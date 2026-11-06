/**
 * Bridge from the skills command's loose tracking hook to the typed catalogue.
 *
 * `src/skills/index.ts` emits through
 * `(event: string, props?: Record<string, unknown>) => void`, which predates
 * this module and is deliberately not changed here: the skills orchestrator
 * should not have to know what analytics backend exists, and its call sites
 * are already well shaped.
 *
 * What that hook cannot do is uphold the no-domain guarantee, because its
 * props are open. So nothing is passed through. This maps a known event name
 * onto a typed event and hands it to the core, where `serializeEvent`
 * allowlists the properties. An unrecognised event name is dropped rather than
 * forwarded, so a new call site is silently ignored until it is mapped here on
 * purpose.
 */

import type { Telemetry, TelemetryEvent } from "./types.js";

/** The shape `runSkillsCommand` expects for `deps.track`. */
export type TrackFn = (event: string, props?: Record<string, unknown>) => void;

const MAPPED = new Set([
  "cli_command_invoked",
  "cli_skill_applied",
  "cli_skill_removed",
  "cli_error",
]);

/**
 * A `TrackFn` that forwards only mapped events into typed telemetry.
 *
 * Synchronous by signature, because that is what the skills module expects.
 * The underlying send is fire-and-forget; call `telemetry.flush()` before the
 * process exits to let it land.
 */
export function bridgeTrackFn(telemetry: Telemetry): TrackFn {
  return (event, props) => {
    if (!MAPPED.has(event)) return;

    // Cast is safe in exactly one direction: the name is checked above, and
    // every property is re-validated by serializeEvent before it is sent. The
    // props object is otherwise untrusted.
    const typed = {
      name: event,
      props: { ...(props ?? {}), surface: "cli" },
    } as unknown as TelemetryEvent;

    // Same reason as the `.catch` in index.ts: a detached promise that rejects
    // becomes an unhandled rejection, which Node escalates to a process-level
    // crash. The core's own `track` never rejects, but this bridge accepts any
    // Telemetry implementation, so it cannot assume that.
    void telemetry.track(typed).catch(() => {});
  };
}
