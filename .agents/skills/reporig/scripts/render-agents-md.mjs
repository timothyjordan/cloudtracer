import { Buffer } from 'node:buffer';
import {
  CURATED_SPINES,
  SPINE_STAGES,
  SPINE_STAGE_LABELS,
} from './catalog.mjs';
import { validateConfig } from './schema.mjs';

export const FENCE_START = '<!-- reporig:start -->';
export const FENCE_END = '<!-- reporig:end -->';

export const TARGET_TOTAL_LINE_BUDGET = 100;
export const MANAGED_LINE_BUDGET = 85;
export const TOTAL_LINE_BUDGET = 130;
export const TOTAL_BYTE_BUDGET = 16_000;

const COMMAND_TABLE_ROWS = [
  ['install', 'Install'],
  ['dev', 'Dev'],
  ['build', 'Build'],
  ['lint', 'Lint'],
  ['typecheck', 'Typecheck'],
  ['testUnit', 'Unit tests'],
  ['testE2e', 'E2E tests'],
];

const ASK_FIRST_LABELS = {
  'new-dependencies': 'Install new third-party dependencies.',
  'existing-migrations-and-contracts':
    'Edit applied database migrations or public API contracts.',
  'ci-and-deploy-configs': 'Modify CI/CD workflows or deployment configurations.',
  'other-repositories': 'Modify any sibling or external repository.',
};

const NEVER_LABELS = {
  'secrets-and-env-files':
    'Commit, print, or expose `.env` files, API keys, tokens, or secrets.',
  'hand-edit-lockfiles-or-generated':
    'Hand-edit lockfiles or generated directories instead of running the package manager or generator.',
  'weaken-spec-tests-without-triage':
    'Delete or weaken failing spec tests to force a green build without user triage.',
  'commit-or-force-push-main':
    'Commit directly to `main` or force-push shared branches.',
};

const SOURCE_PROVIDER_LABELS = {
  github: 'GitHub (`gh` CLI or GitHub MCP)',
  gitlab: 'GitLab (`glab` CLI or GitLab MCP)',
  bitbucket: 'Bitbucket',
  'git-only': 'Local Git only',
};

const ISSUE_PROVIDER_LABELS = {
  linear: 'Linear',
  'github-issues': 'GitHub Issues',
  jira: 'Jira',
  'local-markdown': 'local markdown (`docs/issues/` or `TODO.md`)',
  none: 'none',
};

const CI_PROVIDER_LABELS = {
  'github-actions': 'GitHub Actions',
  'gitlab-ci': 'GitLab CI',
  circleci: 'CircleCI',
  'local-only': 'local checks only',
  none: 'none',
};

function countLines(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return 0;
  }
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n$/, '');
  return normalized.length === 0 ? 1 : normalized.split('\n').length;
}

function ensureSentencePeriod(text) {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return '';
  }
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function stripTrailingPeriod(text) {
  return text.trim().replace(/\.+$/, '');
}

function describeSourceProvider(sourceSlot) {
  if (sourceSlot.id === 'custom') {
    return sourceSlot.customName || 'custom Git host';
  }
  return SOURCE_PROVIDER_LABELS[sourceSlot.id] ?? sourceSlot.id;
}

function describePrChannel(sourceSlot) {
  if (sourceSlot.id === 'github') {
    return 'via GitHub MCP or `gh pr create`';
  }
  if (sourceSlot.id === 'gitlab') {
    return 'via GitLab MCP or `glab mr create`';
  }
  if (sourceSlot.id === 'bitbucket') {
    return 'in Bitbucket';
  }
  if (sourceSlot.id === 'custom') {
    return `in ${sourceSlot.customName}`;
  }
  return 'for review';
}

function describeCiProvider(ciSlot) {
  if (ciSlot.id === 'custom') {
    return ciSlot.customName || 'custom CI';
  }
  return CI_PROVIDER_LABELS[ciSlot.id] ?? ciSlot.id;
}

