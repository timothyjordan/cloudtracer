import type { DnsInfo } from "../types.js";
import type { Platform } from "../platform/types.js";
import { matchDnsProvider } from "../providers/match.js";

export async function scanDns(domain: string, platform: Platform): Promise<DnsInfo> {
  const nameservers = await platform.dns.resolveNs(domain);
  const provider = matchDnsProvider(nameservers);

  return {
    nameservers,
    provider,
  };
}
