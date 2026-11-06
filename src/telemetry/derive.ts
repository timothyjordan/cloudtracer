/**
 * Deriving telemetry payloads from a scan, without carrying anything about the
 * thing scanned.
 */

import type { ScanResult } from "../types.js";
import type { DurationBucket, ErrorKind, ScannerName } from "./types.js";

/**
 * Coarse bucket for a scan duration. Buckets rather than raw timings: a
 * precise duration correlates with the specific host that was scanned, which
 * makes it a weak fingerprint of exactly what we promise not to collect.
 */
export function durationBucket(ms: number): DurationBucket {
  if (ms < 1000) return "<1s";
  if (ms < 3000) return "1-3s";
  if (ms < 10000) return "3-10s";
  return ">10s";
}

/**
 * Result fields in scanner-name order. The names deliberately follow the
 * scanner vocabulary (`domain`, `thirdparty`) rather than the result shape
 * (`registration`, `thirdPartyServices`), so the payload reads the same as
 * `runScan`'s own naming.
 */
const FIELD_BY_SCANNER: readonly (readonly [ScannerName, keyof ScanResult])[] = [
  ["domain", "registration"],
  ["dns", "dns"],
  ["cdn", "cdn"],
  ["hosting", "hosting"],
  ["ssl", "ssl"],
  ["performance", "performance"],
  ["email", "email"],
  ["thirdparty", "thirdPartyServices"],
];

/**
 * Which scanners produced data, as names only.
 *
 * An empty `thirdPartyServices` array counts as resolved: the scanner ran and
 * found nothing, which is a different fact from the scanner not running, and
 * conflating them would hide real failures.
 */
export function resolvedScanners(result: Partial<ScanResult> | undefined): ScannerName[] {
  if (typeof result !== "object" || result === null) return [];
  const out: ScannerName[] = [];
  for (const [name, field] of FIELD_BY_SCANNER) {
    if (result[field] !== undefined && result[field] !== null) out.push(name);
  }
  return out;
}

/**
 * Map an error to a fixed category.
 *
 * The message is inspected to classify but is never emitted: the return type
 * is a closed union, so a scan error mentioning a hostname cannot escape this
 * function.
 */
export function classifyError(err: unknown): ErrorKind {
  const name = err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message.toLowerCase() : "";

  if (name === "AbortError" || message.includes("timeout") || message.includes("timed out")) {
    return "timeout";
  }
  if (message.includes("enotfound") || message.includes("eai_again") || message.includes("dns")) {
    return "dns_failure";
  }
  if (
    message.includes("econnrefused") ||
    message.includes("econnreset") ||
    message.includes("network") ||
    message.includes("fetch failed")
  ) {
    return "network";
  }
  return "unexpected";
}
