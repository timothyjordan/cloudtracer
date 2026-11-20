import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error validate-providers.mjs is a plain ESM Node script without d.ts
import { validateProvidersDir } from "../../scripts/validate-providers.mjs";

const tempDirs: string[] = [];

function createFixtureDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "cloudtracer-providers-"));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const body = typeof content === "string" ? content : JSON.stringify(content, null, 2);
    writeFileSync(join(dir, name), body, "utf8");
  }
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("provider registry validation", () => {
  it("validates the repository providers/ directory and generated.ts cleanly", () => {
    const result = validateProvidersDir(undefined, { checkGenerated: true });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.count).toBeGreaterThan(100);
  });

  it("rejects missing required fields and unknown properties", () => {
    const dir = createFixtureDir({
      "bad.json": { id: "bad", extra: true, dns: { patterns: ["*.bad.example"] } },
    });
    const result = validateProvidersDir(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: string) => e.includes('unknown property "extra"'))).toBe(true);
    expect(result.errors.some((e: string) => e.includes('"name"'))).toBe(true);
  });

  it("rejects filename and id mismatch", () => {
    const dir = createFixtureDir({
      "porkbun.json": {
        id: "porkbun_dns",
        name: "Porkbun",
        dns: { patterns: ["*.porkbun.com"] },
      },
    });
    const result = validateProvidersDir(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: string) => e.includes("must match filename"))).toBe(true);
  });

  it("rejects duplicate provider display names", () => {
    const dir = createFixtureDir({
      "heap.json": {
        id: "heap",
        name: "Heap",
        thirdparty: { scripts: ["cdn.heapanalytics.com"], category: "analytics" },
      },
      "heap_analytics.json": {
        id: "heap_analytics",
        name: "Heap",
        thirdparty: { scripts: ["other.heapanalytics.com"], category: "analytics" },
      },
    });
    const result = validateProvidersDir(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: string) => e.includes("Duplicate provider name"))).toBe(true);
  });

  it("rejects overlapping DNS patterns like the historical ns1/netlify collision", () => {
    const dir = createFixtureDir({
      "ns1.json": {
        id: "ns1",
        name: "NS1",
        dns: { patterns: ["dns*.p*.nsone.net"] },
      },
      "netlify.json": {
        id: "netlify",
        name: "Netlify",
        dns: { patterns: ["dns*.p*.nsone.net"] },
      },
    });
    const result = validateProvidersDir(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: string) => e.includes("Pattern collision in dns"))).toBe(true);
  });

  it("allows intentionally shared patterns when declared in shared_patterns", () => {
    const dir = createFixtureDir({
      "alpha.json": {
        id: "alpha",
        name: "Alpha",
        dns: { patterns: ["*.shared-ns.example"] },
      },
      "beta.json": {
        id: "beta",
        name: "Beta",
        shared_patterns: ["*.shared-ns.example"],
        dns: { patterns: ["*.shared-ns.example"] },
      },
    });
    const result = validateProvidersDir(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
