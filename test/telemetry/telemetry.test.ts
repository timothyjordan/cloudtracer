import { describe, it, expect, vi } from "vitest";

import {
  createNoopAdapter,
  createPostHogAdapter,
  createTelemetry,
  selectAdapter,
  serializeEvent,
} from "../../src/telemetry/index.js";
import type {
  TelemetryConfigProvider,
  TelemetryEvent,
} from "../../src/telemetry/types.js";

/**
 * Tests authored from test/telemetry/specs/telemetry.spec.md.
 *
 * The load-bearing properties: an unconfigured or opted-out build sends
 * nothing, and no event can carry the scanned domain.
 */

const scanEvent: TelemetryEvent = {
  name: "scan_completed",
  props: {
    surface: "cli",
    format: "json",
    resolved: ["dns", "cdn"],
    duration: "1-3s",
  },
};

function okFetch() {
  return vi.fn(async () => ({ ok: true, status: 200 }));
}

function provider(overrides: Partial<TelemetryConfigProvider> = {}): TelemetryConfigProvider {
  return {
    isEnabled: async () => true,
    setEnabled: async () => {},
    getDistinctId: async () => "anon-123",
    hasShownNotice: async () => true,
    markNoticeShown: async () => {},
    ...overrides,
  };
}

describe("serializeEvent", () => {
  it("keeps the declared properties", () => {
    expect(serializeEvent(scanEvent)).toEqual({
      surface: "cli",
      format: "json",
      resolved: ["dns", "cdn"],
      duration: "1-3s",
    });
  });

  it("drops an undeclared key, even a domain smuggled in via any", () => {
    const sneaky = {
      name: "scan_completed",
      props: { ...scanEvent.props, domain: "example.com" },
    } as unknown as TelemetryEvent;
    const out = serializeEvent(sneaky);
    expect(out).not.toHaveProperty("domain");
    expect(JSON.stringify(out)).not.toContain("example.com");
  });

  it("drops a declared key whose value is not an allowed literal", () => {
    const bad = {
      name: "scan_completed",
      props: { ...scanEvent.props, format: "example.com" },
    } as unknown as TelemetryEvent;
    expect(serializeEvent(bad)).not.toHaveProperty("format");
  });

  it("filters unknown scanner names out of resolved", () => {
    const bad = {
      name: "scan_completed",
      props: { ...scanEvent.props, resolved: ["dns", "example.com", "cdn"] },
    } as unknown as TelemetryEvent;
    expect(serializeEvent(bad).resolved).toEqual(["dns", "cdn"]);
  });

  it("keeps only the error kind for error events", () => {
    const out = serializeEvent({
      name: "error",
      props: { surface: "extension", kind: "timeout" },
    });
    expect(out).toEqual({ surface: "extension", kind: "timeout" });
  });

  it("never throws for malformed input", () => {
    for (const input of [{}, { props: null }, { name: "nope" }, null, undefined]) {
      expect(() => serializeEvent(input as unknown as TelemetryEvent)).not.toThrow();
    }
  });
});

