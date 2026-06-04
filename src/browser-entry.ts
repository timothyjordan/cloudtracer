// Browser/extension entry point: exposes only the node-free core so bundlers
// never pull in nodePlatform (node:tls/net/dns) or whoiser. Import this from a
// browser context (e.g. a Chrome extension) instead of the package index.
export { runScan } from "./scanner.js";
export type { ScanOptions } from "./scanner.js";
export { browserPlatform } from "./platform/browser.js";
export type { Platform, DnsResolver } from "./platform/types.js";
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
