import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';

import { findCaseInsensitiveRootFile } from './inspect.mjs';
import {
  FENCE_END,
  FENCE_START,
  MANAGED_LINE_BUDGET,
  TARGET_TOTAL_LINE_BUDGET,
  TOTAL_BYTE_BUDGET,
  TOTAL_LINE_BUDGET,
  hasValidReporigFence,
  scanFenceMarkers,
} from './render-agents-md.mjs';
import {
  LEGACY_MANAGED_REFERENCE_FILES,
  MANAGED_REFERENCE_FILES,
} from './render-references.mjs';
import { parseConfigFile } from './schema.mjs';

export const NON_MANAGED_SECTION_LINE_LIMIT = 25;
export const NON_MANAGED_CODE_BLOCK_LIMIT = 12;
export const NESTED_AGENTS_LINE_LIMIT = 100;
export const SKILL_BODY_LINE_LIMIT = 500;
export const SKILL_COUNT_ADVISORY_LIMIT = 40;
export const SKILL_COUNT_MEDIUM_LIMIT = 60;
export const SKILL_METADATA_TOKEN_LIMIT = 3000;
export const SKILL_METADATA_TOKEN_MEDIUM_LIMIT = 4500;

const IGNORED_WALK_DIRS = new Set([
  '.git',
  '.agents',
  '.claude',
  '.cursor',
  '.github',
  '.superpowers',
  '.worktrees',
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.astro',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  'target',
  'vendor',
  '.turbo',
  '.cache',
]);

const DEFAULT_LAZY_DIRS = [
  '.agents/skills',
  '.claude/skills',
  'docs/issues',
  'docs/solutions',
  'docs/specs',
  'docs/plans',
  'docs/superpowers/specs',
  'docs/superpowers/plans',
];

const EXACT_LAZY_CONTAINER_DIRS = new Set(['.agents/references', 'docs']);

const NON_COVERING_CONTAINER_DIRS = new Set([
  '.agents/references',
  'docs',
  'packages',
  'apps',
  'services',
  'crates',
]);

const BARE_PROTOCOL_FILENAMES = new Set([
  'agents.md',
  'claude.md',
  'gemini.md',
  'skill.md',
  'todo.md',
  'readme.md',
  'changelog.md',
  'license',
  'package.json',
  'tsconfig.json',
  'pyproject.toml',
  'cargo.toml',
  'go.mod',
]);

const KNOWN_PATH_PREFIXES = [
  'docs/',
  '.agents/references/',
  '.agents/skills/',
  '.claude/skills/',
  '.cursor/rules/',
  '.github/',
  'skills/',
  'tests/',
  'test/',
  'packages/',
  'apps/',
  'services/',
  'crates/',
  'src/',
];

const MANAGED_REF_SET = new Set([
  ...MANAGED_REFERENCE_FILES,
  ...LEGACY_MANAGED_REFERENCE_FILES,
]);

function lexCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
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
  } catch {
    return null;
  }
}

function countLines(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return 0;
  }
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n$/, '');
  return normalized.length === 0 ? 1 : normalized.split('\n').length;
}

