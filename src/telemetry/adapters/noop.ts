import type { TelemetryAdapter } from "../types.js";

/**
 * The adapter used whenever telemetry is disabled or unconfigured, which is
 * the default for local dev builds, forks, and any build without an injected
 * key. It performs no network request of any kind.
 */
export function createNoopAdapter(): TelemetryAdapter {
  return {
    capture: () => Promise.resolve(),
    flush: () => Promise.resolve(),
  };
}
