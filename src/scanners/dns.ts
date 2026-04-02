import type { DnsInfo } from "../types.js";
import { resolveNs } from "../utils/dns.js";
import { matchDnsProvider } from "../providers/match.js";

export async function scanDns(domain: string): Promise<DnsInfo> {
  const nameservers = await resolveNs(domain);
  const provider = matchDnsProvider(nameservers);

  return {
    nameservers,
    provider,
  };
}
