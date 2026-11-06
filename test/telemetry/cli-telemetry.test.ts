import { describe, it, expect, vi } from "vitest";

import { envOverride } from "../../src/telemetry/env.js";
import {
  classifyError,
  durationBucket,
  resolvedScanners,
} from "../../src/telemetry/derive.js";
import {
  createNodeConfigProvider,
  defaultConfigDir,
} from "../../src/telemetry/providers/node.js";
import { maybeShowNotice, NOTICE_TEXT } from "../../src/telemetry/notice.js";
import { createTelemetry, createNoopAdapter } from "../../src/telemetry/index.js";
import type { FsFacade } from "../../src/skills/fsFacade.js";
import type { ScanResult } from "../../src/types.js";

/** Tests authored from test/telemetry/specs/cli-telemetry.spec.md. */

/** In-memory FsFacade. Only the methods the provider uses need to work. */
function fakeFs(seed: Record<string, string> = {}): FsFacade & { files: Record<string, string> } {
  const files = { ...seed };
  return {
    files,
    readFile: async (p) => files[p] ?? null,
    writeFile: async (p, c) => {
      files[p] = c;
    },
    mkdirp: async () => {},
    lstat: async () => null,
    readlink: async () => null,
    symlink: async () => {},
    rm: async () => {},
    dirExists: async () => false,
  };
}

describe("envOverride", () => {
  it("honours DO_NOT_TRACK", () => {
    expect(envOverride({ DO_NOT_TRACK: "1" })).toBe(false);
    expect(envOverride({ DO_NOT_TRACK: "true" })).toBe(false);
  });

  it("forces off in CI", () => {
    expect(envOverride({ CI: "true" })).toBe(false);
    expect(envOverride({ CI: "1" })).toBe(false);
  });

  it("lets an explicit tool opt-in beat CI detection", () => {
    expect(envOverride({ CLOUDTRACER_TELEMETRY: "1", CI: "true" })).toBe(true);
  });

  it("honours an explicit tool opt-out", () => {
    expect(envOverride({ CLOUDTRACER_TELEMETRY: "0", DO_NOT_TRACK: "0" })).toBe(false);
  });

  it("treats DO_NOT_TRACK=0 as no opinion, not as opt-in", () => {
    expect(envOverride({ DO_NOT_TRACK: "0" })).toBeUndefined();
  });

  it("defers to config when the environment is silent", () => {
    expect(envOverride({})).toBeUndefined();
  });

  it("never throws", () => {
    expect(() => envOverride({} as Record<string, string>)).not.toThrow();
  });
});

describe("durationBucket", () => {
  it("maps each boundary to the documented bucket", () => {
    expect(durationBucket(0)).toBe("<1s");
    expect(durationBucket(999)).toBe("<1s");
    expect(durationBucket(1000)).toBe("1-3s");
    expect(durationBucket(2999)).toBe("1-3s");
    expect(durationBucket(3000)).toBe("3-10s");
    expect(durationBucket(9999)).toBe("3-10s");
    expect(durationBucket(10000)).toBe(">10s");
    expect(durationBucket(999999)).toBe(">10s");
  });
});

describe("resolvedScanners", () => {
  it("reports only the scanners that produced data", () => {
    const result = { dns: {}, cdn: {} } as unknown as ScanResult;
    expect(resolvedScanners(result)).toEqual(["dns", "cdn"]);
  });

  it("uses scanner names, not result field names", () => {
    const result = { registration: {}, thirdPartyServices: [{}] } as unknown as ScanResult;
    const out = resolvedScanners(result);
    expect(out).toContain("domain");
    expect(out).toContain("thirdparty");
    expect(out).not.toContain("registration");
  });

  it("counts an empty thirdPartyServices array as resolved", () => {
    const result = { thirdPartyServices: [] } as unknown as ScanResult;
    expect(resolvedScanners(result)).toEqual(["thirdparty"]);
  });

  it("returns a stable order across identical scans", () => {
    const a = { cdn: {}, dns: {}, ssl: {} } as unknown as ScanResult;
    expect(resolvedScanners(a)).toEqual(resolvedScanners(a));
    expect(resolvedScanners(a)).toEqual(["dns", "cdn", "ssl"]);
  });

  it("never carries the domain or timestamp", () => {
    const result = {
      domain: "example.com",
      scannedAt: "2026-01-01T00:00:00Z",
      dns: {},
    } as unknown as ScanResult;
    expect(JSON.stringify(resolvedScanners(result))).not.toContain("example.com");
  });

  it("is total for empty and missing input", () => {
    expect(resolvedScanners({})).toEqual([]);
    expect(resolvedScanners(undefined)).toEqual([]);
  });
});

describe("classifyError", () => {
  it("returns a fixed category, never the message", () => {
    const err = new Error("getaddrinfo ENOTFOUND secret-internal.example.com");
    expect(classifyError(err)).toBe("dns_failure");
    expect(classifyError(err)).not.toContain("example.com");
  });

  it("classifies timeouts, including AbortError", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(classifyError(abort)).toBe("timeout");
    expect(classifyError(new Error("Request timed out"))).toBe("timeout");
  });

  it("classifies network failures", () => {
    expect(classifyError(new Error("fetch failed"))).toBe("network");
    expect(classifyError(new Error("connect ECONNREFUSED"))).toBe("network");
  });

  it("falls back to unexpected for anything else", () => {
    expect(classifyError(new Error("something odd"))).toBe("unexpected");
    expect(classifyError("a string")).toBe("unexpected");
    expect(classifyError(undefined)).toBe("unexpected");
  });
});

