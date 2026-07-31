import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Resolve the packed file list once. `npm pack --dry-run` spawns a subprocess
// that can take several seconds under a loaded, concurrent test run, so we run
// it a single time in a hook with a generous timeout rather than per-test.
describe("npm pack contents", () => {
  let paths: string[];

  beforeAll(async () => {
    const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json"], {
      timeout: 60000,
    });
    const [result] = JSON.parse(stdout) as [{ files: { path: string }[] }];
    paths = result.files.map((f) => f.path);
  }, 60000);

  it("should include required dist files", () => {
    expect(paths).toContain("dist/cli.js");
    expect(paths).toContain("dist/index.js");
    expect(paths).toContain("dist/index.d.ts");
  });

  it("should not include source or test files", () => {
    const hasSrc = paths.some((p) => p.startsWith("src/"));
    const hasTest = paths.some((p) => p.startsWith("test/"));
    const hasNodeModules = paths.some((p) => p.startsWith("node_modules/"));

    expect(hasSrc).toBe(false);
    expect(hasTest).toBe(false);
    expect(hasNodeModules).toBe(false);
  });
});