describe("createNoopAdapter", () => {
  it("performs no network request", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const adapter = createNoopAdapter();
    await adapter.capture(scanEvent, "anon-123");
    await adapter.flush();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("selectAdapter", () => {
  it("returns a silent adapter with no key", async () => {
    const fetchImpl = okFetch();
    await selectAdapter({}, { fetchImpl }).capture(scanEvent, "anon-123");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a silent adapter when a key has no host", async () => {
    const fetchImpl = okFetch();
    await selectAdapter({ key: "phc_x" }, { fetchImpl }).capture(scanEvent, "anon-123");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a sending adapter when both key and host are present", async () => {
    const fetchImpl = okFetch();
    await selectAdapter(
      { key: "phc_x", host: "https://us.i.posthog.com" },
      { fetchImpl },
    ).capture(scanEvent, "anon-123");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("createPostHogAdapter", () => {
  it("posts to the capture endpoint on the configured host, verbatim", async () => {
    const fetchImpl = okFetch();
    await createPostHogAdapter({
      key: "phc_x",
      host: "https://us.i.posthog.com",
      fetchImpl,
    }).capture(scanEvent, "anon-123");

    expect(fetchImpl.mock.calls[0][0]).toBe("https://us.i.posthog.com/i/v0/e/");
  });

  it("does not rewrite an EU host to US or vice versa", async () => {
    const fetchImpl = okFetch();
    await createPostHogAdapter({
      key: "phc_x",
      host: "https://eu.i.posthog.com",
      fetchImpl,
    }).capture(scanEvent, "anon-123");

    expect(fetchImpl.mock.calls[0][0]).toBe("https://eu.i.posthog.com/i/v0/e/");
  });

  it("sends api_key, event, distinct_id and serialized properties", async () => {
    const fetchImpl = okFetch();
    await createPostHogAdapter({
      key: "phc_secret",
      host: "https://us.i.posthog.com",
      fetchImpl,
    }).capture(scanEvent, "anon-123");

    const body = JSON.parse(fetchImpl.mock.calls[0][1]!.body as string);
    expect(body.api_key).toBe("phc_secret");
    expect(body.event).toBe("scan_completed");
    expect(body.distinct_id).toBe("anon-123");
    expect(body.properties.format).toBe("json");
  });

  it("resolves when the request rejects", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(
      createPostHogAdapter({
        key: "phc_x",
        host: "https://us.i.posthog.com",
        fetchImpl: fetchImpl as never,
      }).capture(scanEvent, "anon-123"),
    ).resolves.toBeUndefined();
  });

  it("resolves on a non-2xx response", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401 }));
    await expect(
      createPostHogAdapter({
        key: "phc_x",
        host: "https://us.i.posthog.com",
        fetchImpl,
      }).capture(scanEvent, "anon-123"),
    ).resolves.toBeUndefined();
  });
});

describe("createTelemetry", () => {
  it("sends nothing when the user has opted out", async () => {
    const fetchImpl = okFetch();
    const t = createTelemetry({
      adapter: selectAdapter({ key: "phc_x", host: "https://us.i.posthog.com" }, { fetchImpl }),
      provider: provider({ isEnabled: async () => false }),
    });
    await t.track(scanEvent);
    await t.flush();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends one event per track when enabled", async () => {
    const fetchImpl = okFetch();
    const t = createTelemetry({
      adapter: selectAdapter({ key: "phc_x", host: "https://us.i.posthog.com" }, { fetchImpl }),
      provider: provider(),
    });
    await t.track(scanEvent);
    await t.track(scanEvent);
    await t.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("attaches the provider's anonymous distinct id", async () => {
    const fetchImpl = okFetch();
    const t = createTelemetry({
      adapter: selectAdapter({ key: "phc_x", host: "https://us.i.posthog.com" }, { fetchImpl }),
      provider: provider({ getDistinctId: async () => "anon-xyz" }),
    });
    await t.track(scanEvent);
    await t.flush();
    const body = JSON.parse(fetchImpl.mock.calls[0][1]!.body as string);
    expect(body.distinct_id).toBe("anon-xyz");
  });

  it("stops sending immediately after setEnabled(false)", async () => {
    const fetchImpl = okFetch();
    let enabled = true;
    const t = createTelemetry({
      adapter: selectAdapter({ key: "phc_x", host: "https://us.i.posthog.com" }, { fetchImpl }),
      provider: provider({
        isEnabled: async () => enabled,
        setEnabled: async (v) => {
          enabled = v;
        },
      }),
    });
    await t.setEnabled(false);
    await t.track(scanEvent);
    await t.flush();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when the provider throws, sending nothing", async () => {
    const fetchImpl = okFetch();
    const t = createTelemetry({
      adapter: selectAdapter({ key: "phc_x", host: "https://us.i.posthog.com" }, { fetchImpl }),
      provider: provider({
        isEnabled: async () => {
          throw new Error("unreadable config");
        },
      }),
    });
    await expect(t.track(scanEvent)).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await t.isEnabled()).toBe(false);
  });

  it("never throws out of track", async () => {
    const t = createTelemetry({
      adapter: {
        capture: () => Promise.reject(new Error("boom")),
        flush: () => Promise.reject(new Error("boom")),
      },
      provider: provider(),
    });
    await expect(t.track(scanEvent)).resolves.toBeUndefined();
    await expect(t.flush()).resolves.toBeUndefined();
  });
});
