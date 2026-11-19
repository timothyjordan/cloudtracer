import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  CURATED_SKILLS,
  CURATED_SPINES,
  SPINE_STAGES,
  REPORIG_REPO_URL,
  SELF_SKILL_NAMES,
} from './catalog.mjs';

const execFileAsync = promisify(execFile);

const SELF_SKILL_NAME_SET = new Set(SELF_SKILL_NAMES);

const SAFE_SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SKIPPED_DISCOVERY_DIRS = new Set([
  'deprecated',
  'in-progress',
  'archive',
  'examples',
  'tests',
  'test',
  'fixtures',
  'vendored',
  'node_modules',
  '.git',
]);

const ROOT_SKILL_COPY_EXCLUDES = new Set([
  '.git',
  'node_modules',
  'tests',
  'test',
  '.superpowers',
  '.agents',
  '.claude',
  '.worktrees',
  'skills-lock.json',
]);

const SUBDIR_SKILL_COPY_EXCLUDES = new Set(['.git', 'node_modules']);

const REPORIG_SHA_FILE = '.reporig-sha';
const REPORIG_MIRROR_MARKER = '.reporig-mirror';

const GLOBAL_STAGE_BY_SKILL = buildGlobalStageBySkillMap();

function buildGlobalStageBySkillMap() {
  const map = new Map();
  for (const spine of Object.values(CURATED_SPINES)) {
    for (const stage of SPINE_STAGES) {
      for (const skillName of spine.stageSkills?.[stage] ?? []) {
        if (!map.has(skillName)) {
          map.set(skillName, stage);
        }
      }
    }
  }
  return map;
}

function isDirectory(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
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

function removeEntrySafe(targetPath) {
  let stat;
  try {
    stat = fs.lstatSync(targetPath);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return false;
    }
    throw err;
  }
  if (stat.isSymbolicLink()) {
    fs.unlinkSync(targetPath);
  } else {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
  return true;
}

function isSameDirectory(dirA, dirB) {
  const resolvedA = path.resolve(dirA);
  const resolvedB = path.resolve(dirB);
  if (resolvedA === resolvedB) {
    return true;
  }
  if (isDirectory(resolvedA) && isDirectory(resolvedB)) {
    try {
      return fs.realpathSync(resolvedA) === fs.realpathSync(resolvedB);
    } catch {
      return false;
    }
  }
  return false;
}

function isSeparateClaudeSkillsDir(skillsRootDir, claudeSkillsDir) {
  if (!isDirectory(claudeSkillsDir)) {
    return false;
  }
  if (isSameDirectory(claudeSkillsDir, skillsRootDir)) {
    return false;
  }
  try {
    const realClaudeSkills = fs.realpathSync(claudeSkillsDir);
    const parentAgents = path.dirname(path.resolve(skillsRootDir));
    if (isDirectory(parentAgents)) {
      const expectedRealAgentsSkills = path.join(
        fs.realpathSync(parentAgents),
        path.basename(skillsRootDir),
      );
      if (realClaudeSkills === expectedRealAgentsSkills) {
        return false;
      }
    }
  } catch {
    return false;
  }
  return true;
}

function normalizeSkillFilterOption(option, label) {
  if (option === null || option === undefined) {
    return null;
  }
  if (option === 'all') {
    return 'all';
  }
  if (!Array.isArray(option)) {
    throw new Error(
      `Unsafe skill directory name in ${label}: expected null, "all", or an array of safe skill names, got "${String(option)}".`,
    );
  }
  const names = new Set();
  for (const entry of option) {
    if (typeof entry !== 'string' || !SAFE_SKILL_NAME_RE.test(entry)) {
      throw new Error(
        `Unsafe skill directory name rejected in ${label}: "${String(entry)}".`,
      );
    }
    if (!SELF_SKILL_NAME_SET.has(entry)) {
      names.add(entry);
    }
  }
  return [...names].sort(lexCompare);
}

function normalizePruneList(list) {
  if (list === null || list === undefined) {
    return [];
  }
  if (!Array.isArray(list)) {
    throw new Error(
      `Unsafe skill directory name in pruneSkills: expected an array of safe skill names, got "${String(list)}".`,
    );
  }
  const names = new Set();
  for (const entry of list) {
    if (typeof entry !== 'string' || !SAFE_SKILL_NAME_RE.test(entry)) {
      throw new Error(
        `Unsafe skill directory name rejected in pruneSkills: "${String(entry)}".`,
      );
    }
    if (!SELF_SKILL_NAME_SET.has(entry)) {
      names.add(entry);
    }
  }
  return [...names].sort(lexCompare);
}

function matchesSkillFilter(skillName, normalizedFilter) {
  if (normalizedFilter === null || SELF_SKILL_NAME_SET.has(skillName)) {
    return false;
  }
  if (normalizedFilter === 'all') {
    return true;
  }
  return normalizedFilter.includes(skillName);
}

function sanitizeSkillName(raw) {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isUnsafePathLike(raw) {
  if (typeof raw !== 'string') {
    return true;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return true;
  }
  return /[\\/\0]/.test(trimmed) || trimmed.includes('..');
}

function toPosixPath(inputPath) {
  return inputPath
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+|\/+$/g, '');
}

function globToRegExp(rawPattern) {
  const pattern = toPosixPath(String(rawPattern ?? ''));
  let regexStr = '^';
  let i = 0;

  while (i < pattern.length) {
    if (pattern.startsWith('**/', i)) {
      regexStr += '(?:.+/)?';
      i += 3;
      continue;
    }
    if (pattern.startsWith('/**', i) && i + 3 === pattern.length) {
      regexStr += '(?:/.*)?';
      i += 3;
      continue;
    }
    if (pattern.startsWith('**', i)) {
      regexStr += '.*';
      i += 2;
      continue;
    }
    const ch = pattern[i];
    if (ch === '*') {
      regexStr += '[^/]*';
    } else if (ch === '?') {
      regexStr += '[^/]';
    } else if ('+^$.()|[]{}'.includes(ch) || ch === '\\') {
      regexStr += `\\${ch}`;
    } else {
      regexStr += ch;
    }
    i += 1;
  }

  regexStr += '$';
  return new RegExp(regexStr);
}

function compileGlobList(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return [];
  }
  return patterns
    .filter((p) => typeof p === 'string' && p.trim().length > 0)
    .map((p) => globToRegExp(p));
}

function passesPathFilters(relDir, relFile, includeMatchers, excludeMatchers) {
  if (includeMatchers.length > 0) {
    const included = includeMatchers.some(
      (re) => re.test(relDir) || re.test(relFile),
    );
    if (!included) {
      return false;
    }
  }
  if (excludeMatchers.length > 0) {
    const excluded = excludeMatchers.some(
      (re) => re.test(relDir) || re.test(relFile),
    );
    if (excluded) {
      return false;
    }
  }
  return true;
}

function parseFrontmatterName(markdown) {
  if (typeof markdown !== 'string') {
    return null;
  }
  const fmMatch = markdown.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!fmMatch) {
    return null;
  }
  for (const line of fmMatch[1].split(/\r?\n/)) {
    const nameMatch = line.match(/^\s*name\s*:\s*(.+?)\s*$/);
    if (!nameMatch) {
      continue;
    }
    let val = nameMatch[1].trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    } else {
      val = val.replace(/\s+#.*$/, '').trim();
    }
    return val;
  }
  return null;
}

function rewriteFrontmatterName(markdown, newName) {
  const fmMatch = markdown.match(
    /^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/,
  );
  if (!fmMatch) {
    return `---\nname: ${newName}\n---\n\n${markdown}`;
  }

  const [, openFence, body, closeFence] = fmMatch;
  const rest = markdown.slice(fmMatch[0].length);
  const lines = body.split(/\r?\n/);
  let replaced = false;
  const updatedLines = lines.map((line) => {
    if (!replaced && /^\s*name\s*:/.test(line)) {
      replaced = true;
      return `name: ${newName}`;
    }
    return line;
  });

  if (!replaced) {
    updatedLines.unshift(`name: ${newName}`);
  }

  return `${openFence}${updatedLines.join('\n')}${closeFence}${rest}`;
}

function walkSkillSearchRoot(cloneRoot, searchRoot, includeMatchers, excludeMatchers) {
  if (!isDirectory(searchRoot)) {
    return [];
  }

  let realCloneRoot;
  try {
    realCloneRoot = fs.realpathSync(cloneRoot);
  } catch {
    realCloneRoot = path.resolve(cloneRoot);
  }

  let realSearchRoot;
  try {
    realSearchRoot = fs.realpathSync(searchRoot);
  } catch {
    realSearchRoot = path.resolve(searchRoot);
  }

  const found = [];

  function visit(currentDir, activeAncestors) {
    if (currentDir !== searchRoot && isFile(path.join(currentDir, 'SKILL.md'))) {
      const relDir = toPosixPath(path.relative(cloneRoot, currentDir));
      const relFile = `${relDir}/SKILL.md`;
      const safeName = sanitizeSkillName(path.basename(currentDir));
      if (
        SAFE_SKILL_NAME_RE.test(safeName) &&
        passesPathFilters(relDir, relFile, includeMatchers, excludeMatchers)
      ) {
        found.push({
          name: safeName,
          sourceDir: currentDir,
        });
      }
      return;
    }

    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIPPED_DISCOVERY_DIRS.has(entry.name)) {
        continue;
      }
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (!entry.isDirectory()) {
        continue;
      }
      const childDir = path.join(currentDir, entry.name);
      let realChild;
      try {
        realChild = fs.realpathSync(childDir);
        if (
          realChild !== realCloneRoot &&
          !realChild.startsWith(`${realCloneRoot}${path.sep}`)
        ) {
          continue;
        }
      } catch {
        continue;
      }
      if (activeAncestors.has(realChild)) {
        continue;
      }
      activeAncestors.add(realChild);
      try {
        visit(childDir, activeAncestors);
      } finally {
        activeAncestors.delete(realChild);
      }
    }
  }

  visit(searchRoot, new Set([realSearchRoot]));

  found.sort((a, b) => {
    if (a.name !== b.name) {
      return a.name < b.name ? -1 : 1;
    }
    return a.sourceDir < b.sourceDir ? -1 : a.sourceDir > b.sourceDir ? 1 : 0;
  });

  return found;
}

