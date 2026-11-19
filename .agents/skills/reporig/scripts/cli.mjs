#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  CURATED_SKILLS,
  CURATED_SPINES,
  REPORIG_REPO_URL,
  REPORIG_VERSION,
  SELF_SKILL_NAMES,
  matchesCatalogCondition,
} from './catalog.mjs';
import {
  auditRepo,
  discoverScaffoldContextPointers,
  validateAgentsMdPointers,
} from './audit.mjs';
import { findCaseInsensitiveRootFile, inspectRepo } from './inspect.mjs';
import {
  applyAgentsMd,
  applyClaudeMd,
  scanFenceMarkers,
} from './render-agents-md.mjs';
import {
  LEGACY_MANAGED_REFERENCE_FILES,
  MANAGED_REFERENCE_FILES,
  renderReferenceFiles,
  syncReferences,
} from './render-references.mjs';
import {
  ProfileError,
  deleteNamedProfile,
  draftNamedProfile,
  listSavedProfiles,
  matchSavedProfiles,
  resolveProfilesPath,
  saveNamedProfile,
} from './profiles.mjs';
import {
  buildConfigFromPreset,
  parseConfigFile,
  validateConfig,
} from './schema.mjs';
import {
  checkPackUpdates,
  previewBrownfieldSkillOps,
  syncClaudeSkillsBridge,
  syncSkillPacks,
  updateInstalledPacks,
} from './skills-manager.mjs';
import {
  checkEslintIgnoreHygiene,
  collectBaselineEvaluatedIds,
  computeGitignoreUpdate,
  draftUpgradedConfig,
  evaluateRepoUpgrades,
  inferRepoHarnesses,
} from './upgrades.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SELF_SKILL_DIR = path.resolve(SCRIPT_DIR, '..');

const SUBCOMMANDS = [
  'inspect',
  'audit',
  'preset',
  'validate',
  'apply',
  'check-upgrades',
  'draft-upgrades',
  'ack-upgrades',
  'check-updates',
  'update-skills',
  'profiles',
];

const PROFILE_ACTIONS = ['list', 'draft', 'match', 'save', 'delete'];

const FLAT_ESLINT_CONFIG_FILES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
];

const SAFE_SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_REFERENCE_MD_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const RESERVED_SCOPED_TOP_DIRS = new Set([
  '.git',
  '.agents',
  '.claude',
  '.cursor',
  '.github',
  'node_modules',
  '.worktrees',
  '.superpowers',
]);
const LEGACY_FILE_ALLOWLIST_RE =
  /^(?:\.cursorrules|\.github\/copilot-instructions\.md|skills-lock\.json|\.cursor\/rules\/[A-Za-z0-9_.-]+)$/;
class CliError extends Error {
  constructor(message, errors = null) {
    super(message);
    this.name = 'CliError';
    this.errors = Array.isArray(errors) ? errors : null;
  }
}

function writeJson(payload, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = exitCode;
}

