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

const SCOPES = ["global", "local"] as const;
const METHODS = ["copy", "link"] as const;
const OUTPUT_TARGETS = ["text", "json"] as const;

const ERROR_KINDS: readonly ErrorKind[] = [
  "network",
  "timeout",
  "dns_failure",
  "invalid_input",
  "unexpected",
];

/**
 * A short bare identifier: letters, digits, underscore, dash. No dots.
 *
 * Banning dots is the point. `error_class`, `action`, `mode`, and `phase`
 * cannot be literal unions, so this is what stops a hostname riding in on one
 * of them: "example.com" fails, "SkillFetchError" passes.
 */
const IDENT_RE = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;

/** A semver-shaped version. No hostname matches a numeric triple. */
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]{1,32})?$/;

function ident(value: unknown): string | undefined {
  return typeof value === "string" && IDENT_RE.test(value) ? value : undefined;
}

function version(value: unknown): string | undefined {
  return typeof value === "string" && SEMVER_RE.test(value) ? value : undefined;
}

/** A finite, non-negative integer count. Rejects NaN, Infinity, and strings. */
function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/** Copy `key` into `out` only when `resolved` produced a value. */
function put(
  out: SerializedProps,
  key: string,
  resolved: string | number | boolean | undefined,
): void {
  if (resolved !== undefined) out[key] = resolved;
}

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
    case "cli_command_invoked": {
      if (raw.command === "skill") out.command = "skill";
      put(out, "action", ident(raw.action));
      if (oneOf(raw.scope, SCOPES)) out.scope = raw.scope;
      put(out, "mode", ident(raw.mode));
      if (oneOf(raw.method, METHODS)) out.method = raw.method;
      put(out, "dry_run", bool(raw.dry_run));
      put(out, "force", bool(raw.force));
      put(out, "target_count", count(raw.target_count));
      put(out, "found", count(raw.found));
      if (oneOf(raw.output_format, OUTPUT_TARGETS)) out.output_format = raw.output_format;
      break;
    }
    case "cli_skill_applied": {
      put(out, "action", ident(raw.action));
      if (oneOf(raw.method, METHODS)) out.method = raw.method;
      for (const key of ["created", "updated", "unchanged", "skipped", "errors"] as const) {
        put(out, key, count(raw[key]));
      }
      put(out, "new_version", version(raw.new_version));
      break;
    }
    case "cli_skill_removed": {
      for (const key of ["removed", "skipped", "errors"] as const) {
        put(out, key, count(raw[key]));
      }
      break;
    }
    case "cli_error": {
      if (raw.command === "skill") out.command = "skill";
      put(out, "phase", ident(raw.phase));
      put(out, "error_class", ident(raw.error_class));
      break;
    }
    default:
      // Unknown event name: emit only what every event shares.
      break;
  }

  return out;
}