function discoverDirectChildSkills(cloneRoot, includeMatchers, excludeMatchers) {
  let realCloneRoot;
  try {
    realCloneRoot = fs.realpathSync(cloneRoot);
  } catch {
    realCloneRoot = path.resolve(cloneRoot);
  }

  let entries;
  try {
    entries = fs.readdirSync(cloneRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const reservedNames = new Set(['skills', 'plugins', 'plugin', 'template']);
  const found = [];

  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  for (const entry of entries) {
    if (
      entry.name.startsWith('.') ||
      SKIPPED_DISCOVERY_DIRS.has(entry.name) ||
      reservedNames.has(entry.name) ||
      entry.isSymbolicLink() ||
      !entry.isDirectory()
    ) {
      continue;
    }

    const childDir = path.join(cloneRoot, entry.name);
    try {
      const realChild = fs.realpathSync(childDir);
      if (
        realChild !== realCloneRoot &&
        !realChild.startsWith(`${realCloneRoot}${path.sep}`)
      ) {
        continue;
      }
    } catch {
      continue;
    }

    if (!isFile(path.join(childDir, 'SKILL.md'))) {
      continue;
    }

    const relDir = toPosixPath(path.relative(cloneRoot, childDir));
    const relFile = `${relDir}/SKILL.md`;
    const safeName = sanitizeSkillName(entry.name);
    if (
      SAFE_SKILL_NAME_RE.test(safeName) &&
      passesPathFilters(relDir, relFile, includeMatchers, excludeMatchers)
    ) {
      found.push({
        name: safeName,
        sourceDir: childDir,
      });
    }
  }

  return found;
}

export function discoverSkillsInClone(cloneDir, options = {}) {
  if (typeof cloneDir !== 'string' || cloneDir.trim().length === 0) {
    return [];
  }

  const resolvedCloneDir = path.resolve(cloneDir);
  if (!isDirectory(resolvedCloneDir)) {
    return [];
  }

  const includeMatchers = compileGlobList(options.includePaths);
  const excludeMatchers = compileGlobList(options.excludePaths);

  // Priority 1: skills/**/SKILL.md
  const primarySkillsDir = path.join(resolvedCloneDir, 'skills');
  if (isDirectory(primarySkillsDir)) {
    const discoveredInSkills = walkSkillSearchRoot(
      resolvedCloneDir,
      primarySkillsDir,
      includeMatchers,
      excludeMatchers,
    );
    if (discoveredInSkills.length > 0) {
      return discoveredInSkills;
    }
  }

  // Priority 2: plugins/**/skills/**/SKILL.md and plugin/**/skills/**/SKILL.md
  const discoveredInPlugins = [];
  for (const pluginFolder of ['plugins', 'plugin']) {
    const pluginRoot = path.join(resolvedCloneDir, pluginFolder);
    if (isDirectory(pluginRoot)) {
      discoveredInPlugins.push(
        ...walkSkillSearchRoot(
          resolvedCloneDir,
          pluginRoot,
          includeMatchers,
          excludeMatchers,
        ),
      );
    }
  }
  if (discoveredInPlugins.length > 0) {
    discoveredInPlugins.sort((a, b) => {
      if (a.name !== b.name) {
        return a.name < b.name ? -1 : 1;
      }
      return a.sourceDir < b.sourceDir ? -1 : a.sourceDir > b.sourceDir ? 1 : 0;
    });
    return discoveredInPlugins;
  }

  // Priority 3: root SKILL.md or direct 1-level <skill>/SKILL.md subdirectories
  const rootSkillMd = path.join(resolvedCloneDir, 'SKILL.md');
  if (isFile(rootSkillMd)) {
    if (passesPathFilters('.', 'SKILL.md', includeMatchers, excludeMatchers)) {
      let rawContent = '';
      try {
        rawContent = fs.readFileSync(rootSkillMd, 'utf8');
      } catch {
        rawContent = '';
      }

      const frontmatterName = parseFrontmatterName(rawContent);
      const fallbackCandidate =
        sanitizeSkillName(options.fallbackName) ||
        sanitizeSkillName(path.basename(resolvedCloneDir)) ||
        'skill';

      let finalName = fallbackCandidate;
      if (frontmatterName !== null && !isUnsafePathLike(frontmatterName)) {
        const sanitizedFm = sanitizeSkillName(frontmatterName);
        if (SAFE_SKILL_NAME_RE.test(sanitizedFm)) {
          finalName = sanitizedFm;
        }
      }

      return [
        {
          name: finalName,
          sourceDir: resolvedCloneDir,
        },
      ];
    }
  }

  const directChildSkills = discoverDirectChildSkills(
    resolvedCloneDir,
    includeMatchers,
    excludeMatchers,
  );
  if (directChildSkills.length > 0) {
    return directChildSkills;
  }

  // Priority 4: .agents/skills/**/SKILL.md or .claude/skills/**/SKILL.md (only when not an installed workspace unless explicitly included)
  const hasWorkspaceManifest =
    isFile(path.join(resolvedCloneDir, '.agents', 'reporig.json')) ||
    isFile(path.join(resolvedCloneDir, 'skills-lock.json'));
  const explicitHiddenInclude =
    Array.isArray(options.includePaths) &&
    options.includePaths.some((p) =>
      /(?:^|\/)\.(?:agents|claude)(?:\/|$)/.test(toPosixPath(String(p))),
    );

  if (hasWorkspaceManifest && !explicitHiddenInclude) {
    return [];
  }

  const expectedSlug = sanitizeSkillName(options.fallbackName);
  const canNarrowToSlug =
    !explicitHiddenInclude &&
    expectedSlug.length > 0 &&
    SAFE_SKILL_NAME_RE.test(expectedSlug);

  let firstNonEmptyAlt = null;
  for (const hiddenPrefix of ['.agents', '.claude']) {
    const altSkillsDir = path.join(resolvedCloneDir, hiddenPrefix, 'skills');
    if (isDirectory(altSkillsDir)) {
      const discoveredAlt = walkSkillSearchRoot(
        resolvedCloneDir,
        altSkillsDir,
        includeMatchers,
        excludeMatchers,
      );
      if (discoveredAlt.length > 0) {
        if (canNarrowToSlug) {
          const matchingSlug = discoveredAlt.filter(
            (s) => s.name === expectedSlug,
          );
          if (matchingSlug.length > 0) {
            return matchingSlug;
          }
        }
        if (firstNonEmptyAlt === null) {
          firstNonEmptyAlt = discoveredAlt;
        }
      }
    }
  }

  return firstNonEmptyAlt ?? [];
}

function extractFallbackNameFromPack(pack) {
  if (typeof pack?.source === 'string' && pack.source.trim().length > 0) {
    const [baseSource = '', subpackRaw = ''] = pack.source.trim().split('#');
    const subpackClean = sanitizeSkillName(subpackRaw);
    if (subpackClean && SAFE_SKILL_NAME_RE.test(subpackClean)) {
      return subpackClean;
    }
    const parts = baseSource.split('/').filter(Boolean);
    const lastPart = parts.at(-1) ?? '';
    const cleaned = sanitizeSkillName(lastPart.replace(/\.git$/i, ''));
    if (SAFE_SKILL_NAME_RE.test(cleaned)) {
      return cleaned;
    }
  }
  if (typeof pack?.url === 'string' && pack.url.trim().length > 0) {
    const cleanedUrl = pack.url.trim().replace(/\/+$/, '').replace(/\.git$/i, '');
    const base = cleanedUrl.split(/[/:]/).filter(Boolean).pop() ?? '';
    const cleaned = sanitizeSkillName(base);
    if (SAFE_SKILL_NAME_RE.test(cleaned)) {
      return cleaned;
    }
  }
  return 'skill';
}

function derivePackSlugCandidates(source) {
  const candidates = [];
  if (typeof source === 'string' && source.trim().length > 0) {
    const [baseSource = '', subpackRaw = ''] = source.trim().split('#');
    const parts = baseSource
      .replace(/\.git$/i, '')
      .split('/')
      .filter(Boolean);
    const repoSlug = sanitizeSkillName(parts.at(-1) ?? '');
    const ownerRepoSlug = sanitizeSkillName(parts.join('-'));
    const subpackSlug = sanitizeSkillName(subpackRaw);
    if (SAFE_SKILL_NAME_RE.test(repoSlug)) {
      candidates.push(repoSlug);
    }
    if (SAFE_SKILL_NAME_RE.test(ownerRepoSlug) && !candidates.includes(ownerRepoSlug)) {
      candidates.push(ownerRepoSlug);
    }
    if (SAFE_SKILL_NAME_RE.test(subpackSlug) && !candidates.includes(subpackSlug)) {
      candidates.push(subpackSlug);
    }
  }
  candidates.push('pack');
  return candidates;
}

function allocateSkillDirName(skillName, packSource, claimedDirs) {
  if (!claimedDirs.has(skillName)) {
    claimedDirs.add(skillName);
    return { dirName: skillName, prefixed: false };
  }

  const slugCandidates = derivePackSlugCandidates(packSource);
  for (const slug of slugCandidates) {
    const candidate = `${slug}-${skillName}`;
    if (SAFE_SKILL_NAME_RE.test(candidate) && !claimedDirs.has(candidate)) {
      claimedDirs.add(candidate);
      return { dirName: candidate, prefixed: true };
    }
  }

  const primarySlug = slugCandidates[0];
  let counter = 2;
  while (true) {
    const numbered = `${primarySlug}-${skillName}-${counter}`;
    if (!claimedDirs.has(numbered)) {
      claimedDirs.add(numbered);
      return { dirName: numbered, prefixed: true };
    }
    counter += 1;
  }
}

function resolveStageForSkill(skillName, packSource) {
  const curated = CURATED_SPINES[packSource];
  if (curated?.stageSkills) {
    for (const stage of SPINE_STAGES) {
      if ((curated.stageSkills[stage] ?? []).includes(skillName)) {
        return stage;
      }
    }
    if ((curated.stageSkills.utility ?? []).includes(skillName)) {
      return 'utility';
    }
  }

  if (GLOBAL_STAGE_BY_SKILL.has(skillName)) {
    return GLOBAL_STAGE_BY_SKILL.get(skillName);
  }

  return 'utility';
}

function filterPackSkillsForMultiSpine(discovered, pack, allPacks, spinePrecedence) {
  const spineCount = allPacks.filter((p) => p?.kind === 'spine').length;
  if (pack.kind !== 'spine' || spineCount < 2 || !spinePrecedence) {
    return discovered;
  }

  return discovered.filter((skill) => {
    const stage = resolveStageForSkill(skill.name, pack.source);
    if (stage === 'utility') {
      return true;
    }
    return spinePrecedence[stage] === pack.source;
  });
}

function resolveContainedSkillDir(skillsRootDir, dirName) {
  if (!SAFE_SKILL_NAME_RE.test(dirName)) {
    throw new Error(`Unsafe skill directory name rejected: "${String(dirName)}".`);
  }
  const resolvedRoot = path.resolve(skillsRootDir);
  const resolvedTarget = path.resolve(resolvedRoot, dirName);
  if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Skill target escaped .agents/skills root: "${dirName}".`);
  }
  return resolvedTarget;
}

function copyDirectoryFiltered(sourceDir, destDir, containmentRoot, excludedNames) {
  const realContainmentRoot = fs.realpathSync(containmentRoot);
  const realSourceRoot = fs.realpathSync(sourceDir);
  fs.mkdirSync(destDir, { recursive: true });

  function copyRecursive(currentSrc, currentDest, activeAncestors) {
    const entries = fs.readdirSync(currentSrc, { withFileTypes: true });
    for (const entry of entries) {
      if (excludedNames.has(entry.name)) {
        continue;
      }

      const srcEntryPath = path.join(currentSrc, entry.name);
      const destEntryPath = path.join(currentDest, entry.name);

      if (entry.isSymbolicLink()) {
        let realTarget;
        try {
          realTarget = fs.realpathSync(srcEntryPath);
        } catch {
          continue;
        }
        if (
          realTarget !== realContainmentRoot &&
          !realTarget.startsWith(`${realContainmentRoot}${path.sep}`)
        ) {
          continue;
        }
        const stat = fs.statSync(realTarget);
        if (stat.isDirectory()) {
          if (
            activeAncestors.has(realTarget) ||
            realSourceRoot.startsWith(`${realTarget}${path.sep}`)
          ) {
            continue;
          }
          fs.mkdirSync(destEntryPath, { recursive: true });
          activeAncestors.add(realTarget);
          try {
            copyRecursive(realTarget, destEntryPath, activeAncestors);
          } finally {
            activeAncestors.delete(realTarget);
          }
        } else if (stat.isFile()) {
          fs.copyFileSync(realTarget, destEntryPath);
        }
        continue;
      }

      if (entry.isDirectory()) {
        let realChildDir;
        try {
          realChildDir = fs.realpathSync(srcEntryPath);
        } catch {
          continue;
        }
        if (activeAncestors.has(realChildDir)) {
          continue;
        }
        fs.mkdirSync(destEntryPath, { recursive: true });
        activeAncestors.add(realChildDir);
        try {
          copyRecursive(srcEntryPath, destEntryPath, activeAncestors);
        } finally {
          activeAncestors.delete(realChildDir);
        }
      } else if (entry.isFile()) {
        fs.copyFileSync(srcEntryPath, destEntryPath);
      }
    }
  }

  copyRecursive(sourceDir, destDir, new Set([realSourceRoot]));
}

function installDiscoveredSkill({
  skill,
  cloneDir,
  skillsRootDir,
  targetDirName,
  forceFrontmatterRewrite,
}) {
  const targetPath = resolveContainedSkillDir(skillsRootDir, targetDirName);
  removeEntrySafe(targetPath);

  const isRootSkill = isSameDirectory(skill.sourceDir, cloneDir);
  const excludes = isRootSkill
    ? ROOT_SKILL_COPY_EXCLUDES
    : SUBDIR_SKILL_COPY_EXCLUDES;

  copyDirectoryFiltered(skill.sourceDir, targetPath, cloneDir, excludes);

  const installedSkillMdPath = path.join(targetPath, 'SKILL.md');
  if (isFile(installedSkillMdPath)) {
    const rawMd = fs.readFileSync(installedSkillMdPath, 'utf8');
    const currentFmName = parseFrontmatterName(rawMd);
    const hasUnsafeFmName =
      currentFmName !== null && isUnsafePathLike(currentFmName);

    if (forceFrontmatterRewrite || hasUnsafeFmName) {
      const updatedMd = rewriteFrontmatterName(rawMd, targetDirName);
      fs.writeFileSync(installedSkillMdPath, updatedMd, 'utf8');
    }
  }
}

function buildGitEnv() {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
    GIT_SSH_COMMAND:
      process.env.GIT_SSH_COMMAND ?? 'ssh -oBatchMode=yes -oConnectTimeout=5',
  };
}

function formatGitError(err, actionLabel) {
  const stderr = typeof err?.stderr === 'string' ? err.stderr.trim() : '';
  const message = stderr || err?.message || 'Unknown git failure';
  return `${actionLabel}: ${message}`;
}

function assertSafeGitUrl(rawUrl, actionLabel) {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    throw new Error(`${actionLabel}: repository URL must be a non-empty string.`);
  }
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('-')) {
    throw new Error(
      `${actionLabel}: unsafe repository URL "${trimmed}" cannot start with a leading dash.`,
    );
  }
  return trimmed;
}

async function cloneRepoShallow(url, cloneDir, label, timeoutMs = 30000) {
  const actionLabel = `Failed to clone ${label} (${String(url)})`;
  const safeUrl = assertSafeGitUrl(url, actionLabel);
  try {
    await execFileAsync(
      'git',
      [
        '-c',
        'protocol.file.allow=always',
        'clone',
        '--depth',
        '1',
        '--',
        safeUrl,
        cloneDir,
      ],
      {
        env: buildGitEnv(),
        timeout: timeoutMs,
      },
    );
    const { stdout } = await execFileAsync(
      'git',
      ['-C', cloneDir, 'rev-parse', 'HEAD'],
      {
        env: buildGitEnv(),
        timeout: 10000,
      },
    );
    return stdout.trim().toLowerCase();
  } catch (err) {
    throw new Error(formatGitError(err, actionLabel));
  }
}

async function queryRemoteHeadSha(url, timeoutMs = 15000) {
  const safeUrl = assertSafeGitUrl(url, 'Invalid git remote URL');
  const { stdout } = await execFileAsync(
    'git',
    ['-c', 'protocol.file.allow=always', 'ls-remote', '--', safeUrl, 'HEAD'],
    {
      env: buildGitEnv(),
      timeout: timeoutMs,
    },
  );
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.trim().match(/^([0-9a-f]{40})\b/i);
    if (match) {
      return match[1].toLowerCase();
    }
  }
  throw new Error(`No HEAD commit returned by git ls-remote for ${safeUrl}`);
}

function listExistingSkillFolders(skillsRootDir) {
  if (!isDirectory(skillsRootDir)) {
    return new Set();
  }
  const names = new Set();
  for (const entry of fs.readdirSync(skillsRootDir, { withFileTypes: true })) {
    if (!entry.name.startsWith('.')) {
      names.add(entry.name);
    }
  }
  return names;
}

function collectManagedDirsFromPacks(packs) {
  const managed = new Set();
  if (!Array.isArray(packs)) {
    return managed;
  }
  for (const pack of packs) {
    if (!Array.isArray(pack?.installedDirs)) {
      continue;
    }
    for (const dirName of pack.installedDirs) {
      if (!SELF_SKILL_NAME_SET.has(dirName) && SAFE_SKILL_NAME_RE.test(dirName)) {
        managed.add(dirName);
      }
    }
  }
  return managed;
}

async function resolveLocalGitHeadSha(dirPath) {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', dirPath, 'rev-parse', 'HEAD'],
      {
        env: buildGitEnv(),
        timeout: 5000,
      },
    );
    const trimmed = stdout.trim().toLowerCase();
    return /^[0-9a-f]{40}$/.test(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
}

async function vendorSelfSkillDirectory(selfSkillDir, skillsRootDir) {
  if (typeof selfSkillDir !== 'string' || selfSkillDir.trim().length === 0) {
    return false;
  }
  const resolvedSource = path.resolve(selfSkillDir);
  if (!isDirectory(resolvedSource)) {
    return false;
  }

  const targetReporigDir = resolveContainedSkillDir(skillsRootDir, 'reporig');
  const alreadyInPlace = isSameDirectory(resolvedSource, targetReporigDir);
  let detectedSha = null;

  if (!alreadyInPlace) {
    fs.mkdirSync(skillsRootDir, { recursive: true });
    removeEntrySafe(targetReporigDir);
    copyDirectoryFiltered(
      resolvedSource,
      targetReporigDir,
      resolvedSource,
      SUBDIR_SKILL_COPY_EXCLUDES,
    );
  }

  const copiedShaPath = path.join(targetReporigDir, REPORIG_SHA_FILE);
  if (isFile(copiedShaPath)) {
    detectedSha = fs.readFileSync(copiedShaPath, 'utf8').trim() || null;
  } else {
    detectedSha = await resolveLocalGitHeadSha(resolvedSource);
    if (detectedSha) {
      fs.writeFileSync(copiedShaPath, `${detectedSha}\n`, 'utf8');
    }
  }

  for (const siblingName of SELF_SKILL_NAMES) {
    if (siblingName === 'reporig') {
      continue;
    }
    const siblingSource = path.resolve(resolvedSource, '..', siblingName);
    if (!isDirectory(siblingSource) || !isFile(path.join(siblingSource, 'SKILL.md'))) {
      continue;
    }
    const targetSiblingDir = resolveContainedSkillDir(skillsRootDir, siblingName);
    if (!isSameDirectory(siblingSource, targetSiblingDir)) {
      fs.mkdirSync(skillsRootDir, { recursive: true });
      removeEntrySafe(targetSiblingDir);
      copyDirectoryFiltered(
        siblingSource,
        targetSiblingDir,
        siblingSource,
        SUBDIR_SKILL_COPY_EXCLUDES,
      );
    }
    const siblingShaPath = path.join(targetSiblingDir, REPORIG_SHA_FILE);
    if (!isFile(siblingShaPath) && detectedSha) {
      fs.writeFileSync(siblingShaPath, `${detectedSha}\n`, 'utf8');
    }
  }

  return true;
}

function discoverAndFilterPackSkills(cloneDir, pack, allPacks, spinePrecedence) {
  const curatedEntry = CURATED_SPINES[pack.source] ?? CURATED_SKILLS[pack.source];
  const includePaths = pack.includePaths ?? curatedEntry?.includePaths ?? [];
  const excludePaths = pack.excludePaths ?? curatedEntry?.excludePaths ?? [];
  const fallbackName = extractFallbackNameFromPack(pack);

  const discovered = discoverSkillsInClone(cloneDir, {
    includePaths,
    excludePaths,
    fallbackName,
  });

  const selectedFiltered = Array.isArray(pack?.selectedSkills)
    ? discovered.filter((skill) => pack.selectedSkills.includes(skill.name))
    : discovered;

  return filterPackSkillsForMultiSpine(
    selectedFiltered,
    pack,
    allPacks,
    spinePrecedence,
  );
}

function listValidClaudeSkillDirs(claudeSkillsDir) {
  if (!isDirectory(claudeSkillsDir)) {
    return [];
  }
  const validNames = [];
  let entries;
  try {
    entries = fs.readdirSync(claudeSkillsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SELF_SKILL_NAME_SET.has(entry.name)) {
      continue;
    }
    if (!SAFE_SKILL_NAME_RE.test(entry.name)) {
      continue;
    }
    const candidateDir = path.join(claudeSkillsDir, entry.name);
    if (
      (entry.isDirectory() || isDirectory(candidateDir)) &&
      isFile(path.join(candidateDir, 'SKILL.md'))
    ) {
      validNames.push(entry.name);
    }
  }
  return validNames.sort(lexCompare);
}

function cleanupEmptyClaudeDirs(repoRoot, skillsRootDir, claudeSkillsDir) {
  if (!isSeparateClaudeSkillsDir(skillsRootDir, claudeSkillsDir)) {
    return;
  }
  try {
    if (
      !fs.lstatSync(claudeSkillsDir).isSymbolicLink() &&
      fs.readdirSync(claudeSkillsDir).length === 0
    ) {
      fs.rmdirSync(claudeSkillsDir);
    }
    const claudeDir = path.join(repoRoot, '.claude');
    if (
      isDirectory(claudeDir) &&
      !fs.lstatSync(claudeDir).isSymbolicLink() &&
      fs.readdirSync(claudeDir).length === 0
    ) {
      fs.rmdirSync(claudeDir);
    }
  } catch {
    // Ignore concurrent or non-empty directory cleanup errors.
  }
}

function collectKnownCatalogSkillsForPacks(configuredPacks, spinePrecedence) {
  const known = new Set();
  if (!Array.isArray(configuredPacks)) {
    return known;
  }
  for (const pack of configuredPacks) {
    const source = typeof pack?.source === 'string' ? pack.source.trim() : '';
    const curatedSpine = CURATED_SPINES[source];
    if (curatedSpine?.stageSkills) {
      const rawSpineNames = Object.values(curatedSpine.stageSkills).flat();
      const filteredSpineNames = Array.isArray(pack?.selectedSkills)
        ? rawSpineNames.filter((name) => pack.selectedSkills.includes(name))
        : rawSpineNames;
      const allSpineSkills = filteredSpineNames.map((name) => ({ name }));
      const kept = filterPackSkillsForMultiSpine(
        allSpineSkills,
        pack,
        configuredPacks,
        spinePrecedence,
      );
      for (const item of kept) {
        if (!SELF_SKILL_NAME_SET.has(item.name) && SAFE_SKILL_NAME_RE.test(item.name)) {
          known.add(item.name);
        }
      }
    } else if (CURATED_SKILLS[source]) {
      const curatedSkill = CURATED_SKILLS[source];
      const baseNames =
        Array.isArray(curatedSkill.skillNames) && curatedSkill.skillNames.length > 0
          ? curatedSkill.skillNames
          : [sanitizeSkillName(source.split('#')[0].split('/').at(-1) ?? '')];
      const effectiveNames = Array.isArray(pack?.selectedSkills)
        ? baseNames.filter((name) => pack.selectedSkills.includes(name))
        : baseNames;
      for (const slug of effectiveNames) {
        if (!SELF_SKILL_NAME_SET.has(slug) && SAFE_SKILL_NAME_RE.test(slug)) {
          known.add(slug);
        }
      }
    }

    if (Array.isArray(pack?.installedDirs)) {
      for (const dirName of pack.installedDirs) {
        if (!SELF_SKILL_NAME_SET.has(dirName) && SAFE_SKILL_NAME_RE.test(dirName)) {
          known.add(dirName);
        }
      }
    }
  }
  return known;
}

export function previewBrownfieldSkillOps({
  cwd,
  config,
  adoptExistingSkills = null,
  migrateClaudeSkills = null,
  pruneSkills = [],
  skipSkills = false,
} = {}) {
  if (typeof cwd !== 'string' || cwd.trim().length === 0) {
    throw new Error('previewBrownfieldSkillOps requires a non-empty cwd path.');
  }

  const adoptSkills = normalizeSkillFilterOption(
    adoptExistingSkills,
    'adoptExistingSkills',
  );
  const normalizedMigrateClaude = normalizeSkillFilterOption(
    migrateClaudeSkills,
    'migrateClaudeSkills',
  );
  const normalizedPrune = normalizePruneList(pruneSkills);
  const pruneSet = new Set(normalizedPrune);
  const shouldSkipSkills = Boolean(skipSkills);

  const repoRoot = path.resolve(cwd);
  const skillsRootDir = path.join(repoRoot, '.agents', 'skills');
  const claudeSkillsDir = path.join(repoRoot, '.claude', 'skills');
  const configuredPacks = Array.isArray(config?.skills?.packs)
    ? config.skills.packs
    : [];
  const spinePrecedence = config?.skills?.spinePrecedence ?? null;

  const hasSeparateClaude = isSeparateClaudeSkillsDir(
    skillsRootDir,
    claudeSkillsDir,
  );

  const wouldPruneDirs = normalizedPrune.filter((dirName) => {
    const inAgents = pathExistsOrSymlink(path.join(skillsRootDir, dirName));
    const inClaude =
      hasSeparateClaude &&
      pathExistsOrSymlink(path.join(claudeSkillsDir, dirName));
    return inAgents || inClaude;
  });

  const existingAgentsFolders = new Set(
    [...listExistingSkillFolders(skillsRootDir)].filter(
      (name) =>
        !SELF_SKILL_NAME_SET.has(name) &&
        SAFE_SKILL_NAME_RE.test(name) &&
        !pruneSet.has(name),
    ),
  );

  const knownCatalogSkills = collectKnownCatalogSkillsForPacks(
    configuredPacks,
    spinePrecedence,
  );

  const wouldAdoptDirs = [];
  if (!shouldSkipSkills && adoptSkills !== null && configuredPacks.length > 0) {
    for (const folder of existingAgentsFolders) {
      if (adoptSkills === 'all') {
        if (knownCatalogSkills.has(folder)) {
          wouldAdoptDirs.push(folder);
        }
      } else if (adoptSkills.includes(folder)) {
        wouldAdoptDirs.push(folder);
      }
    }
    wouldAdoptDirs.sort(lexCompare);
  }
  const wouldAdoptSet = new Set(wouldAdoptDirs);

  const wouldMigrateClaudeDirs = [];
  if (normalizedMigrateClaude !== null && hasSeparateClaude) {
    for (const name of listValidClaudeSkillDirs(claudeSkillsDir)) {
      if (pruneSet.has(name) || !matchesSkillFilter(name, normalizedMigrateClaude)) {
        continue;
      }
      if (existingAgentsFolders.has(name)) {
        continue;
      }
      const adoptedFromIncoming =
        !shouldSkipSkills &&
        (wouldAdoptSet.has(name) ||
          (knownCatalogSkills.has(name) && matchesSkillFilter(name, adoptSkills)));
      if (adoptedFromIncoming) {
        continue;
      }
      wouldMigrateClaudeDirs.push(name);
    }
    wouldMigrateClaudeDirs.sort(lexCompare);
  }

  return {
    adoptSkills,
    wouldAdoptDirs,
    wouldMigrateClaudeDirs,
    wouldPruneDirs,
  };
}

export async function syncSkillPacks({
  cwd,
  config,
  previousPacks = [],
  selfSkillDir,
  adoptExistingSkills = null,
  migrateClaudeSkills = null,
  pruneSkills = [],
  skipPackClone = false,
} = {}) {
  if (typeof cwd !== 'string' || cwd.trim().length === 0) {
    throw new Error('syncSkillPacks requires a non-empty cwd path.');
  }

  const normalizedAdopt = normalizeSkillFilterOption(
    adoptExistingSkills,
    'adoptExistingSkills',
  );
  const normalizedMigrateClaude = normalizeSkillFilterOption(
    migrateClaudeSkills,
    'migrateClaudeSkills',
  );
  const normalizedPrune = normalizePruneList(pruneSkills);
  const pruneSet = new Set(normalizedPrune);
  const shouldSkipPackClone = Boolean(skipPackClone);

  const repoRoot = path.resolve(cwd);
  const skillsRootDir = path.join(repoRoot, '.agents', 'skills');
  const claudeSkillsDir = path.join(repoRoot, '.claude', 'skills');
  const configuredPacks = Array.isArray(config?.skills?.packs)
    ? config.skills.packs
    : [];
  const spinePrecedence = config?.skills?.spinePrecedence ?? null;

  const tempRoot =
    !shouldSkipPackClone && configuredPacks.length > 0
      ? fs.mkdtempSync(path.join(os.tmpdir(), 'reporig-sync-'))
      : null;

  try {
    // Stage 1: Clone all configured packs into temp directories first so any network or URL error aborts cleanly before mutating .agents/skills
    const stagedClones = [];
    if (!shouldSkipPackClone) {
      const cloneCacheByUrl = new Map();
      for (let i = 0; i < configuredPacks.length; i += 1) {
        const pack = configuredPacks[i];
        const urlKey = typeof pack.url === 'string' ? pack.url.trim() : '';
        let cached = cloneCacheByUrl.get(urlKey);
        if (!cached) {
          const cloneDir = path.join(tempRoot, `pack-${cloneCacheByUrl.size}`);
          const commitSha = await cloneRepoShallow(
            pack.url,
            cloneDir,
            pack.source || `pack-${i}`,
          );
          cached = { cloneDir, commitSha };
          cloneCacheByUrl.set(urlKey, cached);
        }
        const keptSkills = discoverAndFilterPackSkills(
          cached.cloneDir,
          pack,
          configuredPacks,
          spinePrecedence,
        );
        stagedClones.push({
          pack,
          cloneDir: cached.cloneDir,
          commitSha: cached.commitSha,
          keptSkills,
        });
      }
    }

    const incomingSkillNames = new Set(
      stagedClones.flatMap((staged) =>
        staged.keptSkills.map((skill) => skill.name),
      ),
    );

    // Stage 2: Clean up previously managed directories from previousPacks and prior pack entries when refreshing packs
    const deletedFromDisk = new Set();
    if (!shouldSkipPackClone) {
      const previouslyManaged = new Set([
        ...collectManagedDirsFromPacks(previousPacks),
        ...collectManagedDirsFromPacks(configuredPacks),
      ]);

      if (isDirectory(skillsRootDir)) {
        for (const oldDir of previouslyManaged) {
          const oldPath = resolveContainedSkillDir(skillsRootDir, oldDir);
          if (removeEntrySafe(oldPath)) {
            deletedFromDisk.add(oldDir);
          }
        }
      }
    }

    // Stage 2b: Migrate matching skills from separate .claude/skills into .agents/skills
    const migratedClaudeSet = new Set();
    if (
      normalizedMigrateClaude !== null &&
      isSeparateClaudeSkillsDir(skillsRootDir, claudeSkillsDir)
    ) {
      for (const name of listValidClaudeSkillDirs(claudeSkillsDir)) {
        if (pruneSet.has(name) || !matchesSkillFilter(name, normalizedMigrateClaude)) {
          continue;
        }
        const destSkillDir = resolveContainedSkillDir(skillsRootDir, name);
        if (pathExistsOrSymlink(destSkillDir)) {
          continue;
        }
        const shouldCopyFromClaude =
          shouldSkipPackClone ||
          !incomingSkillNames.has(name) ||
          !matchesSkillFilter(name, normalizedAdopt);
        if (!shouldCopyFromClaude) {
          continue;
        }
        const srcSkillDir = resolveContainedSkillDir(claudeSkillsDir, name);
        fs.mkdirSync(skillsRootDir, { recursive: true });
        copyDirectoryFiltered(
          srcSkillDir,
          destSkillDir,
          srcSkillDir,
          SUBDIR_SKILL_COPY_EXCLUDES,
        );
        migratedClaudeSet.add(name);
      }
    }

    // Stage 2c: Prune requested legacy skill directories safely from .agents/skills and separate .claude/skills
    let removedAnyInClaude = false;
    for (const dirName of normalizedPrune) {
      const agentsPrunePath = resolveContainedSkillDir(skillsRootDir, dirName);
      const removedInAgents = removeEntrySafe(agentsPrunePath);
      let removedInClaude = false;
      if (isSeparateClaudeSkillsDir(skillsRootDir, claudeSkillsDir)) {
        const claudePrunePath = resolveContainedSkillDir(claudeSkillsDir, dirName);
        removedInClaude = removeEntrySafe(claudePrunePath);
        if (removedInClaude) {
          removedAnyInClaude = true;
        }
      }
      if (removedInAgents || removedInClaude) {
        deletedFromDisk.add(dirName);
      }
    }

    // Stage 3: Self-vendor reporig skill when !skipPackClone and selfSkillDir is provided
    const vendoredSelf = shouldSkipPackClone
      ? false
      : await vendorSelfSkillDirectory(selfSkillDir, skillsRootDir);

    // Stage 4: Pre-claim unmanaged user directories (and reporig) unless adopted in place
    const existingFolders = listExistingSkillFolders(skillsRootDir);
    const adoptableSet = new Set();
    if (!shouldSkipPackClone && normalizedAdopt !== null) {
      for (const folder of existingFolders) {
        if (
          !SELF_SKILL_NAME_SET.has(folder) &&
          incomingSkillNames.has(folder) &&
          matchesSkillFilter(folder, normalizedAdopt)
        ) {
          adoptableSet.add(folder);
        }
      }
    }

    const claimedDirs = new Set();
    for (const folder of existingFolders) {
      if (!adoptableSet.has(folder)) {
        claimedDirs.add(folder);
      }
    }
    if (vendoredSelf) {
      for (const selfName of SELF_SKILL_NAMES) {
        if (isDirectory(path.join(skillsRootDir, selfName))) {
          claimedDirs.add(selfName);
        }
      }
    }

    if (stagedClones.length > 0) {
      fs.mkdirSync(skillsRootDir, { recursive: true });
    }

    // Stage 5: Copy kept skills for each pack with collision safety and symlink-safe replacement
    const nowIso = new Date().toISOString();
    const updatedPacks = [];
    const newlyInstalledAll = new Set();
    const adoptedSet = new Set();

    if (shouldSkipPackClone) {
      for (const pack of configuredPacks) {
        const clonedPack = structuredClone(pack);
        if (Array.isArray(clonedPack.installedDirs)) {
          clonedPack.installedDirs = clonedPack.installedDirs.filter(
            (dirName) => !deletedFromDisk.has(dirName),
          );
        }
        updatedPacks.push(clonedPack);
      }
    } else {
      for (const staged of stagedClones) {
        const installedDirs = [];
        for (const skill of staged.keptSkills) {
          const { dirName, prefixed } = allocateSkillDirName(
            skill.name,
            staged.pack.source,
            claimedDirs,
          );
          installDiscoveredSkill({
            skill,
            cloneDir: staged.cloneDir,
            skillsRootDir,
            targetDirName: dirName,
            forceFrontmatterRewrite: prefixed,
          });
          if (!prefixed && adoptableSet.has(dirName)) {
            adoptedSet.add(dirName);
          }
          installedDirs.push(dirName);
          newlyInstalledAll.add(dirName);
        }

        installedDirs.sort(lexCompare);

        updatedPacks.push({
          source: staged.pack.source,
          url: staged.pack.url,
          kind: staged.pack.kind,
          installedDirs,
          commitSha: staged.commitSha,
          installedAt: nowIso,
          ...(Array.isArray(staged.pack.includePaths)
            ? { includePaths: [...staged.pack.includePaths] }
            : {}),
          ...(Array.isArray(staged.pack.excludePaths)
            ? { excludePaths: [...staged.pack.excludePaths] }
            : {}),
          ...(Array.isArray(staged.pack.selectedSkills)
            ? { selectedSkills: [...staged.pack.selectedSkills] }
            : {}),
        });
      }
    }

    // Stage 6: Clean up migrated or adopted duplicates in separate .claude/skills once .agents/skills/<name>/SKILL.md exists
    if (
      normalizedMigrateClaude !== null &&
      isSeparateClaudeSkillsDir(skillsRootDir, claudeSkillsDir)
    ) {
      for (const entryName of listExistingSkillFolders(claudeSkillsDir)) {
        if (SELF_SKILL_NAME_SET.has(entryName) || !SAFE_SKILL_NAME_RE.test(entryName)) {
          continue;
        }
        const targeted =
          matchesSkillFilter(entryName, normalizedMigrateClaude) ||
          adoptedSet.has(entryName);
        if (!targeted) {
          continue;
        }
        if (isFile(path.join(skillsRootDir, entryName, 'SKILL.md'))) {
          const claudeDupPath = resolveContainedSkillDir(
            claudeSkillsDir,
            entryName,
          );
          if (removeEntrySafe(claudeDupPath)) {
            removedAnyInClaude = true;
          }
        }
      }
    }

    if (normalizedMigrateClaude !== null || removedAnyInClaude) {
      cleanupEmptyClaudeDirs(repoRoot, skillsRootDir, claudeSkillsDir);
    }

    const removedDirs = [...deletedFromDisk]
      .filter((dirName) => !newlyInstalledAll.has(dirName))
      .sort(lexCompare);
    const adoptedDirs = [...adoptedSet].sort(lexCompare);
    const migratedClaudeDirs = [...migratedClaudeSet].sort(lexCompare);

    const managedForBridge = new Set(collectManagedDirsFromPacks(updatedPacks));
    for (const selfName of SELF_SKILL_NAMES) {
      if (isDirectory(path.join(skillsRootDir, selfName))) {
        managedForBridge.add(selfName);
      }
    }
    syncClaudeSkillsBridge({
      cwd: repoRoot,
      managedDirs: [...managedForBridge],
      removedDirs,
    });

    return {
      packs: updatedPacks,
      vendoredSelf,
      removedDirs,
      adoptedDirs,
      migratedClaudeDirs,
    };
  } finally {
    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
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

function isSymlinkPermissionError(err) {
  return Boolean(
    err &&
      (err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'ENOSYS'),
  );
}

export function syncClaudeSkillsBridge({
  cwd,
  managedDirs = [],
  removedDirs = [],
  symlinkImpl = fs.symlinkSync,
} = {}) {
  if (typeof cwd !== 'string' || cwd.trim().length === 0) {
    throw new Error('syncClaudeSkillsBridge requires a non-empty cwd path.');
  }
  const repoRoot = path.resolve(cwd);
  const agentsSkillsDir = path.join(repoRoot, '.agents', 'skills');
  const claudeDir = path.join(repoRoot, '.claude');
  const claudeSkillsPath = path.join(claudeDir, 'skills');

  const existingStat = safeLstat(claudeSkillsPath);

  if (!isDirectory(agentsSkillsDir)) {
    if (existingStat && existingStat.isSymbolicLink()) {
      const linkTarget = fs.readlinkSync(claudeSkillsPath);
      const resolvedLink = path.resolve(claudeDir, linkTarget);
      if (resolvedLink === agentsSkillsDir) {
        fs.rmSync(claudeSkillsPath, { force: true });
        if (isDirectory(claudeDir) && fs.readdirSync(claudeDir).length === 0) {
          fs.rmdirSync(claudeDir);
        }
      }
    } else if (
      existingStat &&
      existingStat.isDirectory() &&
      isFile(path.join(claudeSkillsPath, REPORIG_MIRROR_MARKER))
    ) {
      fs.rmSync(claudeSkillsPath, { recursive: true, force: true });
      if (isDirectory(claudeDir) && fs.readdirSync(claudeDir).length === 0) {
        fs.rmdirSync(claudeDir);
      }
    }
    return { mode: 'none' };
  }

  if (existingStat && existingStat.isSymbolicLink()) {
    const linkTarget = fs.readlinkSync(claudeSkillsPath);
    const resolvedLink = path.resolve(claudeDir, linkTarget);
    if (resolvedLink === agentsSkillsDir) {
      return { mode: 'symlink' };
    }
    return { mode: 'custom-preserved' };
  }

  if (!existingStat) {
    const hadClaudeDir = isDirectory(claudeDir);
    fs.mkdirSync(claudeDir, { recursive: true });
    try {
      symlinkImpl('../.agents/skills', claudeSkillsPath, 'dir');
      return { mode: 'symlink' };
    } catch (err) {
      if (!isSymlinkPermissionError(err)) {
        if (
          !hadClaudeDir &&
          isDirectory(claudeDir) &&
          fs.readdirSync(claudeDir).length === 0
        ) {
          fs.rmdirSync(claudeDir);
        }
        throw err;
      }
      fs.mkdirSync(claudeSkillsPath, { recursive: true });
      fs.writeFileSync(
        path.join(claudeSkillsPath, REPORIG_MIRROR_MARKER),
        'reporig-managed-mirror\n',
        'utf8',
      );
      for (const dirName of listExistingSkillFolders(agentsSkillsDir)) {
        const srcDir = path.join(agentsSkillsDir, dirName);
        if (isDirectory(srcDir)) {
          const dstDir = path.join(claudeSkillsPath, dirName);
          fs.rmSync(dstDir, { recursive: true, force: true });
          copyDirectoryFiltered(
            srcDir,
            dstDir,
            srcDir,
            SUBDIR_SKILL_COPY_EXCLUDES,
          );
          fs.writeFileSync(
            path.join(dstDir, REPORIG_MIRROR_MARKER),
            'reporig-managed-mirror\n',
            'utf8',
          );
        }
      }
      return { mode: 'copy' };
    }
  }

  if (existingStat.isDirectory()) {
    const isWholeDirMirror = isFile(
      path.join(claudeSkillsPath, REPORIG_MIRROR_MARKER),
    );
    for (const oldName of removedDirs) {
      if (!SAFE_SKILL_NAME_RE.test(oldName)) {
        continue;
      }
      const candidatePath = path.join(claudeSkillsPath, oldName);
      const itemStat = safeLstat(candidatePath);
      if (!itemStat) {
        continue;
      }
      if (itemStat.isSymbolicLink()) {
        const target = path.resolve(
          claudeSkillsPath,
          fs.readlinkSync(candidatePath),
        );
        if (target === path.join(agentsSkillsDir, oldName)) {
          fs.rmSync(candidatePath, { force: true });
        }
      } else if (
        itemStat.isDirectory() &&
        isFile(path.join(candidatePath, REPORIG_MIRROR_MARKER))
      ) {
        fs.rmSync(candidatePath, { recursive: true, force: true });
      }
    }

    for (const dirName of managedDirs) {
      if (!SAFE_SKILL_NAME_RE.test(dirName)) {
        continue;
      }
      const srcSkillDir = path.join(agentsSkillsDir, dirName);
      if (!isDirectory(srcSkillDir)) {
        continue;
      }
      const dstSkillPath = path.join(claudeSkillsPath, dirName);
      const dstStat = safeLstat(dstSkillPath);
      if (dstStat) {
        if (dstStat.isSymbolicLink()) {
          const target = path.resolve(
            claudeSkillsPath,
            fs.readlinkSync(dstSkillPath),
          );
          if (target === srcSkillDir) {
            continue;
          }
          continue;
        }
        if (
          dstStat.isDirectory() &&
          !isFile(path.join(dstSkillPath, REPORIG_MIRROR_MARKER))
        ) {
          continue;
        }
        fs.rmSync(dstSkillPath, { recursive: true, force: true });
      }

      try {
        symlinkImpl(`../../.agents/skills/${dirName}`, dstSkillPath, 'dir');
      } catch (err) {
        if (!isSymlinkPermissionError(err)) {
          throw err;
        }
        copyDirectoryFiltered(
          srcSkillDir,
          dstSkillPath,
          srcSkillDir,
          SUBDIR_SKILL_COPY_EXCLUDES,
        );
        fs.writeFileSync(
          path.join(dstSkillPath, REPORIG_MIRROR_MARKER),
          'reporig-managed-mirror\n',
          'utf8',
        );
      }
    }

    return { mode: isWholeDirMirror ? 'copy' : 'per-skill' };
  }

  return { mode: 'custom-preserved' };
}

function buildHarnessNotes(config) {
  const notes = [];
  const harnesses = Array.isArray(config?.harnesses) ? config.harnesses : [];
  const customHarnesses = Array.isArray(config?.customHarnesses)
    ? config.customHarnesses
    : [];

  if (harnesses.length === 0 && customHarnesses.length === 0) {
    return [
      'Universal repo layout: rules load from `AGENTS.md` (bridged via `CLAUDE.md`) and skills load from `.agents/skills/` (linked at `.claude/skills/`).',
    ];
  }

  for (const harness of harnesses) {
    if (harness === 'claude-code') {
      notes.push(
        'Claude Code: run `claude plugin list` to review installed harness plugins.',
      );
    } else if (harness === 'antigravity') {
      notes.push(
        'Antigravity: check the Plugins Manager pane to verify active workspace plugins and sign-in status.',
      );
    } else if (harness === 'codex') {
      notes.push(
        'Codex: rules load from `AGENTS.md` and skills load directly from `.agents/skills/`.',
      );
    } else if (harness === 'cursor') {
      notes.push(
        'Cursor: rules load from `AGENTS.md` and skills load from `.agents/skills/`.',
      );
    } else if (harness === 'github-copilot') {
      notes.push(
        'GitHub Copilot: repository instructions load from `AGENTS.md` and skills load from `.agents/skills/`.',
      );
    }
  }

  for (const custom of customHarnesses) {
    if (typeof custom?.name === 'string' && custom.name.trim().length > 0) {
      notes.push(
        `Custom harness (${custom.name.trim()}): verify active skills under \`.agents/skills/\`.`,
      );
    }
  }

  return notes;
}