describe("createNodeConfigProvider", () => {
  const dir = "/cfg/cloudtracer";
  const file = `${dir}/config.json`;

  it("defaults to enabled, since the model is opt-out", async () => {
    const p = createNodeConfigProvider({ fs: fakeFs(), configDir: dir, env: {} });
    expect(await p.isEnabled()).toBe(true);
  });

  it("returns a stable anonymous id", async () => {
    const p = createNodeConfigProvider({ fs: fakeFs(), configDir: dir, env: {} });
    const first = await p.getDistinctId();
    expect(first).toBeTruthy();
    expect(await p.getDistinctId()).toBe(first);
  });

  it("does not derive the id from the home directory or config path", async () => {
    const p = createNodeConfigProvider({ fs: fakeFs(), configDir: dir, env: {} });
    const id = await p.getDistinctId();
    expect(id).not.toContain("cloudtracer");
    expect(id).not.toContain("cfg");
  });

  it("persists an opt-out across processes", async () => {
    const fs = fakeFs();
    await createNodeConfigProvider({ fs, configDir: dir, env: {} }).setEnabled(false);
    const fresh = createNodeConfigProvider({ fs, configDir: dir, env: {} });
    expect(await fresh.isEnabled()).toBe(false);
  });

  it("round-trips the notice flag", async () => {
    const fs = fakeFs();
    const p = createNodeConfigProvider({ fs, configDir: dir, env: {} });
    expect(await p.hasShownNotice()).toBe(false);
    await p.markNoticeShown();
    expect(await createNodeConfigProvider({ fs, configDir: dir, env: {} }).hasShownNotice()).toBe(
      true,
    );
  });

  it("falls back to defaults on a corrupt config file", async () => {
    const p = createNodeConfigProvider({
      fs: fakeFs({ [file]: "not json" }),
      configDir: dir,
      env: {},
    });
    await expect(p.isEnabled()).resolves.toBe(true);
    await expect(p.hasShownNotice()).resolves.toBe(false);
  });

  it("survives an unwritable config directory", async () => {
    const fs = fakeFs();
    fs.writeFile = async () => {
      throw new Error("EROFS: read-only file system");
    };
    const p = createNodeConfigProvider({ fs, configDir: dir, env: {} });
    await expect(p.getDistinctId()).resolves.toBeTruthy();
    await expect(p.markNoticeShown()).resolves.toBeUndefined();
  });

  it("lets the environment override stored config", async () => {
    const fs = fakeFs();
    await createNodeConfigProvider({ fs, configDir: dir, env: {} }).setEnabled(true);
    const p = createNodeConfigProvider({ fs, configDir: dir, env: { DO_NOT_TRACK: "1" } });
    expect(await p.isEnabled()).toBe(false);
  });
});

describe("defaultConfigDir", () => {
  it("prefers XDG_CONFIG_HOME", () => {
    expect(defaultConfigDir({ XDG_CONFIG_HOME: "/xdg" }, "/home/u")).toBe("/xdg/cloudtracer");
  });

  it("falls back to ~/.config", () => {
    expect(defaultConfigDir({}, "/home/u")).toBe("/home/u/.config/cloudtracer");
  });
});

describe("maybeShowNotice", () => {
  function setup(opts: { enabled?: boolean; shown?: boolean } = {}) {
    let shown = opts.shown ?? false;
    const provider = {
      isEnabled: async () => opts.enabled ?? true,
      setEnabled: async () => {},
      getDistinctId: async () => "anon-1",
      hasShownNotice: async () => shown,
      markNoticeShown: async () => {
        shown = true;
      },
    };
    const telemetry = createTelemetry({ adapter: createNoopAdapter(), provider });
    const write = vi.fn();
    return { provider, telemetry, write, shown: () => shown };
  }

  it("writes the notice once, then never again", async () => {
    const s = setup();
    await maybeShowNotice({ telemetry: s.telemetry, provider: s.provider, write: s.write });
    expect(s.write).toHaveBeenCalledTimes(1);
    await maybeShowNotice({ telemetry: s.telemetry, provider: s.provider, write: s.write });
    expect(s.write).toHaveBeenCalledTimes(1);
  });

  it("says what is collected, that the domain is not, and how to opt out", () => {
    expect(NOTICE_TEXT).toContain("anonymous");
    expect(NOTICE_TEXT).toContain("never sent");
    expect(NOTICE_TEXT).toContain("cloudtracer telemetry off");
    expect(NOTICE_TEXT).toContain("DO_NOT_TRACK");
  });

  it("stays silent when telemetry is already off", async () => {
    const s = setup({ enabled: false });
    await maybeShowNotice({ telemetry: s.telemetry, provider: s.provider, write: s.write });
    expect(s.write).not.toHaveBeenCalled();
  });

  it("does not throw when the provider fails", async () => {
    const provider = {
      isEnabled: async () => true,
      setEnabled: async () => {},
      getDistinctId: async () => "anon-1",
      hasShownNotice: async () => {
        throw new Error("unreadable");
      },
      markNoticeShown: async () => {},
    };
    const telemetry = createTelemetry({ adapter: createNoopAdapter(), provider });
    await expect(
      maybeShowNotice({ telemetry, provider, write: vi.fn() }),
    ).resolves.toBeUndefined();
  });
});
