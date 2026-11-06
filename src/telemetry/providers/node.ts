/**
 * Node config provider: persists the opt-out flag, the notice flag, and the
 * anonymous id in a JSON file.
 *
 * This is the only telemetry module that is Node-specific, which is why it
 * lives apart from the core and is imported by the CLI alone. It reuses the
 * existing `FsFacade` seam so tests run against an in-memory fake.
 *
 * Every read path degrades rather than throwing. A corrupt config file or a
 * read-only home directory must never be the reason a scan fails.
 */

import os from "node:os";
import path from "node:path";

import { nodeFs, type FsFacade } from "../../skills/fsFacade.js";
import { envOverride } from "../env.js";
import type { TelemetryConfigProvider } from "../types.js";

interface StoredConfig {
  telemetry?: {
    enabled?: boolean;
    noticeShown?: boolean;
    distinctId?: string;
  };
}

export interface NodeProviderOptions {
  fs?: FsFacade;
  /** Defaults to `$XDG_CONFIG_HOME/cloudtracer` or `~/.config/cloudtracer`. */
  configDir?: string;
  env?: Record<string, string | undefined>;
}

export function defaultConfigDir(
  env: Record<string, string | undefined> = process.env,
  homeDir: string = os.homedir(),
): string {
  const base = env.XDG_CONFIG_HOME?.trim() || path.join(homeDir, ".config");
  return path.join(base, "cloudtracer");
}

function randomId(): string {
  // Available on Node 20+ and in browsers; avoids a node:crypto import so the
  // shape stays consistent with the browser provider.
  const c: { randomUUID?: () => string } | undefined = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  // Non-cryptographic fallback. Only identity is required, not secrecy.
  return `anon-${Math.abs(Date.now() ^ 0x5f3759df).toString(36)}`;
}

export function createNodeConfigProvider(
  opts: NodeProviderOptions = {},
): TelemetryConfigProvider {
  const fs = opts.fs ?? nodeFs;
  const env = opts.env ?? process.env;
  const dir = opts.configDir ?? defaultConfigDir(env);
  const file = path.join(dir, "config.json");

  let cache: StoredConfig | undefined;

  async function read(): Promise<StoredConfig> {
    if (cache) return cache;
    let parsed: StoredConfig = {};
    try {
      const raw = await fs.readFile(file);
      if (raw) {
        const value: unknown = JSON.parse(raw);
        if (typeof value === "object" && value !== null) parsed = value as StoredConfig;
      }
    } catch {
      // Corrupt or unreadable: fall back to defaults. A broken config file is
      // not a reason to fail a scan.
      parsed = {};
    }
    cache = parsed;
    return parsed;
  }

  async function write(next: StoredConfig): Promise<void> {
    cache = next;
    await fs.mkdirp(dir);
    await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`);
  }

  return {
    async isEnabled(): Promise<boolean> {
      const forced = envOverride(env);
      if (forced !== undefined) return forced;
      const cfg = await read();
      // Absent means enabled: the agreed model is opt-out.
      return cfg.telemetry?.enabled !== false;
    },

    async setEnabled(enabled: boolean): Promise<void> {
      const cfg = await read();
      await write({ ...cfg, telemetry: { ...cfg.telemetry, enabled } });
    },

    async getDistinctId(): Promise<string> {
      const cfg = await read();
      const existing = cfg.telemetry?.distinctId;
      if (typeof existing === "string" && existing.length > 0) return existing;
      const id = randomId();
      try {
        await write({ ...cfg, telemetry: { ...cfg.telemetry, distinctId: id } });
      } catch {
        // Read-only home, sandbox, or full disk. Returning an unstable id is a
        // worse metric; crashing the CLI would be a worse product.
        cache = { ...cfg, telemetry: { ...cfg.telemetry, distinctId: id } };
      }
      return id;
    },

    async hasShownNotice(): Promise<boolean> {
      const cfg = await read();
      return cfg.telemetry?.noticeShown === true;
    },

    async markNoticeShown(): Promise<void> {
      const cfg = await read();
      try {
        await write({ ...cfg, telemetry: { ...cfg.telemetry, noticeShown: true } });
      } catch {
        // If we cannot persist it the notice reappears next run. Mildly
        // annoying, and still better than failing the command.
      }
    },
  };
}
