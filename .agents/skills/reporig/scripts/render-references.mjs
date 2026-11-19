import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CURATED_SPINES,
  SPINE_STAGES,
  SPINE_STAGE_LABELS,
} from './catalog.mjs';
import { validateConfig } from './schema.mjs';
import { computeReferenceFlags } from './render-agents-md.mjs';

export const MANAGED_REFERENCE_FILES = [
  'spine-precedence.md',
  'playwright-e2e.md',
  'linear-cli-shim.md',
  'linear-cli.mjs',
];

export const LEGACY_MANAGED_REFERENCE_FILES = [
  'testbotpro-workflow.md',
  'linear-antigravity-shim.md',
];

const TEMPLATE_LINEAR_CLI_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'templates',
  'linear-cli.mjs',
);

function renderSpinePrecedenceMd(cfg) {
  const spinePacks = cfg.skills.packs.filter((pack) => pack.kind === 'spine');
  const precedence = cfg.skills.spinePrecedence ?? {};

  const lines = [
    '# Lifecycle Spine Precedence',
    '',
    'Multiple lifecycle spine packs are installed in `.agents/skills/`. Follow the stage ownership table below so overlapping workflow skills never compete on the same task.',
    '',
    '## Installed spine packs',
    '',
  ];

  for (const pack of spinePacks) {
    const curated = CURATED_SPINES[pack.source];
    const label = curated ? curated.label : `\`${pack.source}\``;
    lines.push(`- ${label} (\`${pack.url}\`)`);
  }

  lines.push(
    '',
    '## Stage ownership',
    '',
    '| Stage | Winning spine pack | Primary stage skills |',
    '|---|---|---|',
  );

  for (const stage of SPINE_STAGES) {
    const stageLabel = SPINE_STAGE_LABELS[stage] ?? stage;
    const owner = precedence[stage] ?? '';
    const curatedOwner = CURATED_SPINES[owner];
    const ownerPack = spinePacks.find((p) => p.source === owner);
    const rawStageSkills = curatedOwner?.stageSkills?.[stage] ?? [];
    const stageSkills = Array.isArray(ownerPack?.selectedSkills)
      ? rawStageSkills.filter((skill) => ownerPack.selectedSkills.includes(skill))
      : rawStageSkills;
    const formattedSkills =
      stageSkills.length > 0
        ? stageSkills.map((skill) => `\`${skill}\``).join(', ')
        : 'Pack stage skills in `.agents/skills/`';
    lines.push(`| ${stageLabel} | \`${owner}\` | ${formattedSkills} |`);
  }

  lines.push(
    '',
    '## Routing rules',
    '',
    '1. When entering a lifecycle stage, invoke only the winning spine pack skills assigned to that stage unless the user explicitly names another skill in chat.',
    '2. Non-overlapping utility skills (such as `systematic-debugging`) remain available across stages.',
    '3. If `.agents/skills/` contains a prefixed directory (`<packSlug>-<skillName>`) created to prevent name collisions, treat the unprefixed winning pack skill as authoritative.',
    '',
  );

  return lines.join('\n');
}

function renderPlaywrightE2eMd(cfg) {
  const e2eCommand = cfg.project.commands.testE2e || 'npx playwright test';

  const lines = [
    '# Playwright E2E Conventions',
    '',
    'Cover user-observable browser workflows with deterministic Playwright end-to-end tests.',
    '',
    '## Running E2E suites',
    '',
    `1. Run \`${e2eCommand}\` and confirm passing output before committing UI or user-flow changes.`,
    '2. Keep each test independent so specs pass regardless of execution order or parallelism.',
    '',
    '## Selector and accessibility stability',
    '',
    '1. Prefer accessible, user-facing locators first: `page.getByRole(...)`, `page.getByLabel(...)`, `page.getByPlaceholder(...)`, and `page.getByText(...)`.',
    '2. Fall back to `page.getByTestId(...)` only when semantic roles and accessible names do not distinguish elements.',
    '3. Avoid brittle CSS class chains, XPath expressions, or DOM-index selectors.',
    '4. Use Playwright web-first assertions (`await expect(locator).toBeVisible()`, `toHaveURL()`, `toHaveText()`) instead of fixed sleeps (`waitForTimeout`).',
    '',
    '## Failure artifacts and debugging',
    '',
    '1. Inspect Playwright failure traces, screenshots, and HTML reports under `test-results/` and `playwright-report/` before changing application or test code.',
    '2. Never commit `playwright-report/` or `test-results/` artifact directories to git.',
    '',
  ];

  return lines.join('\n');
}