function describeIssueTracker(issuesSlot) {
  const base =
    issuesSlot.id === 'custom'
      ? issuesSlot.customName || 'custom tracker'
      : (ISSUE_PROVIDER_LABELS[issuesSlot.id] ?? issuesSlot.id);
  if (issuesSlot.projectHint) {
    return `${base} (project: \`${issuesSlot.projectHint}\`)`;
  }
  return base;
}

function describeSpecsHome(specsSlot) {
  if (specsSlot.id === 'in-repo') {
    return `\`${specsSlot.specsDir}/\` and \`${specsSlot.plansDir}/\``;
  }
  if (specsSlot.id === 'linear-docs') {
    return 'Linear Docs';
  }
  if (specsSlot.id === 'notion') {
    return 'Notion';
  }
  if (specsSlot.id === 'confluence') {
    return 'Confluence';
  }
  if (specsSlot.id === 'custom') {
    return specsSlot.customName || 'configured docs home';
  }
  return 'the project docs location';
}

function buildWorkflowRulesSection(cfg, flags) {
  const { sdlc, providers, project } = cfg;
  const lines = ['## Workflow rules', ''];

  const numberedRules = [];

  // 1. Repo sync rule
  if (providers.source.id === 'git-only') {
    numberedRules.push(
      '1. **Sync first:** Check `git status` and confirm the default branch is clean before starting new work.',
    );
  } else {
    numberedRules.push(
      '1. **Sync first:** Check `git status` and pull the latest default branch from origin before starting new work.',
    );
  }

  // 2. Branch creation rule
  if (sdlc.prGate === 'direct-or-fast') {
    numberedRules.push(
      '2. **Branching:** Work on a short-lived feature branch (or trunk only when explicitly requested by the user); never force-push.',
    );
  } else {
    numberedRules.push(
      '2. **Branching:** Create a focused feature branch from the default branch before editing code; never commit directly to `main`.',
    );
  }

  // 3. Intent & planning rule
  const specsHome = describeSpecsHome(providers.specs);
  const locationClause = providers.specs.id === 'none' ? '' : ` in ${specsHome}`;
  if (sdlc.intentPlanning === 'spec-and-plan') {
    numberedRules.push(
      `3. **Intent and planning:** Write and get user approval on a spec and implementation plan${locationClause} before non-trivial code changes.`,
    );
  } else if (sdlc.intentPlanning === 'test-first-plan-multi-file') {
    numberedRules.push(
      `3. **Intent and planning:** Define behavior with a failing test first, and write a brief plan${locationClause} before multi-file changes.`,
    );
  } else if (sdlc.intentPlanning === 'direct-brief-multi-component') {
    numberedRules.push(
      '3. **Intent and planning:** Implement small changes directly; share a brief plan before multi-component or architectural changes.',
    );
  } else {
    numberedRules.push(
      `3. **Intent and planning:** ${ensureSentencePeriod(sdlc.intentPlanning)}`,
    );
  }

  // 4. Verification & oracle rule
  let e2eClause = '';
  if (flags.hasPlaywright) {
    e2eClause =
      ' Cover user-facing UI flows with Playwright E2E tests (see `.agents/references/playwright-e2e.md`).';
  } else if (sdlc.e2eTool && sdlc.e2eTool !== 'none') {
    e2eClause = ` Cover user-facing UI flows with ${sdlc.e2eTool} E2E tests.`;
  }

  if (sdlc.verificationOracle === 'adversarial-spec-oracle') {
    numberedRules.push(
      `4. **Verification oracle:** Verify against written specs as a black-box oracle rather than mirroring implementation details.${e2eClause}`,
    );
  } else if (sdlc.verificationOracle === 'spec-acceptance-tests') {
    numberedRules.push(
      `4. **Verification oracle:** Write unit and integration tests covering every spec acceptance criterion before completion.${e2eClause}`,
    );
  } else if (sdlc.verificationOracle === 'strict-tdd') {
    numberedRules.push(
      `4. **Verification oracle:** Follow a strict Red-Green-Refactor loop: watch the new test fail first, write minimal code to pass, then refactor.${e2eClause}`,
    );
  } else if (sdlc.verificationOracle === 'project-checks-and-core-tests') {
    numberedRules.push(
      `4. **Verification oracle:** Add or update tests for core logic and bug fixes so regressions are caught automatically.${e2eClause}`,
    );
  } else {
    numberedRules.push(
      `4. **Verification oracle:** ${ensureSentencePeriod(sdlc.verificationOracle)}${e2eClause}`,
    );
  }

  // 5. Pre-commit gates
  const activeChecks = [
    project.commands.lint,
    project.commands.typecheck,
    project.commands.testUnit,
    flags.hasPlaywright || (sdlc.e2eTool && sdlc.e2eTool !== 'none')
      ? project.commands.testE2e
      : null,
  ].filter(Boolean);

  if (activeChecks.length > 0) {
    const formattedChecks = activeChecks.map((cmd) => `\`${cmd}\``).join(', ');
    numberedRules.push(
      `5. **Pre-commit checks:** Run ${formattedChecks} and confirm green output before committing.`,
    );
  } else {
    numberedRules.push(
      '5. **Pre-commit checks:** Run project lint, typecheck, and test commands and confirm green output before committing.',
    );
  }

  // 6. Commit & push cadence
  const commitMap = {
    'per-task': 'Commit atomically after each completed plan task',
    'small-green-commits': 'Make small commits after each green test cycle',
    'logical-units': 'Commit cohesive logical units with clear messages',
  };
  const pushMap = {
    'when-all-tasks-complete':
      'push the feature branch once all planned tasks and local checks pass',
    'ask-before-push': 'ask the user before pushing to the remote repository',
  };
  const commitText =
    commitMap[sdlc.commitCadence] ?? stripTrailingPeriod(sdlc.commitCadence);
  const pushText = pushMap[sdlc.pushCadence] ?? sdlc.pushCadence.trim();
  numberedRules.push(
    `6. **Commit and push cadence:** ${commitText}; ${ensureSentencePeriod(pushText)}`,
  );

  // 7. PR & merge gates
  const mergeMap = {
    'explicit-user-approval': 'never merge without explicit user approval',
    'ask-before-merge-or-push-main':
      'always ask before merging or pushing to `main`',
  };
  const mergeText =
    mergeMap[sdlc.mergeGate] ?? stripTrailingPeriod(sdlc.mergeGate);
  const prChannel = describePrChannel(providers.source);
  const ciCheckClause =
    providers.ci.id !== 'none' && providers.ci.id !== 'local-only'
      ? ` Confirm ${describeCiProvider(providers.ci)} checks pass.`
      : '';

  if (sdlc.prGate === 'pr-with-test-plan') {
    numberedRules.push(
      `7. **PR and merge gate:** Open a PR ${prChannel} with step-by-step verification instructions in the description, and ${mergeText}.${ciCheckClause}`,
    );
  } else if (sdlc.prGate === 'local-test-before-pr') {
    numberedRules.push(
      `7. **PR and merge gate:** Push the branch, provide step-by-step local test instructions (starting the dev server when applicable), and wait for explicit human sign-off on that test run before opening a PR ${prChannel}; ${mergeText}.${ciCheckClause}`,
    );
  } else if (sdlc.prGate === 'direct-or-fast') {
    numberedRules.push(
      `7. **PR and merge gate:** Skip mandatory PR ceremony unless requested; ${mergeText}.${ciCheckClause}`,
    );
  } else {
    numberedRules.push(
      `7. **PR and merge gate:** ${ensureSentencePeriod(sdlc.prGateCustom ?? 'Follow project PR policy')} ${ensureSentencePeriod(mergeText)}${ciCheckClause}`,
    );
  }

  // 8. Issue tracking rule
  if (sdlc.issueCadence === 'none' || providers.issues.id === 'none') {
    numberedRules.push(
      '8. **Issue tracking:** Mandatory ticket creation is disabled; cite an issue ID only when provided by the user.',
    );
  } else {
    const tracker = describeIssueTracker(providers.issues);
    if (sdlc.issueCadence === 'all-work') {
      numberedRules.push(
        `8. **Issue tracking:** Track all work in ${tracker} through \`Todo\` -> \`In Progress\` -> \`In Review\` -> \`Done\`. Reference exact issue IDs in commits and PRs only when directly addressed.`,
      );
    } else if (sdlc.issueCadence === 'features-and-bugs') {
      numberedRules.push(
        `8. **Issue tracking:** Track features and bugs in ${tracker} and update ticket status as PRs open and merge. Reference exact issue IDs only when directly addressed.`,
      );
    } else {
      numberedRules.push(
        `8. **Issue tracking:** Link and update existing tickets in ${tracker} for tracked work; do not create new tickets unless asked.`,
      );
    }
  }

  lines.push(numberedRules.join('\n\n'));
  return lines;
}

