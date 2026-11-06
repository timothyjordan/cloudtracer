/**
 * Event serialization, and the runtime half of the no-domain guarantee.
 *
 * The types in `types.ts` already make it impossible to pass a hostname
 * through a well-typed call. This module is the backstop for anything that
 * reaches the core through `as any`, a JSON boundary, or a future refactor:
 * it is an allowlist, not a passthrough. A key the schema does not name is
 * dropped, and a named key whose value is not one of the permitted literals is
 * dropped rather than coerced.
 */

import type {
  DurationBucket,
  ErrorKind,
  OutputFormat,
  ScannerName,
  SerializedProps,
  Surface,
  TelemetryEvent,
} from "./types.js";

const SURFACES: readonly Surface[] = ["cli", "extension"];

const OUTPUT_FORMATS: readonly OutputFormat[] = ["tree", "json", "yaml", "markdown"];

const SCANNERS: readonly ScannerName[] = [
  "domain",
  "dns",
  "cdn",
  "hosting",
  "ssl",
  "performance",
  "email",
  "thirdparty",
];

const DURATIONS: readonly DurationBucket[] = ["<1s", "1-3s", "3-10s", ">10s"];

const ERROR_KINDS: readonly ErrorKind[] = [
  "network",
  "timeout",
  "dns_failure",
  "invalid_input",
  "unexpected",
];

/** True when `value` is exactly one of `allowed`. Rejects anything else. */
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

/** The subset of `value` that is a list of permitted literals, order preserved. */
function subsetOf<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is T => oneOf(item, allowed));
}

/**
 * Flatten an event into the property bag sent to the backend, keeping only
 * what the event's schema declares. Total: never throws, for any input.
 */
export function serializeEvent(event: TelemetryEvent): SerializedProps {
  // Defensive: callers reaching the core through `any` may hand us anything.
  const props: unknown = (event as { props?: unknown } | undefined)?.props;
  const raw: Record<string, unknown> =
    typeof props === "object" && props !== null ? (props as Record<string, unknown>) : {};

  const out: SerializedProps = {};

  if (oneOf(raw.surface, SURFACES)) out.surface = raw.surface;

  switch ((event as { name?: unknown } | undefined)?.name) {
    case "scan_completed": {
      if (oneOf(raw.format, OUTPUT_FORMATS)) out.format = raw.format;
      out.resolved = subsetOf(raw.resolved, SCANNERS);
      if (oneOf(raw.duration, DURATIONS)) out.duration = raw.duration;
      break;
    }
    case "error": {
      if (oneOf(raw.kind, ERROR_KINDS)) out.kind = raw.kind;
      break;
    }
    default:
      // Unknown event name: emit only what every event shares.
      break;
  }

  return out;
}