function renderLinearCliShimMd(cfg) {
  const projectHint = cfg.providers.issues.projectHint;
  const projectLine = projectHint
    ? `Default Linear project hint for this repository: \`${projectHint}\`.`
    : 'Ask the user which Linear project or team applies if multiple projects exist.';

  const lines = [
    '# Linear CLI Fallback for Remote Agent Sessions',
    '',
    'When a Linear MCP server is connected in the current session, use the MCP tools directly. When no Linear MCP server is connected (such as in a remote cloud or Antigravity workspace without interactive MCP OAuth), bootstrap and use `.agents/references/linear-cli.mjs`.',
    '',
    projectLine,
    '',
    '## Session bootstrap steps',
    '',
    '1. Resolve the Antigravity data directory with `APP_DATA_DIR="${ANTIGRAVITY_APP_DATA_DIR:-$HOME/.gemini/jetski}"`, create `"$APP_DATA_DIR/bin"` (`mkdir -p "$APP_DATA_DIR/bin"`), and ensure `"$APP_DATA_DIR/bin"` is exported on `PATH` in `~/.bashrc`.',
    '2. Check whether `"$APP_DATA_DIR/bin/linear"` and `"$APP_DATA_DIR/linear-token"` (or `$LINEAR_API_KEY`) already exist.',
    '3. If `"$APP_DATA_DIR/bin/linear"` is missing, copy `.agents/references/linear-cli.mjs` to `"$APP_DATA_DIR/bin/linear"` and run `chmod +x "$APP_DATA_DIR/bin/linear"` if permitted by the filesystem (otherwise invoke via `node "$APP_DATA_DIR/bin/linear"`).',
    '4. If neither `$LINEAR_API_KEY` nor `"$APP_DATA_DIR/linear-token"` exists, ask the user in chat for their Linear personal API key (`<YOUR_LINEAR_API_KEY>`) and run `linear auth-key <YOUR_LINEAR_API_KEY>`. Never hardcode, echo into tracked files, or commit API keys.',
    '5. Register a persistent `linear` skill so future remote sessions load it automatically: call Antigravity\'s `save_skill` tool with `overwrite: true` when available, or write `~/.gemini/config/skills/linear/SKILL.md` as a local fallback, documenting `"$APP_DATA_DIR/bin/linear"` commands and the `Todo` -> `In Progress` -> `In Review` -> `Done` workflow.',
    '6. Verify authentication and workspace access by running `linear me` and `linear projects`.',
    '',
    '## Supported `linear` CLI commands',
    '',
    '| Command | Purpose |',
    '|---|---|',
    '| `linear auth-key <YOUR_LINEAR_API_KEY>` | Verify viewer identity and save `<APP_DATA_DIR>/linear-token` (`0600`) |',
    '| `linear me` / `linear whoami` | Print authenticated Linear user (`--json` supported) |',
    '| `linear teams [--json]` | List workspace teams |',
    '| `linear projects [--json]` | List workspace projects and linked teams |',
    '| `linear states [--team <KEY>] [--json]` | List workflow states (case-insensitive team filter) |',
    '| `linear issues` / `linear list` `[filters] [--json]` | Filter by `--project`, `--team`, `--state`, `--assignee`, `--limit` |',
    '| `linear view <ISSUE-ID> [--json]` | Show issue metadata, branchName, description, and comments |',
    '| `linear create --title <text> [options] [--json]` | Create issue (defaults `--state "Todo"` and `--assignee "me"`, inferring team from `--project`) |',
    '| `linear state <ISSUE-ID> "<state-name>" [--json]` | Case-insensitively resolve state on the issue team and update |',
    '| `linear update <ISSUE-ID> [options] [--json]` | Update `--state`, `--title`, `--description`, `--project`, `--assignee`, or `--priority` |',
    '| `linear comment <ISSUE-ID> "<text>" [--json]` | Post a Markdown comment on an issue |',
    '| `linear graphql "<query>" [\'{"var":"val"}\']` | Run raw GraphQL query or mutation against Linear |',
    '',
  ];

  return lines.join('\n');
}

export function renderReferenceFiles(config) {
  const flags = computeReferenceFlags(config);
  const validation = validateConfig(config);
  const cfg = validation.value;

  const files = new Map();

  if (flags.hasMultipleSpines) {
    files.set('spine-precedence.md', renderSpinePrecedenceMd(cfg));
  }
  if (flags.hasPlaywright) {
    files.set('playwright-e2e.md', renderPlaywrightE2eMd(cfg));
  }
  if (flags.hasLinearCliFallback) {
    files.set('linear-cli-shim.md', renderLinearCliShimMd(cfg));
    files.set(
      'linear-cli.mjs',
      fs.readFileSync(TEMPLATE_LINEAR_CLI_PATH, 'utf8'),
    );
  }

  return files;
}

export function syncReferences(cwd, config) {
  if (typeof cwd !== 'string' || cwd.trim().length === 0) {
    throw new Error('cwd must be a non-empty directory path.');
  }

  const activeFiles = renderReferenceFiles(config);
  const refsDir = path.join(cwd, '.agents', 'references');

  const written = [];
  const removed = [];

  if (activeFiles.size > 0) {
    fs.mkdirSync(refsDir, { recursive: true });
    for (const [fileName, content] of activeFiles.entries()) {
      const targetPath = path.join(refsDir, fileName);
      const isExecutableScript = fileName === 'linear-cli.mjs';
      fs.writeFileSync(targetPath, content, {
        encoding: 'utf8',
        ...(isExecutableScript ? { mode: 0o755 } : {}),
      });
      if (isExecutableScript) {
        try {
          fs.chmodSync(targetPath, 0o755);
        } catch {
          // Ignore chmod errors on filesystems without POSIX mode bits.
        }
      }
      written.push(fileName);
    }
  }

  if (fs.existsSync(refsDir)) {
    for (const managedName of [
      ...MANAGED_REFERENCE_FILES,
      ...LEGACY_MANAGED_REFERENCE_FILES,
    ]) {
      if (activeFiles.has(managedName)) {
        continue;
      }
      const candidatePath = path.join(refsDir, managedName);
      if (fs.existsSync(candidatePath)) {
        fs.rmSync(candidatePath, { force: true });
        removed.push(managedName);
      }
    }

    const remainingEntries = fs.readdirSync(refsDir);
    if (remainingEntries.length === 0) {
      fs.rmdirSync(refsDir);
    }
  }

  written.sort();
  removed.sort();

  return { written, removed };
}
