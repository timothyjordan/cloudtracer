import type { RegistrationInfo, SslInfo } from "../types.js";

/**
 * DNS record resolution. Implemented natively in Node (node:dns) and over
 * DNS-over-HTTPS in the browser. Each method resolves to an empty array on
 * failure rather than throwing, matching the original utils/dns.ts contract.
 */
export interface DnsResolver {
  resolveNs(domain: string): Promise<string[]>;
  resolveA(domain: string): Promise<string[]>;
  resolveAaaa(domain: string): Promise<string[]>;
  resolveCname(domain: string): Promise<string[]>;
  resolveMx(domain: string): Promise<{ priority: number; exchange: string }[]>;
  resolveTxt(domain: string): Promise<string[]>;
}

/**
 * Everything the scanners need that differs between Node and the browser.
 * The pure orchestration and provider-matching logic is platform-agnostic and
 * receives one of these at runtime (nodePlatform or browserPlatform).
 */
export interface Platform {
  dns: DnsResolver;

  /** Read the TLS certificate for a domain (Node: live handshake; browser: CT logs). */
  getCertificate(domain: string): Promise<SslInfo | undefined>;

  /**
   * WHOIS fallback when RDAP yields nothing. Node-only; omitted in the browser,
   * where the RDAP-first path in the domain scanner degrades gracefully.
   */
  whois?(domain: string): Promise<RegistrationInfo | undefined>;

  /**
   * Raw TLS handshake timing in milliseconds. Node-only; omitted in the browser,
   * where raw socket timing is not observable.
   */
  measureTlsMs?(domain: string): Promise<number>;
}