function writeError(message, errors = null) {
  const payload = {
    ok: false,
    error: message,
    ...(Array.isArray(errors) ? { errors } : {}),
  };
  writeJson(payload, 1);
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isDirectory(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

function resolveExistingCwd(rawCwd) {
  if (rawCwd === undefined) {
    return path.resolve(process.cwd());
  }
  if (typeof rawCwd !== 'string' || rawCwd.trim().length === 0) {
    throw new CliError('Flag --cwd must be a non-empty directory path.');
  }
  const resolved = path.resolve(rawCwd);
  if (!isDirectory(resolved)) {
    throw new CliError(`Repository directory does not exist: ${resolved}`);
  }
  return resolved;
}

function normalizeOptionalSelfUrl(rawSelfUrl) {
  const trimmed = String(rawSelfUrl ?? '').trim();
  if (trimmed.length === 0 || trimmed.toLowerCase() === 'none') {
    return null;
  }
  return trimmed;
}


function parseSubcommandFlags(restArgs, optionsSpec) {
  try {
    const parsed = parseArgs({
      args: restArgs,
      options: optionsSpec,
      strict: true,
      allowPositionals: false,
    });
    return parsed.values;
  } catch (err) {
    throw new CliError(err.message);
  }
}

function loadRequiredConfigWithRaw(configPath) {
  const parsed = parseConfigFile(configPath);
  if (!parsed.exists) {
    const msg = `Config file not found: ${configPath}`;
    throw new CliError(msg, [msg]);
  }
  if (!parsed.valid) {
    throw new CliError(`Invalid reporig config in ${configPath}`, parsed.errors);
  }
  let rawConfigObject = null;
  try {
    const rawText = fs.readFileSync(configPath, 'utf8');
    rawConfigObject = JSON.parse(rawText);
  } catch {
    rawConfigObject = parsed.config;
  }
  return {
    config: parsed.config,
    rawConfigObject,
  };
}

function loadRequiredConfig(configPath) {
  return loadRequiredConfigWithRaw(configPath).config;
}

async function handleInspect(restArgs) {
  const values = parseSubcommandFlags(restArgs, {
    cwd: { type: 'string' },
  });
  const cwd = resolveExistingCwd(values.cwd);
  const result = await inspectRepo(cwd);
  writeJson(result, 0);
}

async function handleAudit(restArgs) {
  const values = parseSubcommandFlags(restArgs, {
    cwd: { type: 'string' },
  });
  const cwd = resolveExistingCwd(values.cwd);
  const result = auditRepo(cwd);
  writeJson(result, 0);
}

async function handlePreset(restArgs) {
  const values = parseSubcommandFlags(restArgs, {
    id: { type: 'string' },
    cwd: { type: 'string' },
  });

  if (typeof values.id !== 'string' || values.id.trim().length === 0) {
    throw new CliError('Missing required --id <presetId> flag.');
  }

  const presetId = values.id.trim();
  const cwd = resolveExistingCwd(values.cwd);
  const inspection = await inspectRepo(cwd);

  const packs = [
    {
      source: 'obra/superpowers',
      url: CURATED_SPINES['obra/superpowers'].url,
      kind: 'spine',
      installedDirs: [],
      commitSha: null,
      installedAt: null,
    },
  ];

  for (const skill of Object.values(CURATED_SKILLS)) {
    if (matchesCatalogCondition(skill.defaultWhen, inspection)) {
      packs.push({
        source: skill.source,
        url: skill.url,
        kind: skill.kind,
        installedDirs: [],
        commitSha: null,
        installedAt: null,
      });
    }
  }

  const sourceId = ['github', 'gitlab', 'bitbucket'].includes(
    inspection.gitRemoteHost,
  )
    ? inspection.gitRemoteHost
    : 'git-only';

  const ciId = ['github-actions', 'gitlab-ci', 'circleci'].includes(
    inspection.ciProvider,
  )
    ? inspection.ciProvider
    : 'local-only';

  let sdlcOverrides = {};
  if (inspection.hasPlaywright) {
    sdlcOverrides = { e2eTool: 'playwright' };
  } else if (!inspection.hasFrontendUi) {
    sdlcOverrides = { e2eTool: 'none' };
  }

  const draft = buildConfigFromPreset(presetId, {
    project: {
      name: inspection.projectName,
      packageManager: inspection.packageManager,
      commands: inspection.commands,
    },
    sdlc: sdlcOverrides,
    providers: {
      source: {
        id: sourceId,
        customName: null,
        notes: null,
      },
      ci: {
        id: ciId,
        customName: null,
        notes: null,
      },
      specs: {
        id: 'in-repo',
        specsDir: 'docs/superpowers/specs',
        plansDir: 'docs/superpowers/plans',
        customName: null,
        notes: null,
      },
    },
    skills: {
      packs,
      spinePrecedence: null,
    },
    evaluatedUpgrades: collectBaselineEvaluatedIds(cwd, inspection),
  });

  const validation = validateConfig(draft);
  if (!validation.valid) {
    throw new CliError(
      'Generated preset draft failed schema validation.',
      validation.errors,
    );
  }

  writeJson(validation.value, 0);
}

async function handleValidate(restArgs) {
  const values = parseSubcommandFlags(restArgs, {
    config: { type: 'string' },
  });

  if (typeof values.config !== 'string' || values.config.trim().length === 0) {
    throw new CliError('Missing required --config <path> flag.');
  }

  const configPath = path.resolve(values.config);
  const parsed = parseConfigFile(configPath);

  if (parsed.valid) {
    writeJson(
      {
        valid: true,
        errors: [],
        config: parsed.config,
      },
      0,
    );
    return;
  }

  const errors = !parsed.exists
    ? [`Config file not found: ${configPath}`]
    : parsed.errors;

  writeJson(
    {
      valid: false,
      errors,
      config: null,
    },
    1,
  );
}

function lexCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function pathExistsOrSymlink(targetPath) {
  try {
    fs.lstatSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

function parseAllOrSkillListFlag(rawValue, flagName) {
  if (rawValue === undefined) {
    return null;
  }
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    throw new CliError(
      `Flag ${flagName} must be "all" or a non-empty comma-separated list of skill directory names.`,
    );
  }
  const trimmed = rawValue.trim();
  if (trimmed === 'all') {
    return 'all';
  }
  const segments = rawValue.split(',').map((entry) => entry.trim());
  if (segments.some((entry) => entry.length === 0)) {
    throw new CliError(
      `Flag ${flagName} contains an empty skill directory entry.`,
    );
  }
  const unique = new Set();
  for (const entry of segments) {
    if (!SAFE_SKILL_NAME_RE.test(entry)) {
      throw new CliError(
        `Unsafe skill directory name in ${flagName}: "${entry}".`,
      );
    }
    unique.add(entry);
  }
  return [...unique].sort(lexCompare);
}

function parseSkillCsvFlag(rawValue, flagName) {
  if (rawValue === undefined) {
    return [];
  }
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    throw new CliError(
      `Flag ${flagName} must be a non-empty comma-separated list of skill directory names.`,
    );
  }
  const segments = rawValue.split(',').map((entry) => entry.trim());
  if (segments.some((entry) => entry.length === 0)) {
    throw new CliError(
      `Flag ${flagName} contains an empty skill directory entry.`,
    );
  }
  const unique = new Set();
  for (const entry of segments) {
    if (!SAFE_SKILL_NAME_RE.test(entry)) {
      throw new CliError(
        `Unsafe skill directory name in ${flagName}: "${entry}".`,
      );
    }
    unique.add(entry);
  }
  return [...unique].sort(lexCompare);
}

function parseAndValidateLegacyFiles(rawValue, cwd) {
  if (rawValue === undefined) {
    return [];
  }
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    throw new CliError(
      'Flag --remove-legacy-files must be a non-empty comma-separated list of allowlisted paths.',
    );
  }
  const segments = rawValue.split(',').map((entry) => entry.trim());
  if (segments.some((entry) => entry.length === 0)) {
    throw new CliError(
      'Flag --remove-legacy-files contains an empty path entry.',
    );
  }

  const resolvedCwd = path.resolve(cwd);
  const realCwd = fs.realpathSync(resolvedCwd);
  const unique = new Set();

  for (const rawEntry of segments) {
    const normalizedEntry = rawEntry.replace(/^\.\//, '');
    if (!LEGACY_FILE_ALLOWLIST_RE.test(normalizedEntry)) {
      throw new CliError(
        `Disallowed path in --remove-legacy-files: "${rawEntry}".`,
      );
    }
    const parts = normalizedEntry.split('/');
    if (parts.some((part) => part === '.' || part === '..')) {
      throw new CliError(
        `Path traversal rejected in --remove-legacy-files: "${rawEntry}".`,
      );
    }
    const fullPath = path.resolve(resolvedCwd, normalizedEntry);
    if (!fullPath.startsWith(`${resolvedCwd}${path.sep}`)) {
      throw new CliError(
        `Path escaped repository root in --remove-legacy-files: "${rawEntry}".`,
      );
    }

    let currentParent = resolvedCwd;
    for (const parentSegment of parts.slice(0, -1)) {
      currentParent = path.join(currentParent, parentSegment);
      let parentStat;
      try {
        parentStat = fs.lstatSync(currentParent);
      } catch (err) {
        if (err && err.code === 'ENOENT') {
          break;
        }
        throw err;
      }
      if (!parentStat.isDirectory() && !parentStat.isSymbolicLink()) {
        throw new CliError(
          `Parent component is not a directory in --remove-legacy-files: "${rawEntry}".`,
        );
      }
      let realParent;
      try {
        realParent = fs.realpathSync(currentParent);
      } catch {
        throw new CliError(
          `Broken or unsafe parent symlink in --remove-legacy-files: "${rawEntry}".`,
        );
      }
      if (
        realParent !== realCwd &&
        !realParent.startsWith(`${realCwd}${path.sep}`)
      ) {
        throw new CliError(
          `Parent directory symlink escapes repository root in --remove-legacy-files: "${rawEntry}".`,
        );
      }
      if (!fs.statSync(realParent).isDirectory()) {
        throw new CliError(
          `Parent component is not a directory in --remove-legacy-files: "${rawEntry}".`,
        );
      }
    }

    try {
      const targetStat = fs.lstatSync(fullPath);
      if (targetStat.isDirectory() && !targetStat.isSymbolicLink()) {
        throw new CliError(
          `Target in --remove-legacy-files is a directory, expected a file: "${rawEntry}".`,
        );
      }
    } catch (err) {
      if (err instanceof CliError) {
        throw err;
      }
      if (!err || err.code !== 'ENOENT') {
        throw err;
      }
    }

    unique.add(normalizedEntry);
  }

  return [...unique].sort(lexCompare);
}

function parseAndValidateWriteReferences(rawValues, cwd) {
  if (!Array.isArray(rawValues) || rawValues.length === 0) {
    return [];
  }

  const resolvedCwd = path.resolve(cwd);
  const realCwd = fs.realpathSync(resolvedCwd);
  const reservedRefNames = new Set([
    ...MANAGED_REFERENCE_FILES,
    ...LEGACY_MANAGED_REFERENCE_FILES,
  ]);

  for (const relContainer of ['.agents', '.agents/references']) {
    const containerPath = path.join(resolvedCwd, relContainer);
    const stat = safeLstat(containerPath);
    if (!stat) {
      continue;
    }
    if (!stat.isDirectory() && !stat.isSymbolicLink()) {
      throw new CliError(
        `Container path "${relContainer}" is not a directory in repository.`,
      );
    }
    let realContainer;
    try {
      realContainer = fs.realpathSync(containerPath);
    } catch {
      throw new CliError(
        `Broken symlink on container path "${relContainer}" in --write-reference.`,
      );
    }
    if (
      realContainer !== realCwd &&
      !realContainer.startsWith(`${realCwd}${path.sep}`)
    ) {
      throw new CliError(
        `Container symlink "${relContainer}" escapes repository root in --write-reference.`,
      );
    }
    if (!fs.statSync(realContainer).isDirectory()) {
      throw new CliError(
        `Container path "${relContainer}" does not resolve to a directory in --write-reference.`,
      );
    }
  }

  const seenNames = new Set();
  const entries = [];

  for (const rawEntry of rawValues) {
    if (typeof rawEntry !== 'string') {
      throw new CliError(
        'Flag --write-reference expects <name.md>=<scratch-path>.',
      );
    }
    const eqIdx = rawEntry.indexOf('=');
    if (eqIdx <= 0 || eqIdx === rawEntry.length-1) {
      throw new CliError(
        `Invalid --write-reference entry "${rawEntry}"; expected <name.md>=<scratch-path>.`,
      );
    }
    const name = rawEntry.slice(0, eqIdx).trim();
    const scratchRaw = rawEntry.slice(eqIdx + 1).trim();

    if (!SAFE_REFERENCE_MD_NAME_RE.test(name)) {
      throw new CliError(
        `Invalid reference filename "${name}" in --write-reference; expected lowercase kebab-case <name>.md.`,
      );
    }
    if (reservedRefNames.has(name)) {
      throw new CliError(
        `Reference filename "${name}" in --write-reference is reserved by reporig managed references.`,
      );
    }
    if (seenNames.has(name)) {
      throw new CliError(
        `Duplicate reference filename "${name}" in --write-reference.`,
      );
    }
    seenNames.add(name);

    const scratchPath = path.resolve(scratchRaw);
    if (!isFile(scratchPath)) {
      throw new CliError(
        `Scratch reference file not found for "${name}": ${scratchPath}`,
      );
    }

    const refsDir = path.join(resolvedCwd, '.agents', 'references');
    const targetPath = path.join(refsDir, name);
    const targetStat = safeLstat(targetPath);
    if (targetStat && (targetStat.isDirectory() || targetStat.isSymbolicLink())) {
      throw new CliError(
        `Target reference path ".agents/references/${name}" cannot be a directory or symlink.`,
      );
    }
    if (isDirectory(refsDir)) {
      for (const entryName of fs.readdirSync(refsDir)) {
        if (entryName.toLowerCase() === name.toLowerCase()) {
          const entryStat = safeLstat(path.join(refsDir, entryName));
          if (entryStat && (entryStat.isDirectory() || entryStat.isSymbolicLink())) {
            throw new CliError(
              `Target reference path ".agents/references/${entryName}" cannot be a directory or symlink.`,
            );
          }
        }
      }
    }

    const realScratch = fs.realpathSync(scratchPath);
    if (
      scratchPath === targetPath ||
      (targetStat && fs.realpathSync(targetPath) === realScratch)
    ) {
      throw new CliError(
        `Scratch file for "${name}" in --write-reference must be outside .agents/references/${name}.`,
      );
    }

    entries.push({
      name,
      targetPath,
      content: fs.readFileSync(scratchPath, 'utf8'),
    });
  }

  return entries.sort((a, b) => lexCompare(a.name, b.name));
}

function parseAndValidateWriteScopedAgents(rawValues, cwd) {
  if (!Array.isArray(rawValues) || rawValues.length === 0) {
    return [];
  }

  const resolvedCwd = path.resolve(cwd);
  const realCwd = fs.realpathSync(resolvedCwd);
  const seenDirs = new Set();
  const seenRealDirs = new Set();
  const entries = [];

  for (const rawEntry of rawValues) {
    if (typeof rawEntry !== 'string') {
      throw new CliError(
        'Flag --write-scoped-agents expects <rel-dir>=<scratch-path>.',
      );
    }
    const eqIdx = rawEntry.indexOf('=');
    if (eqIdx <= 0 || eqIdx === rawEntry.length-1) {
      throw new CliError(
        `Invalid --write-scoped-agents entry "${rawEntry}"; expected <rel-dir>=<scratch-path>.`,
      );
    }
    const relDirInput = rawEntry.slice(0, eqIdx).trim();
    const scratchRaw = rawEntry.slice(eqIdx + 1).trim();

    if (
      relDirInput.length === 0 ||
      relDirInput.includes('\\') ||
      relDirInput.startsWith('/')
    ) {
      throw new CliError(
        `Invalid relative directory "${relDirInput}" in --write-scoped-agents.`,
      );
    }
    const normalizedRelDir = relDirInput.replace(/^\.\//, '').replace(/\/+$/, '');
    const parts = normalizedRelDir.split('/');
    if (
      normalizedRelDir.length === 0 ||
      parts.some((part) => part.length === 0 || part === '.' || part === '..')
    ) {
      throw new CliError(
        `Unsafe relative directory "${relDirInput}" in --write-scoped-agents.`,
      );
    }
    if (RESERVED_SCOPED_TOP_DIRS.has(parts[0].toLowerCase())) {
      throw new CliError(
        `Disallowed reserved directory "${parts[0]}" in --write-scoped-agents.`,
      );
    }
    if (seenDirs.has(normalizedRelDir.toLowerCase())) {
      throw new CliError(
        `Duplicate target directory "${normalizedRelDir}" in --write-scoped-agents.`,
      );
    }
    seenDirs.add(normalizedRelDir.toLowerCase());

    let currentDir = resolvedCwd;
    for (const seg of parts) {
      currentDir = path.join(currentDir, seg);
      const segStat = safeLstat(currentDir);
      if (!segStat) {
        throw new CliError(
          `Target subdirectory does not exist in --write-scoped-agents: "${normalizedRelDir}".`,
        );
      }
      let realSeg;
      try {
        realSeg = fs.realpathSync(currentDir);
      } catch {
        throw new CliError(
          `Broken symlink in --write-scoped-agents path: "${normalizedRelDir}".`,
        );
      }
      if (!realSeg.startsWith(`${realCwd}${path.sep}`)) {
        throw new CliError(
          `Directory symlink escapes repository root in --write-scoped-agents: "${normalizedRelDir}".`,
        );
      }
      if (!fs.statSync(realSeg).isDirectory()) {
        throw new CliError(
          `Path component is not a directory in --write-scoped-agents: "${normalizedRelDir}".`,
        );
      }
    }

    const scratchPath = path.resolve(scratchRaw);
    if (!isFile(scratchPath)) {
      throw new CliError(
        `Scratch scoped AGENTS.md file not found for "${normalizedRelDir}": ${scratchPath}`,
      );
    }

    const targetDir = path.join(resolvedCwd, normalizedRelDir);
    const realTargetDir = fs.realpathSync(targetDir);
    if (seenRealDirs.has(realTargetDir)) {
      throw new CliError(
        `Duplicate physical target directory "${normalizedRelDir}" in --write-scoped-agents.`,
      );
    }
    seenRealDirs.add(realTargetDir);

    const targetPath = path.join(targetDir, 'AGENTS.md');
    const targetStat = safeLstat(targetPath);
    if (targetStat && (targetStat.isDirectory() || targetStat.isSymbolicLink())) {
      throw new CliError(
        `Target "${normalizedRelDir}/AGENTS.md" cannot be a directory or symlink.`,
      );
    }
    for (const entryName of fs.readdirSync(targetDir)) {
      if (entryName.toLowerCase() === 'agents.md') {
        const entryStat = safeLstat(path.join(targetDir, entryName));
        if (entryStat && (entryStat.isDirectory() || entryStat.isSymbolicLink())) {
          throw new CliError(
            `Target "${normalizedRelDir}/${entryName}" cannot be a directory or symlink.`,
          );
        }
      }
    }

    const foundExistingScoped = findCaseInsensitiveRootFile(
      targetDir,
      'AGENTS.md',
    );
    const realScratch = fs.realpathSync(scratchPath);
    if (
      scratchPath === targetPath ||
      (foundExistingScoped.exists &&
        foundExistingScoped.fullPath &&
        fs.realpathSync(foundExistingScoped.fullPath) === realScratch)
    ) {
      throw new CliError(
        `Scratch file for "${normalizedRelDir}" in --write-scoped-agents must be outside ${normalizedRelDir}/AGENTS.md.`,
      );
    }

    const content = fs.readFileSync(scratchPath, 'utf8');
    const { startMatches, endMatches } = scanFenceMarkers(content);
    if (startMatches.length > 0 || endMatches.length > 0) {
      throw new CliError(
        `Scoped AGENTS.md for "${normalizedRelDir}" must not contain reporig fence markers.`,
      );
    }

    entries.push({
      relDir: normalizedRelDir,
      relFilePath: `${normalizedRelDir}/AGENTS.md`,
      targetDir,
      existingFilename: foundExistingScoped.exists
        ? foundExistingScoped.filename
        : null,
      existingContent:
        foundExistingScoped.exists && foundExistingScoped.fullPath
          ? readTextIfExists(foundExistingScoped.fullPath)
          : null,
      content,
    });
  }

  return entries.sort((a, b) => lexCompare(a.relFilePath, b.relFilePath));
}

function renameCasePreserving(cwd, fromName, toName) {
  if (!fromName || fromName === toName) {
    return;
  }
  const fromPath = path.join(cwd, fromName);
  const toPath = path.join(cwd, toName);
  const tempPath = path.join(
    cwd,
    `.reporig-case-${process.pid}-${Date.now()}`,
  );
  try {
    fs.renameSync(fromPath, tempPath);
    fs.renameSync(tempPath, toPath);
  } finally {
    if (pathExistsOrSymlink(tempPath)) {
      if (!pathExistsOrSymlink(fromPath) && !pathExistsOrSymlink(toPath)) {
        try {
          fs.renameSync(tempPath, fromPath);
        } catch {
          fs.rmSync(tempPath, { force: true });
        }
      } else {
        fs.rmSync(tempPath, { force: true });
      }
    }
  }
}

function writeCanonicalRootFile(cwd, canonicalName, existingFilename, content) {
  const canonicalPath = path.join(cwd, canonicalName);
  const renamedCase = Boolean(
    existingFilename && existingFilename !== canonicalName,
  );
  if (renamedCase) {
    renameCasePreserving(cwd, existingFilename, canonicalName);
  }
  try {
    fs.writeFileSync(canonicalPath, content, 'utf8');
  } catch (err) {
    if (renamedCase && pathExistsOrSymlink(canonicalPath)) {
      try {
        renameCasePreserving(cwd, canonicalName, existingFilename);
      } catch {
        // Best-effort rollback of casing if file write fails.
      }
    }
    throw err;
  }
}

function restoreOptionalTextFile(filePath, previousContent) {
  if (previousContent === null || previousContent === undefined) {
    fs.rmSync(filePath, { force: true });
    return;
  }
  fs.writeFileSync(filePath, previousContent, 'utf8');
}

function safeLstat(targetPath) {
  try {
    return fs.lstatSync(targetPath);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

function restoreRootTextFile(
  cwd,
  canonicalName,
  previousFilename,
  previousContent,
) {
  if (previousContent === null || previousContent === undefined) {
    const currentFound = findCaseInsensitiveRootFile(cwd, canonicalName);
    if (currentFound.exists && currentFound.fullPath) {
      fs.rmSync(currentFound.fullPath, { force: true });
    } else {
      fs.rmSync(path.join(cwd, canonicalName), { force: true });
    }
    return;
  }

  const targetName = previousFilename || canonicalName;
  const currentFound = findCaseInsensitiveRootFile(cwd, canonicalName);
  if (currentFound.exists && currentFound.filename !== targetName) {
    renameCasePreserving(cwd, currentFound.filename, targetName);
  }
  fs.writeFileSync(path.join(cwd, targetName), previousContent, 'utf8');
}

function capturePreApplySnapshot(
  cwd,
  existingAgentsFilename,
  existingAgentsMd,
  existingClaudeFilename,
  existingClaudeMd,
  existingGitignore,
  legacyFilesToRemove,
  customReferencesToWrite = [],
  scopedAgentsToWrite = [],
) {
  const agentsDir = path.join(cwd, '.agents');
  const refsDir = path.join(agentsDir, 'references');
  const claudeDir = path.join(cwd, '.claude');
  const claudeSkillsPath = path.join(claudeDir, 'skills');
  const claudeSkillsStat = safeLstat(claudeSkillsPath);
  const hadAgentsDir = isDirectory(agentsDir);
  const hadReferencesDir = isDirectory(refsDir);
  const hadClaudeDir = isDirectory(claudeDir);
  const claudeSkillsLinkTarget =
    claudeSkillsStat && claudeSkillsStat.isSymbolicLink()
      ? fs.readlinkSync(claudeSkillsPath)
      : null;
  const hadClaudeSkillsEntry = claudeSkillsStat !== null;
  const existingReporigJson = readTextIfExists(
    path.join(agentsDir, 'reporig.json'),
  );
  const managedReferences = new Map();
  const customReferences = new Map();

  if (hadReferencesDir) {
    for (const managedName of [
      ...MANAGED_REFERENCE_FILES,
      ...LEGACY_MANAGED_REFERENCE_FILES,
    ]) {
      managedReferences.set(
        managedName,
        readTextIfExists(path.join(refsDir, managedName)),
      );
    }
    for (const customRef of customReferencesToWrite) {
      customReferences.set(
        customRef.name,
        readTextIfExists(path.join(refsDir, customRef.name)),
      );
    }
  } else {
    for (const customRef of customReferencesToWrite) {
      customReferences.set(customRef.name, null);
    }
  }

  const scopedAgents = scopedAgentsToWrite.map((entry) => ({
    targetDir: entry.targetDir,
    previousFilename: entry.existingFilename,
    previousContent: entry.existingContent,
  }));

  const legacyFiles = [];
  for (const relPath of legacyFilesToRemove) {
    const fullPath = path.join(cwd, relPath);
    let stat;
    try {
      stat = fs.lstatSync(fullPath);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        continue;
      }
      throw err;
    }
    if (stat.isSymbolicLink()) {
      legacyFiles.push({
        relPath,
        isSymlink: true,
        linkTarget: fs.readlinkSync(fullPath),
        content: null,
      });
    } else if (stat.isFile()) {
      legacyFiles.push({
        relPath,
        isSymlink: false,
        linkTarget: null,
        content: fs.readFileSync(fullPath, 'utf8'),
      });
    }
  }

  return {
    existingAgentsFilename,
    existingAgentsMd,
    existingClaudeFilename,
    existingClaudeMd,
    existingGitignore,
    existingReporigJson,
    hadAgentsDir,
    hadReferencesDir,
    hadClaudeDir,
    hadClaudeSkillsEntry,
    claudeSkillsLinkTarget,
    managedReferences,
    customReferences,
    scopedAgents,
    legacyFiles,
  };
}

function restorePreApplySnapshot(cwd, snapshot, mutationFlags) {
  if (mutationFlags.agentsMdWritten) {
    restoreRootTextFile(
      cwd,
      'AGENTS.md',
      snapshot.existingAgentsFilename,
      snapshot.existingAgentsMd,
    );
  }
  if (mutationFlags.claudeMdWritten) {
    restoreRootTextFile(
      cwd,
      'CLAUDE.md',
      snapshot.existingClaudeFilename,
      snapshot.existingClaudeMd,
    );
  }
  if (mutationFlags.gitignoreWritten) {
    restoreOptionalTextFile(
      path.join(cwd, '.gitignore'),
      snapshot.existingGitignore,
    );
  }
  if (mutationFlags.legacyFilesRemoved) {
    for (const entry of snapshot.legacyFiles) {
      const fullPath = path.join(cwd, entry.relPath);
      if (!pathExistsOrSymlink(fullPath)) {
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        if (entry.isSymlink) {
          fs.symlinkSync(entry.linkTarget, fullPath);
        } else {
          fs.writeFileSync(fullPath, entry.content, 'utf8');
        }
      }
    }
  }
  if (mutationFlags.reporigJsonWritten) {
    restoreOptionalTextFile(
      path.join(cwd, '.agents', 'reporig.json'),
      snapshot.existingReporigJson,
    );
  }
  if (mutationFlags.scopedAgentsWritten) {
    for (const scopedEntry of snapshot.scopedAgents) {
      restoreRootTextFile(
        scopedEntry.targetDir,
        'AGENTS.md',
        scopedEntry.previousFilename,
        scopedEntry.previousContent,
      );
    }
  }
  if (mutationFlags.referencesSynced || mutationFlags.customReferencesWritten) {
    const agentsDir = path.join(cwd, '.agents');
    const refsDir = path.join(agentsDir, 'references');

    if (!snapshot.hadReferencesDir) {
      if (isDirectory(refsDir)) {
        for (const managedName of [
          ...MANAGED_REFERENCE_FILES,
          ...LEGACY_MANAGED_REFERENCE_FILES,
        ]) {
          fs.rmSync(path.join(refsDir, managedName), { force: true });
        }
        for (const [customName] of snapshot.customReferences.entries()) {
          fs.rmSync(path.join(refsDir, customName), { force: true });
        }
        if (fs.readdirSync(refsDir).length === 0) {
          fs.rmdirSync(refsDir);
        }
      }
    } else {
      fs.mkdirSync(refsDir, { recursive: true });
      if (mutationFlags.referencesSynced) {
        for (const [managedName, prevContent] of snapshot.managedReferences.entries()) {
          const targetPath = path.join(refsDir, managedName);
          if (prevContent === null) {
            fs.rmSync(targetPath, { force: true });
          } else {
            const isExecutableScript = managedName === 'linear-cli.mjs';
            fs.writeFileSync(targetPath, prevContent, {
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
          }
        }
      }
      if (mutationFlags.customReferencesWritten) {
        for (const [customName, prevContent] of snapshot.customReferences.entries()) {
          restoreOptionalTextFile(path.join(refsDir, customName), prevContent);
        }
      }
    }

    if (
      !snapshot.hadAgentsDir &&
      isDirectory(agentsDir) &&
      fs.readdirSync(agentsDir).length === 0
    ) {
      fs.rmdirSync(agentsDir);
    }
  }
  if (mutationFlags.claudeBridgeSynced) {
    const claudeDir = path.join(cwd, '.claude');
    const claudeSkillsPath = path.join(claudeDir, 'skills');
    if (!snapshot.hadClaudeSkillsEntry) {
      fs.rmSync(claudeSkillsPath, { recursive: true, force: true });
    } else if (snapshot.claudeSkillsLinkTarget !== null) {
      const curStat = safeLstat(claudeSkillsPath);
      if (!curStat || !curStat.isSymbolicLink()) {
        fs.rmSync(claudeSkillsPath, { recursive: true, force: true });
        fs.mkdirSync(claudeDir, { recursive: true });
        fs.symlinkSync(snapshot.claudeSkillsLinkTarget, claudeSkillsPath, 'dir');
      }
    }
    if (
      !snapshot.hadClaudeDir &&
      isDirectory(claudeDir) &&
      fs.readdirSync(claudeDir).length === 0
    ) {
      fs.rmdirSync(claudeDir);
    }
  }
}

function removeLegacyFilesOnDisk(cwd, legacyFilesToRemove, mutationFlags) {
  const removed = [];
  let removedCursorRuleFile = false;

  for (const relPath of legacyFilesToRemove) {
    const fullPath = path.join(cwd, relPath);
    if (!pathExistsOrSymlink(fullPath)) {
      continue;
    }
    mutationFlags.legacyFilesRemoved = true;
    fs.unlinkSync(fullPath);
    removed.push(relPath);
    if (relPath.startsWith('.cursor/rules/')) {
      removedCursorRuleFile = true;
    }
  }

  if (removedCursorRuleFile) {
    const cursorRulesDir = path.join(cwd, '.cursor', 'rules');
    const cursorDir = path.join(cwd, '.cursor');
    try {
      if (
        isDirectory(cursorRulesDir) &&
        !fs.lstatSync(cursorRulesDir).isSymbolicLink() &&
        fs.readdirSync(cursorRulesDir).length === 0
      ) {
        fs.rmdirSync(cursorRulesDir);
      }
      if (
        isDirectory(cursorDir) &&
        !fs.lstatSync(cursorDir).isSymbolicLink() &&
        fs.readdirSync(cursorDir).length === 0
      ) {
        fs.rmdirSync(cursorDir);
      }
    } catch {
      // Ignore non-empty or concurrent directory cleanup errors.
    }
  }

  return removed.sort(lexCompare);
}

async function handleApply(restArgs) {
  const values = parseSubcommandFlags(restArgs, {
    cwd: { type: 'string' },
    config: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'skip-skills': { type: 'boolean', default: false },
    'non-managed-header': { type: 'string' },
    'write-reference': { type: 'string', multiple: true },
    'write-scoped-agents': { type: 'string', multiple: true },
    'replace-claude-md': { type: 'boolean', default: false },
    'adopt-skills': { type: 'string' },
    'migrate-claude-skills': { type: 'string' },
    'prune-skills': { type: 'string' },
    'remove-legacy-files': { type: 'string' },
  });

  const cwd = resolveExistingCwd(values.cwd);
  if (
    values.config !== undefined &&
    (typeof values.config !== 'string' || values.config.trim().length === 0)
  ) {
    throw new CliError('Flag --config must be a non-empty file path.');
  }

  let nonManagedHeader = null;
  if (values['non-managed-header'] !== undefined) {
    if (
      typeof values['non-managed-header'] !== 'string' ||
      values['non-managed-header'].trim().length === 0
    ) {
      throw new CliError(
        'Flag --non-managed-header must be a non-empty file path.',
      );
    }
    const headerPath = path.resolve(values['non-managed-header']);
    if (!isFile(headerPath)) {
      throw new CliError(`Non-managed header file not found: ${headerPath}`);
    }
    nonManagedHeader = fs.readFileSync(headerPath, 'utf8');
  }

  const replaceClaudeMd = Boolean(values['replace-claude-md']);
  const adoptSkills = parseAllOrSkillListFlag(
    values['adopt-skills'],
    '--adopt-skills',
  );
  const migrateClaudeSkills = parseAllOrSkillListFlag(
    values['migrate-claude-skills'],
    '--migrate-claude-skills',
  );
  const pruneSkills = parseSkillCsvFlag(
    values['prune-skills'],
    '--prune-skills',
  );
  const legacyFilesToRemove = parseAndValidateLegacyFiles(
    values['remove-legacy-files'],
    cwd,
  );
  const customReferencesToWrite = parseAndValidateWriteReferences(
    values['write-reference'],
    cwd,
  );
  const scopedAgentsToWrite = parseAndValidateWriteScopedAgents(
    values['write-scoped-agents'],
    cwd,
  );

  const targetReporigJsonPath = path.join(cwd, '.agents', 'reporig.json');
  const configPath =
    values.config !== undefined
      ? path.resolve(values.config)
      : targetReporigJsonPath;

  const config = loadRequiredConfig(configPath);
  const dryRun = Boolean(values['dry-run']);
  const skipSkills = Boolean(values['skip-skills']);

  const priorParsed = parseConfigFile(targetReporigJsonPath);
  const previousPacks = priorParsed.valid ? priorParsed.config.skills.packs : [];

  const foundAgents = findCaseInsensitiveRootFile(cwd, 'AGENTS.md');
  const existingAgentsFilename = foundAgents.exists ? foundAgents.filename : null;
  const existingAgentsMd =
    foundAgents.exists && foundAgents.fullPath
      ? readTextIfExists(foundAgents.fullPath)
      : null;

  const foundClaude = findCaseInsensitiveRootFile(cwd, 'CLAUDE.md');
  const existingClaudeFilename = foundClaude.exists ? foundClaude.filename : null;
  const existingClaudeMd =
    foundClaude.exists && foundClaude.fullPath
      ? readTextIfExists(foundClaude.fullPath)
      : null;

  const existingGitignore = readTextIfExists(path.join(cwd, '.gitignore'));

  const greenfieldContextPointers =
    existingAgentsMd === null && nonManagedHeader === null
      ? discoverScaffoldContextPointers(cwd, {
          stagedCustomReferences: customReferencesToWrite.map((r) => r.name),
          stagedScopedAgents: scopedAgentsToWrite.map((s) => s.relFilePath),
        })
      : [];

  let agentsMdResult;
  let claudeMdResult;
  let skillPreview;
  try {
    agentsMdResult = applyAgentsMd({
      existingContent: existingAgentsMd,
      nonManagedHeader,
      config,
      contextPointers: greenfieldContextPointers,
    });
    claudeMdResult = applyClaudeMd({
      existingContent: existingClaudeMd,
      includeClaudeBridge: true,
      replaceExisting: replaceClaudeMd,
    });
    skillPreview = previewBrownfieldSkillOps({
      cwd,
      config,
      adoptExistingSkills: adoptSkills,
      migrateClaudeSkills,
      pruneSkills,
      skipSkills,
    });
  } catch (err) {
    throw err instanceof CliError ? err : new CliError(err.message);
  }

  const agentsWouldNormalizeCaseFrom =
    existingAgentsFilename && existingAgentsFilename !== 'AGENTS.md'
      ? existingAgentsFilename
      : null;

  const claudeWouldNormalizeCaseFrom =
    existingClaudeFilename && existingClaudeFilename !== 'CLAUDE.md'
      ? existingClaudeFilename
      : null;
  const shouldWriteClaude = Boolean(
    claudeMdResult.shouldWrite || claudeWouldNormalizeCaseFrom !== null,
  );
  const claudeTargetContent = shouldWriteClaude
    ? (claudeMdResult.content ?? existingClaudeMd)
    : claudeMdResult.content;
  const claudeReplacedExisting = Boolean(
    replaceClaudeMd && existingClaudeMd !== null && claudeMdResult.shouldWrite,
  );

  const legacyFilesWouldRemove = legacyFilesToRemove.filter((relPath) =>
    pathExistsOrSymlink(path.join(cwd, relPath)),
  );

  const plannedReferenceFiles = [...renderReferenceFiles(config).keys()].sort();
  const referencesWouldWriteCustom = customReferencesToWrite.map((r) => r.name);
  const scopedAgentsWouldWrite = scopedAgentsToWrite.map((s) => s.relFilePath);

  const extraLazyDirs =
    config.providers?.specs?.id === 'in-repo'
      ? [
          config.providers.specs.specsDir,
          config.providers.specs.plansDir,
        ].filter(Boolean)
      : [];
  const pointerValidation = validateAgentsMdPointers(
    agentsMdResult.content,
    cwd,
    {
      additionalValidPaths: [
        'CLAUDE.md',
        ...plannedReferenceFiles.map((f) => `.agents/references/${f}`),
        ...referencesWouldWriteCustom.map((f) => `.agents/references/${f}`),
        ...scopedAgentsWouldWrite,
      ],
      removedPaths: legacyFilesToRemove,
      lazyDirs: extraLazyDirs,
    },
  );
  const brokenPointerWarning =
    pointerValidation.brokenPointers.length > 0
      ? `AGENTS.md contains broken file or directory pointers: ${pointerValidation.brokenPointers.map((b) => `${b.path} (line ${b.line})`).join(', ')}.`
      : null;

  const gitignoreCheck = computeGitignoreUpdate(existingGitignore);
  const eslintWarning = checkEslintIgnoreHygiene(cwd);
  const agentsMdWarnings = [
    ...agentsMdResult.warnings,
    ...(brokenPointerWarning ? [brokenPointerWarning] : []),
  ];
  const warnings = [
    ...agentsMdWarnings,
    ...(eslintWarning ? [eslintWarning] : []),
  ];

  if (dryRun) {
    writeJson(
      {
        ok: true,
        dryRun: true,
        agentsMd: {
          changed:
            existingAgentsMd !== agentsMdResult.content ||
            agentsWouldNormalizeCaseFrom !== null,
          managedLineCount: agentsMdResult.managedLineCount,
          totalLineCount: agentsMdResult.totalLineCount,
          appendedToUnfencedFile: agentsMdResult.appendedToUnfencedFile,
          reconciledNonManagedHeader: agentsMdResult.reconciledNonManagedHeader,
          wouldNormalizeCaseFrom: agentsWouldNormalizeCaseFrom,
          warnings: agentsMdWarnings,
          preview: agentsMdResult.content,
        },
        agentsMdPreview: agentsMdResult.content,
        claudeMd: {
          wouldWrite: shouldWriteClaude,
          content: claudeTargetContent,
          replacedExisting: claudeReplacedExisting,
          wouldNormalizeCaseFrom: claudeWouldNormalizeCaseFrom,
        },
        claudeMdWouldWrite: shouldWriteClaude,
        references: {
          planned: plannedReferenceFiles,
        },
        referencesWouldWriteCustom,
        scopedAgentsWouldWrite,
        skills: {
          skipped: skipSkills,
          plannedPacks: config.skills.packs.map((pack) => ({
            source: pack.source,
            url: pack.url,
            kind: pack.kind,
            ...(Array.isArray(pack.includePaths)
              ? { includePaths: [...pack.includePaths] }
              : {}),
            ...(Array.isArray(pack.excludePaths)
              ? { excludePaths: [...pack.excludePaths] }
              : {}),
          })),
          adoptSkills: skillPreview.adoptSkills,
          wouldAdoptDirs: skillPreview.wouldAdoptDirs,
          wouldMigrateClaudeDirs: skillPreview.wouldMigrateClaudeDirs,
          wouldPruneDirs: skillPreview.wouldPruneDirs,
        },
        legacyFilesWouldRemove,
        gitignoreUpdated: false,
        gitignoreWouldUpdate: gitignoreCheck.shouldUpdate,
        eslintWarning,
        warnings,
      },
      0,
    );
    return;
  }

  const preApplySnapshot = capturePreApplySnapshot(
    cwd,
    existingAgentsFilename,
    existingAgentsMd,
    existingClaudeFilename,
    existingClaudeMd,
    existingGitignore,
    legacyFilesToRemove,
    customReferencesToWrite,
    scopedAgentsToWrite,
  );
  const mutationFlags = {
    agentsMdWritten: false,
    claudeMdWritten: false,
    referencesSynced: false,
    customReferencesWritten: false,
    scopedAgentsWritten: false,
    gitignoreWritten: false,
    claudeBridgeSynced: false,
    legacyFilesRemoved: false,
    reporigJsonWritten: false,
  };

  let referencesResult;
  let nextPacks = config.skills.packs;
  let skillsSummary;
  let legacyFilesRemoved = [];
  let persistedConfig;

  try {
    // Write AGENTS.md, CLAUDE.md, references, and .gitignore before syncing skill packs so a local write failure (such as EACCES/EPERM on AGENTS.md) never leaves unrecorded skill directories in .agents/skills/, and roll back if syncSkillPacks or persisting reporig.json throws.
    writeCanonicalRootFile(
      cwd,
      'AGENTS.md',
      existingAgentsFilename,
      agentsMdResult.content,
    );
    mutationFlags.agentsMdWritten = true;

    if (shouldWriteClaude) {
      writeCanonicalRootFile(
        cwd,
        'CLAUDE.md',
        existingClaudeFilename,
        claudeTargetContent,
      );
      mutationFlags.claudeMdWritten = true;
    }

    referencesResult = syncReferences(cwd, config);
    mutationFlags.referencesSynced = true;

    if (customReferencesToWrite.length > 0) {
      const refsDir = path.join(cwd, '.agents', 'references');
      fs.mkdirSync(refsDir, { recursive: true });
      mutationFlags.customReferencesWritten = true;
      for (const customRef of customReferencesToWrite) {
        fs.writeFileSync(customRef.targetPath, customRef.content, 'utf8');
      }
    }

    if (scopedAgentsToWrite.length > 0) {
      mutationFlags.scopedAgentsWritten = true;
      for (const scopedEntry of scopedAgentsToWrite) {
        writeCanonicalRootFile(
          scopedEntry.targetDir,
          'AGENTS.md',
          scopedEntry.existingFilename,
          scopedEntry.content,
        );
      }
    }

    if (gitignoreCheck.shouldUpdate) {
      fs.writeFileSync(
        path.join(cwd, '.gitignore'),
        gitignoreCheck.content,
        'utf8',
      );
      mutationFlags.gitignoreWritten = true;
    }

    mutationFlags.claudeBridgeSynced = true;
    if (skipSkills) {
      if (migrateClaudeSkills !== null || pruneSkills.length > 0) {
        const syncResult = await syncSkillPacks({
          cwd,
          config,
          previousPacks,
          adoptExistingSkills: adoptSkills,
          migrateClaudeSkills,
          pruneSkills,
          skipPackClone: true,
        });
        nextPacks = syncResult.packs;
        skillsSummary = {
          skipped: true,
          packs: syncResult.packs,
          vendoredSelf: syncResult.vendoredSelf,
          removedDirs: syncResult.removedDirs,
          adoptedDirs: syncResult.adoptedDirs,
          migratedClaudeDirs: syncResult.migratedClaudeDirs,
        };
      } else {
        const existingManaged = config.skills.packs.flatMap((p) =>
          Array.isArray(p.installedDirs) ? p.installedDirs : [],
        );
        for (const selfName of SELF_SKILL_NAMES) {
          if (isDirectory(path.join(cwd, '.agents', 'skills', selfName))) {
            existingManaged.push(selfName);
          }
        }
        syncClaudeSkillsBridge({
          cwd,
          managedDirs: existingManaged,
        });
        skillsSummary = {
          skipped: true,
          packs: config.skills.packs,
          vendoredSelf: false,
          removedDirs: [],
          adoptedDirs: [],
          migratedClaudeDirs: [],
        };
      }
    } else {
      const syncResult = await syncSkillPacks({
        cwd,
        config,
        previousPacks,
        selfSkillDir: SELF_SKILL_DIR,
        adoptExistingSkills: adoptSkills,
        migrateClaudeSkills,
        pruneSkills,
      });
      nextPacks = syncResult.packs;
      skillsSummary = {
        skipped: false,
        packs: syncResult.packs,
        vendoredSelf: syncResult.vendoredSelf,
        removedDirs: syncResult.removedDirs,
        adoptedDirs: syncResult.adoptedDirs,
        migratedClaudeDirs: syncResult.migratedClaudeDirs,
      };
    }

    const updatedAt = new Date().toISOString();
    const finalValidation = validateConfig({
      ...config,
      reporigVersion: REPORIG_VERSION,
      updatedAt,
      skills: {
        ...config.skills,
        packs: nextPacks,
      },
    });
    if (!finalValidation.valid) {
      throw new CliError(
        'Persisted reporig config failed schema validation.',
        finalValidation.errors,
      );
    }
    persistedConfig = finalValidation.value;

    if (legacyFilesToRemove.length > 0) {
      legacyFilesRemoved = removeLegacyFilesOnDisk(
        cwd,
        legacyFilesToRemove,
        mutationFlags,
      );
    }

    fs.mkdirSync(path.dirname(targetReporigJsonPath), { recursive: true });
    fs.writeFileSync(
      targetReporigJsonPath,
      `${JSON.stringify(persistedConfig, null, 2)}\n`,
      'utf8',
    );
    mutationFlags.reporigJsonWritten = true;
  } catch (err) {
    restorePreApplySnapshot(cwd, preApplySnapshot, mutationFlags);
    throw err;
  }
  writeJson(
    {
      ok: true,
      dryRun: false,
      reporigJsonPath: targetReporigJsonPath,
      agentsMd: {
        written: true,
        changed:
          existingAgentsMd !== agentsMdResult.content ||
          agentsWouldNormalizeCaseFrom !== null,
        managedLineCount: agentsMdResult.managedLineCount,
        totalLineCount: agentsMdResult.totalLineCount,
        appendedToUnfencedFile: agentsMdResult.appendedToUnfencedFile,
        reconciledNonManagedHeader: agentsMdResult.reconciledNonManagedHeader,
        normalizedCaseFrom: agentsWouldNormalizeCaseFrom,
        warnings: agentsMdWarnings,
      },
      claudeMd: {
        written: shouldWriteClaude,
        replacedExisting: claudeReplacedExisting,
        normalizedCaseFrom: shouldWriteClaude
          ? claudeWouldNormalizeCaseFrom
          : null,
      },
      references: referencesResult,
      referencesWrittenCustom: referencesWouldWriteCustom,
      scopedAgentsWritten: scopedAgentsWouldWrite,
      skills: skillsSummary,
      legacyFilesRemoved,
      gitignoreUpdated: gitignoreCheck.shouldUpdate,
      eslintWarning,
      warnings,
    },
    0,
  );
}

async function handleCheckUpgrades(restArgs) {
  const values = parseSubcommandFlags(restArgs, {
    cwd: { type: 'string' },
  });

  const cwd = resolveExistingCwd(values.cwd);
  const reporigJsonPath = path.join(cwd, '.agents', 'reporig.json');
  const { config, rawConfigObject } = loadRequiredConfigWithRaw(reporigJsonPath);
  const inspection = await inspectRepo(cwd);

  const report = evaluateRepoUpgrades({
    cwd,
    rawConfigObject,
    config,
    inspection,
  });

  writeJson(
    {
      ok: true,
      previousReporigVersion: report.previousReporigVersion,
      currentReporigVersion: report.currentReporigVersion,
      versionChanged: report.versionChanged,
      hasRecommendations: report.hasRecommendations,
      vetoItems: report.vetoItems,
      questionnaireItems: report.questionnaireItems,
      pendingEvaluatedIds: report.pendingEvaluatedIds,
    },
    0,
  );
}

async function handleDraftUpgrades(restArgs) {
  const values = parseSubcommandFlags(restArgs, {
    cwd: { type: 'string' },
    accept: { type: 'string' },
    veto: { type: 'string' },
    answer: { type: 'string', multiple: true },
    out: { type: 'string' },
  });

  const cwd = resolveExistingCwd(values.cwd);
  const reporigJsonPath = path.join(cwd, '.agents', 'reporig.json');
  const { config, rawConfigObject } = loadRequiredConfigWithRaw(reporigJsonPath);
  const inspection = await inspectRepo(cwd);

  if (
    values.accept !== undefined &&
    (typeof values.accept !== 'string' || values.accept.trim().length === 0)
  ) {
    throw new CliError('Flag --accept must be a non-empty string.');
  }

  if (
    values.veto !== undefined &&
    (typeof values.veto !== 'string' || values.veto.trim().length === 0)
  ) {
    throw new CliError('Flag --veto must be a non-empty string.');
  }

  if (
    values.veto !== undefined &&
    values.accept !== undefined &&
    values.accept.trim() !== 'all'
  ) {
    throw new CliError(
      'Combining non-empty veto with any accept value other than "all" is not supported.',
    );
  }

  const answers = {};
  if (values.answer !== undefined) {
    const rawAnswers = Array.isArray(values.answer)
      ? values.answer
      : [values.answer];
    for (const rawEntry of rawAnswers) {
      if (typeof rawEntry !== 'string' || !rawEntry.includes('=')) {
        throw new CliError(
          `Invalid --answer format: "${rawEntry}". Expected "itemId=optionId".`,
        );
      }
      const equalsIndex = rawEntry.indexOf('=');
      const itemId = rawEntry.slice(0, equalsIndex).trim();
      const optionId = rawEntry.slice(equalsIndex + 1).trim();
      if (!itemId || !optionId) {
        throw new CliError(
          `Invalid --answer format: "${rawEntry}". Both itemId and optionId must be non-empty.`,
        );
      }
      if (Object.prototype.hasOwnProperty.call(answers, itemId)) {
        throw new CliError(
          `Duplicate answer provided for questionnaire item "${itemId}".`,
        );
      }
      answers[itemId] = optionId;
    }
  }

  if (values.out !== undefined) {
    if (typeof values.out !== 'string' || values.out.trim().length === 0) {
      throw new CliError('Flag --out must be a non-empty file path.');
    }
    const resolvedOut = path.resolve(values.out);
    const targetReporigJson = path.resolve(reporigJsonPath);
    if (resolvedOut === targetReporigJson) {
      throw new CliError(
        `Flag --out cannot write directly to ${targetReporigJson}. Draft upgrades must be reviewed in a scratch file before applying.`,
      );
    }
  }

  let result;
  try {
    result = draftUpgradedConfig({
      cwd,
      rawConfigObject,
      config,
      inspection,
      accept: values.accept !== undefined ? values.accept.trim() : 'all',
      veto: values.veto !== undefined ? values.veto.trim() : [],
      answers,
    });
  } catch (err) {
    throw new CliError(err.message, err.errors);
  }

  if (values.out !== undefined) {
    const draftPath = path.resolve(values.out);
    fs.mkdirSync(path.dirname(draftPath), { recursive: true });
    fs.writeFileSync(
      draftPath,
      `${JSON.stringify(result.config, null, 2)}\n`,
      'utf8',
    );
    writeJson(
      {
        ok: true,
        draftPath,
        acceptedVetoIds: result.acceptedVetoIds,
        vetoedIds: result.vetoedIds,
        answeredQuestions: result.answeredQuestions,
        requiresApply: result.requiresApply,
        requiresSkillSync: result.requiresSkillSync,
        externalActions: result.externalActions,
      },
      0,
    );
  } else {
    writeJson(result.config, 0);
  }
}

async function handleAckUpgrades(restArgs) {
  const values = parseSubcommandFlags(restArgs, {
    cwd: { type: 'string' },
  });

  const cwd = resolveExistingCwd(values.cwd);
  const reporigJsonPath = path.join(cwd, '.agents', 'reporig.json');
  const { config, rawConfigObject } = loadRequiredConfigWithRaw(reporigJsonPath);
  const inspection = await inspectRepo(cwd);

  const evaluation = evaluateRepoUpgrades({
    cwd,
    rawConfigObject,
    config,
    inspection,
  });

  const existingEvaluated = new Set(config.evaluatedUpgrades ?? []);
  const addedEvaluatedIds = evaluation.pendingEvaluatedIds
    .filter((id) => !existingEvaluated.has(id))
    .sort();

  const combinedEvaluated = [
    ...(config.evaluatedUpgrades ?? []),
    ...evaluation.pendingEvaluatedIds,
  ];
  const nextEvaluatedUpgrades = [...new Set(combinedEvaluated)].sort();

  const updatedAt = new Date().toISOString();
  const nextValidation = validateConfig({
    ...config,
    reporigVersion: REPORIG_VERSION,
    updatedAt,
    evaluatedUpgrades: nextEvaluatedUpgrades,
  });

  if (!nextValidation.valid) {
    throw new CliError(
      'Acked reporig config failed schema validation.',
      nextValidation.errors,
    );
  }

  const persisted = nextValidation.value;
  fs.writeFileSync(
    reporigJsonPath,
    `${JSON.stringify(persisted, null, 2)}\n`,
    'utf8',
  );

  writeJson(
    {
      ok: true,
      reporigJsonPath,
      reporigVersion: persisted.reporigVersion,
      addedEvaluatedIds,
      evaluatedUpgrades: persisted.evaluatedUpgrades,
    },
    0,
  );
}

async function handleCheckUpdates(restArgs) {
  const values = parseSubcommandFlags(restArgs, {
    cwd: { type: 'string' },
    'self-url': { type: 'string' },
  });

  const cwd = resolveExistingCwd(values.cwd);
  const reporigJsonPath = path.join(cwd, '.agents', 'reporig.json');
  const config = loadRequiredConfig(reporigJsonPath);

  const hasSelfUrlFlag =
    Object.prototype.hasOwnProperty.call(values, 'self-url') &&
    values['self-url'] !== undefined;

  const report = await checkPackUpdates({
    cwd,
    config,
    ...(hasSelfUrlFlag
      ? { selfRepoUrl: normalizeOptionalSelfUrl(values['self-url']) }
      : {}),
  });

  writeJson(report, 0);
}

async function handleUpdateSkills(restArgs) {
  const values = parseSubcommandFlags(restArgs, {
    cwd: { type: 'string' },
    packs: { type: 'string' },
    'self-url': { type: 'string' },
  });

  const cwd = resolveExistingCwd(values.cwd);
  const reporigJsonPath = path.join(cwd, '.agents', 'reporig.json');
  const config = loadRequiredConfig(reporigJsonPath);

  let packSourcesToUpdate;
  if (values.packs !== undefined) {
    packSourcesToUpdate = values.packs
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (packSourcesToUpdate.length === 0) {
      throw new CliError(
        'Flag --packs must specify at least one comma-separated pack source.',
      );
    }
  }

  const hasSelfUrlFlag =
    Object.prototype.hasOwnProperty.call(values, 'self-url') &&
    values['self-url'] !== undefined;
  const shouldUseLocalSelfSkillFallback =
    !hasSelfUrlFlag && packSourcesToUpdate === undefined;

  const updateResult = await updateInstalledPacks({
    cwd,
    config,
    ...(packSourcesToUpdate !== undefined ? { packSourcesToUpdate } : {}),
    ...(hasSelfUrlFlag
      ? { selfRepoUrl: normalizeOptionalSelfUrl(values['self-url']) }
      : packSourcesToUpdate === undefined
        ? { selfRepoUrl: REPORIG_REPO_URL }
        : {}),
    ...(shouldUseLocalSelfSkillFallback ? { selfSkillDir: SELF_SKILL_DIR } : {}),
  });

  const updatedAt = new Date().toISOString();
  const nextValidation = validateConfig({
    ...config,
    updatedAt,
    skills: {
      ...config.skills,
      packs: updateResult.packs,
    },
  });
  if (!nextValidation.valid) {
    throw new CliError(
      'Updated reporig config failed schema validation.',
      nextValidation.errors,
    );
  }

  fs.writeFileSync(
    reporigJsonPath,
    `${JSON.stringify(nextValidation.value, null, 2)}\n`,
    'utf8',
  );

  writeJson(
    {
      ok: true,
      updatedAt,
      packs: nextValidation.value.skills.packs,
      updatedSources: updateResult.updatedSources,
      selfUpdated: updateResult.selfUpdated,
    },
    0,
  );
}

function resolveOptionalProfilesFlag(rawProfilesFile) {
  if (rawProfilesFile === undefined) {
    return resolveProfilesPath();
  }
  if (typeof rawProfilesFile !== 'string' || rawProfilesFile.trim().length === 0) {
    throw new CliError('Flag --profiles-file must be a non-empty file path.');
  }
  return resolveProfilesPath(rawProfilesFile);
}

async function handleProfiles(restArgs) {
  let action = null;
  let flagArgs = restArgs;
  let usedActionFlag = false;

  if (restArgs.length > 0 && !restArgs[0].startsWith('-')) {
    action = restArgs[0];
    flagArgs = restArgs.slice(1);
  } else {
    const actionIdx = restArgs.findIndex(
      (arg) => arg === '--action' || arg.startsWith('--action='),
    );
    if (actionIdx !== -1) {
      usedActionFlag = true;
      if (restArgs[actionIdx].startsWith('--action=')) {
        action = restArgs[actionIdx].slice('--action='.length);
      } else if (actionIdx + 1 < restArgs.length) {
        action = restArgs[actionIdx + 1];
      }
    }
  }

  if (typeof action !== 'string' || action.trim().length === 0) {
    throw new CliError(
      `Missing required profiles action. Expected one of: ${PROFILE_ACTIONS.join(', ')}.`,
    );
  }

  const normalizedAction = action.trim();
  if (!PROFILE_ACTIONS.includes(normalizedAction)) {
    throw new CliError(
      `Unknown profiles action "${normalizedAction}". Expected one of: ${PROFILE_ACTIONS.join(', ')}.`,
    );
  }

  const baseSpec = {
    'profiles-file': { type: 'string' },
    ...(usedActionFlag ? { action: { type: 'string' } } : {}),
  };

  if (normalizedAction === 'list') {
    const values = parseSubcommandFlags(flagArgs, baseSpec);
    const profilesPath = resolveOptionalProfilesFlag(values['profiles-file']);
    writeJson(listSavedProfiles({ profilesPath }), 0);
    return;
  }

  if (normalizedAction === 'draft') {
    const values = parseSubcommandFlags(flagArgs, {
      ...baseSpec,
      name: { type: 'string' },
      cwd: { type: 'string' },
    });
    if (typeof values.name !== 'string' || values.name.trim().length === 0) {
      throw new CliError('Missing required --name <profileName> flag.');
    }
    const cwd = resolveExistingCwd(values.cwd);
    const profilesPath = resolveOptionalProfilesFlag(values['profiles-file']);
    const inspection = await inspectRepo(cwd);
    const draftResult = draftNamedProfile({
      name: values.name,
      inspection,
      profilesPath,
    });
    if (draftResult?.config) {
      draftResult.config.evaluatedUpgrades = collectBaselineEvaluatedIds(
        cwd,
        inspection,
      );
    }
    writeJson(draftResult, 0);
    return;
  }

  if (normalizedAction === 'match') {
    const values = parseSubcommandFlags(flagArgs, {
      ...baseSpec,
      config: { type: 'string' },
      cwd: { type: 'string' },
    });
    if (typeof values.config !== 'string' || values.config.trim().length === 0) {
      throw new CliError('Missing required --config <path> flag.');
    }
    const configPath = path.resolve(values.config);
    const config = loadRequiredConfig(configPath);
    const profilesPath = resolveOptionalProfilesFlag(values['profiles-file']);
    const inspection =
      values.cwd !== undefined
        ? await inspectRepo(resolveExistingCwd(values.cwd))
        : null;
    writeJson(
      matchSavedProfiles({
        config,
        inspection,
        profilesPath,
      }),
      0,
    );
    return;
  }

  if (normalizedAction === 'save') {
    const values = parseSubcommandFlags(flagArgs, {
      ...baseSpec,
      name: { type: 'string' },
      config: { type: 'string' },
      overwrite: { type: 'boolean', default: false },
    });
    if (typeof values.name !== 'string' || values.name.trim().length === 0) {
      throw new CliError('Missing required --name <profileName> flag.');
    }
    if (typeof values.config !== 'string' || values.config.trim().length === 0) {
      throw new CliError('Missing required --config <path> flag.');
    }
    const configPath = path.resolve(values.config);
    const config = loadRequiredConfig(configPath);
    const profilesPath = resolveOptionalProfilesFlag(values['profiles-file']);
    writeJson(
      saveNamedProfile({
        name: values.name,
        config,
        overwrite: Boolean(values.overwrite),
        profilesPath,
      }),
      0,
    );
    return;
  }

  if (normalizedAction === 'delete') {
    const values = parseSubcommandFlags(flagArgs, {
      ...baseSpec,
      name: { type: 'string' },
    });
    if (typeof values.name !== 'string' || values.name.trim().length === 0) {
      throw new CliError('Missing required --name <profileName> flag.');
    }
    const profilesPath = resolveOptionalProfilesFlag(values['profiles-file']);
    writeJson(
      deleteNamedProfile({
        name: values.name,
        profilesPath,
      }),
      0,
    );
  }
}

async function main(argv) {
  if (argv.length === 0 || argv[0].startsWith('-')) {
    throw new CliError(
      `Missing subcommand. Expected one of: ${SUBCOMMANDS.join(', ')}.`,
    );
  }

  const subcommand = argv[0];
  const restArgs = argv.slice(1);

  switch (subcommand) {
    case 'inspect':
      await handleInspect(restArgs);
      break;
    case 'audit':
      await handleAudit(restArgs);
      break;
    case 'preset':
      await handlePreset(restArgs);
      break;
    case 'validate':
      await handleValidate(restArgs);
      break;
    case 'apply':
      await handleApply(restArgs);
      break;
    case 'check-upgrades':
      await handleCheckUpgrades(restArgs);
      break;
    case 'draft-upgrades':
      await handleDraftUpgrades(restArgs);
      break;
    case 'ack-upgrades':
      await handleAckUpgrades(restArgs);
      break;
    case 'check-updates':
      await handleCheckUpdates(restArgs);
      break;
    case 'update-skills':
      await handleUpdateSkills(restArgs);
      break;
    case 'profiles':
      await handleProfiles(restArgs);
      break;
    default:
      throw new CliError(
        `Unknown subcommand "${subcommand}". Expected one of: ${SUBCOMMANDS.join(', ')}.`,
      );
  }
}

main(process.argv.slice(2)).catch((err) => {
  const message = err?.message || 'Unexpected CLI failure.';
  const errors =
    err instanceof CliError || err instanceof ProfileError
      ? err.errors
      : Array.isArray(err?.errors)
        ? err.errors
        : null;
  writeError(message, errors);
});
