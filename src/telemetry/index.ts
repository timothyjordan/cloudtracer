/**
 * Telemetry façade, shared by the CLI and the Chrome extension.
 *
 * Two invariants hold here regardless of configuration:
 *
 * 1. A build with no injected key sends nothing, because `selectAdapter`
 *    returns the noop adapter.
 * 2. A user who has opted out sends nothing, because `track` checks the
 *    provider before touching the adapter.
 *
 * Both are tested. The second fails closed: if the provider cannot be read,
 * we treat that as "do not send" rather than as consent.
 */

import { createNoopAdapter } from "./adapters/noop.js";
import { createPostHogAdapter, type FetchImpl } from "./adapters/posthog.js";
import type {
  Telemetry,
  TelemetryAdapter,
  TelemetryBuildConfig,
  TelemetryConfigProvider,
  TelemetryEvent,
} from "./types.js";

export { serializeEvent } from "./serialize.js";
export { createNoopAdapter } from "./adapters/noop.js";
export { createPostHogAdapter } from "./adapters/posthog.js";
export type * from "./types.js";

/**
 * Choose a transport from build-time config. Both a key and a host are
 * required: a key alone cannot be routed, and inferring a region would turn a
 * misconfiguration into silently discarded data.
 */
export function selectAdapter(
  config: TelemetryBuildConfig,
  deps: { fetchImpl?: FetchImpl; timeoutMs?: number } = {},
): TelemetryAdapter {
  if (!config.key || !config.host) return createNoopAdapter();
  return createPostHogAdapter({
    key: config.key,
    host: config.host,
    fetchImpl: deps.fetchImpl,
    timeoutMs: deps.timeoutMs,
  });
}

export function createTelemetry(deps: {
  adapter: TelemetryAdapter;
  provider: TelemetryConfigProvider;
}): Telemetry {
  const { adapter, provider } = deps;

  return {
    async track(event: TelemetryEvent): Promise<void> {
      try {
        if (!(await provider.isEnabled())) return;
        const distinctId = await provider.getDistinctId();
        // Not awaited: a scan must never wait on analytics. `flush` is the
        // hook for short-lived processes that need the send to land.
        //
        // The `.catch` is load-bearing, not defensive noise. Without it a
        // rejecting adapter produces an unhandled rejection, which Node turns
        // into a process-level crash: telemetry would take down the scan it is
        // supposed to be silently observing. The PostHog adapter swallows its
        // own failures, so this guards custom and future adapters.
        void adapter.capture(event, distinctId).catch(() => {});
      } catch {
        // Fail closed and stay silent.
      }
    },

    async isEnabled(): Promise<boolean> {
      try {
        return await provider.isEnabled();
      } catch {
        return false;
      }
    },

    async setEnabled(enabled: boolean): Promise<void> {
      await provider.setEnabled(enabled);
    },

    async flush(): Promise<void> {
      try {
        await adapter.flush();
      } catch {
        // Nothing actionable.
      }
    },
  };
}