function readVendoredReporigSha(cwd) {
  const shaPath = path.join(cwd, '.agents', 'skills', 'reporig', REPORIG_SHA_FILE);
  if (!isFile(shaPath)) {
    return null;
  }
  try {
    const text = fs.readFileSync(shaPath, 'utf8').trim();
    return /^[0-9a-f]{7,40}$/i.test(text) ? text.toLowerCase() : null;
  } catch {
    return null;
  }
}

export async function checkPackUpdates(options = {}) {
  const { cwd, config } = options;
  if (typeof cwd !== 'string' || cwd.trim().length === 0) {
    throw new Error('checkPackUpdates requires a non-empty cwd path.');
  }

  const repoRoot = path.resolve(cwd);
  const hasExplicitSelfUrl = Object.prototype.hasOwnProperty.call(
    options,
    'selfRepoUrl',
  );
  const selfRepoUrl = hasExplicitSelfUrl
    ? options.selfRepoUrl
    : REPORIG_REPO_URL;

  const packs = Array.isArray(config?.skills?.packs) ? config.skills.packs : [];
  const updates = [];
  const remoteShaCache = new Map();

  for (const pack of packs) {
    const currentSha =
      typeof pack.commitSha === 'string' && pack.commitSha.trim().length > 0
        ? pack.commitSha.trim().toLowerCase()
        : null;
    const urlKey = typeof pack.url === 'string' ? pack.url.trim() : '';

    let cachedResult = remoteShaCache.get(urlKey);
    if (!cachedResult) {
      try {
        const remoteSha = await queryRemoteHeadSha(pack.url);
        cachedResult = { ok: true, remoteSha };
      } catch (err) {
        cachedResult = { ok: false, err };
      }
      remoteShaCache.set(urlKey, cachedResult);
    }

    if (cachedResult.ok) {
      const { remoteSha } = cachedResult;
      updates.push({
        source: pack.source,
        url: pack.url,
        currentSha,
        remoteSha,
        hasUpdate: Boolean(remoteSha && remoteSha !== currentSha),
        error: null,
      });
    } else {
      updates.push({
        source: pack.source,
        url: pack.url,
        currentSha,
        remoteSha: null,
        hasUpdate: false,
        error: formatGitError(cachedResult.err, `Unable to check ${pack.source}`),
      });
    }
  }

  // Check vendored reporig self-update when selfRepoUrl is enabled and .agents/skills/reporig is present (or custom selfRepoUrl was explicitly supplied)
  const vendoredReporigDir = path.join(repoRoot, '.agents', 'skills', 'reporig');
  if (
    typeof selfRepoUrl === 'string' &&
    selfRepoUrl.trim().length > 0 &&
    (isDirectory(vendoredReporigDir) ||
      (hasExplicitSelfUrl && selfRepoUrl !== REPORIG_REPO_URL))
  ) {
    const currentSelfSha = readVendoredReporigSha(repoRoot);
    try {
      const remoteSelfSha = await queryRemoteHeadSha(selfRepoUrl.trim(), 5000);
      updates.push({
        source: 'timothyjordan/reporig',
        url: selfRepoUrl.trim(),
        currentSha: currentSelfSha,
        remoteSha: remoteSelfSha,
        hasUpdate: Boolean(remoteSelfSha && remoteSelfSha !== currentSelfSha),
        error: null,
      });
    } catch (err) {
      // Spec Section 9.2: include default reporig self-check when remote is reachable; surface explicit custom selfRepoUrl errors directly
      if (hasExplicitSelfUrl && selfRepoUrl !== REPORIG_REPO_URL) {
        updates.push({
          source: 'timothyjordan/reporig',
          url: selfRepoUrl.trim(),
          currentSha: currentSelfSha,
          remoteSha: null,
          hasUpdate: false,
          error: formatGitError(err, 'Unable to check timothyjordan/reporig'),
        });
      }
    }
  }

  const externalLockCheck = isFile(path.join(repoRoot, 'skills-lock.json'))
    ? 'Found skills-lock.json; run `npx skills check` to inspect externally managed skills.'
    : null;

  const harnessNotes = buildHarnessNotes(config);

  return {
    updates,
    externalLockCheck,
    harnessNotes,
  };
}

