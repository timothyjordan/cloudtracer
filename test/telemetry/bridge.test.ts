import { describe, it, expect, vi } from "vitest";

import { bridgeTrackFn } from "../../src/telemetry/bridge.js";
import { serializeEvent } from "../../src/telemetry/index.js";
import type { Telemetry, TelemetryEvent } from "../../src/telemetry/types.js";

/**
 * The skills hook is `(event: string, props?: Record<string, unknown>) => void`,
 * so these tests exist to prove the open shape cannot defeat the no-domain
 * guarantee. Each case asks: if a call site added this tomorrow, would it leak?
 */

function captureTelemetry() {
  const events: TelemetryEvent[] = [];
  const telemetry: Telemetry = {
    track: async (e) => {
      events.push(e);
    },
    isEnabled: async () => true,
    setEnabled: async () => {},
    flush: async () => {},
  };
  return { telemetry, events, sent: () => events.map(serializeEvent) };
}

describe("bridgeTrackFn", () => {
  it("forwards a mapped event", () => {
    const c = captureTelemetry();
    bridgeTrackFn(c.telemetry)("cli_command_invoked", {
      command: "skill",
      action: "install",
      scope: "global",
      method: "copy",
      dry_run: false,
      force: false,
      target_count: 3,
      output_format: "text",
    });
    expect(c.sent()).toEqual([
      {
        surface: "cli",
        command: "skill",
        action: "install",
        scope: "global",
        method: "copy",
        dry_run: false,
        force: false,
        target_count: 3,
        output_format: "text",
      },
    ]);
  });

  it("drops an unmapped event name rather than forwarding it blind", () => {
    const c = captureTelemetry();
    bridgeTrackFn(c.telemetry)("cli_something_new", { anything: "at all" });
    expect(c.events).toHaveLength(0);
  });

  it("stamps the surface so events are attributable", () => {
    const c = captureTelemetry();
    bridgeTrackFn(c.telemetry)("cli_skill_removed", { removed: 2, skipped: 0, errors: 0 });
    expect(c.sent()[0].surface).toBe("cli");
  });

  it("drops a path, which is the realistic leak for a skills command", () => {
    const c = captureTelemetry();
    bridgeTrackFn(c.telemetry)("cli_skill_applied", {
      action: "install",
      created: 1,
      target_path: "/home/timothy/.claude/skills/cloudtracer/SKILL.md",
    });
    const sent = c.sent()[0];
    expect(sent).not.toHaveProperty("target_path");
    expect(JSON.stringify(sent)).not.toContain("timothy");
  });

  it("drops a domain smuggled into any field", () => {
    const c = captureTelemetry();
    bridgeTrackFn(c.telemetry)("cli_command_invoked", {
      command: "skill",
      action: "example.com",
      mode: "scan.example.com",
      domain: "example.com",
    });
    expect(JSON.stringify(c.sent()[0])).not.toContain("example.com");
  });

  it("keeps a real error class but drops a dotted one", () => {
    const c = captureTelemetry();
    const track = bridgeTrackFn(c.telemetry);
    track("cli_error", { command: "skill", phase: "fetch", error_class: "SkillFetchError" });
    track("cli_error", { command: "skill", phase: "fetch", error_class: "example.com" });
    expect(c.sent()[0].error_class).toBe("SkillFetchError");
    expect(c.sent()[1]).not.toHaveProperty("error_class");
  });

  it("keeps a semver version but drops a hostname in that field", () => {
    const c = captureTelemetry();
    const track = bridgeTrackFn(c.telemetry);
    track("cli_skill_applied", { action: "update", new_version: "1.4.2" });
    track("cli_skill_applied", { action: "update", new_version: "cloudtracer.dev" });
    expect(c.sent()[0].new_version).toBe("1.4.2");
    expect(c.sent()[1]).not.toHaveProperty("new_version");
  });

  it("drops a null version rather than emitting null", () => {
    const c = captureTelemetry();
    bridgeTrackFn(c.telemetry)("cli_skill_applied", { action: "install", new_version: null });
    expect(c.sent()[0]).not.toHaveProperty("new_version");
  });

  it("drops a run_id, which is not in the catalogue", () => {
    const c = captureTelemetry();
    bridgeTrackFn(c.telemetry)("cli_skill_removed", { removed: 1, run_id: "abc-123" });
    expect(c.sent()[0]).not.toHaveProperty("run_id");
  });

  it("rejects non-numeric and nonsense counts", () => {
    const c = captureTelemetry();
    bridgeTrackFn(c.telemetry)("cli_skill_removed", {
      removed: "many",
      skipped: Number.NaN,
      errors: -1,
    });
    const sent = c.sent()[0];
    expect(sent).not.toHaveProperty("removed");
    expect(sent).not.toHaveProperty("skipped");
    expect(sent).not.toHaveProperty("errors");
  });

  it("tolerates a call with no props at all", () => {
    const c = captureTelemetry();
    expect(() => bridgeTrackFn(c.telemetry)("cli_skill_removed")).not.toThrow();
    expect(c.sent()[0]).toEqual({ surface: "cli" });
  });

  it("never throws when telemetry itself rejects", () => {
    const telemetry: Telemetry = {
      track: () => Promise.reject(new Error("boom")),
      isEnabled: async () => true,
      setEnabled: async () => {},
      flush: async () => {},
    };
    expect(() => bridgeTrackFn(telemetry)("cli_skill_removed", { removed: 1 })).not.toThrow();
  });

  it("is synchronous, as the skills module expects", () => {
    const c = captureTelemetry();
    const result = bridgeTrackFn(c.telemetry)("cli_skill_removed", { removed: 1 });
    expect(result).toBeUndefined();
  });
});

