import fs from 'node:fs';
import path from 'node:path';
import { CURATED_SKILLS, CURATED_SPINES, SELF_SKILL_NAMES } from './catalog.mjs';
import { parseConfigFile } from './schema.mjs';
import { hasValidReporigFence } from './render-agents-md.mjs';

const SELF_SKILL_NAME_SET = new Set(SELF_SKILL_NAMES);

const IGNORED_SCAN_DIRS = new Set([
  '.git',
  '.agents',
  '.claude',
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

const ESLINT_CONFIG_CANDIDATES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yaml',
  '.eslintrc.yml',
  '.eslintrc.json',
  '.eslintrc',
  '.eslintignore',
];

const PLAYWRIGHT_CONFIG_FILES = [
  'playwright.config.js',
  'playwright.config.ts',
  'playwright.config.mjs',
  'playwright.config.cjs',
  'playwright.config.mts',
  'playwright.config.cts',
];

const JS_TS_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.mts',
  '.cts',
  '.tsx',
  '.vue',
  '.svelte',
  '.astro',
]);

const WEB_UI_EXTENSIONS = new Set([
  '.jsx',
  '.tsx',
  '.vue',
  '.svelte',
  '.astro',
  '.html',
  '.css',
  '.scss',
  '.sass',
  '.less',
]);

const WEB_UI_DEPS = new Set([
  'react',
  'react-dom',
  'vue',
  'svelte',
  '@sveltejs/kit',
  'next',
  'nuxt',
  'astro',
  'vite',
  '@remix-run/react',
  'react-router',
  '@angular/core',
  'solid-js',
  'preact',
  'lit',
  'htmx.org',
  'tailwindcss',
]);

const OTHER_LANGUAGE_EXTENSIONS = new Set([
  '.c',
  '.cc',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.php',
  '.swift',
  '.dart',
  '.ex',
  '.exs',
  '.zig',
  '.sh',
]);

const REACT_WEB_OR_BASE_DEPS = new Set([
  'react',
  'react-dom',
  'next',
  '@remix-run/react',
  'react-router',
]);

const POSTGRES_JS_DEPS = new Set([
  'pg',
  'postgres',
  '@neondatabase/serverless',
  '@vercel/postgres',
  'kysely',
  'typeorm',
  '@mikro-orm/postgresql',
  'drizzle-orm',
  '@supabase/supabase-js',
]);

const COMPOSE_CONFIG_FILES = [
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
];

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

function readJsonIfExists(filePath) {
  const raw = readTextIfExists(filePath);
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function collectRepoSignals(rootDir) {
  const rootEntries = new Set();
  const extensions = new Set();
  const relativeFiles = new Set();
  const relativeDirs = new Set();

  function walk(currentDir, relPrefix, depth) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const name = entry.name;
      if (depth === 0) {
        rootEntries.add(name);
      }
      if (IGNORED_SCAN_DIRS.has(name)) {
        continue;
      }

      const relPath = relPrefix ? `${relPrefix}/${name}` : name;
      const fullPath = path.join(currentDir, name);

      if (entry.isDirectory()) {
        if (name.startsWith('.') && name !== '.vitepress') {
          continue;
        }
        relativeDirs.add(relPath);
        if (depth < 2) {
          walk(fullPath, relPath, depth + 1);
        }
      } else if (entry.isFile()) {
        relativeFiles.add(relPath);
        const ext = path.extname(name).toLowerCase();
        if (ext) {
          extensions.add(ext);
        }
      }
    }
  }

  walk(rootDir, '', 0);
  return { rootEntries, extensions, relativeFiles, relativeDirs };
}

function hasRootPrefix(rootEntries, prefixes) {
  for (const entry of rootEntries) {
    for (const prefix of prefixes) {
      if (entry.startsWith(prefix)) {
        return true;
      }
    }
  }
  return false;
}

function hasAnySetOverlap(sourceSet, targetSet) {
  for (const item of targetSet) {
    if (sourceSet.has(item)) {
      return true;
    }
  }
  return false;
}

function parseTomlNameInSections(tomlText, allowedSections) {
  if (!tomlText) {
    return null;
  }
  const sectionSet = new Set(allowedSections);
  let currentSection = '';
  for (const rawLine of tomlText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const headerMatch = line.match(/^\[([^\]]+)\]/);
    if (headerMatch) {
      currentSection = headerMatch[1].trim();
      continue;
    }
    if (sectionSet.has(currentSection)) {
      const nameMatch = line.match(/^name\s*=\s*["']([^"']+)["']/);
      if (nameMatch && nameMatch[1].trim().length > 0) {
        return nameMatch[1].trim();
      }
    }
  }
  return null;
}

function parseGoModuleName(goModText) {
  if (!goModText) {
    return null;
  }
  for (const rawLine of goModText.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^module\s+["']?([^\s"']+)["']?/);
    if (match) {
      const parts = match[1].split('/').filter(Boolean);
      if (parts.length === 0) {
        return null;
      }
      const last = parts.at(-1);
      if (parts.length >= 2 && /^v\d+$/.test(last)) {
        return parts.at(-2);
      }
      return last;
    }
  }
  return null;
}

function inferProjectName(rootDir, pkgJson, pyprojectText, cargoText, goModText) {
  if (typeof pkgJson?.name === 'string' && pkgJson.name.trim().length > 0) {
    return pkgJson.name.trim();
  }
  const pyName = parseTomlNameInSections(pyprojectText, ['project', 'tool.poetry']);
  if (pyName) {
    return pyName;
  }
  const cargoName = parseTomlNameInSections(cargoText, ['package']);
  if (cargoName) {
    return cargoName;
  }
  const goName = parseGoModuleName(goModText);
  if (goName) {
    return goName;
  }
  return path.basename(rootDir) || 'app';
}

function collectJsDeps(pkgJson) {
  const deps = new Set();
  if (!pkgJson) {
    return deps;
  }
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const bucket = pkgJson[field];
    if (typeof bucket === 'object' && bucket !== null && !Array.isArray(bucket)) {
      for (const name of Object.keys(bucket)) {
        deps.add(name);
      }
    }
  }
  return deps;
}

