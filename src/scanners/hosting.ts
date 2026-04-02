import type { HostingInfo } from "../types.js";
import { resolveA, resolveAaaa, resolveTxt } from "../utils/dns.js";
import { reverseIp } from "../utils/ip.js";
import { matchHostingByAsn } from "../providers/match.js";

export async function scanHosting(domain: string): Promise<HostingInfo> {
  const [v4, v6] = await Promise.all([resolveA(domain), resolveAaaa(domain)]);

  const result: HostingInfo = {
    ipAddresses: { v4, v6 },
  };

  // Look up ASN for the first IPv4 address
  if (v4.length > 0) {
    const asnInfo = await lookupAsn(v4[0]);
    if (asnInfo) {
      result.asn = asnInfo;
      result.provider = matchHostingByAsn(asnInfo.number);
    }
  }

  return result;
}

async function lookupAsn(
  ip: string,
): Promise<{ number: number; name: string } | undefined> {
  try {
    const reversed = reverseIp(ip);
    const records = await resolveTxt(`${reversed}.origin.asn.cymru.com`);

    if (records.length === 0) return undefined;

    // Format: "ASN | IP | Prefix | CC | Registry"
    const parts = records[0].split("|").map((s) => s.trim());
    const asnNumber = parseInt(parts[0]);

    if (isNaN(asnNumber)) return undefined;

    // Look up ASN name
    const nameRecords = await resolveTxt(`AS${asnNumber}.asn.cymru.com`);
    let name = `AS${asnNumber}`;
    if (nameRecords.length > 0) {
      const nameParts = nameRecords[0].split("|").map((s) => s.trim());
      name = nameParts[nameParts.length - 1] ?? name;
    }

    return { number: asnNumber, name };
  } catch {
    return undefined;
  }
}
