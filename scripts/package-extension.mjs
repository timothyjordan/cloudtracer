#!/usr/bin/env node
// Package the built extension into a Chrome Web Store-ready zip.
//
// Usage: node scripts/package-extension.mjs [--rebuild]
//   --rebuild   run `npm run build:ext` first, even if dist-extension/ exists
//
// Writes `cloudtracer-extension-<version>.zip` at the repo root, where
// <version> comes from extension/package.json (release-please keeps that in
// step with extension/manifest.json). Drag the zip into the Chrome Web Store
// developer dashboard.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import AdmZip from "adm-zip";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const distDir = resolve(root, "dist-extension");

// Nothing here belongs in a store upload. Sourcemaps are the expensive one:
// popup.js.map is over 1MB of inlined source, dwarfing the extension itself.
const EXCLUDE = [
  /\.map$/,
  /\.DS_Store$/,
  /(^|\/)\.[^/]+$/, // any dotfile
];

/** True when a dist-relative path must be kept out of the zip. */
export function shouldExclude(relPath) {
  const normalized = relPath.split("\\").join("/");
  return EXCLUDE.some((re) => re.test(normalized));
}

/** The published asset name for a given extension version. */
export function zipName(version) {
  return `cloudtracer-extension-${version}.zip`;
}

/**
 * Every file under `dir` that belongs in the zip, as
 * `{ abs, rel, size }`, sorted by `rel` so the listing is stable.
 */
export function collectFiles(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const rel = relative(base, abs).split("\\").join("/");
    if (shouldExclude(rel)) continue;
    if (statSync(abs).isDirectory()) out.push(...collectFiles(abs, base));
    else out.push({ abs, rel, size: statSync(abs).size });
  }
  return out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

/** Human-readable byte count for the build summary. */
export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function main() {
  if (process.argv.includes("--rebuild") || !existsSync(distDir)) {
    console.log("- running npm run build:ext ...");
    execFileSync("npm", ["run", "build:ext"], { cwd: root, stdio: "inherit" });
  }

  const { version } = JSON.parse(
    readFileSync(resolve(root, "extension/package.json"), "utf8"),
  );
  const files = collectFiles(distDir);
  if (files.length === 0) {
    console.error(`no files to package in ${distDir}`);
    process.exit(1);
  }

  const zip = new AdmZip();
  for (const file of files) zip.addLocalFile(file.abs, dirname(file.rel));

  const outPath = resolve(root, zipName(version));
  zip.writeZip(outPath);

  const total = files.reduce((sum, f) => sum + f.size, 0);
  for (const file of files) {
    console.log(`  ${file.rel.padEnd(28)} ${formatSize(file.size)}`);
  }
  console.log(
    `\npackaged ${files.length} files (${formatSize(total)} uncompressed) into`,
  );
  console.log(`  ${relative(root, outPath)}  ${formatSize(statSync(outPath).size)}`);
}

// Only run when invoked directly, so the helpers above stay importable.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
