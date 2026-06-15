import type { SslInfo } from "../types.js";
import type { Platform } from "../platform/types.js";

/**
 * Thin wrapper over the platform's certificate reader. Node performs a live TLS
 * handshake; the browser derives the certificate from Certificate Transparency
 * logs. Kept as a named scanner so the orchestrator treats SSL like the others.
 */
export function scanSsl(
  domain: string,
  platform: Platform,
): Promise<SslInfo | undefined> {
  return platform.getCertificate(domain);
}
