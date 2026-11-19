import fs from 'node:fs';
import path from 'node:path';
import {
  REPORIG_VERSION,
  CURATED_SKILLS,
  matchesCatalogCondition,
} from './catalog.mjs';
import { auditRepo } from './audit.mjs';
import { findCaseInsensitiveRootFile } from './inspect.mjs';
import { validateConfig } from './schema.mjs';
import {
  applyAgentsMd,
  applyClaudeMd,
} from './render-agents-md.mjs';
import {
  MANAGED_REFERENCE_FILES,
  LEGACY_MANAGED_REFERENCE_FILES,
  renderReferenceFiles,
} from './render-references.mjs';

export const FLAT_ESLINT_CONFIG_FILES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
];

function isFile(targetPath) {
  try {
    return fs.statSync(targetPath).isFile();
  } catch {
    return false;
  }
}

function isDirectory(targetPath) {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

export function computeGitignoreUpdate(existingContent) {
  if (existingContent === null || existingContent === undefined) {
    return {
      shouldUpdate: true,
      content: '.env*\n!.env.example\n',
    };
  }

  const nonCommentLines = existingContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  let lastEnvGlobIndex = -1;
  let lastEnvExampleIndex = -1;

  for (let i = 0; i < nonCommentLines.length; i += 1) {
    const entry = nonCommentLines[i];
    if (entry === '.env*' || entry === '**/.env*') {
      lastEnvGlobIndex = i;
    } else if (entry === '!.env.example' || entry === '!**/.env.example') {
      lastEnvExampleIndex = i;
    }
  }

  if (lastEnvGlobIndex !== -1 && lastEnvExampleIndex > lastEnvGlobIndex) {
    return {
      shouldUpdate: false,
      content: existingContent,
    };
  }

  const linesToAppend =
    lastEnvGlobIndex === -1
      ? ['.env*', '!.env.example']
      : ['!.env.example'];

  let nextContent;
  if (existingContent.length === 0) {
    nextContent = `${linesToAppend.join('\n')}\n`;
  } else if (existingContent.endsWith('\n')) {
    nextContent = `${existingContent}${linesToAppend.join('\n')}\n`;
  } else {
    nextContent = `${existingContent}\n${linesToAppend.join('\n')}\n`;
  }

  return {
    shouldUpdate: true,
    content: nextContent,
  };
}

export function detectEslintIgnoreTarget(cwd) {
  if (!cwd) {
    return null;
  }
  const hasClaudeCopyMirror = isFile(
    path.join(cwd, '.claude', 'skills', '.reporig-mirror'),
  );

  for (const candidate of FLAT_ESLINT_CONFIG_FILES) {
    const fullPath = path.join(cwd, candidate);
    if (!isFile(fullPath)) {
      continue;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    if (!/\.agents\b/.test(content)) {
      return {
        fileName: candidate,
        warning: `Found ${candidate} without ".agents/**" in ignores; ask the user for confirmation to add ".agents/**" to ESLint ignores so vendored skills do not trip project lint rules.`,
        externalAction: `Add '.agents/**' to ignores in ${candidate}`,
      };
    }
    if (hasClaudeCopyMirror && !/\.claude\b/.test(content)) {
      return {
        fileName: candidate,
        warning: `Found ${candidate} without ".claude/**" in ignores while .claude/skills is a copied directory mirror; ask the user for confirmation to add ".claude/**" to ESLint ignores so mirrored skill scripts do not trip project lint rules.`,
        externalAction: `Add '.claude/**' to ignores in ${candidate}`,
      };
    }
    return null;
  }

  const legacyIgnorePath = path.join(cwd, '.eslintignore');
  if (isFile(legacyIgnorePath)) {
    const content = fs.readFileSync(legacyIgnorePath, 'utf8');
    if (!/\.agents\b/.test(content)) {
      return {
        fileName: '.eslintignore',
        warning: 'Found .eslintignore without ".agents/"; ask the user for confirmation to add ".agents/**" to .eslintignore so vendored skills do not trip project lint rules.',
        externalAction: "Add '.agents/**' to ignores in .eslintignore",
      };
    }
    if (hasClaudeCopyMirror && !/\.claude\b/.test(content)) {
      return {
        fileName: '.eslintignore',
        warning: 'Found .eslintignore without ".claude/"; ask the user for confirmation to add ".claude/**" to .eslintignore so mirrored skill scripts do not trip project lint rules.',
        externalAction: "Add '.claude/**' to ignores in .eslintignore",
      };
    }
  }

  return null;
}

export function checkEslintIgnoreHygiene(cwd) {
  return detectEslintIgnoreTarget(cwd)?.warning ?? null;
}

export function inferRepoHarnesses(cwd) {
  const detected = [];
  if (!cwd) {
    return ['claude-code'];
  }
  if (isFile(path.join(cwd, 'CLAUDE.md')) || isDirectory(path.join(cwd, '.claude'))) {
    detected.push('claude-code');
  }
  if (isDirectory(path.join(cwd, '.cursor')) || isFile(path.join(cwd, '.cursorrules'))) {
    detected.push('cursor');
  }
  if (isFile(path.join(cwd, '.github', 'copilot-instructions.md'))) {
    detected.push('github-copilot');
  }
  if (isDirectory(path.join(cwd, '.codex'))) {
    detected.push('codex');
  }
  return detected.length > 0 ? detected : ['claude-code'];
}

export function compareSemver(versionA, versionB) {
  if (typeof versionA !== 'string' || typeof versionB !== 'string') {
    return null;
  }
  const SEMVER_STRICT = /^\d+\.\d+\.\d+$/;
  if (!SEMVER_STRICT.test(versionA) || !SEMVER_STRICT.test(versionB)) {
    return null;
  }
  const [majA, minA, patchA] = versionA.split('.').map((n) => Number.parseInt(n, 10));
  const [majB, minB, patchB] = versionB.split('.').map((n) => Number.parseInt(n, 10));

  if (majA < majB) return -1;
  if (majA > majB) return 1;
  if (minA < minB) return -1;
  if (minA > minB) return 1;
  if (patchA < patchB) return -1;
  if (patchA > patchB) return 1;
  return 0;
}

export const UPGRADE_ADVISORIES = [
  {
    id: '2026-11-13-decouple-testbotpro',
    kind: 'veto',
    category: 'deprecation',
    introducedIn: '0.1.1',
    title: 'Remove legacy default timothyjordan/testbotpro pack',
    rationale:
      'timothyjordan/testbotpro was decoupled from curated defaults in v0.1.1; keep it (veto this item) only if you intentionally want it as a custom write-in pack.',
    recommendedAction: 'Remove timothyjordan/testbotpro from skills.packs',
    changesConfig: true,
    requiresApply: true,
    requiresSkillSync: true,
    trackInEvaluated: true,
    externalAction: null,
    appliesWhen: (config) =>
      Array.isArray(config?.skills?.packs) &&
      config.skills.packs.some((p) => p.source === 'timothyjordan/testbotpro'),
    transform: (draft) => {
      draft.skills.packs = draft.skills.packs.filter(
        (p) => p.source !== 'timothyjordan/testbotpro',
      );
    },
  },
  {
    id: '2026-11-13-neutral-no-em-dashes',
    kind: 'veto',
    category: 'recommendation-change',
    introducedIn: '0.1.1',
    title: 'Disable writingStyle.noEmDashes preset default',
    rationale:
      'Em-dash punctuation avoidance was removed as a baked-in preset default in v0.1.1; veto this item if your repository intentionally enforces that house style.',
    recommendedAction: 'Set sdlc.writingStyle.noEmDashes to false',
    changesConfig: true,
    requiresApply: true,
    requiresSkillSync: false,
    trackInEvaluated: true,
    externalAction: null,
    appliesWhen: (config) => Boolean(config?.sdlc?.writingStyle?.noEmDashes),
    transform: (draft) => {
      if (!draft.sdlc) {
        draft.sdlc = {};
      }
      if (!draft.sdlc.writingStyle) {
        draft.sdlc.writingStyle = { plainEnglish: true, noEmDashes: false };
      }
      draft.sdlc.writingStyle.noEmDashes = false;
    },
  },
  {
    id: '2026-11-13-universal-harnesses',
    kind: 'questionnaire',
    category: 'recommendation-change',
    introducedIn: 'unreleased',
    title: 'Universal harness layout',
    question: (config) =>
      config?.providers?.issues?.id === 'linear'
        ? 'How should this repository adopt the universal harness layout and Linear CLI fallback?'
        : 'Adopt universal harness layout across all coding agents?',
    rationale:
      'reporig now configures AGENTS.md, CLAUDE.md, and .claude/skills universally without maintaining a per-repo harnesses list, and gates the bundled Linear CLI fallback on providers.issues.includeCliFallback.',
    trackInEvaluated: true,
    appliesWhen: (config) =>
      Array.isArray(config?.harnesses) &&
      config.harnesses.length > 0 &&
      Array.isArray(config?.customHarnesses) &&
      config.customHarnesses.length === 0,
    options: (config) => {
      if (config?.providers?.issues?.id === 'linear') {
        const hasAntigravity =
          Array.isArray(config?.harnesses) && config.harnesses.includes('antigravity');
        const hasCliFallback = config?.providers?.issues?.includeCliFallback === true;
        const recommendedCliFallback = hasAntigravity || hasCliFallback;
        return [
          {
            id: 'universal-with-cli-fallback',
            label:
              'Universal layout with bundled Linear CLI fallback (harnesses: [], includeCliFallback: true)',
            recommended: recommendedCliFallback,
          },
          {
            id: 'universal-mcp-only',
            label:
              'Universal layout without Linear CLI fallback (harnesses: [], includeCliFallback: false)',
            recommended: !recommendedCliFallback,
          },
          {
            id: 'keep-current',
            label: 'Keep current harnesses configuration unchanged',
            recommended: false,
          },
        ];
      }
      return [
        {
          id: 'universal-layout',
          label:
            'Adopt universal harness layout (harnesses: []; CLAUDE.md and .claude/skills link automatically)',
          recommended: true,
        },
        {
          id: 'keep-current',
          label: 'Keep current harnesses configuration unchanged',
          recommended: false,
        },
      ];
    },
    applyAnswer: (draft, answerId) => {
      if (answerId === 'universal-with-cli-fallback') {
        draft.harnesses = [];
        if (!draft.providers) draft.providers = {};
        if (!draft.providers.issues) draft.providers.issues = {};
        draft.providers.issues.includeCliFallback = true;
      } else if (answerId === 'universal-mcp-only') {
        draft.harnesses = [];
        if (!draft.providers) draft.providers = {};
        if (!draft.providers.issues) draft.providers.issues = {};
        draft.providers.issues.includeCliFallback = false;
      } else if (answerId === 'universal-layout') {
        draft.harnesses = [];
      } else if (answerId === 'keep-current') {
        // Leave harnesses and includeCliFallback unchanged
      }
    },
  },
];

function detectManagedFilesDrift(cwd, config) {
  if (!cwd) {
    return null;
  }
  const driftedPaths = [];

  // 1. AGENTS.md
  const foundAgents = findCaseInsensitiveRootFile(cwd, 'AGENTS.md');
  foundAgents.needsCaseRename = Boolean(
    foundAgents.exists && foundAgents.filename !== 'AGENTS.md',
  );
  const existingAgents =
    foundAgents.exists && foundAgents.fullPath
      ? fs.readFileSync(foundAgents.fullPath, 'utf8')
      : null;
  const appliedAgents = applyAgentsMd({ existingContent: existingAgents, config });
  if (foundAgents.needsCaseRename || existingAgents !== appliedAgents.content) {
    driftedPaths.push('AGENTS.md');
  }

  // 2. CLAUDE.md
  const foundClaude = findCaseInsensitiveRootFile(cwd, 'CLAUDE.md');
  foundClaude.needsCaseRename = Boolean(
    foundClaude.exists && foundClaude.filename !== 'CLAUDE.md',
  );
  const existingClaude =
    foundClaude.exists && foundClaude.fullPath
      ? fs.readFileSync(foundClaude.fullPath, 'utf8')
      : null;
  const claudeResult = applyClaudeMd({
    existingContent: existingClaude,
    includeClaudeBridge: true,
  });
  if (foundClaude.needsCaseRename || claudeResult.shouldWrite) {
    driftedPaths.push('CLAUDE.md');
  }

  // 3. .gitignore
  const gitignorePath = path.join(cwd, '.gitignore');
  const existingGitignore = isFile(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : null;
  const gitignoreCheck = computeGitignoreUpdate(existingGitignore);
  if (gitignoreCheck.shouldUpdate) {
    driftedPaths.push('.gitignore');
  }

  // 4. .claude/skills link
  const agentsSkillsDir = path.join(cwd, '.agents', 'skills');
  let hasAgentsSkills = false;
  try {
    hasAgentsSkills = fs.statSync(agentsSkillsDir).isDirectory();
  } catch {
    hasAgentsSkills = false;
  }
  if (hasAgentsSkills) {
    const claudeSkillsLink = path.join(cwd, '.claude', 'skills');
    let claudeSkillsExists = false;
    try {
      fs.lstatSync(claudeSkillsLink);
      claudeSkillsExists = true;
    } catch {
      claudeSkillsExists = false;
    }
    if (!claudeSkillsExists) {
      driftedPaths.push('.claude/skills');
    }
  }

  // 5. Reference files
  const activeFiles = renderReferenceFiles(config);
  const refsDir = path.join(cwd, '.agents', 'references');

  for (const [fileName, expectedContent] of activeFiles.entries()) {
    const filePath = path.join(refsDir, fileName);
    if (!isFile(filePath)) {
      driftedPaths.push(`.agents/references/${fileName}`);
    } else {
      const currentContent = fs.readFileSync(filePath, 'utf8');
      if (currentContent !== expectedContent) {
        driftedPaths.push(`.agents/references/${fileName}`);
      }
    }
  }

  for (const managedName of [
    ...MANAGED_REFERENCE_FILES,
    ...LEGACY_MANAGED_REFERENCE_FILES,
  ]) {
    if (!activeFiles.has(managedName)) {
      const candidatePath = path.join(refsDir, managedName);
      if (isFile(candidatePath)) {
        driftedPaths.push(`.agents/references/${managedName}`);
      }
    }
  }

  if (driftedPaths.length === 0) {
    return null;
  }

  driftedPaths.sort();
  return {
    id: 'drift:managed-files',
    kind: 'veto',
    category: 'drift',
    introducedIn: '0.1.1',
    title: 'Update managed repository files',
    rationale:
      'Managed files (AGENTS.md, CLAUDE.md, .gitignore, or .agents/references) differ from rendered configuration.',
    recommendedAction: `Update managed files: ${driftedPaths.join(', ')}`,
    changesConfig: false,
    requiresApply: true,
    requiresSkillSync: false,
    trackInEvaluated: false,
    externalAction: null,
    driftedPaths,
  };
}

function detectLiveSignals({ cwd, config, inspection }) {
  const items = [];
  const safeInspection = inspection ?? {};
  const commands = safeInspection.commands ?? {};
  const packs = Array.isArray(config?.skills?.packs) ? config.skills.packs : [];
  const existingPackSources = new Set(packs.map((p) => p.source));

  // 1. signal:curated-skill:<source> and signal:postgres-craft
  for (const [source, skill] of Object.entries(CURATED_SKILLS)) {
    if (skill.choiceGroup !== null || !skill.defaultWhen) {
      continue;
    }
    if (
      matchesCatalogCondition(skill.defaultWhen, safeInspection) &&
      !existingPackSources.has(source)
    ) {
      items.push({
        id: `signal:curated-skill:${source}`,
        kind: 'veto',
        category: 'signal',
        introducedIn: '0.1.2',
        title: `Add curated skill ${source}`,
        rationale: `Repository matches conditions for ${skill.label} (${skill.defaultWhen}).`,
        recommendedAction: `Add ${source} to skills.packs`,
        changesConfig: true,
        requiresApply: true,
        requiresSkillSync: true,
        trackInEvaluated: true,
        externalAction: null,
        transform: (draft) => {
          draft.skills.packs.push({
            source: skill.source,
            url: skill.url,
            kind: skill.kind,
            installedDirs: [],
            commitSha: null,
            installedAt: null,
          });
        },
      });
    }
  }

  const supabasePgSource = 'supabase/agent-skills#postgres-best-practices';
  const microsoftPgSource = 'microsoft/postgres-skills#postgresql-best-practices';
  if (
    matchesCatalogCondition('hasPostgres', safeInspection) &&
    !existingPackSources.has(supabasePgSource) &&
    !existingPackSources.has(microsoftPgSource)
  ) {
    items.push({
      id: 'signal:postgres-craft',
      kind: 'questionnaire',
      category: 'signal',
      introducedIn: 'unreleased',
      title: 'PostgreSQL craft skill pack',
      question:
        'PostgreSQL was detected in this repository. Which vendor-neutral PostgreSQL craft pack should be installed?',
      rationale:
        'Both Supabase and Microsoft publish Apache/MIT PostgreSQL craft skills covering query tuning, indexing, and schema design.',
      trackInEvaluated: true,
      options: [
        {
          id: 'supabase-postgres',
          label:
            'Supabase Postgres Best Practices (supabase/agent-skills#postgres-best-practices)',
          recommended: true,
        },
        {
          id: 'microsoft-postgres',
          label:
            'Microsoft PostgreSQL Best Practices (microsoft/postgres-skills#postgresql-best-practices)',
          recommended: false,
        },
        {
          id: 'none',
          label: 'Do not install a PostgreSQL craft pack',
          recommended: false,
        },
      ],
      applyAnswer: (draft, answerId) => {
        const chosenSource =
          answerId === 'supabase-postgres'
            ? supabasePgSource
            : answerId === 'microsoft-postgres'
              ? microsoftPgSource
              : null;
        if (chosenSource && CURATED_SKILLS[chosenSource]) {
          const chosen = CURATED_SKILLS[chosenSource];
          draft.skills.packs.push({
            source: chosen.source,
            url: chosen.url,
            kind: chosen.kind,
            installedDirs: [],
            commitSha: null,
            installedAt: null,
          });
        }
      },
    });
  }

  // 2. signal:playwright-e2e
  const hasPlaywrightSignal =
    safeInspection.hasPlaywright === true && config?.sdlc?.e2eTool === 'none';
  if (hasPlaywrightSignal) {
    items.push({
      id: 'signal:playwright-e2e',
      kind: 'veto',
      category: 'signal',
      introducedIn: '0.1.1',
      title: 'Configure Playwright E2E tooling',
      rationale:
        'Playwright was detected in this repository but sdlc.e2eTool is currently set to none.',
      recommendedAction:
        'Set sdlc.e2eTool to playwright and configure testE2e command',
      changesConfig: true,
      requiresApply: true,
      requiresSkillSync: false,
      trackInEvaluated: true,
      externalAction: null,
      transform: (draft) => {
        draft.sdlc.e2eTool = 'playwright';
        if (
          draft.project.commands.testE2e === null &&
          commands.testE2e != null
        ) {
          draft.project.commands.testE2e = commands.testE2e;
        }
      },
    });
  }

  // 3. signal:ci-provider:<inspection.ciProvider>
  const ciProvider = safeInspection.ciProvider;
  if (
    ['github-actions', 'gitlab-ci', 'circleci'].includes(ciProvider) &&
    ['local-only', 'none'].includes(config?.providers?.ci?.id)
  ) {
    items.push({
      id: `signal:ci-provider:${ciProvider}`,
      kind: 'veto',
      category: 'signal',
      introducedIn: '0.1.1',
      title: `Configure CI provider ${ciProvider}`,
      rationale: `Continuous integration configuration for ${ciProvider} was detected in this repository.`,
      recommendedAction: `Set providers.ci to ${ciProvider}`,
      changesConfig: true,
      requiresApply: true,
      requiresSkillSync: false,
      trackInEvaluated: true,
      externalAction: null,
      transform: (draft) => {
        draft.providers.ci = { id: ciProvider, customName: null, notes: null };
      },
    });
  }

  // 4. signal:command:<slot>:<cmd>
  const commandSlots = [
    'install',
    'dev',
    'build',
    'lint',
    'typecheck',
    'testUnit',
    'testE2e',
  ];
  for (const slot of commandSlots) {
    if (slot === 'testE2e' && hasPlaywrightSignal) {
      continue;
    }
    const detectedCmd = commands[slot];
    if (detectedCmd != null && config?.project?.commands?.[slot] === null) {
      items.push({
        id: `signal:command:${slot}:${detectedCmd}`,
        kind: 'veto',
        category: 'signal',
        introducedIn: '0.1.1',
        title: `Set project ${slot} command`,
        rationale: `Detected command for ${slot}: ${detectedCmd}.`,
        recommendedAction: `Set project.commands.${slot} to "${detectedCmd}"`,
        changesConfig: true,
        requiresApply: true,
        requiresSkillSync: false,
        trackInEvaluated: true,
        externalAction: null,
        transform: (draft) => {
          draft.project.commands[slot] = detectedCmd;
        },
      });
    }
  }

  // 5. hygiene:eslint-ignore and hygiene:progressive-disclosure
  if (cwd) {
    const eslintTarget = detectEslintIgnoreTarget(cwd);
    if (eslintTarget) {
      items.push({
        id: 'hygiene:eslint-ignore',
        kind: 'veto',
        category: 'hygiene',
        introducedIn: '0.1.1',
        title: `Add .agents/** to ignores in ${eslintTarget.fileName}`,
        rationale: eslintTarget.warning,
        recommendedAction: eslintTarget.externalAction,
        changesConfig: false,
        requiresApply: false,
        requiresSkillSync: false,
        trackInEvaluated: true,
        externalAction: eslintTarget.externalAction,
        transform: () => {},
      });
    }

    let auditReport = null;
    try {
      auditReport = auditRepo(cwd);
    } catch {
      auditReport = null;
    }
    if (auditReport?.needsProgressiveDisclosureMigration) {
      const triggerIds = auditReport.findings
        .filter((f) =>
          [
            'malformed-reporig-fence',
            'tier1-over-ceiling',
            'monolithic-wiki-sections',
            'broken-context-pointers',
            'fragmented-always-on-files',
            'agents-md-unfenced',
          ].includes(f.id),
        )
        .map((f) => f.id);
      items.push({
        id: 'hygiene:progressive-disclosure',
        kind: 'veto',
        category: 'hygiene',
        introducedIn: 'unreleased',
        title: 'Adapt AGENTS.md to Three-Tier Progressive Disclosure',
        rationale: `Always-on instruction files (${auditReport.tier1.alwaysOnTotalLines} lines) triggered progressive disclosure findings: ${triggerIds.join(', ')}.`,
        recommendedAction:
          'Extract deep inline wiki sections into .agents/references/ with Tier 1 Context map pointers via /reporig',
        changesConfig: false,
        requiresApply: true,
        requiresSkillSync: false,
        trackInEvaluated: true,
        externalAction: null,
        transform: () => {},
      });
    }
  }

  return items;
}

export function collectBaselineEvaluatedIds(
  cwd,
  inspection,
  advisories = UPGRADE_ADVISORIES,
) {
  const ids = advisories.map((a) => a.id);
  const safeInspection = inspection ?? {};
  const commands = safeInspection.commands ?? {};

  for (const [source, skill] of Object.entries(CURATED_SKILLS)) {
    if (skill.choiceGroup !== null || !skill.defaultWhen) {
      continue;
    }
    if (matchesCatalogCondition(skill.defaultWhen, safeInspection)) {
      ids.push(`signal:curated-skill:${source}`);
    }
  }

  if (matchesCatalogCondition('hasPostgres', safeInspection)) {
    ids.push('signal:postgres-craft');
  }

  const hasPlaywright = safeInspection.hasPlaywright === true;
  if (hasPlaywright) {
    ids.push('signal:playwright-e2e');
  }

  const ciProvider = safeInspection.ciProvider;
  if (['github-actions', 'gitlab-ci', 'circleci'].includes(ciProvider)) {
    ids.push(`signal:ci-provider:${ciProvider}`);
  }

  const commandSlots = [
    'install',
    'dev',
    'build',
    'lint',
    'typecheck',
    'testUnit',
    'testE2e',
  ];
  for (const slot of commandSlots) {
    if (slot === 'testE2e' && hasPlaywright) {
      continue;
    }
    const detectedCmd = commands[slot];
    if (detectedCmd != null) {
      ids.push(`signal:command:${slot}:${detectedCmd}`);
    }
  }

  if (cwd && detectEslintIgnoreTarget(cwd) != null) {
    ids.push('hygiene:eslint-ignore');
  }

  if (cwd) {
    try {
      if (auditRepo(cwd).needsProgressiveDisclosureMigration) {
        ids.push('hygiene:progressive-disclosure');
      }
    } catch {
      // Ignore audit errors on unreadable or non-existent directories.
    }
  }

  return [...new Set(ids)].sort();
}

export function evaluateRepoUpgrades({
  cwd,
  rawConfigObject = null,
  config,
  inspection = {},
  advisories = UPGRADE_ADVISORIES,
}) {
  const previousReporigVersion =
    rawConfigObject?.reporigVersion ?? config?.reporigVersion ?? null;
  const currentReporigVersion = REPORIG_VERSION;
  const versionChanged =
    previousReporigVersion !== null &&
    previousReporigVersion !== currentReporigVersion;

  const hasExplicitEvaluatedField = Array.isArray(
    rawConfigObject?.evaluatedUpgrades,
  );
  const alreadyEvaluated = new Set(config?.evaluatedUpgrades ?? []);

  const pendingEvaluatedIds = [];
  const vetoItems = [];
  const questionnaireItems = [];

  for (const advisory of advisories) {
    let isEvaluated = alreadyEvaluated.has(advisory.id);
    if (
      !isEvaluated &&
      !hasExplicitEvaluatedField &&
      advisory.introducedIn !== 'unreleased'
    ) {
      const cmp = compareSemver(previousReporigVersion, advisory.introducedIn);
      if (cmp !== null && cmp >= 0) {
        isEvaluated = true;
      }
    }

    if (!isEvaluated) {
      pendingEvaluatedIds.push(advisory.id);
      if (
        typeof advisory.appliesWhen === 'function' &&
        advisory.appliesWhen(config, inspection, cwd)
      ) {
        if (advisory.kind === 'veto') {
          vetoItems.push({
            id: advisory.id,
            kind: 'veto',
            category: advisory.category,
            introducedIn: advisory.introducedIn,
            title: advisory.title,
            rationale: advisory.rationale,
            recommendedAction: advisory.recommendedAction,
            changesConfig: advisory.changesConfig ?? true,
            requiresApply: advisory.requiresApply ?? true,
            requiresSkillSync: advisory.requiresSkillSync ?? false,
            trackInEvaluated: advisory.trackInEvaluated ?? true,
            externalAction: advisory.externalAction ?? null,
          });
        } else if (advisory.kind === 'questionnaire') {
          const rawOptions =
            typeof advisory.options === 'function'
              ? advisory.options(config, inspection, cwd)
              : advisory.options;
          const resolvedQuestion =
            typeof advisory.question === 'function'
              ? advisory.question(config, inspection, cwd)
              : advisory.question;
          questionnaireItems.push({
            id: advisory.id,
            kind: 'questionnaire',
            category: advisory.category,
            introducedIn: advisory.introducedIn,
            title: advisory.title,
            question: resolvedQuestion,
            rationale: advisory.rationale,
            options: rawOptions,
          });
        }
      }
    }
  }

  // Live signal & hygiene detectors
  const liveSignals = detectLiveSignals({ cwd, config, inspection });
  for (const signal of liveSignals) {
    if (!alreadyEvaluated.has(signal.id)) {
      pendingEvaluatedIds.push(signal.id);
      if (signal.kind === 'questionnaire') {
        const rawOptions =
          typeof signal.options === 'function'
            ? signal.options(config, inspection, cwd)
            : signal.options;
        const resolvedQuestion =
          typeof signal.question === 'function'
            ? signal.question(config, inspection, cwd)
            : signal.question;
        questionnaireItems.push({
          id: signal.id,
          kind: 'questionnaire',
          category: signal.category,
          introducedIn: signal.introducedIn,
          title: signal.title,
          question: resolvedQuestion,
          rationale: signal.rationale,
          options: rawOptions,
        });
      } else {
        vetoItems.push({
          id: signal.id,
          kind: 'veto',
          category: signal.category,
          introducedIn: signal.introducedIn,
          title: signal.title,
          rationale: signal.rationale,
          recommendedAction: signal.recommendedAction,
          changesConfig: signal.changesConfig,
          requiresApply: signal.requiresApply,
          requiresSkillSync: signal.requiresSkillSync,
          trackInEvaluated: signal.trackInEvaluated,
          externalAction: signal.externalAction,
        });
      }
    }
  }

  // Live managed files drift detector
  const driftItem = detectManagedFilesDrift(cwd, config);
  if (driftItem) {
    vetoItems.push(driftItem);
  }

  const uniquePendingIds = [...new Set(pendingEvaluatedIds)].sort();
  const hasRecommendations =
    vetoItems.length > 0 || questionnaireItems.length > 0;

  return {
    previousReporigVersion,
    currentReporigVersion,
    versionChanged,
    hasRecommendations,
    vetoItems,
    questionnaireItems,
    pendingEvaluatedIds: uniquePendingIds,
  };
}

export function draftUpgradedConfig({
  cwd,
  rawConfigObject = null,
  config,
  inspection = {},
  accept = 'all',
  veto = [],
  answers = {},
  advisories = UPGRADE_ADVISORIES,
}) {
  const errors = [];
  const evaluation = evaluateRepoUpgrades({
    cwd,
    rawConfigObject,
    config,
    inspection,
    advisories,
  });

  const validVetoMap = new Map(evaluation.vetoItems.map((i) => [i.id, i]));
  const validQuestionnaireMap = new Map(
    evaluation.questionnaireItems.map((i) => [i.id, i]),
  );

  // Normalize veto
  let normalizedVeto = [];
  if (typeof veto === 'string') {
    normalizedVeto = veto
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (Array.isArray(veto)) {
    normalizedVeto = veto.map((s) => String(s).trim()).filter(Boolean);
  } else {
    errors.push('veto must be an array or comma-separated string of upgrade IDs.');
  }

  // Normalize accept
  let normalizedAcceptMode = null;
  let normalizedAcceptList = [];

  if (accept === 'all') {
    normalizedAcceptMode = 'all';
  } else if (accept === 'none') {
    normalizedAcceptMode = 'none';
  } else if (typeof accept === 'string') {
    normalizedAcceptMode = 'list';
    normalizedAcceptList = accept
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (Array.isArray(accept)) {
    normalizedAcceptMode = 'list';
    normalizedAcceptList = accept.map((s) => String(s).trim()).filter(Boolean);
  } else {
    errors.push('accept must be "all", "none", or an array / comma-separated string of upgrade IDs.');
  }

  if (normalizedVeto.length > 0 && normalizedAcceptMode !== 'all') {
    errors.push(
      'Combining non-empty veto with any accept value other than "all" is not supported.',
    );
  }

  // Validate veto IDs
  for (const vId of normalizedVeto) {
    if (!validVetoMap.has(vId)) {
      errors.push(`Unknown upgrade ID in veto: "${vId}".`);
    }
  }

  // Validate accept IDs
  if (normalizedAcceptMode === 'list') {
    for (const aId of normalizedAcceptList) {
      if (!validVetoMap.has(aId)) {
        errors.push(`Unknown upgrade ID in accept: "${aId}".`);
      }
    }
  }

  // Validate answers keys
  const answerEntries = Object.entries(answers ?? {});
  for (const [qId] of answerEntries) {
    if (!validQuestionnaireMap.has(qId)) {
      errors.push(`Unknown questionnaire item in answers: "${qId}".`);
    }
  }

  // Validate answers requirements
  const isNoneWithEmptyAnswers =
    normalizedAcceptMode === 'none' && answerEntries.length === 0;

  const answeredQuestions = {};
  if (!isNoneWithEmptyAnswers) {
    for (const [qId, qItem] of validQuestionnaireMap.entries()) {
      const ans = answers?.[qId];
      if (ans === undefined || ans === null || ans === '') {
        errors.push(`Missing required answer for questionnaire item "${qId}".`);
      } else {
        const validOptions = (qItem.options ?? []).map((o) => o.id);
        if (!validOptions.includes(ans)) {
          errors.push(
            `Invalid option "${ans}" for questionnaire item "${qId}". Expected one of: ${validOptions.join(', ')}.`,
          );
        } else {
          answeredQuestions[qId] = ans;
        }
      }
    }
  }

  if (errors.length > 0) {
    const err = new Error(`Upgrade configuration validation failed: ${errors.join('; ')}`);
    err.errors = errors;
    throw err;
  }

  // Determine accepted and vetoed IDs
  const acceptedVetoIds = [];
  const vetoedIds = [];

  const vetoSet = new Set(normalizedVeto);
  const acceptSet = new Set(normalizedAcceptList);

  for (const item of evaluation.vetoItems) {
    if (normalizedAcceptMode === 'all') {
      if (vetoSet.has(item.id)) {
        vetoedIds.push(item.id);
      } else {
        acceptedVetoIds.push(item.id);
      }
    } else if (normalizedAcceptMode === 'none') {
      vetoedIds.push(item.id);
    } else if (normalizedAcceptMode === 'list') {
      if (acceptSet.has(item.id)) {
        acceptedVetoIds.push(item.id);
      } else {
        vetoedIds.push(item.id);
      }
    }
  }

  // Build draft config
  const draft = structuredClone(config);
  draft.reporigVersion = REPORIG_VERSION;
  draft.updatedAt = new Date().toISOString();

  let requiresApply = false;
  let requiresSkillSync = false;
  const externalActions = [];

  // Apply accepted veto items
  const liveSignalsMap = new Map(
    detectLiveSignals({ cwd, config, inspection }).map((s) => [s.id, s]),
  );

  for (const itemId of acceptedVetoIds) {
    const item = validVetoMap.get(itemId);
    if (!item) continue;

    if (item.externalAction) {
      externalActions.push(item.externalAction);
    }

    if (item.id === 'drift:managed-files') {
      requiresApply = true;
      continue;
    }

    const advisory = advisories.find((a) => a.id === item.id);
    if (advisory && typeof advisory.transform === 'function') {
      advisory.transform(draft, inspection, cwd);
      if (advisory.changesConfig) {
        requiresApply = true;
      }
      if (advisory.requiresSkillSync) {
        requiresSkillSync = true;
      }
    } else {
      const signal = liveSignalsMap.get(item.id);
      if (signal && typeof signal.transform === 'function') {
        signal.transform(draft, inspection, cwd);
        if (signal.changesConfig || signal.requiresApply) {
          requiresApply = true;
        }
        if (signal.requiresSkillSync) {
          requiresSkillSync = true;
        }
      }
    }
  }

  // Apply questionnaire answers
  for (const [qId, selectedOption] of Object.entries(answeredQuestions)) {
    const advisory = advisories.find((a) => a.id === qId);
    if (advisory && typeof advisory.applyAnswer === 'function') {
      advisory.applyAnswer(draft, selectedOption, { cwd, inspection, config });
    } else {
      const signal = liveSignalsMap.get(qId);
      if (signal && typeof signal.applyAnswer === 'function') {
        signal.applyAnswer(draft, selectedOption, { cwd, inspection, config });
      }
    }
  }

  // Check if questionnaire answers actually modified config semantics
  if (
    JSON.stringify(draft.harnesses) !== JSON.stringify(config.harnesses) ||
    JSON.stringify(draft.customHarnesses) !== JSON.stringify(config.customHarnesses) ||
    JSON.stringify(draft.sdlc) !== JSON.stringify(config.sdlc) ||
    JSON.stringify(draft.providers) !== JSON.stringify(config.providers) ||
    JSON.stringify(draft.project) !== JSON.stringify(config.project)
  ) {
    requiresApply = true;
  }
  if (
    JSON.stringify(draft.skills?.packs) !== JSON.stringify(config.skills?.packs) ||
    JSON.stringify(draft.skills?.spinePrecedence) !== JSON.stringify(config.skills?.spinePrecedence)
  ) {
    requiresApply = true;
    requiresSkillSync = true;
  }

  if (normalizedAcceptMode === 'none' && Object.keys(answeredQuestions).length === 0) {
    requiresApply = false;
    requiresSkillSync = false;
  }

  // Merge pendingEvaluatedIds into evaluatedUpgrades
  const combinedEvaluated = [
    ...(config.evaluatedUpgrades ?? []),
    ...evaluation.pendingEvaluatedIds,
  ];
  draft.evaluatedUpgrades = [...new Set(combinedEvaluated)].sort();

  const validated = validateConfig(draft);
  if (!validated.valid) {
    const err = new Error(
      `Draft upgraded config failed schema validation: ${validated.errors.join('; ')}`,
    );
    err.errors = validated.errors;
    throw err;
  }

  return {
    config: validated.value,
    acceptedVetoIds,
    vetoedIds,
    answeredQuestions,
    requiresApply,
    requiresSkillSync,
    externalActions,
  };
}