function buildAutonomySection(cfg) {
  const { autonomy, prGate } = cfg.sdlc;
  const lines = [
    '## Autonomy boundaries',
    '',
    '- **Always (autonomous):** Run local read-only repo inspection, linters, typechecks, and test suites.',
  ];

  const askItems = autonomy.askFirst.map(
    (item) => ASK_FIRST_LABELS[item] ?? ensureSentencePeriod(item),
  );
  if (prGate === 'local-test-before-pr') {
    askItems.push(
      'Open a pull request only after explicit human sign-off on local verification.',
    );
  }

  if (askItems.length === 0) {
    lines.push('- **Ask first (human gate):** Confirm destructive or cross-repo actions.');
  } else {
    lines.push('- **Ask first (human gate):**');
    askItems.forEach((entry, index) => {
      lines.push(`  ${index + 1}. ${entry}`);
    });
  }

  const neverItems = autonomy.never.map(
    (item) => NEVER_LABELS[item] ?? ensureSentencePeriod(item),
  );
  if (neverItems.length === 0) {
    lines.push(
      '- **Never (hard stops):** Never expose secrets or force-push shared branches.',
    );
  } else {
    lines.push('- **Never (hard stops):**');
    neverItems.forEach((entry, index) => {
      lines.push(`  ${index + 1}. ${entry}`);
    });
  }

  if (autonomy.protectedPaths.length > 0) {
    const formattedPaths = autonomy.protectedPaths.map((p) => `\`${p}\``).join(', ');
    lines.push(`- **Protected paths (ask before editing):** ${formattedPaths}.`);
  }

  return lines;
}