function arraysEqual(arrA, arrB) {
  if (arrA.length !== arrB.length) {
    return false;
  }
  for (let i = 0; i < arrA.length; i += 1) {
    if (arrA[i] !== arrB[i]) {
      return false;
    }
  }
  return true;
}

async function cloneAndVendorSelfFromRemote(remoteUrl, tempRoot, skillsRootDir) {
  const selfCloneDir = path.join(tempRoot, 'reporig-self');
  const selfCommitSha = await cloneRepoShallow(
    remoteUrl.trim(),
    selfCloneDir,
    'timothyjordan/reporig',
  );
  const candidateSkillsParent = path.join(selfCloneDir, 'skills');
  const hasSkillsSubdirLayout = isDirectory(
    path.join(candidateSkillsParent, 'reporig'),
  );
  fs.mkdirSync(skillsRootDir, { recursive: true });

  if (hasSkillsSubdirLayout) {
    for (const selfName of SELF_SKILL_NAMES) {
      const candidateSubdir = path.join(candidateSkillsParent, selfName);
      if (!isDirectory(candidateSubdir)) {
        continue;
      }
      const targetSelfDir = resolveContainedSkillDir(skillsRootDir, selfName);
      removeEntrySafe(targetSelfDir);
      copyDirectoryFiltered(
        candidateSubdir,
        targetSelfDir,
        selfCloneDir,
        SUBDIR_SKILL_COPY_EXCLUDES,
      );
      fs.writeFileSync(
        path.join(targetSelfDir, REPORIG_SHA_FILE),
        `${selfCommitSha}\n`,
        'utf8',
      );
    }
  } else {
    const targetReporigDir = resolveContainedSkillDir(skillsRootDir, 'reporig');
    removeEntrySafe(targetReporigDir);
    copyDirectoryFiltered(
      selfCloneDir,
      targetReporigDir,
      selfCloneDir,
      ROOT_SKILL_COPY_EXCLUDES,
    );
    fs.writeFileSync(
      path.join(targetReporigDir, REPORIG_SHA_FILE),
      `${selfCommitSha}\n`,
      'utf8',
    );
  }
  return selfCommitSha;
}