function normalizeRelPath(raw) {
  return raw
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

function isSafeRepoRelPath(relPath) {
  if (!relPath || relPath.startsWith('/') || relPath.startsWith('~')) {
    return false;
  }
  const segments = relPath.split('/');
  return !segments.some(
    (seg) => seg.length === 0 || seg === '.' || seg === '..',
  );
}

function looksLikeBacktickPointer(rawSpan) {
  const trimmed = rawSpan.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > 160 ||
    /\s/.test(trimmed) ||
    /[*?<>|$=;:~()[\]]/.test(trimmed) ||
    trimmed.startsWith('-') ||
    trimmed.startsWith('@') ||
    trimmed.includes('://')
  ) {
    return false;
  }

  const withoutAnchor = trimmed.split('#')[0].split('?')[0];
  const normalized = normalizeRelPath(withoutAnchor);
  if (!isSafeRepoRelPath(normalized)) {
    return false;
  }

  if (
    normalized === '.agents/reporig.json' ||
    normalized === '.agents/references'
  ) {
    return false;
  }

  if (!normalized.includes('/')) {
    if (BARE_PROTOCOL_FILENAMES.has(normalized.toLowerCase())) {
      return false;
    }
    return /^[A-Za-z0-9_.-]+\.(?:md|mdx)$/i.test(normalized);
  }

  if (KNOWN_PATH_PREFIXES.some((prefix) => withoutAnchor.replace(/^\.\//, '').startsWith(prefix))) {
    return true;
  }

  return /(?:\/AGENTS\.md|\/CLAUDE\.md|\/SKILL\.md|\.(?:md|mdx|mdc|mjs|cjs|js|ts|json|ya?ml|toml))$/i.test(
    normalized,
  );
}

export function extractPointersFromMarkdown(markdown) {
  if (typeof markdown !== 'string' || markdown.length === 0) {
    return [];
  }

  const results = [];
  const seen = new Set();
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let openFence = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNumber = i + 1;

    if (openFence !== null) {
      const closeMatch = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
      if (
        closeMatch &&
        closeMatch[1][0] === openFence.char &&
        closeMatch[1].length >= openFence.length
      ) {
        openFence = null;
      }
      continue;
    }

    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const rest = fenceMatch[2];
      if (marker[0] === '~' || !rest.includes('`')) {
        openFence = { char: marker[0], length: marker.length };
        continue;
      }
    }

    if (/^\s*<!--[\s\S]*-->\s*$/.test(line)) {
      continue;
    }

    const tokenRe = /(`+[^`]*`+)|\[[^\]]*\]\(([^)\s]+)\)/g;
    let tokenMatch;
    while ((tokenMatch = tokenRe.exec(line)) !== null) {
      if (tokenMatch[1] !== undefined) {
        const rawSpan = tokenMatch[1].replace(/^`+|`+$/g, '');
        if (!looksLikeBacktickPointer(rawSpan)) {
          continue;
        }
        const cleanSpan = normalizeRelPath(rawSpan.split('#')[0].split('?')[0]);
        if (isSafeRepoRelPath(cleanSpan) && !seen.has(cleanSpan)) {
          seen.add(cleanSpan);
          results.push({ path: cleanSpan, line: lineNumber });
        }
      } else if (tokenMatch[2] !== undefined) {
        const rawTarget = tokenMatch[2].trim();
        if (
          rawTarget.startsWith('#') ||
          /^(?:https?|mailto|file|tel|conversation):/i.test(rawTarget) ||
          /[*?<>|$]/.test(rawTarget)
        ) {
          continue;
        }
        const cleanTarget = normalizeRelPath(
          rawTarget.split('#')[0].split('?')[0],
        );
        if (isSafeRepoRelPath(cleanTarget) && !seen.has(cleanTarget)) {
          seen.add(cleanTarget);
          results.push({ path: cleanTarget, line: lineNumber });
        }
      }
    }
  }

  return results;
}

export function validateAgentsMdPointers(markdown, cwd, options = {}) {
  const rootDir = path.resolve(cwd);
  const additionalSet = new Set(
    Array.from(options.additionalValidPaths ?? [], (p) => normalizeRelPath(p)),
  );
  const removedSet = new Set(
    Array.from(options.removedPaths ?? [], (p) => normalizeRelPath(p)),
  );
  const lazyDirList = Array.from(
    new Set([
      ...DEFAULT_LAZY_DIRS,
      ...Array.from(options.lazyDirs ?? [], (p) => normalizeRelPath(p)),
    ]),
  ).filter(Boolean);

  const extracted = extractPointersFromMarkdown(markdown);
  const referencedPaths = [];
  const brokenPointers = [];

  for (const item of extracted) {
    const relPath = item.path;
    const isRemoved = removedSet.has(relPath) && !additionalSet.has(relPath);
    const isStagedValid =
      additionalSet.has(relPath) ||
      Array.from(additionalSet).some((staged) => staged.startsWith(`${relPath}/`));
    const fullPath = path.join(rootDir, relPath);
    const existsOnDisk =
      !isRemoved && (isFile(fullPath) || isDirectory(fullPath));
    const isLazyAllowed =
      !isRemoved &&
      (EXACT_LAZY_CONTAINER_DIRS.has(relPath) ||
        lazyDirList.some(
          (lazyDir) => relPath === lazyDir || relPath.startsWith(`${lazyDir}/`),
        ));

    const exists = Boolean(isStagedValid || existsOnDisk);
    referencedPaths.push({
      path: relPath,
      exists,
      line: item.line,
    });

    if (!exists && !isLazyAllowed) {
      brokenPointers.push({
        path: relPath,
        line: item.line,
      });
    }
  }

  return { referencedPaths, brokenPointers };
}

function parseNonManagedRegionSections(regionText, baseLineNumber) {
  if (typeof regionText !== 'string' || regionText.length === 0) {
    return [];
  }

  const lines = regionText.replace(/\r\n/g, '\n').split('\n');
  const rawSections = [];
  let current = null;
  let openFence = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const absLine = baseLineNumber + i;

    if (openFence !== null) {
      if (current) {
        current.lines.push(line);
        current.codeBlockLines += 1;
        if (/(?:├──|└──|│\s{2,})/.test(line)) {
          current.hasAsciiTree = true;
        }
      }
      const closeMatch = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
      if (
        closeMatch &&
        closeMatch[1][0] === openFence.char &&
        closeMatch[1].length >= openFence.length
      ) {
        openFence = null;
      }
      continue;
    }

    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const rest = fenceMatch[2];
      if (marker[0] === '~' || !rest.includes('`')) {
        openFence = { char: marker[0], length: marker.length };
        if (current) {
          current.lines.push(line);
          current.codeBlockLines += 1;
        }
        continue;
      }
    }

    const headingMatch = line.match(/^\s{0,3}(#{2,3})\s+(.+?)\s*$/);
    if (headingMatch) {
      if (current) {
        rawSections.push(current);
      }
      current = {
        heading: `${headingMatch[1]} ${headingMatch[2].trim()}`,
        level: headingMatch[1].length,
        startLine: absLine,
        lines: [line],
        codeBlockLines: 0,
        hasAsciiTree: false,
      };
      continue;
    }

    if (current) {
      current.lines.push(line);
      if (/(?:├──|└──|│\s{2,})/.test(line)) {
        current.hasAsciiTree = true;
      }
    }
  }

  if (current) {
    rawSections.push(current);
  }

  return rawSections.map((sec) => {
    let trimmedLen = sec.lines.length;
    while (trimmedLen > 1 && sec.lines[trimmedLen-1].trim().length === 0) {
      trimmedLen -= 1;
    }
    const endLine = sec.startLine+trimmedLen-1;
    const exceedsSectionLimit =
      trimmedLen > NON_MANAGED_SECTION_LINE_LIMIT ||
      sec.codeBlockLines > NON_MANAGED_CODE_BLOCK_LIMIT ||
      sec.hasAsciiTree;

    return {
      heading: sec.heading,
      level: sec.level,
      startLine: sec.startLine,
      endLine,
      lineCount: trimmedLen,
      codeBlockLines: sec.codeBlockLines,
      hasAsciiTree: sec.hasAsciiTree,
      exceedsSectionLimit,
    };
  });
}