function formatSpineStageSummary(stage, owner, packs = []) {
  const stageLabel = SPINE_STAGE_LABELS[stage] ?? stage;
  const curated = CURATED_SPINES[owner];
  const rawStageSkills = curated?.stageSkills?.[stage] ?? [];
  const ownerPack = packs.find((p) => p.kind === 'spine' && p.source === owner);
  const filteredStageSkills = Array.isArray(ownerPack?.selectedSkills)
    ? rawStageSkills.filter((s) => ownerPack.selectedSkills.includes(s))
    : rawStageSkills;
  const sampleSkills = filteredStageSkills.slice(0, 2);
  if (sampleSkills.length > 0) {
    const skillList = sampleSkills.map((s) => `\`${s}\``).join(', ');
    return `${stageLabel}: \`${owner}\` (${skillList})`;
  }
  return `${stageLabel}: \`${owner}\``;
}

function buildToolingSection(cfg, flags) {
  const { customHarnesses, providers, skills } = cfg;
  const lines = ['## Tooling & references', ''];

  lines.push(
    `- **SDLC providers:** Source: ${describeSourceProvider(providers.source)}. Issues: ${describeIssueTracker(providers.issues)}. CI: ${describeCiProvider(providers.ci)}.`,
    '- **Vendored skills:** Load repository skills from `.agents/skills/` (linked at `.claude/skills/`; run `/reporig` to reconfigure workflows or update vendored packs).',
  );

  const spinePacks = skills.packs.filter((p) => p.kind === 'spine');
  if (flags.hasMultipleSpines && skills.spinePrecedence) {
    const stageSummaries = SPINE_STAGES.map((stage) =>
      formatSpineStageSummary(stage, skills.spinePrecedence[stage], spinePacks),
    );
    lines.push(
      `- **Spine precedence:** Follow \`.agents/references/spine-precedence.md\` for multi-spine stage routing (${stageSummaries.join('; ')}).`,
    );
  } else if (spinePacks.length === 1) {
    lines.push(
      `- **Workflow spine:** Follow \`${spinePacks[0].source}\` skills in \`.agents/skills/\` across discovery, planning, implementation, and review.`,
    );
  }

  if (flags.hasPlaywright) {
    lines.push(
      '- **Playwright E2E:** Follow `.agents/references/playwright-e2e.md` for selector, fixture, and browser test conventions.',
    );
  }

  const nonSpinePacks = skills.packs.filter((pack) => pack.kind !== 'spine');
  if (nonSpinePacks.length > 0) {
    const firstFive = nonSpinePacks
      .slice(0, 5)
      .map((pack) => `\`${pack.source}\``)
      .join(', ');
    const overflowCount = nonSpinePacks.slice(5).length;
    const overflowSuffix =
      overflowCount > 0
        ? ` (and ${overflowCount} more in \`.agents/reporig.json\`)`
        : '';
    lines.push(
      `- **Craft and domain packs:** Apply ${firstFive}${overflowSuffix} from \`.agents/skills/\`.`,
    );
  }

  if (flags.hasLinearCliFallback) {
    lines.push(
      '- **Linear CLI fallback:** Prefer the connected Linear MCP server; when unavailable in remote sessions, read and follow `.agents/references/linear-cli-shim.md` to bootstrap `.agents/references/linear-cli.mjs` (never hardcode keys).',
    );
  }

  const customNotes = [];
  for (const ch of customHarnesses) {
    if (ch.notes) {
      customNotes.push(`${ch.name}: ${ch.notes}`);
    }
  }
  for (const slotName of ['source', 'issues', 'ci', 'specs']) {
    const note = providers[slotName]?.notes;
    if (note) {
      customNotes.push(`${slotName}: ${note}`);
    }
  }
  if (customNotes.length > 0) {
    lines.push(`- **Adapter notes:** ${customNotes.join('; ')}.`);
  }

  return lines;
}