function detectLanguages(signals, pkgJson) {
  const { rootEntries, extensions } = signals;
  const languages = [];

  const isJsTs =
    pkgJson !== null ||
    rootEntries.has('package.json') ||
    rootEntries.has('tsconfig.json') ||
    rootEntries.has('jsconfig.json') ||
    rootEntries.has('pnpm-lock.yaml') ||
    rootEntries.has('yarn.lock') ||
    rootEntries.has('package-lock.json') ||
    rootEntries.has('bun.lock') ||
    rootEntries.has('bun.lockb') ||
    rootEntries.has('deno.json') ||
    rootEntries.has('deno.jsonc') ||
    hasRootPrefix(rootEntries, [
      'vite.config.',
      'next.config.',
      'astro.config.',
      'svelte.config.',
      'nuxt.config.',
      'playwright.config.',
      'eslint.config.',
    ]) ||
    hasAnySetOverlap(extensions, JS_TS_EXTENSIONS);

  if (isJsTs) {
    languages.push('js-ts');
  }

  const isPython =
    rootEntries.has('pyproject.toml') ||
    rootEntries.has('uv.lock') ||
    rootEntries.has('poetry.lock') ||
    rootEntries.has('Pipfile') ||
    rootEntries.has('Pipfile.lock') ||
    rootEntries.has('requirements.txt') ||
    rootEntries.has('requirements-dev.txt') ||
    rootEntries.has('setup.py') ||
    rootEntries.has('setup.cfg') ||
    rootEntries.has('tox.ini') ||
    extensions.has('.py');

  if (isPython) {
    languages.push('python');
  }

  const isGo =
    rootEntries.has('go.mod') ||
    rootEntries.has('go.sum') ||
    rootEntries.has('go.work') ||
    extensions.has('.go');

  if (isGo) {
    languages.push('go');
  }

  const isRust =
    rootEntries.has('Cargo.toml') ||
    rootEntries.has('Cargo.lock') ||
    extensions.has('.rs');

  if (isRust) {
    languages.push('rust');
  }

  const isRuby =
    rootEntries.has('Gemfile') ||
    rootEntries.has('Gemfile.lock') ||
    rootEntries.has('Rakefile') ||
    rootEntries.has('.ruby-version') ||
    extensions.has('.rb');

  if (isRuby) {
    languages.push('ruby');
  }

  const isJava =
    rootEntries.has('pom.xml') ||
    rootEntries.has('build.gradle') ||
    rootEntries.has('build.gradle.kts') ||
    rootEntries.has('settings.gradle') ||
    rootEntries.has('settings.gradle.kts') ||
    rootEntries.has('gradlew') ||
    extensions.has('.java') ||
    extensions.has('.kt');

  if (isJava) {
    languages.push('java');
  }

  if (languages.length === 0) {
    const hasOtherCode =
      rootEntries.has('CMakeLists.txt') ||
      rootEntries.has('composer.json') ||
      rootEntries.has('mix.exs') ||
      rootEntries.has('Package.swift') ||
      rootEntries.has('pubspec.yaml') ||
      rootEntries.has('Makefile') ||
      rootEntries.has('GNUmakefile') ||
      hasAnySetOverlap(extensions, OTHER_LANGUAGE_EXTENSIONS);
    if (hasOtherCode) {
      languages.push('other');
    }
  }

  return languages;
}

function detectSurfaces(signals, jsDeps) {
  const { rootEntries, extensions, relativeFiles, relativeDirs } = signals;

  const hasWebFrameworkFile =
    rootEntries.has('angular.json') ||
    rootEntries.has('index.html') ||
    hasRootPrefix(rootEntries, [
      'vite.config.',
      'next.config.',
      'astro.config.',
      'svelte.config.',
      'nuxt.config.',
      'remix.config.',
      'tailwind.config.',
      'postcss.config.',
    ]);

  const hasWebDep = hasAnySetOverlap(jsDeps, WEB_UI_DEPS);
  const hasWebExtension = hasAnySetOverlap(extensions, WEB_UI_EXTENSIONS);
  const hasWebUi = hasWebFrameworkFile || hasWebDep || hasWebExtension;

  let hasXcodeContainer = false;
  for (const entry of rootEntries) {
    if (entry.endsWith('.xcodeproj') || entry.endsWith('.xcworkspace')) {
      hasXcodeContainer = true;
      break;
    }
  }

  const hasMobileUi =
    jsDeps.has('react-native') ||
    jsDeps.has('expo') ||
    rootEntries.has('pubspec.yaml') ||
    rootEntries.has('Podfile') ||
    relativeDirs.has('ios') ||
    relativeDirs.has('android') ||
    hasXcodeContainer;

  const hasPublicDocsOrE2eWeb =
    rootEntries.has('mkdocs.yml') ||
    rootEntries.has('mint.json') ||
    rootEntries.has('book.toml') ||
    rootEntries.has('llms.txt') ||
    relativeFiles.has('public/llms.txt') ||
    relativeFiles.has('docs/index.md') ||
    relativeFiles.has('docs/index.mdx') ||
    relativeDirs.has('.vitepress') ||
    hasRootPrefix(rootEntries, ['docusaurus.config.', 'playwright.config.']);

  return {
    hasFrontendUi: hasWebUi || hasMobileUi,
    hasWebSurface: hasWebUi || hasPublicDocsOrE2eWeb,
  };
}

function detectPlaywright(signals, jsDeps, pkgJson, pyprojectText, commands) {
  if (PLAYWRIGHT_CONFIG_FILES.some((name) => signals.rootEntries.has(name))) {
    return true;
  }
  if (jsDeps.has('@playwright/test') || jsDeps.has('playwright')) {
    return true;
  }
  const scripts =
    typeof pkgJson?.scripts === 'object' &&
    pkgJson.scripts !== null &&
    !Array.isArray(pkgJson.scripts)
      ? pkgJson.scripts
      : {};
  for (const scriptVal of Object.values(scripts)) {
    if (typeof scriptVal === 'string' && /playwright/i.test(scriptVal)) {
      return true;
    }
  }
  if (typeof pyprojectText === 'string' && /playwright/i.test(pyprojectText)) {
    return true;
  }
  if (/playwright/i.test(commands?.testE2e ?? '')) {
    return true;
  }
  return false;
}

