/**
 * Extension telemetry: a `chrome.storage.local` config provider plus assembly.
 *
 * This lives in `extension/src/` rather than `src/` because it touches the
 * `chrome.*` APIs, which keeps the shared core free of browser globals. It is
 * the same arrangement the popup already uses to reach `src/browser-entry.js`.
 *
 * `__POSTHOG_KEY__` and `__POSTHOG_HOST__` are substituted by esbuild at build
 * time. Absent (a local `npm run build:ext`, a fork, a contributor build) they
 * resolve to empty strings, the core selects its noop adapter, and nothing is
 * ever sent. The `typeof` guard matters because an undefined identifier is a
 * runtime ReferenceError, not `undefined`.
 */

import {
  createTelemetry,
  selectAdapter,
  type Telemetry,
  type TelemetryConfigProvider,
} from "../../src/telemetry/index.js";

declare const __POSTHOG_KEY__: string | undefined;
declare const __POSTHOG_HOST__: string | undefined;

const ENABLED_KEY = "telemetryEnabled";
const NOTICE_KEY = "telemetryNoticeShown";
const ID_KEY = "telemetryDistinctId";

function buildKey(): string | undefined {
  return typeof __POSTHOG_KEY__ === "string" && __POSTHOG_KEY__ ? __POSTHOG_KEY__ : undefined;
}

function buildHost(): string | undefined {
  return typeof __POSTHOG_HOST__ === "string" && __POSTHOG_HOST__ ? __POSTHOG_HOST__ : undefined;
}

/** Promise wrapper over the callback-style storage API. Resolves `{}` on error. */
function get(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (items) => resolve(items ?? {}));
    } catch {
      resolve({});
    }
  });
}

function set(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(items, () => resolve());
    } catch {
      resolve();
    }
  });
}

function randomId(): string {
  const c: { randomUUID?: () => string } | undefined = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  return `anon-${Math.abs(Date.now() ^ 0x5f3759df).toString(36)}`;
}

export function createBrowserConfigProvider(): TelemetryConfigProvider {
  return {
    async isEnabled(): Promise<boolean> {
      const items = await get([ENABLED_KEY]);
      // Absent means enabled: the agreed model is opt-out.
      return items[ENABLED_KEY] !== false;
    },

    async setEnabled(enabled: boolean): Promise<void> {
      await set({ [ENABLED_KEY]: enabled });
    },

    async getDistinctId(): Promise<string> {
      const items = await get([ID_KEY]);
      const existing = items[ID_KEY];
      if (typeof existing === "string" && existing.length > 0) return existing;
      const id = randomId();
      await set({ [ID_KEY]: id });
      return id;
    },

    async hasShownNotice(): Promise<boolean> {
      const items = await get([NOTICE_KEY]);
      return items[NOTICE_KEY] === true;
    },

    async markNoticeShown(): Promise<void> {
      await set({ [NOTICE_KEY]: true });
    },
  };
}

export interface ExtensionTelemetry {
  telemetry: Telemetry;
  provider: TelemetryConfigProvider;
}

export function createExtensionTelemetry(): ExtensionTelemetry {
  const provider = createBrowserConfigProvider();
  const adapter = selectAdapter({ key: buildKey(), host: buildHost() });
  return { telemetry: createTelemetry({ adapter, provider }), provider };
}