function buildWritingStyleSection(cfg) {
  const { plainEnglish, noEmDashes } = cfg.sdlc.writingStyle;
  if (!plainEnglish && !noEmDashes) {
    return [];
  }

  const lines = ['## Writing style', ''];
  if (plainEnglish) {
    lines.push(
      '- Use plain, direct English in specs, code comments, commit messages, PR descriptions, and documentation; avoid filler and buzzwords.',
    );
  }
  if (noEmDashes) {
    lines.push(
      '- Never use em dashes or spaced hyphens as sentence punctuation; use commas, colons, parentheses, or separate sentences instead.',
    );
  }
  return lines;
}

function computeReferenceFlagsFromNormalized(cfg) {
  const packSources = new Set(cfg.skills.packs.map((p) => p.source));
  const spineCount = cfg.skills.packs.filter((p) => p.kind === 'spine').length;

  return {
    hasMultipleSpines: spineCount >= 2 && cfg.skills.spinePrecedence !== null,
    hasImpeccable: packSources.has('pbakaus/impeccable'),
    hasA14y: packSources.has('timothyjordan/a14y'),
    hasPlaywright:
      cfg.sdlc.e2eTool === 'playwright' ||
      /playwright/i.test(cfg.project.commands.testE2e ?? ''),
    hasLinearCliFallback:
      cfg.providers.issues.id === 'linear' &&
      cfg.providers.issues.includeCliFallback === true,
  };
}