function detectPostgresSignal({ rootDir, signals, jsDeps, pyprojectText, cargoText, goModText }) {
  if (hasAnySetOverlap(jsDeps, POSTGRES_JS_DEPS)) {
    return true;
  }

  const pyPostgresRe = /\b(?:psycopg2?|asyncpg|sqlmodel)\b/i;
  if (typeof pyprojectText === 'string' && pyPostgresRe.test(pyprojectText)) {
    return true;
  }
  for (const entry of signals.rootEntries) {
    if (/^requirements.*\.txt$/i.test(entry)) {
      const reqText = readTextIfExists(path.join(rootDir, entry));
      if (typeof reqText === 'string' && pyPostgresRe.test(reqText)) {
        return true;
      }
    }
  }

  if (typeof cargoText === 'string') {
    if (
      /\b(?:sqlx|tokio-postgres)\b/i.test(cargoText) ||
      (/\bdiesel\b/i.test(cargoText) && /\bpostgres\b/i.test(cargoText))
    ) {
      return true;
    }
  }

  if (typeof goModText === 'string' && /(?:jackc\/pgx|lib\/pq)/i.test(goModText)) {
    return true;
  }

  const prismaText = readTextIfExists(path.join(rootDir, 'prisma', 'schema.prisma'));
  if (typeof prismaText === 'string' && /provider\s*=\s*["']postgres(?:ql)?["']/i.test(prismaText)) {
    return true;
  }

  if (isFile(path.join(rootDir, 'supabase', 'config.toml'))) {
    return true;
  }

  for (const composeFile of COMPOSE_CONFIG_FILES) {
    if (signals.rootEntries.has(composeFile)) {
      const composeText = readTextIfExists(path.join(rootDir, composeFile));
      if (typeof composeText === 'string' && /\bpostgres(?:ql)?\b/i.test(composeText)) {
        return true;
      }
    }
  }

  return false;
}

function detectStackSignals({
  rootDir,
  signals,
  jsDeps,
  pyprojectText,
  cargoText,
  goModText,
}) {
  const { rootEntries, extensions } = signals;

  const hasReactNative = jsDeps.has('react-native') || jsDeps.has('expo');
  const hasReact =
    hasAnySetOverlap(jsDeps, REACT_WEB_OR_BASE_DEPS) &&
    (!hasReactNative || jsDeps.has('react-dom') || jsDeps.has('next'));

  const hasPostgres = detectPostgresSignal({
    rootDir,
    signals,
    jsDeps,
    pyprojectText,
    cargoText,
    goModText,
  });

  let hasXcodeContainer = false;
  for (const entry of rootEntries) {
    if (entry.endsWith('.xcodeproj') || entry.endsWith('.xcworkspace')) {
      hasXcodeContainer = true;
      break;
    }
  }
  const hasSwift =
    rootEntries.has('Package.swift') || extensions.has('.swift') || hasXcodeContainer;

  return {
    hasReact,
    hasReactNative,
    hasPostgres,
    hasSwift,
  };
}

function detectPackageManager(rootEntries, pkgJson, pyprojectText) {
  if (rootEntries.has('pnpm-lock.yaml')) {
    return 'pnpm';
  }
  if (rootEntries.has('yarn.lock')) {
    return 'yarn';
  }
  if (rootEntries.has('bun.lock') || rootEntries.has('bun.lockb')) {
    return 'bun';
  }
  if (rootEntries.has('package-lock.json') || rootEntries.has('npm-shrinkwrap.json')) {
    return 'npm';
  }
  if (typeof pkgJson?.packageManager === 'string') {
    const pmMatch = pkgJson.packageManager.trim().match(/^(pnpm|yarn|bun|npm)@/);
    if (pmMatch) {
      return pmMatch[1];
    }
  }
  if (rootEntries.has('uv.lock')) {
    return 'uv';
  }
  if (rootEntries.has('poetry.lock')) {
    return 'poetry';
  }
  if (pyprojectText !== null) {
    if (/^\s*\[tool\.uv\b/m.test(pyprojectText)) {
      return 'uv';
    }
    if (/^\s*\[tool\.poetry\b/m.test(pyprojectText)) {
      return 'poetry';
    }
    return 'pip';
  }
  if (
    rootEntries.has('Pipfile') ||
    rootEntries.has('Pipfile.lock') ||
    rootEntries.has('requirements.txt') ||
    rootEntries.has('requirements-dev.txt') ||
    rootEntries.has('setup.py')
  ) {
    return 'pip';
  }
  if (rootEntries.has('Cargo.lock') || rootEntries.has('Cargo.toml')) {
    return 'cargo';
  }
  if (rootEntries.has('go.mod')) {
    return 'go';
  }
  if (pkgJson !== null || rootEntries.has('package.json')) {
    return 'npm';
  }
  if (rootEntries.has('Makefile') || rootEntries.has('GNUmakefile')) {
    return 'make';
  }
  return 'unknown';
}

function formatNodeScript(packageManager, scriptName) {
  if (packageManager === 'pnpm') {
    return `pnpm ${scriptName}`;
  }
  if (packageManager === 'yarn') {
    return `yarn ${scriptName}`;
  }
  if (packageManager === 'bun') {
    return `bun run ${scriptName}`;
  }
  if (scriptName === 'test' || scriptName === 'start') {
    return `npm ${scriptName}`;
  }
  return `npm run ${scriptName}`;
}

function parseMakefileTargets(makefileText) {
  const targets = new Set();
  if (!makefileText) {
    return targets;
  }
  for (const rawLine of makefileText.split(/\r?\n/)) {
    const match = rawLine.match(/^([A-Za-z0-9][A-Za-z0-9_-]*)\s*:(?!=)/);
    if (match) {
      targets.add(match[1]);
    }
  }
  return targets;
}

function detectCommands(rootDir, signals, packageManager, pkgJson, pyprojectText) {
  const commands = {
    install: null,
    dev: null,
    build: null,
    lint: null,
    typecheck: null,
    testUnit: null,
    testE2e: null,
  };

  const { rootEntries, relativeDirs } = signals;

  if (pkgJson && ['pnpm', 'yarn', 'bun', 'npm'].includes(packageManager)) {
    commands.install = `${packageManager} install`;
    const scripts =
      typeof pkgJson.scripts === 'object' &&
      pkgJson.scripts !== null &&
      !Array.isArray(pkgJson.scripts)
        ? pkgJson.scripts
        : {};

    const pickScript = (candidates, skipNpmPlaceholder = false) => {
      for (const name of candidates) {
        const val = scripts[name];
        if (typeof val !== 'string' || val.trim().length === 0) {
          continue;
        }
        if (skipNpmPlaceholder && val.includes('Error: no test specified')) {
          continue;
        }
        return formatNodeScript(packageManager, name);
      }
      return null;
    };

    commands.dev = pickScript(['dev', 'start', 'serve']);
    commands.build = pickScript(['build', 'compile']);
    commands.lint = pickScript(['lint', 'check:lint', 'eslint']);
    commands.typecheck = pickScript(['typecheck', 'check-types', 'type-check', 'types']);
    commands.testUnit = pickScript(['test:unit', 'unit', 'test'], true);
    commands.testE2e = pickScript(['test:e2e', 'e2e', 'playwright']);
    return commands;
  }

  if (['uv', 'poetry', 'pip'].includes(packageManager)) {
    const runner =
      packageManager === 'uv'
        ? 'uv run '
        : packageManager === 'poetry'
          ? 'poetry run '
          : '';

    if (packageManager === 'uv') {
      commands.install = 'uv sync';
    } else if (packageManager === 'poetry') {
      commands.install = 'poetry install';
    } else if (rootEntries.has('requirements.txt')) {
      commands.install = 'pip install -r requirements.txt';
    } else if (rootEntries.has('pyproject.toml')) {
      commands.install = 'pip install -e .';
    }

    const pyText = pyprojectText ?? '';
    if (
      /\bruff\b/i.test(pyText) ||
      rootEntries.has('ruff.toml') ||
      rootEntries.has('.ruff.toml')
    ) {
      commands.lint = `${runner}ruff check .`;
    }

    if (/\bmypy\b/i.test(pyText) || rootEntries.has('mypy.ini')) {
      commands.typecheck = `${runner}mypy .`;
    } else if (/\bpyright\b/i.test(pyText) || rootEntries.has('pyrightconfig.json')) {
      commands.typecheck = `${runner}pyright`;
    }

    if (
      /\bpytest\b/i.test(pyText) ||
      relativeDirs.has('tests') ||
      rootEntries.has('pytest.ini') ||
      rootEntries.has('uv.lock') ||
      rootEntries.has('poetry.lock')
    ) {
      commands.testUnit = `${runner}pytest`;
    }

    return commands;
  }

  if (packageManager === 'cargo') {
    commands.build = 'cargo build';
    commands.lint = 'cargo clippy';
    commands.typecheck = 'cargo check';
    commands.testUnit = 'cargo test';
    return commands;
  }

  if (packageManager === 'go') {
    commands.build = 'go build ./...';
    commands.typecheck = 'go vet ./...';
    commands.testUnit = 'go test ./...';
    return commands;
  }

  if (packageManager === 'make') {
    const makefilePath = rootEntries.has('Makefile')
      ? path.join(rootDir, 'Makefile')
      : path.join(rootDir, 'GNUmakefile');
    const targets = parseMakefileTargets(readTextIfExists(makefilePath));
    const pickTarget = (candidates) => {
      for (const target of candidates) {
        if (targets.has(target)) {
          return `make ${target}`;
        }
      }
      return null;
    };
    commands.install = pickTarget(['install']);
    commands.dev = pickTarget(['dev', 'run', 'serve']);
    commands.build = pickTarget(['build', 'compile']);
    commands.lint = pickTarget(['lint']);
    commands.typecheck = pickTarget(['typecheck', 'check-types']);
    commands.testUnit = pickTarget(['test-unit', 'unit', 'test']);
    commands.testE2e = pickTarget(['test-e2e', 'e2e']);
  }

  return commands;
}

function resolveGitConfigPaths(rootDir) {
  const dotGitPath = path.join(rootDir, '.git');
  let stat;
  try {
    stat = fs.statSync(dotGitPath);
  } catch {
    return [];
  }

  if (stat.isDirectory()) {
    const configPath = path.join(dotGitPath, 'config');
    return isFile(configPath) ? [configPath] : [];
  }

  if (stat.isFile()) {
    const pointerText = readTextIfExists(dotGitPath);
    const match = pointerText?.match(/^\s*gitdir:\s*(.+)\s*$/m);
    if (!match) {
      return [];
    }
    const gitDir = path.resolve(rootDir, match[1].trim());
    const candidates = [];
    const directConfig = path.join(gitDir, 'config');
    if (isFile(directConfig)) {
      candidates.push(directConfig);
    }
    const commonDirRaw = readTextIfExists(path.join(gitDir, 'commondir'));
    if (commonDirRaw) {
      const commonConfig = path.join(path.resolve(gitDir, commonDirRaw.trim()), 'config');
      if (isFile(commonConfig) && !candidates.includes(commonConfig)) {
        candidates.push(commonConfig);
      }
    }
    return candidates;
  }

  return [];
}

function parseRemoteUrlFromGitConfig(gitConfigText) {
  if (!gitConfigText) {
    return null;
  }
  const remotes = new Map();
  let activeRemote = null;

  for (const rawLine of gitConfigText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) {
      continue;
    }
    const sectionMatch = line.match(/^\[([^\]]+)\]/);
    if (sectionMatch) {
      const remoteHeader = sectionMatch[1].match(/^remote\s+"([^"]+)"$/i);
      activeRemote = remoteHeader ? remoteHeader[1] : null;
      continue;
    }
    if (activeRemote) {
      const urlMatch = line.match(/^url\s*=\s*(.+)$/i);
      if (urlMatch && !remotes.has(activeRemote)) {
        remotes.set(activeRemote, urlMatch[1].trim());
      }
    }
  }

  if (remotes.has('origin')) {
    return remotes.get('origin');
  }
  for (const url of remotes.values()) {
    return url;
  }
  return null;
}

