/**
 * CLI telemetry assembly: build-time config, provider, adapter, façade.
 *
 * `__POSTHOG_KEY__` and `__POSTHOG_HOST__` are substituted by tsup at build
 * time from the `POSTHOG_KEY` and `POSTHOG_HOST` environment variables. When
 * they are absent (local dev, a fork, a contributor build) they resolve to
 * empty strings, `selectAdapter` returns the noop adapter, and nothing is ever
 * sent. Only official release builds carry the key.
 *
 * The `typeof` guards matter: when a bundler has not defined the identifier at
 * all, referencing it directly is a runtime ReferenceError.
 */

import { createTelemetry, selectAdapter } from "./index.js";
import { createNodeConfigProvider } from "./providers/node.js";
import type { Telemetry, TelemetryConfigProvider } from "./types.js";

declare const __POSTHOG_KEY__: string | undefined;
declare const __POSTHOG_HOST__: string | undefined;

function buildKey(): string | undefined {
  return typeof __POSTHOG_KEY__ === "string" && __POSTHOG_KEY__ ? __POSTHOG_KEY__ : undefined;
}

function buildHost(): string | undefined {
  return typeof __POSTHOG_HOST__ === "string" && __POSTHOG_HOST__ ? __POSTHOG_HOST__ : undefined;
}

export interface CliTelemetry {
  telemetry: Telemetry;
  provider: TelemetryConfigProvider;
}

/** Wire up telemetry for a CLI process. Cheap: no I/O until first use. */
export function createCliTelemetry(): CliTelemetry {
  const provider = createNodeConfigProvider();
  const adapter = selectAdapter({ key: buildKey(), host: buildHost() });
  return { telemetry: createTelemetry({ adapter, provider }), provider };
}