describe("the real skills call sites survive the bridge", () => {
  // Mirrors the actual props emitted by src/skills/index.ts, so a change there
  // that would silently lose data shows up as a failure here.
  it("preserves everything cli_command_invoked actually sends", () => {
    const c = captureTelemetry();
    bridgeTrackFn(c.telemetry)("cli_command_invoked", {
      command: "skill",
      action: "install",
      scope: "global",
      mode: "detect",
      method: "link",
      dry_run: true,
      force: false,
      target_count: 4,
      output_format: "json",
      run_id: undefined,
    });
    const sent = c.sent()[0];
    expect(sent.mode).toBe("detect");
    expect(sent.method).toBe("link");
    expect(sent.dry_run).toBe(true);
    expect(sent.target_count).toBe(4);
    expect(sent.output_format).toBe("json");
  });

  it("preserves the uninstall variant with found instead of target_count", () => {
    const c = captureTelemetry();
    bridgeTrackFn(c.telemetry)("cli_command_invoked", {
      command: "skill",
      action: "uninstall",
      scope: "local",
      found: 2,
      dry_run: false,
      output_format: "text",
    });
    expect(c.sent()[0].found).toBe(2);
    expect(c.sent()[0].scope).toBe("local");
  });

  it("preserves the full cli_skill_applied counts", () => {
    const c = captureTelemetry();
    bridgeTrackFn(c.telemetry)("cli_skill_applied", {
      action: "update",
      method: "copy",
      created: 1,
      updated: 2,
      unchanged: 3,
      skipped: 0,
      errors: 0,
      new_version: "0.2.1",
    });
    expect(c.sent()[0]).toEqual({
      surface: "cli",
      action: "update",
      method: "copy",
      created: 1,
      updated: 2,
      unchanged: 3,
      skipped: 0,
      errors: 0,
      new_version: "0.2.1",
    });
  });
});

describe("serializeEvent spot checks for the new events", () => {
  it("never emits a bare string field that was not validated", () => {
    const evil = {
      name: "cli_error",
      props: {
        surface: "cli",
        error_class: "Error",
        message: "getaddrinfo ENOTFOUND internal.corp.example.com",
      },
    } as unknown as TelemetryEvent;
    expect(JSON.stringify(serializeEvent(evil))).not.toContain("example.com");
  });
});
