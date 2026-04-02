import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

describe("npm pack contents", () => {
  it("should include required dist files", async () => {
    const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json"], {
      timeout: 10000,
    });
    const [result] = JSON.parse(stdout) as [{ files: { path: string }[] }];
    const paths = result.files.map((f) => f.path);

    expect(paths).toContain("dist/cli.js");
    expect(paths).toContain("dist/index.js");
    expect(paths).toContain("dist/index.d.ts");
  });

  it("should not include source or test files", async () => {
    const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json"], {
      timeout: 10000,
    });
    const [result] = JSON.parse(stdout) as [{ files: { path: string }[] }];
    const paths = result.files.map((f) => f.path);

    const hasSrc = paths.some((p) => p.startsWith("src/"));
    const hasTest = paths.some((p) => p.startsWith("test/"));
    const hasNodeModules = paths.some((p) => p.startsWith("node_modules/"));

    expect(hasSrc).toBe(false);
    expect(hasTest).toBe(false);
    expect(hasNodeModules).toBe(false);
  });
});
