/**
 * Telemetry types, shared by the CLI and the Chrome extension.
 *
 * Nothing here may import `node:*`: the same module is bundled into the
 * browser extension, so platform differences live behind the injected
 * `TelemetryConfigProvider` and `TelemetryAdapter`.
 */

/** Which surface produced an event. */
export type Surface = "cli" | "extension";

/** CLI output formats. `tree` is the default. */
export type OutputFormat = "tree" | "json" | "yaml" | "markdown";

/** The eight scanners, matching the keys used by `runScan`. */
export type ScannerName =
  | "domain"
  | "dns"
  | "cdn"
  | "hosting"
  | "ssl"
  | "performance"
  | "email"
  | "thirdparty";

/**
 * Coarse duration buckets rather than raw timings. A precise duration is a
 * weak fingerprint of the thing scanned; a bucket is not.
 */
export type DurationBucket = "<1s" | "1-3s" | "3-10s" | ">10s";

/** Error categories. Deliberately not error messages, which can embed a domain. */
export type ErrorKind =
  | "network"
  | "timeout"
  | "dns_failure"
  | "invalid_input"
  | "unexpected";

/**
 * The event catalogue, as a discriminated union of closed property sets.
 *
 * Every string-valued property is a union of literals, never `string`. That is
 * the structural half of the no-domain guarantee: there is no field a hostname
 * could be passed in, so it is a type error rather than a review miss.
 * `serializeEvent` is the runtime half, for callers who reach for `as any`.
 */
export type TelemetryEvent =
  | {
      name: "scan_completed";
      props: {
        surface: Surface;
        format?: OutputFormat;
        resolved: ScannerName[];
        duration: DurationBucket;
      };
    }
  | {
      name: "error";
      props: {
        surface: Surface;
        kind: ErrorKind;
      };
    }
  | {
      name: "cli_command_invoked";
      props: {
        surface: Surface;
        command: "skill";
        action?: SafeToken;
        scope?: "global" | "local";
        mode?: SafeToken;
        method?: "copy" | "link";
        dry_run?: boolean;
        force?: boolean;
        target_count?: number;
        found?: number;
        output_format?: "text" | "json";
      };
    }
  | {
      name: "cli_skill_applied";
      props: {
        surface: Surface;
        action?: SafeToken;
        method?: "copy" | "link";
        created?: number;
        updated?: number;
        unchanged?: number;
        skipped?: number;
        errors?: number;
        new_version?: SafeVersion;
      };
    }
  | {
      name: "cli_skill_removed";
      props: {
        surface: Surface;
        removed?: number;
        skipped?: number;
        errors?: number;
      };
    }
  | {
      name: "cli_error";
      props: {
        surface: Surface;
        command?: "skill";
        phase?: SafeToken;
        error_class?: SafeToken;
      };
    };

/**
 * Fields whose domain cannot be enumerated at compile time.
 *
 * `error_class` comes from `(e as Error).name`, and `action`/`mode`/`phase`
 * grow as the skills command grows, so a literal union would be either wrong
 * or constantly stale. These are plain strings in the type and are instead
 * constrained at runtime by `serializeEvent`, which drops any value that is
 * not a short bare identifier containing no dots.
 *
 * This is deliberately weaker than the rest of the catalogue, where every
 * string is a literal union. The narrowing is what keeps it safe: a hostname
 * cannot pass the identifier check, and a version cannot pass it either, so
 * neither can ride in on one of these fields.
 */
export type SafeToken = string;

/** A semver-shaped string. Validated at runtime; no hostname matches the shape. */
export type SafeVersion = string;

export type EventName = TelemetryEvent["name"];

/** A serialized event body: flat, primitive, and allowlisted. */
export type SerializedProps = Record<string, string | number | boolean | string[]>;

/** Transport. Implemented by the PostHog adapter and the noop adapter. */
export interface TelemetryAdapter {
  /** Send one event. Must resolve even on failure: telemetry never throws at callers. */
  capture(event: TelemetryEvent, distinctId: string): Promise<void>;
  /** Wait for in-flight sends. Used by the CLI before a short-lived process exits. */
  flush(): Promise<void>;
}

/**
 * Per-platform persistence. The CLI backs this with a config file, the
 * extension with `chrome.storage.local`.
 */
export interface TelemetryConfigProvider {
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
  /** A random, stable, anonymous id. Never derived from the user or machine. */
  getDistinctId(): Promise<string>;
  hasShownNotice(): Promise<boolean>;
  markNoticeShown(): Promise<void>;
}

/** Build-time injected configuration. Both fields absent means "send nothing". */
export interface TelemetryBuildConfig {
  key?: string;
  host?: string;
}

/** The façade the CLI and extension consume. */
export interface Telemetry {
  track(event: TelemetryEvent): Promise<void>;
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
  flush(): Promise<void>;
}
