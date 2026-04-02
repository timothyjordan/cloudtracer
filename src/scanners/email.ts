import type { EmailInfo } from "../types.js";
import { resolveMx, resolveTxt } from "../utils/dns.js";
import { matchEmailProvider } from "../providers/match.js";

export async function scanEmail(domain: string): Promise<EmailInfo> {
  const [mxRecords, txtRecords] = await Promise.all([
    resolveMx(domain),
    resolveTxt(domain),
  ]);

  const sorted = mxRecords.sort((a, b) => a.priority - b.priority);
  const exchanges = sorted.map((r) => r.exchange);
  const provider = matchEmailProvider(exchanges);

  const spf = txtRecords.find((r) => r.startsWith("v=spf1"));
  const dmarc = await getDmarc(domain);

  return {
    mxRecords: sorted,
    provider,
    spf,
    dmarc,
  };
}

async function getDmarc(domain: string): Promise<string | undefined> {
  const records = await resolveTxt(`_dmarc.${domain}`);
  return records.find((r) => r.startsWith("v=DMARC1"));
}