function classifyRemoteUrl(remoteUrl) {
  if (!remoteUrl || remoteUrl.trim().length === 0) {
    return 'none';
  }
  const trimmed = remoteUrl.trim();
  let host = null;

  if (trimmed.includes('://')) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'file:') {
        return 'other';
      }
      host = parsed.hostname.toLowerCase();
    } catch {
      return 'other';
    }
  } else {
    const scpMatch = trimmed.match(/^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/);
    if (!scpMatch) {
      return 'other';
    }
    host = scpMatch[1].toLowerCase();
  }

  if (!host) {
    return 'other';
  }
  if (/(^|\.)github(\.|$)/.test(host)) {
    return 'github';
  }
  if (/(^|\.)gitlab(\.|$)/.test(host)) {
    return 'gitlab';
  }
  if (/(^|\.)bitbucket(\.|$)/.test(host)) {
    return 'bitbucket';
  }
  return 'other';
}

function detectGitRemoteHost(rootDir) {
  const gitConfigPaths = resolveGitConfigPaths(rootDir);
  for (const gitConfigPath of gitConfigPaths) {
    const gitConfigText = readTextIfExists(gitConfigPath);
    const remoteUrl = parseRemoteUrlFromGitConfig(gitConfigText);
    if (remoteUrl) {
      return classifyRemoteUrl(remoteUrl);
    }
  }
  return 'none';
}