async function vendorSelfFromLocalFallback(selfSkillDir, skillsRootDir) {
  if (typeof selfSkillDir !== 'string' || selfSkillDir.trim().length === 0) {
    return false;
  }
  const resolvedSelf = path.resolve(selfSkillDir);
  const targetReporigDir = resolveContainedSkillDir(skillsRootDir, 'reporig');
  if (isDirectory(resolvedSelf) && !isSameDirectory(resolvedSelf, targetReporigDir)) {
    await vendorSelfSkillDirectory(resolvedSelf, skillsRootDir);
    return true;
  }
  return false;
}

export async function updateInstalledPacks(options = {}) {
  const {
    cwd,
    config,
    packSourcesToUpdate,
    selfSkillDir,
  } = options;

  if (typeof cwd !== 'string' || cwd.trim().length === 0) {
    throw new Error('updateInstalledPacks requires a non-empty cwd path.');
  }

  const repoRoot = path.resolve(cwd);
  const skillsRootDir = path.join(repoRoot, '.agents', 'skills');
  const configuredPacks = Array.isArray(config?.skills?.packs)
    ? config.skills.packs
    : [];
  const spinePrecedence = config?.skills?.spinePrecedence ?? null;

  const hasExplicitFilter = Array.isArray(packSourcesToUpdate);
  const targetSourceSet = hasExplicitFilter
    ? new Set(packSourcesToUpdate)
    : new Set(configuredPacks.map((p) => p.source));

  const defaultSelfUrl =
    typeof options.defaultSelfRepoUrl === 'string' &&
    options.defaultSelfRepoUrl.trim().length > 0
      ? options.defaultSelfRepoUrl.trim()
      : REPORIG_REPO_URL;

  const hasExplicitSelfUrl = Object.prototype.hasOwnProperty.call(
    options,
    'selfRepoUrl',
  );
  const effectiveSelfRepoUrl = hasExplicitSelfUrl
    ? options.selfRepoUrl
    : !hasExplicitFilter || targetSourceSet.has('timothyjordan/reporig')
      ? defaultSelfUrl
      : null;
  const trimmedSelfUrl =
    typeof effectiveSelfRepoUrl === 'string'
      ? effectiveSelfRepoUrl.trim()
      : '';
  const isCustomSelfUrl =
    hasExplicitSelfUrl &&
    trimmedSelfUrl.length > 0 &&
    trimmedSelfUrl !== defaultSelfUrl;

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reporig-update-'));

  try {
    // Stage 1: Clone all targeted packs first so failures abort cleanly before mutating .agents/skills
    const stagedByIndex = new Map();
    const cloneCacheByUrl = new Map();
    for (let i = 0; i < configuredPacks.length; i += 1) {
      const pack = configuredPacks[i];
      if (!targetSourceSet.has(pack.source)) {
        continue;
      }
      const urlKey = typeof pack.url === 'string' ? pack.url.trim() : '';
      let cached = cloneCacheByUrl.get(urlKey);
      if (!cached) {
        const cloneDir = path.join(tempRoot, `pack-${cloneCacheByUrl.size}`);
        const commitSha = await cloneRepoShallow(
          pack.url,
          cloneDir,
          pack.source || `pack-${i}`,
        );
        cached = { cloneDir, commitSha };
        cloneCacheByUrl.set(urlKey, cached);
      }
      const keptSkills = discoverAndFilterPackSkills(
        cached.cloneDir,
        pack,
        configuredPacks,
        spinePrecedence,
      );
      stagedByIndex.set(i, {
        cloneDir: cached.cloneDir,
        commitSha: cached.commitSha,
        keptSkills,
      });
    }

    // Optional self-update via effectiveSelfRepoUrl (with local selfSkillDir fallback when offline)
    let selfUpdated = false;
    const vendoredReporigDir = resolveContainedSkillDir(skillsRootDir, 'reporig');
    const hasVendoredReporig = isDirectory(vendoredReporigDir);

    if (hasExplicitFilter) {
      if (targetSourceSet.has('timothyjordan/reporig')) {
        if (trimmedSelfUrl.length > 0) {
          await cloneAndVendorSelfFromRemote(trimmedSelfUrl, tempRoot, skillsRootDir);
          selfUpdated = true;
        } else {
          selfUpdated = await vendorSelfFromLocalFallback(selfSkillDir, skillsRootDir);
        }
      }
    } else if (trimmedSelfUrl.length === 0) {
      // Explicit selfRepoUrl: null or --self-url none skips remote self-checks
      selfUpdated = await vendorSelfFromLocalFallback(selfSkillDir, skillsRootDir);
    } else if (hasVendoredReporig || isCustomSelfUrl) {
      const currentSelfSha = readVendoredReporigSha(repoRoot);
      try {
        const remoteSelfSha = await queryRemoteHeadSha(trimmedSelfUrl, 5000);
        if (
          !hasVendoredReporig ||
          (remoteSelfSha && remoteSelfSha !== currentSelfSha)
        ) {
          await cloneAndVendorSelfFromRemote(trimmedSelfUrl, tempRoot, skillsRootDir);
          selfUpdated = true;
        }
      } catch (err) {
        if (isCustomSelfUrl) {
          if (err instanceof Error && err.message.startsWith('Failed to clone ')) {
            throw err;
          }
          throw new Error(
            formatGitError(err, 'Unable to update timothyjordan/reporig'),
          );
        }
        selfUpdated = await vendorSelfFromLocalFallback(selfSkillDir, skillsRootDir);
      }
    } else {
      selfUpdated = await vendorSelfFromLocalFallback(selfSkillDir, skillsRootDir);
    }

    // Stage 2: Remove old installedDirs ONLY for packs being refreshed, while preserving untouched packs and unmanaged user folders
    const allKnownManaged = collectManagedDirsFromPacks(configuredPacks);
    const existingBeforeCleanup = listExistingSkillFolders(skillsRootDir);
    const claimedDirs = new Set();

    // Claim unmanaged folders and reporig immediately
    for (const folderName of existingBeforeCleanup) {
      if (!allKnownManaged.has(folderName)) {
        claimedDirs.add(folderName);
      }
    }
    for (const selfName of SELF_SKILL_NAMES) {
      if (isDirectory(path.join(skillsRootDir, selfName))) {
        claimedDirs.add(selfName);
      }
    }

    // Claim untouched packs' installedDirs so refreshed packs never collide with them
    for (let i = 0; i < configuredPacks.length; i += 1) {
      if (!stagedByIndex.has(i)) {
        for (const dirName of configuredPacks[i].installedDirs ?? []) {
          if (SAFE_SKILL_NAME_RE.test(dirName)) {
            claimedDirs.add(dirName);
          }
        }
      }
    }

    // Delete old installedDirs of refreshed packs (this removes any upstream-deleted skills cleanly)
    const missingBeforeRefresh = new Set();
    for (const [idx] of stagedByIndex.entries()) {
      const oldDirs = Array.isArray(configuredPacks[idx].installedDirs)
        ? configuredPacks[idx].installedDirs
        : [];
      for (const oldDir of oldDirs) {
        if (SELF_SKILL_NAME_SET.has(oldDir) || !SAFE_SKILL_NAME_RE.test(oldDir)) {
          continue;
        }
        const oldPath = resolveContainedSkillDir(skillsRootDir, oldDir);
        if (!removeEntrySafe(oldPath)) {
          missingBeforeRefresh.add(idx);
        }
      }
    }

    if (stagedByIndex.size > 0) {
      fs.mkdirSync(skillsRootDir, { recursive: true });
    }

    // Stage 3: Install refreshed skills and assemble result packs
    const nowIso = new Date().toISOString();
    const resultPacks = [];
    const updatedSources = [];

    for (let i = 0; i < configuredPacks.length; i += 1) {
      const pack = configuredPacks[i];
      const staged = stagedByIndex.get(i);
      if (!staged) {
        resultPacks.push(structuredClone(pack));
        continue;
      }

      const newInstalledDirs = [];
      for (const skill of staged.keptSkills) {
        const { dirName, prefixed } = allocateSkillDirName(
          skill.name,
          pack.source,
          claimedDirs,
        );
        installDiscoveredSkill({
          skill,
          cloneDir: staged.cloneDir,
          skillsRootDir,
          targetDirName: dirName,
          forceFrontmatterRewrite: prefixed,
        });
        newInstalledDirs.push(dirName);
      }

      newInstalledDirs.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

      const prevDirs = [...(pack.installedDirs ?? [])].sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0,
      );
      const prevCommitSha =
        typeof pack.commitSha === 'string' && pack.commitSha.trim().length > 0
          ? pack.commitSha.trim().toLowerCase()
          : null;
      const changed =
        staged.commitSha !== prevCommitSha ||
        !arraysEqual(prevDirs, newInstalledDirs) ||
        missingBeforeRefresh.has(i) ||
        hasExplicitFilter;

      if (changed) {
        updatedSources.push(pack.source);
      }

      resultPacks.push({
        source: pack.source,
        url: pack.url,
        kind: pack.kind,
        installedDirs: newInstalledDirs,
        commitSha: staged.commitSha,
        installedAt: changed ? nowIso : (pack.installedAt ?? nowIso),
        ...(Array.isArray(pack.includePaths)
          ? { includePaths: [...pack.includePaths] }
          : {}),
        ...(Array.isArray(pack.excludePaths)
          ? { excludePaths: [...pack.excludePaths] }
          : {}),
        ...(Array.isArray(pack.selectedSkills)
          ? { selectedSkills: [...pack.selectedSkills] }
          : {}),
      });
    }

    const managedAfterUpdate = new Set(collectManagedDirsFromPacks(resultPacks));
    for (const selfName of SELF_SKILL_NAMES) {
      if (isDirectory(path.join(skillsRootDir, selfName))) {
        managedAfterUpdate.add(selfName);
      }
    }
    const removedDuringUpdate = [...allKnownManaged].filter(
      (dirName) => !managedAfterUpdate.has(dirName),
    );
    syncClaudeSkillsBridge({
      cwd: repoRoot,
      managedDirs: [...managedAfterUpdate],
      removedDirs: removedDuringUpdate,
    });

    return {
      packs: resultPacks,
      updatedSources,
      selfUpdated,
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}
