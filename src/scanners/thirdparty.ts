import * as cheerio from "cheerio";
import type { ThirdPartyInfo } from "../types.js";
import { fetchHtml } from "../utils/http.js";
import { matchThirdPartyScripts, matchHtmlFrameworks } from "../providers/match.js";

export async function scanThirdParty(domain: string): Promise<ThirdPartyInfo[]> {
  const html = await fetchHtml(domain);
  if (!html) return [];

  const $ = cheerio.load(html);
  const scriptSrcs: string[] = [];

  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src) scriptSrcs.push(src);
  });

  // Also check link tags for fonts/stylesheets
  $("link[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href) scriptSrcs.push(href);
  });

  const scriptMatches = matchThirdPartyScripts(scriptSrcs);
  const frameworkMatches = matchHtmlFrameworks(html);

  // Merge, deduplicating by name
  const seen = new Set<string>();
  const results: ThirdPartyInfo[] = [];

  for (const m of [...scriptMatches, ...frameworkMatches]) {
    if (!seen.has(m.name)) {
      seen.add(m.name);
      results.push({
        name: m.name,
        category: m.category,
        evidence: m.evidence,
      });
    }
  }

  return results;
}
