import type { EmailInfo } from "../types.js";
import type { Platform } from "../platform/types.js";
import { matchEmailProvider } from "../providers/match.js";

export async function scanEmail(domain: string, platform: Platform): Promise<EmailInfo> {
  const [mxRecords, txtRecords] = await Promise.all([
    platform.dns.resolveMx(domain),
    platform.dns.resolveTxt(domain),
  ]);

  const sorted = mxRecords.sort((a, b) => a.priority - b.priority);
  const exchanges = sorted.map((r) => r.exchange);
  const provider = matchEmailProvider(exchanges);

  const spf = txtRecords.find((r) => r.startsWith("v=spf1"));
  const dmarc = await getDmarc(domain, platform);

  return {
    mxRecords: sorted,
    provider,
    spf,
    dmarc,
  };
}

async function getDmarc(domain: string, platform: Platform): Promise<string | undefined> {
  const records = await platform.dns.resolveTxt(`_dmarc.${domain}`);
  return records.find((r) => r.startsWith("v=DMARC1"));
}
