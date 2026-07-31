import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const execFileAsync = promisify(execFile);
const CLI_PATH = resolve(import.meta.dirname, "../dist/cli.js");
const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf-8"));

function run(...args: string[]) {
  return execFileAsync("node", [CLI_PATH, ...args], { timeout: 5000 });
}

function runExpectFail(...args: string[]) {
  return execFileAsync("node", [CLI_PATH, ...args], { timeout: 5000 }).then(
    () => {
      throw new Error("Expected command to fail");
    },
    (err) => err as { stdout: string; stderr: string; code: number },
  );
}

describe("CLI", () => {
  beforeAll(async () => {
    // Ensure the CLI is built
    const { existsSync } = await import("node:fs");
    if (!existsSync(CLI_PATH)) {
      throw new Error("dist/cli.js not found — run `pnpm build` first");
    }
  });

  it("should show help with --help, listing the scan and skill commands", async () => {
    const { stdout } = await run("--help");
    expect(stdout).toContain("cloudtracer");
    expect(stdout).toContain("Scan a website");
    expect(stdout).toContain("scan");
    expect(stdout).toContain("skill");
  });

  it("should show the scan options under `scan --help`", async () => {
    const { stdout } = await run("scan", "--help");
    expect(stdout).toContain("--json");
    expect(stdout).toContain("--yaml");
    expect(stdout).toContain("--markdown");
    expect(stdout).toContain("--verbose");
    expect(stdout).toContain("--timeout");
  });

  it("should show the skill installer under `skill --help`", async () => {
    const { stdout } = await run("skill", "--help");
    expect(stdout).toContain("Install, update, or uninstall");
    expect(stdout).toContain("install");
    expect(stdout).toContain("--check");
    expect(stdout).toContain("--target");
  });

  it("routes a bare domain to the scan command (rejects an invalid domain)", async () => {
    const err = await runExpectFail("bad domain");
    expect(err.stderr || err.stdout).toContain("Invalid domain");
  });

  it("should show version with --version", async () => {
    const { stdout } = await run("--version");
    expect(stdout.trim()).toBe(pkg.version);
  });

  it("should error when no domain is provided", async () => {
    const err = await runExpectFail();
    expect(err.stderr || err.stdout).toContain("missing required argument");
  });
});
