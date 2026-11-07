import { describe, it, expect, afterEach } from "vitest";

import { serializeEvent } from "../../src/telemetry/index.js";
import { createBrowserConfigProvider } from "../../extension/src/telemetry.js";
import type { TelemetryEvent } from "../../src/telemetry/types.js";

/** Tests authored from test/telemetry/specs/extension-telemetry.spec.md. */

type Store = Record<string, unknown>;

/**
 * Minimal `chrome.storage.local` stand-in. The provider is written against the
 * callback API, so the fake has to be callback-shaped too.
 */
function installChrome(opts: { store?: Store; throwOnGet?: boolean; throwOnSet?: boolean } = {}) {
  const store: Store = opts.store ?? {};
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local: {
        get(keys: string[], cb: (items: Store) => void) {
          if (opts.throwOnGet) throw new Error("storage unavailable");
          const out: Store = {};
          for (const k of keys) if (k in store) out[k] = store[k];
          cb(out);
        },
        set(items: Store, cb: () => void) {
          if (opts.throwOnSet) throw new Error("storage unavailable");
          Object.assign(store, items);
          cb();
        },
      },
    },
  };
  return store;
}

function removeChrome() {
  delete (globalThis as { chrome?: unknown }).chrome;
}

/**
 * A new provider per call. It holds no module-level state: every method reads
 * the `chrome` global at call time, which is what makes the absent-chrome case
 * testable at all.
 */
async function freshProvider() {
  return createBrowserConfigProvider();
}

afterEach(removeChrome);

describe("createBrowserConfigProvider", () => {
  it("defaults to enabled, since the model is opt-out", async () => {
    installChrome();
    expect(await (await freshProvider()).isEnabled()).toBe(true);
  });

  it("treats only an explicit stored false as disabled", async () => {
    installChrome({ store: { telemetryEnabled: false } });
    expect(await (await freshProvider()).isEnabled()).toBe(false);
  });

  it("does not read a junk value as an opt-out", async () => {
    installChrome({ store: { telemetryEnabled: "nope" } });
    expect(await (await freshProvider()).isEnabled()).toBe(true);
  });

  it("returns a stable anonymous id", async () => {
    installChrome();
    const p = await freshProvider();
    const first = await p.getDistinctId();
    expect(first).toBeTruthy();
    expect(await p.getDistinctId()).toBe(first);
  });

  it("does not derive the id from storage keys or the extension", async () => {
    installChrome();
    const id = await (await freshProvider()).getDistinctId();
    expect(id).not.toContain("telemetry");
    expect(id).not.toContain("cloudtracer");
  });

  it("persists an opt-out into a later popup session", async () => {
    const store = installChrome();
    await (await freshProvider()).setEnabled(false);
    expect(store.telemetryEnabled).toBe(false);
    expect(await (await freshProvider()).isEnabled()).toBe(false);
  });

  it("round-trips the notice flag", async () => {
    installChrome();
    const p = await freshProvider();
    expect(await p.hasShownNotice()).toBe(false);
    await p.markNoticeShown();
    expect(await (await freshProvider()).hasShownNotice()).toBe(true);
  });

  it("survives a storage layer that throws on read", async () => {
    installChrome({ throwOnGet: true });
    const p = await freshProvider();
    await expect(p.isEnabled()).resolves.toBe(true);
    await expect(p.hasShownNotice()).resolves.toBe(false);
    await expect(p.getDistinctId()).resolves.toBeTruthy();
  });

  it("survives a storage layer that throws on write", async () => {
    installChrome({ throwOnSet: true });
    const p = await freshProvider();
    await expect(p.setEnabled(false)).resolves.toBeUndefined();
    await expect(p.markNoticeShown()).resolves.toBeUndefined();
  });

  it("resolves even with chrome entirely absent", async () => {
    removeChrome();
    const p = await freshProvider();
    await expect(p.isEnabled()).resolves.toBe(true);
    await expect(p.getDistinctId()).resolves.toBeTruthy();
    await expect(p.setEnabled(false)).resolves.toBeUndefined();
  });
});

describe("extension event payloads", () => {
  it("reports popup_opened with the surface and nothing else", () => {
    const out = serializeEvent({
      name: "popup_opened",
      props: { surface: "extension" },
    });
    expect(out).toEqual({ surface: "extension" });
  });

  it("drops has_domain, so the payload says nothing about the web resource", () => {
    // Chrome defines web browsing activity as any information about the
    // websites a user interacts with. A boolean identifies nothing, but it is
    // not worth defending in review, so it must not survive serialization.
    const legacy = {
      name: "popup_opened",
      props: { surface: "extension", has_domain: true },
    } as unknown as TelemetryEvent;
    expect(serializeEvent(legacy)).toEqual({ surface: "extension" });
  });

  it("keeps a known control and drops an unknown one", () => {
    expect(
      serializeEvent({ name: "ui_clicked", props: { surface: "extension", control: "rescan" } })
        .control,
    ).toBe("rescan");

    const bogus = {
      name: "ui_clicked",
      props: { surface: "extension", control: "exfiltrate" },
    } as unknown as TelemetryEvent;
    expect(serializeEvent(bogus)).not.toHaveProperty("control");
  });

  it("drops a domain attached to any extension event", () => {
    for (const name of ["popup_opened", "ui_clicked", "scan_completed"]) {
      const evil = {
        name,
        props: {
          surface: "extension",
          has_domain: true,
          control: "rescan",
          domain: "example.com",
          tab_url: "https://example.com/private",
          duration: "<1s",
          resolved: ["dns"],
        },
      } as unknown as TelemetryEvent;
      const json = JSON.stringify(serializeEvent(evil));
      expect(json).not.toContain("example.com");
      expect(json).not.toContain("private");
    }
  });

  it("reports extension scans in the same shape as CLI scans", () => {
    const out = serializeEvent({
      name: "scan_completed",
      props: { surface: "extension", resolved: ["dns", "ssl"], duration: "1-3s" },
    });
    expect(out).toEqual({
      surface: "extension",
      resolved: ["dns", "ssl"],
      duration: "1-3s",
    });
  });
});