function detectCiProvider(rootDir) {
  const workflowsDir = path.join(rootDir, '.github', 'workflows');
  if (isDirectory(workflowsDir)) {
    try {
      const files = fs.readdirSync(workflowsDir);
      if (files.some((name) => name.endsWith('.yml') || name.endsWith('.yaml'))) {
        return 'github-actions';
      }
    } catch {
      // Ignore unreadable workflow directories and continue checking other providers.
    }
  }

  if (
    isFile(path.join(rootDir, '.gitlab-ci.yml')) ||
    isFile(path.join(rootDir, '.gitlab-ci.yaml'))
  ) {
    return 'gitlab-ci';
  }

  if (
    isFile(path.join(rootDir, '.circleci', 'config.yml')) ||
    isFile(path.join(rootDir, '.circleci', 'config.yaml'))
  ) {
    return 'circleci';
  }

  return 'none';
}

function getCuratedPackSkillNames(pack) {
  if (Array.isArray(pack?.skillNames) && pack.skillNames.length > 0) {
    return pack.skillNames;
  }
  const baseSource = String(pack?.source ?? '').split('#')[0];
  const fallbackSlug = baseSource.split('/').at(-1);
  return fallbackSlug ? [fallbackSlug] : [];
}

function buildCatalogBrownfieldIndex() {
  const spineSkillSets = new Map(
    Object.entries(CURATED_SPINES).map(([source, spine]) => [
      source,
      new Set(Object.values(spine.stageSkills ?? {}).flat()),
    ]),
  );

  const allSpineSkills = new Set();
  for (const skillSet of spineSkillSets.values()) {
    for (const skillName of skillSet) {
      allSpineSkills.add(skillName);
    }
  }

  const candidatePacksBySkill = new Map();
  for (const pack of Object.values(CURATED_SKILLS)) {
    for (const skillName of getCuratedPackSkillNames(pack)) {
      if (allSpineSkills.has(skillName)) {
        continue;
      }
      if (!candidatePacksBySkill.has(skillName)) {
        candidatePacksBySkill.set(skillName, []);
      }
      candidatePacksBySkill.get(skillName).push(pack);
    }
  }

  const curatedSkillByName = new Map();
  for (const [skillName, packs] of candidatePacksBySkill.entries()) {
    if (packs.length === 1) {
      curatedSkillByName.set(skillName, packs[0]);
    }
  }

  return { curatedSkillByName, spineSkillSets };
}

function lexCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function countLines(content) {
  if (typeof content !== 'string' || content.length === 0) {
    return 0;
  }
  const normalized = content.replace(/\r\n/g, '\n').replace(/\n$/, '');
  return normalized.length === 0 ? 1 : normalized.split('\n').length;
}

export function findCaseInsensitiveRootFile(rootDir, canonicalName) {
  if (
    typeof rootDir !== 'string' ||
    rootDir.trim().length === 0 ||
    typeof canonicalName !== 'string' ||
    canonicalName.trim().length === 0
  ) {
    return { exists: false, filename: null, fullPath: null };
  }

  let entries;
  try {
    entries = fs.readdirSync(rootDir);
  } catch {
    return { exists: false, filename: null, fullPath: null };
  }

  if (entries.includes(canonicalName)) {
    const exactPath = path.join(rootDir, canonicalName);
    if (isFile(exactPath)) {
      return { exists: true, filename: canonicalName, fullPath: exactPath };
    }
  }

  const targetLower = canonicalName.toLowerCase();
  const caseMatches = entries
    .filter((name) => name.toLowerCase() === targetLower)
    .sort(lexCompare);

  for (const name of caseMatches) {
    const candidatePath = path.join(rootDir, name);
    if (isFile(candidatePath)) {
      return { exists: true, filename: name, fullPath: candidatePath };
    }
  }

  return { exists: false, filename: null, fullPath: null };
}