export function computeReferenceFlags(config) {
  const validation = validateConfig(config);
  if (!validation.valid) {
    throw new Error(`Invalid reporig config: ${validation.errors.join(' ')}`);
  }
  return computeReferenceFlagsFromNormalized(validation.value);
}

export function renderManagedBlock(config) {
  const validation = validateConfig(config);
  if (!validation.valid) {
    throw new Error(`Invalid reporig config: ${validation.errors.join(' ')}`);
  }

  const cfg = validation.value;
  const flags = computeReferenceFlagsFromNormalized(cfg);

  const sections = [
    [
      FENCE_START,
      '<!-- Managed by /reporig (.agents/reporig.json). Edit outside this fence or run /reporig to reconfigure. -->',
    ],
    buildWorkflowRulesSection(cfg, flags),
    buildAutonomySection(cfg),
    buildToolingSection(cfg, flags),
  ];

  const writingLines = buildWritingStyleSection(cfg);
  if (writingLines.length > 0) {
    sections.push(writingLines);
  }

  const body = sections.map((sec) => sec.join('\n')).join('\n\n');
  const markdown = `${body}\n${FENCE_END}`;
  const lineCount = countLines(markdown);
  const warnings = [];

  if (lineCount > MANAGED_LINE_BUDGET) {
    warnings.push(
      `Managed reporig block is ${lineCount} lines (budget: ${MANAGED_LINE_BUDGET} lines). Extract detailed guidance into .agents/references/ pointers.`,
    );
  }

  return {
    markdown,
    lineCount,
    warnings,
  };
}

function buildScaffoldedHumanHeader(cfg, contextPointers = []) {
  const { project, providers, sdlc } = cfg;
  const summaryText =
    project.description.trim().length > 0
      ? project.description.trim()
      : 'Add a short 1 to 2 sentence summary of this repository.';

  const lines = [
    '# AGENTS.md',
    '',
    '> Precedence: closer subdirectory `AGENTS.md` files override root rules for their subtree, and direct user instructions in chat override file rules. Keep this root file as a concise Tier 1 map; place deep domain docs and runbooks in `.agents/references/` or `docs/`. Content outside `<!-- reporig:start -->` and `<!-- reporig:end -->` is owned by maintainers.',
    '',
    '## This project',
    '',
    `**${project.name}**: ${summaryText} (Package manager: \`${project.packageManager}\`)`,
    '',
    '| Action | Command |',
    '|---|---|',
  ];

  const configuredRows = COMMAND_TABLE_ROWS.filter(
    ([key]) => Boolean(project.commands[key]),
  );

  if (configuredRows.length > 0) {
    for (const [key, label] of configuredRows) {
      lines.push(`| ${label} | \`${project.commands[key]}\` |`);
    }
  } else {
    lines.push('| Install | _not configured_ |');
    lines.push('| Lint | _not configured_ |');
    lines.push('| Typecheck | _not configured_ |');
    lines.push('| Unit tests | _not configured_ |');
  }

  lines.push('', '## Context map', '');
  if (providers.specs.id !== 'none') {
    lines.push(
      `- **Specs and plans:** Read and write approved specs and implementation plans in ${describeSpecsHome(providers.specs)}.`,
    );
  }

  const validPointers = Array.isArray(contextPointers)
    ? contextPointers.filter(
        (entry) =>
          entry &&
          typeof entry.label === 'string' &&
          entry.label.trim().length > 0 &&
          typeof entry.path === 'string' &&
          entry.path.trim().length > 0,
      )
    : [];

  if (validPointers.length > 0) {
    for (const pointer of validPointers) {
      lines.push(`- **${pointer.label.trim()}:** \`${pointer.path.trim()}\``);
    }
  } else {
    lines.push(
      '- **Deep references:** Add topic pointers here (`.agents/references/<topic>.md` or `docs/<topic>.md`) instead of inlining long guides.',
    );
  }

  lines.push('', '## Repo boundaries', '');
  if (sdlc.autonomy.protectedPaths.length > 0) {
    const formatted = sdlc.autonomy.protectedPaths.map((p) => `\`${p}\``).join(', ');
    lines.push(`- Protected or generated paths: ${formatted}`);
  } else {
    lines.push(
      '- Protected or generated paths: none listed yet (document generated, vendor, or migration directories here).',
    );
  }

  return lines.join('\n');
}

