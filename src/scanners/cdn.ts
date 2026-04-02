import type { CdnInfo } from "../types.js";
import { resolveCname } from "../utils/dns.js";
import { fetchHeaders } from "../utils/http.js";
import { matchCdnByHeaders, matchCdnByCname } from "../providers/match.js";

export async function scanCdn(domain: string): Promise<CdnInfo> {
  const [headers, cnames] = await Promise.all([
    fetchHeaders(domain),
    resolveCname(domain),
  ]);

  const headerMatches = matchCdnByHeaders(headers);
  const cnameMatches = matchCdnByCname(cnames);

  // Merge matches by provider name
  const merged = new Map<string, string[]>();

  for (const match of [...headerMatches, ...cnameMatches]) {
    const existing = merged.get(match.name) ?? [];
    existing.push(...match.evidence);
    merged.set(match.name, existing);
  }

  const providers = Array.from(merged.entries()).map(([name, evidence]) => ({
    provider: { name, confidence: "high" as const },
    evidence,
  }));

  return { providers };
}