export function extractMarkdownHeadings(markdown, limit = 25) {
  if (typeof markdown !== 'string' || markdown.length === 0 || limit <= 0) {
    return [];
  }

  const headings = [];
  let openFence = null;

  for (const line of markdown.split(/\r?\n/)) {
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

    const headingMatch = line.match(/^\s{0,3}(#{1,3}\s+.+?)\s*$/);
    if (headingMatch) {
      headings.push(headingMatch[1].trim());
      if (headings.length >= limit) {
        break;
      }
    }
  }

  return headings;
}

function inspectAgentsMdDetail(rootDir) {
  const found = findCaseInsensitiveRootFile(rootDir, 'AGENTS.md');
  if (!found.exists || !found.fullPath) {
    return {
      exists: false,
      filename: null,
      hasReporigFence: false,
      lineCount: 0,
      headings: [],
    };
  }

  const content = readTextIfExists(found.fullPath);
  if (content === null) {
    return {
      exists: false,
      filename: null,
      hasReporigFence: false,
      lineCount: 0,
      headings: [],
    };
  }

  return {
    exists: true,
    filename: found.filename,
    hasReporigFence: hasValidReporigFence(content),
    lineCount: countLines(content),
    headings: extractMarkdownHeadings(content),
  };
}

function inspectClaudeMdDetail(rootDir) {
  const found = findCaseInsensitiveRootFile(rootDir, 'CLAUDE.md');
  if (!found.exists || !found.fullPath) {
    return {
      exists: false,
      filename: null,
      isBridgeOnly: false,
      hasAgentsBridge: false,
      lineCount: 0,
      headings: [],
    };
  }

  const content = readTextIfExists(found.fullPath);
  if (content === null) {
    return {
      exists: false,
      filename: null,
      isBridgeOnly: false,
      hasAgentsBridge: false,
      lineCount: 0,
      headings: [],
    };
  }

  const trimmed = content.trim();
  const isBridgeOnly = trimmed === '@AGENTS.md' || trimmed === '@./AGENTS.md';
  const hasAgentsBridge = /(?:^|\s)@(?:\.\/)?AGENTS\.md(?:\s|$)/m.test(content);

  return {
    exists: true,
    filename: found.filename,
    isBridgeOnly,
    hasAgentsBridge,
    lineCount: countLines(content),
    headings: extractMarkdownHeadings(content),
  };
}

function inspectMarkdownPath(filePath) {
  if (!isFile(filePath)) {
    return {
      exists: false,
      lineCount: 0,
      headings: [],
    };
  }

  const content = readTextIfExists(filePath);
  if (content === null) {
    return {
      exists: false,
      lineCount: 0,
      headings: [],
    };
  }

  return {
    exists: true,
    lineCount: countLines(content),
    headings: extractMarkdownHeadings(content),
  };
}

function detectCursorRuleFiles(rootDir) {
  const rulesDir = path.join(rootDir, '.cursor', 'rules');
  if (!isDirectory(rulesDir)) {
    return [];
  }

  const ruleFiles = [];
  function walkRules(currentDir, relPrefix) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      const relPath = `${relPrefix}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        walkRules(fullPath, relPath);
      } else if (entry.isFile()) {
        ruleFiles.push(relPath);
      }
    }
  }

  walkRules(rulesDir, '.cursor/rules');
  return ruleFiles.sort(lexCompare);
}

function detectEslintConfig(rootDir) {
  for (const candidate of ESLINT_CONFIG_CANDIDATES) {
    if (isFile(path.join(rootDir, candidate))) {
      return candidate;
    }
  }
  return null;
}

function scanSkillsDirectory(skillsDir) {
  if (!isDirectory(skillsDir)) {
    return [];
  }

  let entries;
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const installed = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const candidateDir = path.join(skillsDir, entry.name);
    if (
      (entry.isDirectory() || isDirectory(candidateDir)) &&
      isFile(path.join(candidateDir, 'SKILL.md'))
    ) {
      installed.push(entry.name);
    }
  }

  return installed.sort(lexCompare);
}

function parseSkillsLock(rootDir) {
  const lockPath = path.join(rootDir, 'skills-lock.json');
  if (!isFile(lockPath)) {
    return { exists: false, entries: [], rawEntries: [] };
  }

  const parsed = readJsonIfExists(lockPath);
  if (
    !parsed ||
    typeof parsed.skills !== 'object' ||
    parsed.skills === null ||
    Array.isArray(parsed.skills)
  ) {
    return { exists: true, entries: [], rawEntries: [] };
  }

  const entries = [];
  const rawEntries = [];
  for (const name of Object.keys(parsed.skills).sort(lexCompare)) {
    const raw = parsed.skills[name];
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      continue;
    }
    const source = typeof raw.source === 'string' ? raw.source.trim() : '';
    if (source.length === 0) {
      continue;
    }
    const sourceType =
      typeof raw.sourceType === 'string' && raw.sourceType.trim().length > 0
        ? raw.sourceType.trim()
        : null;
    const sourceUrl =
      typeof raw.sourceUrl === 'string' && raw.sourceUrl.trim().length > 0
        ? raw.sourceUrl.trim()
        : null;

    entries.push({ name, source, sourceType });
    rawEntries.push({ name, source, sourceType, sourceUrl });
  }

  return { exists: true, entries, rawEntries };
}

function resolvePackMetaFromLock(source, sourceType, sourceUrl, skillName) {
  if (CURATED_SPINES[source]) {
    return {
      source,
      url: CURATED_SPINES[source].url,
      kind: 'spine',
    };
  }
  if (CURATED_SKILLS[source]) {
    return {
      source,
      url: CURATED_SKILLS[source].url,
      kind: CURATED_SKILLS[source].kind,
    };
  }

  if (typeof skillName === 'string' && skillName.length > 0 && !source.includes('#')) {
    const matchingSubpacks = Object.values(CURATED_SKILLS).filter((pack) => {
      if (typeof pack?.source !== 'string' || !pack.source.includes('#')) {
        return false;
      }
      if (pack.source.split('#')[0] !== source) {
        return false;
      }
      return getCuratedPackSkillNames(pack).includes(skillName);
    });
    if (matchingSubpacks.length === 1) {
      return {
        source: matchingSubpacks[0].source,
        url: matchingSubpacks[0].url,
        kind: matchingSubpacks[0].kind,
      };
    }
  }

  let url = null;
  if (sourceUrl) {
    url = sourceUrl;
  } else if (
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source) &&
    (sourceType === null || sourceType.toLowerCase() === 'github')
  ) {
    url = `https://github.com/${source.replace(/\.git$/i, '')}.git`;
  }

  return {
    source,
    url,
    kind: 'custom',
  };
}

function classifyBrownfieldSkills({ agentsSkills, claudeSkills, skillsLockParsed }) {
  const { curatedSkillByName, spineSkillSets } = buildCatalogBrownfieldIndex();
  const skillLocations = new Map();
  for (const name of agentsSkills) {
    if (SELF_SKILL_NAME_SET.has(name)) {
      continue;
    }
    skillLocations.set(name, new Set(['.agents/skills']));
  }
  for (const name of claudeSkills) {
    if (SELF_SKILL_NAME_SET.has(name)) {
      continue;
    }
    if (!skillLocations.has(name)) {
      skillLocations.set(name, new Set());
    }
    skillLocations.get(name).add('.claude/skills');
  }

  const packMap = new Map();
  const attributedSkills = new Set();

  function recordPackMatch(meta, skillName, via) {
    if (!packMap.has(meta.source)) {
      packMap.set(meta.source, {
        source: meta.source,
        url: meta.url,
        kind: meta.kind,
        matchedSkills: new Set([skillName]),
        via,
      });
    } else {
      const existing = packMap.get(meta.source);
      existing.matchedSkills.add(skillName);
      if (via === 'skills-lock') {
        existing.via = 'skills-lock';
      }
      if (!existing.url && meta.url) {
        existing.url = meta.url;
      }
    }
    attributedSkills.add(skillName);
  }

  for (const entry of skillsLockParsed.rawEntries) {
    if (
      SELF_SKILL_NAME_SET.has(entry.name) ||
      entry.source === 'timothyjordan/reporig'
    ) {
      continue;
    }
    const meta = resolvePackMetaFromLock(
      entry.source,
      entry.sourceType,
      entry.sourceUrl,
      entry.name,
    );
    recordPackMatch(meta, entry.name, 'skills-lock');
  }

  const remainingAfterLock = [...skillLocations.keys()].filter(
    (name) => !attributedSkills.has(name),
  );

  for (const skillName of remainingAfterLock) {
    const curatedSkill = curatedSkillByName.get(skillName);
    if (curatedSkill) {
      recordPackMatch(
        {
          source: curatedSkill.source,
          url: curatedSkill.url,
          kind: curatedSkill.kind,
        },
        skillName,
        'catalog-match',
      );
    }
  }

  const remainingForSpines = remainingAfterLock.filter(
    (name) => !attributedSkills.has(name),
  );

  const spineSources = Object.keys(CURATED_SPINES);
  const candidateSpinesBySkill = new Map();
  for (const skillName of remainingForSpines) {
    candidateSpinesBySkill.set(
      skillName,
      spineSources.filter((src) => spineSkillSets.get(src).has(skillName)),
    );
  }

  const spineStats = new Map();
  const assignedToSpine = new Map();
  for (const source of spineSources) {
    const hasLockMatch =
      packMap.has(source) && packMap.get(source).via === 'skills-lock';
    const lockCount = hasLockMatch ? packMap.get(source).matchedSkills.size : 0;
    const potentialMatches = remainingForSpines.filter((name) =>
      spineSkillSets.get(source).has(name),
    );
    const unambiguousCount =
      lockCount +
      potentialMatches.filter(
        (name) => candidateSpinesBySkill.get(name).length === 1,
      ).length;
    const qualifies = hasLockMatch
      ? potentialMatches.length >= 1
      : potentialMatches.length >= 2;

    spineStats.set(source, {
      source,
      hasLockMatch,
      unambiguousCount,
      qualifies,
      recommended: Boolean(CURATED_SPINES[source].recommended),
    });
    assignedToSpine.set(source, []);
  }

  for (const skillName of remainingForSpines) {
    let candidates = candidateSpinesBySkill
      .get(skillName)
      .map((src) => spineStats.get(src))
      .filter((st) => st.qualifies);

    if (candidates.length === 0) {
      continue;
    }

    if (candidates.length > 1) {
      const withUnambiguousSibling = candidates.filter(
        (st) => st.unambiguousCount > 0,
      );
      if (withUnambiguousSibling.length > 0) {
        candidates = withUnambiguousSibling;
      }
      candidates.sort((a, b) => {
        if (a.recommended !== b.recommended) {
          return a.recommended ? -1 : 1;
        }
        if (a.unambiguousCount !== b.unambiguousCount) {
          return b.unambiguousCount > a.unambiguousCount ? 1 : -1;
        }
        return lexCompare(a.source, b.source);
      });
    }

    assignedToSpine.get(candidates[0].source).push(skillName);
  }

  for (const [source, assignedSkills] of assignedToSpine.entries()) {
    const stats = spineStats.get(source);
    const minRequired = stats.hasLockMatch ? 1 : 2;
    if (assignedSkills.length >= minRequired) {
      const spine = CURATED_SPINES[source];
      for (const skillName of assignedSkills) {
        recordPackMatch(
          { source, url: spine.url, kind: 'spine' },
          skillName,
          'catalog-match',
        );
      }
    }
  }

  const recognizedPacks = [...packMap.values()]
    .map((pack) => ({
      source: pack.source,
      url: pack.url,
      kind: pack.kind,
      matchedSkills: [...pack.matchedSkills].sort(lexCompare),
      via: pack.via,
    }))
    .sort((a, b) => lexCompare(a.source, b.source));

  const customSkills = [...skillLocations.entries()]
    .filter(([name]) => !attributedSkills.has(name))
    .sort(([a], [b]) => lexCompare(a, b))
    .map(([name, locs]) => ({
      name,
      locations: [...locs].sort(lexCompare),
    }));

  return { recognizedPacks, customSkills };
}

function inspectBrownfield(
  rootDir,
  { reporigJsonExists, agentsMdDetail, claudeMdDetail, agentsSkills },
) {
  const cursorRules = {
    legacyFile: inspectMarkdownPath(path.join(rootDir, '.cursorrules')),
    ruleFiles: detectCursorRuleFiles(rootDir),
  };
  const copilotInstructions = inspectMarkdownPath(
    path.join(rootDir, '.github', 'copilot-instructions.md'),
  );

  const agentsSkillsDir = path.join(rootDir, '.agents', 'skills');
  const claudeSkillsDir = path.join(rootDir, '.claude', 'skills');
  let claudeSkillsIsSymlinkToAgents = false;
  if (isDirectory(claudeSkillsDir) && isDirectory(agentsSkillsDir)) {
    try {
      claudeSkillsIsSymlinkToAgents =
        fs.realpathSync(claudeSkillsDir) === fs.realpathSync(agentsSkillsDir);
    } catch {
      claudeSkillsIsSymlinkToAgents = false;
    }
  }

  const isWholeDirClaudeMirror = isFile(
    path.join(claudeSkillsDir, '.reporig-mirror'),
  );
  const claudeSkills =
    claudeSkillsIsSymlinkToAgents || isWholeDirClaudeMirror
      ? []
      : scanSkillsDirectory(claudeSkillsDir).filter((name) => {
          const entryPath = path.join(claudeSkillsDir, name);
          if (isFile(path.join(entryPath, '.reporig-mirror'))) {
            return false;
          }
          const agentEntryPath = path.join(agentsSkillsDir, name);
          if (isDirectory(agentEntryPath)) {
            try {
              if (
                fs.realpathSync(entryPath) === fs.realpathSync(agentEntryPath)
              ) {
                return false;
              }
            } catch {
              // Keep scanning if realpath fails
            }
          }
          return true;
        });
  const skillsLockParsed = parseSkillsLock(rootDir);
  const { recognizedPacks, customSkills } = classifyBrownfieldSkills({
    agentsSkills,
    claudeSkills,
    skillsLockParsed,
  });

  const skills = {
    agentsSkills,
    claudeSkills,
    claudeSkillsIsSymlinkToAgents,
    skillsLock: {
      exists: skillsLockParsed.exists,
      entries: skillsLockParsed.entries,
    },
    recognizedPacks,
    customSkills,
  };

  const hasFootprint = Boolean(
    (agentsMdDetail.exists && (!agentsMdDetail.hasReporigFence || !reporigJsonExists)) ||
      (claudeMdDetail.exists && !claudeMdDetail.isBridgeOnly) ||
      cursorRules.legacyFile.exists ||
      cursorRules.ruleFiles.length > 0 ||
      copilotInstructions.exists ||
      skills.claudeSkills.length > 0 ||
      skills.skillsLock.exists ||
      (!reporigJsonExists &&
        skills.agentsSkills.some((name) => !SELF_SKILL_NAME_SET.has(name))),
  );

  return {
    hasFootprint,
    instructionFiles: {
      agentsMd: agentsMdDetail,
      claudeMd: claudeMdDetail,
      cursorRules,
      copilotInstructions,
    },
    skills,
  };
}

export async function inspectRepo(cwd) {
  if (typeof cwd !== 'string' || cwd.trim().length === 0) {
    throw new Error('inspectRepo requires a non-empty cwd directory path.');
  }

  const rootDir = path.resolve(cwd);
  if (!isDirectory(rootDir)) {
    throw new Error(`Repository directory does not exist: ${rootDir}`);
  }

  const reporigJsonPath = path.join(rootDir, '.agents', 'reporig.json');
  const parsedConfig = parseConfigFile(reporigJsonPath);

  let mode = 'setup';
  let configErrors = [];
  let currentConfig = null;
  if (parsedConfig.exists) {
    if (parsedConfig.valid) {
      mode = 'update';
      currentConfig = parsedConfig.config;
    } else {
      mode = 'invalid-config';
      configErrors = parsedConfig.errors;
    }
  }

  const signals = collectRepoSignals(rootDir);
  const pkgJson = readJsonIfExists(path.join(rootDir, 'package.json'));
  const pyprojectText = readTextIfExists(path.join(rootDir, 'pyproject.toml'));
  const cargoText = readTextIfExists(path.join(rootDir, 'Cargo.toml'));
  const goModText = readTextIfExists(path.join(rootDir, 'go.mod'));

  const projectName = inferProjectName(
    rootDir,
    pkgJson,
    pyprojectText,
    cargoText,
    goModText,
  );
  const jsDeps = collectJsDeps(pkgJson);
  const languages = detectLanguages(signals, pkgJson);
  const { hasFrontendUi, hasWebSurface } = detectSurfaces(signals, jsDeps);
  const packageManager = detectPackageManager(signals.rootEntries, pkgJson, pyprojectText);
  const commands = detectCommands(rootDir, signals, packageManager, pkgJson, pyprojectText);
  const hasPlaywright = detectPlaywright(
    signals,
    jsDeps,
    pkgJson,
    pyprojectText,
    commands,
  );
  const stackSignals = detectStackSignals({
    rootDir,
    signals,
    jsDeps,
    pyprojectText,
    cargoText,
    goModText,
  });
  const gitRemoteHost = detectGitRemoteHost(rootDir);
  const ciProvider = detectCiProvider(rootDir);

  const agentsMdDetail = inspectAgentsMdDetail(rootDir);
  const claudeMdDetail = inspectClaudeMdDetail(rootDir);

  const existingFiles = {
    agentsMd: {
      exists: agentsMdDetail.exists,
      hasReporigFence: agentsMdDetail.hasReporigFence,
      lineCount: agentsMdDetail.lineCount,
    },
    claudeMd: claudeMdDetail.exists,
    reporigJson: parsedConfig.exists,
    eslintConfig: detectEslintConfig(rootDir),
    gitignore: isFile(path.join(rootDir, '.gitignore')),
  };

  const installedSkills = scanSkillsDirectory(path.join(rootDir, '.agents', 'skills'));
  const brownfield = inspectBrownfield(rootDir, {
    reporigJsonExists: parsedConfig.exists,
    agentsMdDetail,
    claudeMdDetail,
    agentsSkills: [...installedSkills],
  });

  return {
    mode,
    configErrors,
    currentConfig,
    projectName,
    languages,
    hasFrontendUi,
    hasWebSurface,
    hasPlaywright,
    stackSignals,
    packageManager,
    commands,
    gitRemoteHost,
    ciProvider,
    existingFiles,
    installedSkills,
    brownfield,
  };
}