export function scanFenceMarkers(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { startMatches: [], endMatches: [] };
  }

  const startMatches = [];
  const endMatches = [];
  let pos = 0;
  let lineNumber = 1;

  while (pos <= text.length) {
    const nlIdx = text.indexOf('\n', pos);
    const rawLineEnd = nlIdx === -1 ? text.length : nlIdx;
    const rawLine = text.slice(pos, rawLineEnd);
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

    if (/^[ \t]*<!-- reporig:start -->[ \t]*$/.test(line)) {
      const markerOffset = pos + line.indexOf(FENCE_START);
      startMatches.push({
        lineNumber,
        markerOffset,
        markerEndOffset: markerOffset + FENCE_START.length,
      });
    } else if (/^[ \t]*<!-- reporig:end -->[ \t]*$/.test(line)) {
      const markerOffset = pos + line.indexOf(FENCE_END);
      endMatches.push({
        lineNumber,
        markerOffset,
        markerEndOffset: markerOffset + FENCE_END.length,
      });
    }

    if (nlIdx === -1) {
      break;
    }
    pos = nlIdx + 1;
    lineNumber += 1;
  }

  return { startMatches, endMatches };
}

export function hasValidReporigFence(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return false;
  }
  const { startMatches, endMatches } = scanFenceMarkers(text);
  return (
    startMatches.length === 1 &&
    endMatches.length === 1 &&
    startMatches[0].markerOffset < endMatches[0].markerOffset
  );
}

