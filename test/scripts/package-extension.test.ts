import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  shouldExclude,
  zipName,
  collectFiles,
  formatSize,
} from "../../scripts/package-extension.mjs";

/**
 * Tests authored from test/scripts/specs/packageExtension.spec.md.
 *
 * The contract that matters: whatever collectFiles returns is exactly what a
 * user installs from the Chrome Web Store, so exclusions are load-bearing.
 */

describe("shouldExclude", () => {
  it("excludes sourcemaps", () => {
    expect(shouldExclude("popup.js.map")).toBe(true);
  });

  it("keeps the extension payload", () => {
    for (const keep of ["popup.js", "manifest.json", "popup.html", "popup.css"]) {
      expect(shouldExclude(keep)).toBe(false);
    }
  });

  it("keeps nested icon assets", () => {
    expect(shouldExclude("icons/icon-16.png")).toBe(false);
  });

  it("excludes .DS_Store", () => {
    expect(shouldExclude(".DS_Store")).toBe(true);
  });

  it("excludes dotfiles in a subdirectory", () => {
    expect(shouldExclude("icons/.keep")).toBe(true);
  });

  it("treats a backslash separator like a forward slash", () => {
    expect(shouldExclude("icons\\.keep")).toBe(true);
    expect(shouldExclude("icons\\icon-16.png")).toBe(false);
  });

  it("never throws, including on empty string", () => {
    expect(() => shouldExclude("")).not.toThrow();
  });
});

describe("zipName", () => {
  it("names the asset after the version", () => {
    expect(zipName("0.1.0")).toBe("cloudtracer-extension-0.1.0.zip");
  });

  it("carries a prerelease version through unchanged", () => {
    expect(zipName("1.2.0-rc.1")).toBe("cloudtracer-extension-1.2.0-rc.1.zip");
  });
});

describe("formatSize", () => {
  it("renders bytes under 1KB", () => {
    expect(formatSize(512)).toBe("512 B");
  });

  it("renders KB with one decimal", () => {
    expect(formatSize(2048)).toBe("2.0 KB");
  });

  it("renders MB with two decimals", () => {
    expect(formatSize(1048576)).toBe("1.00 MB");
  });
});

describe("collectFiles", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "ct-pack-"));
    writeFileSync(join(dir, "manifest.json"), "{}");
    writeFileSync(join(dir, "popup.js"), "console.log(1)");
    writeFileSync(join(dir, "popup.js.map"), "x".repeat(100));
    writeFileSync(join(dir, ".DS_Store"), "junk");
    mkdirSync(join(dir, "icons"));
    writeFileSync(join(dir, "icons", "icon-16.png"), "png");
    mkdirSync(join(dir, ".cache"));
    writeFileSync(join(dir, ".cache", "leftover.bin"), "nope");
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("excludes sourcemaps and .DS_Store", () => {
    const rels = collectFiles(dir).map((f: { rel: string }) => f.rel);
    expect(rels).not.toContain("popup.js.map");
    expect(rels).not.toContain(".DS_Store");
  });

  it("keeps the real payload", () => {
    const rels = collectFiles(dir).map((f: { rel: string }) => f.rel);
    expect(rels).toContain("manifest.json");
    expect(rels).toContain("popup.js");
  });

  it("returns nested files with a path relative to base", () => {
    const rels = collectFiles(dir).map((f: { rel: string }) => f.rel);
    expect(rels).toContain("icons/icon-16.png");
  });

  it("skips the contents of an excluded directory", () => {
    const rels = collectFiles(dir).map((f: { rel: string }) => f.rel);
    expect(rels.some((r: string) => r.includes("leftover.bin"))).toBe(false);
  });

  it("returns entries sorted by rel, so the zip is reproducible", () => {
    const rels = collectFiles(dir).map((f: { rel: string }) => f.rel);
    expect(rels).toEqual([...rels].sort());
  });

  it("reports a size for each entry", () => {
    for (const file of collectFiles(dir)) {
      expect(file.size).toBeGreaterThan(0);
    }
  });

  it("returns no directory entries", () => {
    const rels = collectFiles(dir).map((f: { rel: string }) => f.rel);
    expect(rels).not.toContain("icons");
  });
});
