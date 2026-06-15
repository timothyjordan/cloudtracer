import { runScan, type ScanOptions } from "./scanner.js";
import { nodePlatform } from "./platform/node.js";
import type { ScanResult } from "./types.js";

export type {
  ScanResult,
  RegistrationInfo,
  DnsInfo,
  CdnInfo,
  CdnProvider,
  HostingInfo,
  SslInfo,
  EmailInfo,
  ThirdPartyInfo,
  ProviderMatch,
} from "./types.js";

export type { Platform, DnsResolver } from "./platform/types.js";
export { runScan } from "./scanner.js";
export type { ScanOptions } from "./scanner.js";
export { nodePlatform } from "./platform/node.js";
export { browserPlatform } from "./platform/browser.js";

/**
 * Scan a domain using the Node platform (native DNS, live TLS handshake, WHOIS).
 * This is the public library/CLI entry point and keeps the original signature.
 */
export function scan(domain: string, options?: ScanOptions): Promise<ScanResult> {
  return runScan(domain, nodePlatform, options);
}