export function applyAgentsMd({
  existingContent = null,
  nonManagedHeader = null,
  config,
  contextPointers = [],
}) {
  if (
    existingContent !== null &&
    existingContent !== undefined &&
    typeof existingContent !== 'string'
  ) {
    throw new Error('existingContent must be a string or null.');
  }

  if (
    nonManagedHeader !== null &&
    nonManagedHeader !== undefined &&
    typeof nonManagedHeader !== 'string'
  ) {
    throw new Error('nonManagedHeader must be a string or null.');
  }

  const validation = validateConfig(config);
  if (!validation.valid) {
    throw new Error(`Invalid reporig config: ${validation.errors.join(' ')}`);
  }

  const managed = renderManagedBlock(validation.value);
  const warnings = [...managed.warnings];

  let content;
  let appendedToUnfencedFile = false;
  let reconciledNonManagedHeader = false;

  if (typeof nonManagedHeader === 'string') {
    const { startMatches, endMatches } = scanFenceMarkers(nonManagedHeader);
    if (startMatches.length > 0 || endMatches.length > 0) {
      throw new Error('Non-managed header must not contain reporig fence markers.');
    }
    const trimmedHeader = nonManagedHeader.replace(/\r\n/g, '\n').trim();
    content =
      trimmedHeader.length > 0
        ? `${trimmedHeader}\n\n${managed.markdown}\n`
        : `${managed.markdown}\n`;
    reconciledNonManagedHeader = true;
    appendedToUnfencedFile = false;
  } else if (existingContent === null || existingContent === undefined) {
    const humanHeader = buildScaffoldedHumanHeader(
      validation.value,
      contextPointers,
    );
    content = `${humanHeader}\n\n${managed.markdown}\n`;
  } else {
    const { startMatches, endMatches } = scanFenceMarkers(existingContent);

    if (startMatches.length === 0 && endMatches.length === 0) {
      appendedToUnfencedFile = true;
      if (existingContent.length === 0) {
        content = `${managed.markdown}\n`;
      } else if (
        existingContent.endsWith('\n\n') ||
        existingContent.endsWith('\r\n\r\n')
      ) {
        content = `${existingContent}${managed.markdown}\n`;
      } else if (existingContent.endsWith('\n')) {
        content = `${existingContent}\n${managed.markdown}\n`;
      } else {
        content = `${existingContent}\n\n${managed.markdown}\n`;
      }
    } else {
      if (startMatches.length > 1) {
        throw new Error(
          `Malformed reporig fence: found ${startMatches.length} start markers on lines ${startMatches.map((m) => m.lineNumber).join(', ')}; expected 1.`,
        );
      }
      if (endMatches.length > 1) {
        throw new Error(
          `Malformed reporig fence: found ${endMatches.length} end markers on lines ${endMatches.map((m) => m.lineNumber).join(', ')}; expected 1.`,
        );
      }
      if (startMatches.length === 1 && endMatches.length === 0) {
        throw new Error(
          `Malformed reporig fence: found start marker on line ${startMatches[0].lineNumber} without a matching end marker.`,
        );
      }
      if (startMatches.length === 0 && endMatches.length === 1) {
        throw new Error(
          `Malformed reporig fence: found end marker on line ${endMatches[0].lineNumber} without a matching start marker.`,
        );
      }
      if (endMatches[0].markerOffset < startMatches[0].markerOffset) {
        throw new Error(
          `Malformed reporig fence: end marker on line ${endMatches[0].lineNumber} precedes start marker on line ${startMatches[0].lineNumber}.`,
        );
      }

      const prefix = existingContent.slice(0, startMatches[0].markerOffset);
      const suffix = existingContent.slice(endMatches[0].markerEndOffset);
      content = `${prefix}${managed.markdown}${suffix}`;
    }
  }

  const totalLineCount = countLines(content);
  if (totalLineCount > TOTAL_LINE_BUDGET) {
    warnings.push(
      `AGENTS.md total length is ${totalLineCount} lines (budget: ${TOTAL_LINE_BUDGET} lines). Extract detailed sections into .agents/references/ pointers.`,
    );
  }

  const byteLength = Buffer.byteLength(content, 'utf8');
  if (byteLength > TOTAL_BYTE_BUDGET) {
    warnings.push(
      `AGENTS.md size is ${byteLength} bytes (budget: ${TOTAL_BYTE_BUDGET} bytes). Move lengthy project documentation into .agents/references/ files.`,
    );
  }

  return {
    content,
    managedLineCount: managed.lineCount,
    totalLineCount,
    appendedToUnfencedFile,
    reconciledNonManagedHeader,
    warnings,
  };
}

export function applyClaudeMd({
  existingContent = null,
  includeClaudeBridge = true,
  replaceExisting = false,
} = {}) {
  if (
    existingContent !== null &&
    existingContent !== undefined &&
    typeof existingContent !== 'string'
  ) {
    throw new Error('existingContent must be a string or null.');
  }

  if (replaceExisting === true) {
    return {
      shouldWrite: existingContent !== '@AGENTS.md\n',
      content: '@AGENTS.md\n',
    };
  }

  if (!includeClaudeBridge) {
    return {
      shouldWrite: false,
      content: null,
    };
  }

  if (existingContent === null || existingContent === undefined) {
    return {
      shouldWrite: true,
      content: '@AGENTS.md\n',
    };
  }

  if (/(?:^|\s)@(?:\.\/)?AGENTS\.md(?:\s|$)/m.test(existingContent)) {
    return {
      shouldWrite: false,
      content: existingContent,
    };
  }

  if (existingContent.length === 0) {
    return {
      shouldWrite: true,
      content: '@AGENTS.md\n',
    };
  }

  return {
    shouldWrite: true,
    content: `@AGENTS.md\n\n${existingContent}`,
  };
}