function classifyCursorRules(rootDir) {
  const rulesDir = path.join(rootDir, '.cursor', 'rules');
  if (!isDirectory(rulesDir)) {
    return { alwaysOn: [], scoped: [] };
  }

  const alwaysOn = [];
  const scoped = [];

  function walk(currentDir, relPrefix) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      const relPath = `${relPrefix}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else if (entry.isFile()) {
        const text = readTextIfExists(fullPath) ?? '';
        const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
        let isScoped = false;
        if (fmMatch) {
          const fmBody = fmMatch[1];
          const alwaysTrue =
            /^[ \t]*alwaysApply[ \t]*:[ \t]*true[ \t]*$/im.test(fmBody);
          const globsLine = fmBody.match(/^[ \t]*globs[ \t]*:[ \t]*(.*)$/im);
          let hasNonEmptyGlobs = false;
          if (globsLine) {
            const inlineVal = globsLine[1].trim();
            if (inlineVal.length > 0) {
              hasNonEmptyGlobs =
                inlineVal !== '[]' &&
                inlineVal !== '""' &&
                inlineVal !== "''" &&
                inlineVal !== 'null';
            } else {
              hasNonEmptyGlobs =
                /^[ \t]*globs[ \t]*:[ \t]*\r?\n(?:[ \t]*\r?\n)*[ \t]*-[ \t]*\S+/im.test(
                  fmBody,
                );
            }
          }
          isScoped = !alwaysTrue && hasNonEmptyGlobs;
        }
        if (isScoped) {
          scoped.push(relPath);
        } else {
          alwaysOn.push({
            path: relPath,
            kind: 'cursor-always-on',
            lineCount: countLines(text),
            bytes: Buffer.byteLength(text, 'utf8'),
          });
        }
      }
    }
  }

  walk(rulesDir, '.cursor/rules');
  alwaysOn.sort((a, b) => lexCompare(a.path, b.path));
  scoped.sort(lexCompare);
  return { alwaysOn, scoped };
}

function scanNestedAgentsAndWorkspaces(rootDir) {
  const nestedAgentsMd = [];
  const workspacePackages = [];
  const workspaceContainerNames = new Set([
    'packages',
    'apps',
    'services',
    'crates',
  ]);

  function walk(currentDir, relPrefix, depth) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      const name = entry.name;
      if (IGNORED_WALK_DIRS.has(name)) {
        continue;
      }

      const relPath = relPrefix ? `${relPrefix}/${name}` : name;
      const fullPath = path.join(currentDir, name);

      if (entry.isDirectory()) {
        if (name.startsWith('.')) {
          continue;
        }
        if (depth === 1 && workspaceContainerNames.has(relPrefix)) {
          workspacePackages.push(relPath);
        }
        if (depth < 4) {
          walk(fullPath, relPath, depth + 1);
        }
      } else if (entry.isFile() && depth >= 1 && name.toLowerCase() === 'agents.md') {
        const content = readTextIfExists(fullPath) ?? '';
        const lineCount = countLines(content);
        nestedAgentsMd.push({
          path: relPath,
          lineCount,
          exceedsLimit: lineCount > NESTED_AGENTS_LINE_LIMIT,
        });
      }
    }
  }

  walk(rootDir, '', 0);
  nestedAgentsMd.sort((a, b) => lexCompare(a.path, b.path));
  workspacePackages.sort(lexCompare);
  return { nestedAgentsMd, workspacePackages };
}

function scanRepoDocs(rootDir) {
  const docsDir = path.join(rootDir, 'docs');
  if (!isDirectory(docsDir)) {
    return [];
  }

  const docs = [];
  function walkDocs(currentDir, relPrefix, depth) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      const relPath = `${relPrefix}/${entry.name}`;
      if (entry.isDirectory() && depth < 2) {
        walkDocs(fullPath, relPath, depth + 1);
      } else if (entry.isFile() && /\.(?:md|mdx)$/i.test(entry.name)) {
        docs.push(relPath);
      }
    }
  }

  walkDocs(docsDir, 'docs', 0);
  return docs.sort(lexCompare);
}

function scanReferencesTier3(rootDir) {
  const refsDir = path.join(rootDir, '.agents', 'references');
  if (!isDirectory(refsDir)) {
    return { managedReferences: [], customReferences: [] };
  }

  const managedReferences = [];
  const customReferences = [];
  let entries;
  try {
    entries = fs.readdirSync(refsDir, { withFileTypes: true });
  } catch {
    return { managedReferences, customReferences };
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink() || !entry.isFile()) {
      continue;
    }
    const relPath = `.agents/references/${entry.name}`;
    const fullPath = path.join(refsDir, entry.name);
    const text = readTextIfExists(fullPath) ?? '';
    const lineCount = countLines(text);

    if (MANAGED_REF_SET.has(entry.name)) {
      managedReferences.push({ path: relPath, lineCount });
    } else if (/\.md$/i.test(entry.name)) {
      customReferences.push({ path: relPath, lineCount });
    }
  }

  managedReferences.sort((a, b) => lexCompare(a.path, b.path));
  customReferences.sort((a, b) => lexCompare(a.path, b.path));
  return { managedReferences, customReferences };
}

function extractFrontmatterBytes(skillContent) {
  const match = skillContent.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return Math.min(Buffer.byteLength(skillContent, 'utf8'), 400);
  }
  return Buffer.byteLength(match[1], 'utf8');
}

function auditSkills(rootDir, parsedConfig) {
  const agentsSkillsDir = path.join(rootDir, '.agents', 'skills');
  const claudeSkillsDir = path.join(rootDir, '.claude', 'skills');

  let claudeIsSameAsAgents = false;
  if (isDirectory(agentsSkillsDir) && isDirectory(claudeSkillsDir)) {
    try {
      claudeIsSameAsAgents =
        fs.realpathSync(agentsSkillsDir) === fs.realpathSync(claudeSkillsDir);
    } catch {
      claudeIsSameAsAgents = false;
    }
  }
  const isWholeClaudeMirror = isFile(
    path.join(claudeSkillsDir, '.reporig-mirror'),
  );

  const seenNames = new Set();
  let totalFrontmatterBytes = 0;
  const oversizedSkills = [];
  const separateClaudeSkills = [];

  function inspectSkillFolder(baseDir, relPrefix, isSeparateClaude) {
    if (!isDirectory(baseDir)) {
      return;
    }
    let entries;
    try {
      entries = fs.readdirSync(baseDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      const skillDir = path.join(baseDir, entry.name);
      if (!isDirectory(skillDir)) {
        continue;
      }
      if (isSeparateClaude) {
        if (isFile(path.join(skillDir, '.reporig-mirror'))) {
          continue;
        }
        const agentCounterpart = path.join(agentsSkillsDir, entry.name);
        if (isDirectory(agentCounterpart)) {
          try {
            if (fs.realpathSync(skillDir) === fs.realpathSync(agentCounterpart)) {
              continue;
            }
          } catch {
            // Keep scanning separate entry if realpath fails.
          }
        }
      }

      const skillMdPath = path.join(skillDir, 'SKILL.md');
      if (!isFile(skillMdPath)) {
        continue;
      }

      if (isSeparateClaude) {
        separateClaudeSkills.push(entry.name);
      }

      if (!seenNames.has(entry.name)) {
        seenNames.add(entry.name);
        const content = readTextIfExists(skillMdPath) ?? '';
        totalFrontmatterBytes += extractFrontmatterBytes(content);
        const lineCount = countLines(content);
        if (lineCount > SKILL_BODY_LINE_LIMIT) {
          oversizedSkills.push({
            name: entry.name,
            path: `${relPrefix}/${entry.name}/SKILL.md`,
            lineCount,
          });
        }
      }
    }
  }

  inspectSkillFolder(agentsSkillsDir, '.agents/skills', false);
  if (!claudeIsSameAsAgents && !isWholeClaudeMirror) {
    inspectSkillFolder(claudeSkillsDir, '.claude/skills', true);
  }

  const unfilteredMultiSkillPacks = [];
  if (parsedConfig?.valid && Array.isArray(parsedConfig.config?.skills?.packs)) {
    for (const pack of parsedConfig.config.skills.packs) {
      if (
        Array.isArray(pack.installedDirs) &&
        pack.installedDirs.length >= 6 &&
        !Array.isArray(pack.selectedSkills)
      ) {
        unfilteredMultiSkillPacks.push(pack.source);
      }
    }
  }

  unfilteredMultiSkillPacks.sort(lexCompare);
  oversizedSkills.sort((a, b) => lexCompare(a.name, b.name));
  separateClaudeSkills.sort(lexCompare);

  return {
    installedCount: seenNames.size,
    estimatedMetadataTokens: Math.ceil(totalFrontmatterBytes / 4),
    unfilteredMultiSkillPacks,
    oversizedSkills,
    separateClaudeSkills,
  };
}

function titleFromDocPath(relPath) {
  if (relPath.endsWith('/AGENTS.md')) {
    const dirName = relPath.slice(0, -'/AGENTS.md'.length);
    return `Scoped rules (${dirName})`;
  }
  const base = path.basename(relPath, path.extname(relPath));
  const words = base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w, idx) =>
      idx === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w,
    );
  return words.join(' ') || 'Reference';
}

export function discoverScaffoldContextPointers(cwd, options = {}) {
  const rootDir = path.resolve(cwd);
  const { nestedAgentsMd } = scanNestedAgentsAndWorkspaces(rootDir);
  const { customReferences } = scanReferencesTier3(rootDir);
  const repoDocs = scanRepoDocs(rootDir);

  const datedDocDirPrefixes = [
    'docs/issues/',
    'docs/specs/',
    'docs/plans/',
    'docs/solutions/',
    'docs/superpowers/',
  ];

  const candidatePaths = new Set();

  for (const docPath of repoDocs) {
    if (!datedDocDirPrefixes.some((prefix) => docPath.startsWith(prefix))) {
      candidatePaths.add(docPath);
    }
  }
  for (const customRef of customReferences) {
    candidatePaths.add(customRef.path);
  }
  for (const stagedRef of options.stagedCustomReferences ?? []) {
    const cleanName = String(stagedRef).trim();
    if (cleanName.length > 0) {
      candidatePaths.add(
        cleanName.startsWith('.agents/references/')
          ? cleanName
          : `.agents/references/${cleanName}`,
      );
    }
  }
  for (const nested of nestedAgentsMd) {
    candidatePaths.add(nested.path);
  }
  for (const stagedScoped of options.stagedScopedAgents ?? []) {
    const cleanScoped = normalizeRelPath(String(stagedScoped));
    if (cleanScoped.length > 0) {
      candidatePaths.add(
        cleanScoped.endsWith('/AGENTS.md')
          ? cleanScoped
          : `${cleanScoped}/AGENTS.md`,
      );
    }
  }

  return [...candidatePaths]
    .sort(lexCompare)
    .slice(0, 10)
    .map((relPath) => ({
      label: titleFromDocPath(relPath),
      path: relPath,
    }));
}

export function auditRepo(cwd) {
  if (typeof cwd !== 'string' || cwd.trim().length === 0) {
    throw new Error('auditRepo requires a non-empty cwd directory path.');
  }
  const rootDir = path.resolve(cwd);
  if (!isDirectory(rootDir)) {
    throw new Error(`Repository directory does not exist: ${rootDir}`);
  }

  const parsedConfig = parseConfigFile(
    path.join(rootDir, '.agents', 'reporig.json'),
  );
  const extraLazyDirs = [];
  if (
    parsedConfig.valid &&
    parsedConfig.config?.providers?.specs?.id === 'in-repo'
  ) {
    if (parsedConfig.config.providers.specs.specsDir) {
      extraLazyDirs.push(parsedConfig.config.providers.specs.specsDir);
    }
    if (parsedConfig.config.providers.specs.plansDir) {
      extraLazyDirs.push(parsedConfig.config.providers.specs.plansDir);
    }
  }

  const foundAgents = findCaseInsensitiveRootFile(rootDir, 'AGENTS.md');
  const agentsContent =
    foundAgents.exists && foundAgents.fullPath
      ? readTextIfExists(foundAgents.fullPath)
      : null;

  let hasReporigFence = false;
  let hasMalformedFence = false;
  let totalAgentsLines = 0;
  let managedLines = 0;
  let nonManagedLines = 0;
  let agentsBytes = 0;
  let sections = [];
  let nonManagedCombinedText = '';

  if (agentsContent !== null) {
    totalAgentsLines = countLines(agentsContent);
    agentsBytes = Buffer.byteLength(agentsContent, 'utf8');
    const { startMatches, endMatches } = scanFenceMarkers(agentsContent);
    hasReporigFence = hasValidReporigFence(agentsContent);
    hasMalformedFence =
      !hasReporigFence && (startMatches.length > 0 || endMatches.length > 0);

    if (hasReporigFence) {
      const prefix = agentsContent.slice(0, startMatches[0].markerOffset);
      const managedSlice = agentsContent.slice(
        startMatches[0].markerOffset,
        endMatches[0].markerEndOffset,
      );
      const suffix = agentsContent.slice(endMatches[0].markerEndOffset);
      managedLines = countLines(managedSlice);
      nonManagedLines = Math.max(0, totalAgentsLines-managedLines);
      nonManagedCombinedText = `${prefix}\n${suffix}`;
      sections = [
        ...parseNonManagedRegionSections(prefix, 1),
        ...parseNonManagedRegionSections(suffix, endMatches[0].lineNumber),
      ];
    } else {
      nonManagedLines = totalAgentsLines;
      nonManagedCombinedText = agentsContent;
      sections = parseNonManagedRegionSections(agentsContent, 1);
    }
  }

  const otherAlwaysOnFiles = [];
  const foundClaude = findCaseInsensitiveRootFile(rootDir, 'CLAUDE.md');
  if (foundClaude.exists && foundClaude.fullPath) {
    const claudeContent = readTextIfExists(foundClaude.fullPath) ?? '';
    const trimmedClaude = claudeContent.trim();
    const isBridgeOnly =
      trimmedClaude === '@AGENTS.md' || trimmedClaude === '@./AGENTS.md';
    if (!isBridgeOnly) {
      otherAlwaysOnFiles.push({
        path: foundClaude.filename,
        kind: 'claude-non-bridge',
        lineCount: countLines(claudeContent),
        bytes: Buffer.byteLength(claudeContent, 'utf8'),
      });
    }
  }

  const cursorRulesLegacyPath = path.join(rootDir, '.cursorrules');
  if (isFile(cursorRulesLegacyPath)) {
    const text = readTextIfExists(cursorRulesLegacyPath) ?? '';
    otherAlwaysOnFiles.push({
      path: '.cursorrules',
      kind: 'cursorrules-legacy',
      lineCount: countLines(text),
      bytes: Buffer.byteLength(text, 'utf8'),
    });
  }

  const copilotPath = path.join(rootDir, '.github', 'copilot-instructions.md');
  if (isFile(copilotPath)) {
    const text = readTextIfExists(copilotPath) ?? '';
    otherAlwaysOnFiles.push({
      path: '.github/copilot-instructions.md',
      kind: 'copilot-instructions',
      lineCount: countLines(text),
      bytes: Buffer.byteLength(text, 'utf8'),
    });
  }

  const cursorRuleSplit = classifyCursorRules(rootDir);
  otherAlwaysOnFiles.push(...cursorRuleSplit.alwaysOn);

  const otherLines = otherAlwaysOnFiles.reduce((acc, f) => acc + f.lineCount, 0);
  const otherBytes = otherAlwaysOnFiles.reduce((acc, f) => acc + f.bytes, 0);
  const alwaysOnTotalLines = totalAgentsLines + otherLines;
  const alwaysOnTotalBytes = agentsBytes + otherBytes;
  const estimatedAlwaysOnTokens = Math.ceil(alwaysOnTotalBytes / 4);

  const { referencedPaths, brokenPointers } =
    agentsContent !== null
      ? validateAgentsMdPointers(agentsContent, rootDir, {
          lazyDirs: extraLazyDirs,
        })
      : { referencedPaths: [], brokenPointers: [] };

  const { nestedAgentsMd, workspacePackages } =
    scanNestedAgentsAndWorkspaces(rootDir);
  const { managedReferences, customReferences } = scanReferencesTier3(rootDir);
  const repoDocs = scanRepoDocs(rootDir);
  const skillsReport = auditSkills(rootDir, parsedConfig);

  const referencedSet = new Set(referencedPaths.map((r) => r.path));
  function isCoveredByPointer(candidatePath) {
    if (referencedSet.has(candidatePath)) {
      return true;
    }
    for (const refPath of referencedSet) {
      if (
        !NON_COVERING_CONTAINER_DIRS.has(refPath) &&
        candidatePath.startsWith(`${refPath}/`)
      ) {
        return true;
      }
    }
    return false;
  }

  const artifactDirs = new Set([
    'docs/issues',
    'docs/specs',
    'docs/plans',
    'docs/solutions',
    'docs/superpowers/specs',
    'docs/superpowers/plans',
    ...extraLazyDirs.map(normalizeRelPath),
  ]);

  const unindexedCandidates = [
    ...customReferences.map((r) => r.path),
    ...nestedAgentsMd.map((n) => n.path),
    ...repoDocs.filter((docPath) => {
      for (const artDir of artifactDirs) {
        if (artDir && docPath.startsWith(`${artDir}/`) && isCoveredByPointer(artDir)) {
          return false;
        }
      }
      return true;
    }),
  ];

  const unindexedDocs =
    agentsContent !== null
      ? [...new Set(unindexedCandidates)]
          .filter((cand) => !isCoveredByPointer(cand))
          .sort(lexCompare)
      : [...new Set(unindexedCandidates)].sort(lexCompare);

  const nonManagedPointers = extractPointersFromMarkdown(nonManagedCombinedText);
  const hasResolvedDocPointer = nonManagedPointers.some((ptr) => {
    const p = ptr.path;
    if (NON_COVERING_CONTAINER_DIRS.has(p)) {
      return false;
    }
    if (
      p.startsWith('docs/') ||
      p.startsWith('.agents/references/') ||
      p.endsWith('/AGENTS.md')
    ) {
      const full = path.join(rootDir, p);
      return (
        isFile(full) ||
        isDirectory(full) ||
        DEFAULT_LAZY_DIRS.includes(p) ||
        extraLazyDirs.map(normalizeRelPath).includes(p)
      );
    }
    return false;
  });

  const hasContextMapHeading = sections.some((sec) =>
    /^#{2,3}\s+(?:context\s+map|documentation(?:\s+map|\s+index)?|references|where\s+to\s+look)\b/i.test(
      sec.heading,
    ),
  );
  const hasContextMap = Boolean(hasContextMapHeading || hasResolvedDocPointer);

  const combinedAlwaysOnTokens =
    estimatedAlwaysOnTokens + skillsReport.estimatedMetadataTokens;

  const findings = [];

  if (!foundAgents.exists || agentsContent === null) {
    findings.push({
      id: 'missing-agents-md',
      severity: 'high',
      tier: 1,
      title: 'Root AGENTS.md is missing',
      detail: 'No root AGENTS.md index file was found in this repository.',
      recommendation:
        'Run /reporig to scaffold a concise Tier 1 AGENTS.md index with a Context map and deterministic workflow rules.',
    });
  }

  if (hasMalformedFence) {
    findings.push({
      id: 'malformed-reporig-fence',
      severity: 'high',
      tier: 1,
      title: 'Malformed reporig fence markers in AGENTS.md',
      detail: `Found unmatched or out-of-order ${FENCE_START} / ${FENCE_END} markers.`,
      recommendation:
        'Repair or reconcile AGENTS.md via /reporig so exactly one start marker precedes one end marker.',
    });
  }

  if (
    alwaysOnTotalLines > TOTAL_LINE_BUDGET ||
    alwaysOnTotalBytes > TOTAL_BYTE_BUDGET
  ) {
    findings.push({
      id: 'tier1-over-ceiling',
      severity: 'high',
      tier: 1,
      title: 'Always-on Tier 1 instructions exceed ceiling budget',
      detail: `Always-on instruction files total ${alwaysOnTotalLines} lines and ${alwaysOnTotalBytes} bytes (ceiling: ${TOTAL_LINE_BUDGET} lines / ${TOTAL_BYTE_BUDGET} bytes).`,
      recommendation:
        'Extract detailed architecture essays, runbooks, and style guides into .agents/references/<topic>.md and link them from a concise Tier 1 Context map.',
    });
  } else if (alwaysOnTotalLines > TARGET_TOTAL_LINE_BUDGET) {
    findings.push({
      id: 'tier1-over-target',
      severity: 'low',
      tier: 1,
      title: 'Always-on Tier 1 instructions exceed 100-line target',
      detail: `Always-on instruction files total ${alwaysOnTotalLines} lines (target: <= ${TARGET_TOTAL_LINE_BUDGET} lines, ceiling: ${TOTAL_LINE_BUDGET} lines).`,
      recommendation:
        'Consider moving secondary notes into .agents/references/ pointers to keep root AGENTS.md near 100 lines.',
    });
  }

  const bloatedSections = sections.filter((s) => s.exceedsSectionLimit);
  if (bloatedSections.length > 0) {
    const formattedList = bloatedSections
      .map((s) => `${s.heading} (${s.lineCount} lines)`)
      .join(', ');
    findings.push({
      id: 'monolithic-wiki-sections',
      severity: alwaysOnTotalLines > TARGET_TOTAL_LINE_BUDGET ? 'high' : 'medium',
      tier: 1,
      title: 'Inline wiki or runbook sections in root AGENTS.md',
      detail: `Non-managed sections exceed the ${NON_MANAGED_SECTION_LINE_LIMIT}-line Tier 1 section budget or inline directory trees/code blocks: ${formattedList}.`,
      recommendation:
        'Extract deep domain sections into Tier 3 .agents/references/<slug>.md files (or Tier 2 <subdir>/AGENTS.md for package-specific rules) and replace them with 1-line Context map pointers.',
    });
  }

  if (brokenPointers.length > 0) {
    const formattedBroken = brokenPointers
      .map((b) => `${b.path} (line ${b.line})`)
      .join(', ');
    findings.push({
      id: 'broken-context-pointers',
      severity: 'high',
      tier: 1,
      title: 'Broken file or directory pointers in AGENTS.md',
      detail: `Referenced paths do not exist on disk: ${formattedBroken}.`,
      recommendation:
        'Update or remove stale paths in AGENTS.md so every Tier 1 pointer resolves cleanly.',
    });
  }

  if (otherAlwaysOnFiles.length > 0) {
    const fileSummary = otherAlwaysOnFiles
      .map((f) => `${f.path} (${f.lineCount} lines)`)
      .join(', ');
    findings.push({
      id: 'fragmented-always-on-files',
      severity: 'medium',
      tier: 1,
      title: 'Fragmented always-on instruction files outside AGENTS.md',
      detail: `Additional root rules load alongside or instead of AGENTS.md: ${fileSummary}.`,
      recommendation:
        'Consolidate universal rules into AGENTS.md, bridge CLAUDE.md via @AGENTS.md, and move path-specific rules into Tier 2 scoped files or .agents/references/.',
    });
  }

  if (foundAgents.exists && !hasReporigFence && !hasMalformedFence) {
    findings.push({
      id: 'agents-md-unfenced',
      severity: 'medium',
      tier: 1,
      title: 'AGENTS.md is not managed with a deterministic reporig fence',
      detail: `Root ${foundAgents.filename} has ${totalAgentsLines} lines without ${FENCE_START} / ${FENCE_END} markers.`,
      recommendation:
        'Run /reporig to reconcile existing rules into a Tier 1 header + deterministic managed fence.',
    });
  }

  if (foundAgents.exists && unindexedDocs.length > 0) {
    findings.push({
      id: 'missing-context-map',
      severity: hasContextMap ? 'low' : 'medium',
      tier: 1,
      title: 'Existing repository docs or scoped AGENTS.md files are unindexed in root AGENTS.md',
      detail: `Unindexed Tier 2/3 files: ${unindexedDocs.join(', ')}.`,
      recommendation:
        'Add concise pointers under ## Context map in root AGENTS.md so agents can discover these files on demand.',
    });
  }

  const bloatedNested = nestedAgentsMd.filter((n) => n.exceedsLimit);
  if (bloatedNested.length > 0) {
    findings.push({
      id: 'nested-agents-md-bloated',
      severity: 'medium',
      tier: 2,
      title: 'Oversized subdirectory AGENTS.md files',
      detail: `Scoped AGENTS.md files exceed ${NESTED_AGENTS_LINE_LIMIT} lines: ${bloatedNested.map((n) => `${n.path} (${n.lineCount} lines)`).join(', ')}.`,
      recommendation:
        'Keep subdirectory AGENTS.md files focused on local package overrides and move deep runbooks into .agents/references/.',
    });
  }

  if (
    skillsReport.installedCount > SKILL_COUNT_ADVISORY_LIMIT ||
    skillsReport.estimatedMetadataTokens > SKILL_METADATA_TOKEN_LIMIT
  ) {
    const isMedium =
      skillsReport.installedCount > SKILL_COUNT_MEDIUM_LIMIT ||
      skillsReport.estimatedMetadataTokens > SKILL_METADATA_TOKEN_MEDIUM_LIMIT;
    const packHint =
      skillsReport.unfilteredMultiSkillPacks.length > 0
        ? ` Unfiltered multi-skill packs: ${skillsReport.unfilteredMultiSkillPacks.join(', ')}.`
        : '';
    findings.push({
      id: 'skill-metadata-bloat',
      severity: isMedium ? 'medium' : 'low',
      tier: 1,
      title: 'High always-on skill frontmatter count in Tier 1 discovery',
      detail: `${skillsReport.installedCount} installed skills inject ~${skillsReport.estimatedMetadataTokens} frontmatter tokens on every turn.${packHint}`,
      recommendation:
        'Use per-pack selectedSkills filtering in .agents/reporig.json via /reporig to keep only skills relevant to this repository stack.',
    });
  }

  if (skillsReport.oversizedSkills.length > 0) {
    findings.push({
      id: 'oversized-skill-bodies',
      severity: 'low',
      tier: 2,
      title: 'Installed SKILL.md bodies exceed 500-line progressive disclosure limit',
      detail: `Oversized skills: ${skillsReport.oversizedSkills.map((s) => `${s.name} (${s.lineCount} lines)`).join(', ')}.`,
      recommendation:
        'Keep SKILL.md playbooks concise (<= 500 lines) and split deep reference tables or templates into skill references/ subdirectories.',
    });
  }

  if (skillsReport.separateClaudeSkills.length > 0) {
    findings.push({
      id: 'separate-claude-skills',
      severity: 'low',
      tier: 2,
      title: 'Unconsolidated skills in .claude/skills/',
      detail: `Separate .claude/skills directories not unified under .agents/skills/: ${skillsReport.separateClaudeSkills.join(', ')}.`,
      recommendation:
        'Consolidate skills into .agents/skills/ with /reporig (--migrate-claude-skills) so every coding harness loads the same Tier 2 skills.',
    });
  }

  const migrationTriggerIds = new Set([
    'malformed-reporig-fence',
    'tier1-over-ceiling',
    'monolithic-wiki-sections',
    'broken-context-pointers',
    'fragmented-always-on-files',
    'agents-md-unfenced',
  ]);

  const hasExistingInstructionFootprint =
    foundAgents.exists || otherAlwaysOnFiles.length > 0;
  const needsProgressiveDisclosureMigration = Boolean(
    hasExistingInstructionFootprint &&
      findings.some((f) => migrationTriggerIds.has(f.id)),
  );

  let status = 'healthy';
  if (
    needsProgressiveDisclosureMigration ||
    findings.some((f) => f.id === 'missing-agents-md')
  ) {
    status = 'needs-migration';
  } else if (findings.length > 0) {
    status = 'needs-recommendations';
  }

  return {
    ok: true,
    status,
    needsProgressiveDisclosureMigration,
    budgets: {
      targetLines: TARGET_TOTAL_LINE_BUDGET,
      ceilingLines: TOTAL_LINE_BUDGET,
      managedCeilingLines: MANAGED_LINE_BUDGET,
      ceilingBytes: TOTAL_BYTE_BUDGET,
      nonManagedSectionLineLimit: NON_MANAGED_SECTION_LINE_LIMIT,
      nestedAgentsLineLimit: NESTED_AGENTS_LINE_LIMIT,
      skillBodyLineLimit: SKILL_BODY_LINE_LIMIT,
      skillCountAdvisoryLimit: SKILL_COUNT_ADVISORY_LIMIT,
      skillMetadataTokenLimit: SKILL_METADATA_TOKEN_LIMIT,
    },
    tier1: {
      agentsMd: {
        exists: foundAgents.exists,
        filename: foundAgents.filename,
        hasReporigFence,
        totalLines: totalAgentsLines,
        nonManagedLines,
        managedLines,
        bytes: agentsBytes,
        hasContextMap,
        sections,
      },
      otherAlwaysOnFiles,
      alwaysOnTotalLines,
      alwaysOnTotalBytes,
      estimatedAlwaysOnTokens,
      combinedAlwaysOnTokens,
      pointers: {
        referencedPaths,
        brokenPointers,
        unindexedDocs,
      },
    },
    tier2: {
      nestedAgentsMd,
      scopedRuleFiles: cursorRuleSplit.scoped,
      workspacePackages,
      skills: skillsReport,
    },
    tier3: {
      managedReferences,
      customReferences,
      repoDocs,
    },
    findings,
  };
}
