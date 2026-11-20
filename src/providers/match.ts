import {
  CDN_PROVIDERS,
  DNS_PROVIDERS,
  EMAIL_PROVIDERS,
  HOSTING_PROVIDERS,
  HTML_FRAMEWORK_PROVIDERS,
  THIRDPARTY_PROVIDERS,
} from "./generated.js";
import type { ProviderMatch } from "../types.js";

function globMatch(pattern: string, value: string): boolean {
  const regex = new RegExp(
    "^" +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*") +
      "$",
    "i",
  );
  return regex.test(value);
}

export function matchDnsProvider(nameservers: string[]): ProviderMatch | undefined {
  for (const config of DNS_PROVIDERS) {
    for (const ns of nameservers) {
      for (const pattern of config.patterns) {
        if (globMatch(pattern, ns)) {
          return {
            name: config.name,
            confidence: "high",
          };
        }
      }
    }
  }
  return undefined;
}

export function matchCdnByHeaders(
  headers: Record<string, string>,
): { name: string; evidence: string[] }[] {
  const matches: { name: string; evidence: string[] }[] = [];

  for (const config of CDN_PROVIDERS) {
    const evidence: string[] = [];
    for (const [headerName, pattern] of Object.entries(config.headers)) {
      for (const [actualHeader, actualValue] of Object.entries(headers)) {
        if (
          globMatch(headerName, actualHeader) &&
          globMatch(pattern, actualValue)
        ) {
          evidence.push(`Header: ${actualHeader}: ${actualValue}`);
        }
      }
    }
    if (evidence.length > 0) {
      matches.push({ name: config.name, evidence });
    }
  }

  return matches;
}

export function matchCdnByCname(cnames: string[]): { name: string; evidence: string[] }[] {
  const matches: { name: string; evidence: string[] }[] = [];

  for (const config of CDN_PROVIDERS) {
    const evidence: string[] = [];
    for (const cname of cnames) {
      for (const pattern of config.cnames) {
        if (globMatch(pattern, cname)) {
          evidence.push(`CNAME: ${cname}`);
        }
      }
    }
    if (evidence.length > 0) {
      matches.push({ name: config.name, evidence });
    }
  }

  return matches;
}

export function matchHostingByAsn(asn: number): ProviderMatch | undefined {
  for (const config of HOSTING_PROVIDERS) {
    if (config.asns.includes(asn)) {
      return {
        name: config.name,
        confidence: "high",
      };
    }
  }
  return undefined;
}

export function matchEmailProvider(mxExchanges: string[]): ProviderMatch | undefined {
  for (const config of EMAIL_PROVIDERS) {
    for (const mx of mxExchanges) {
      for (const pattern of config.mx_patterns) {
        if (globMatch(pattern, mx)) {
          return {
            name: config.name,
            confidence: "high",
          };
        }
      }
    }
  }
  return undefined;
}

export function matchThirdPartyScripts(
  scriptSrcs: string[],
): { name: string; category: string; evidence: string }[] {
  const matches: { name: string; category: string; evidence: string }[] = [];
  const seen = new Set<string>();

  for (const config of THIRDPARTY_PROVIDERS) {
    for (const src of scriptSrcs) {
      for (const pattern of config.scripts) {
        if (src.toLowerCase().includes(pattern.toLowerCase()) && !seen.has(config.id)) {
          seen.add(config.id);
          matches.push({
            name: config.name,
            category: config.category,
            evidence: `script src: ${src}`,
          });
        }
      }
    }
  }

  return matches;
}

export function matchHtmlFrameworks(
  html: string,
): { name: string; category: string; evidence: string }[] {
  const matches: { name: string; category: string; evidence: string }[] = [];
  const seen = new Set<string>();

  for (const config of HTML_FRAMEWORK_PROVIDERS) {
    for (const pattern of config.html_patterns) {
      if (html.includes(pattern) && !seen.has(config.id)) {
        seen.add(config.id);
        matches.push({
          name: config.name,
          category: config.category,
          evidence: `html pattern: ${pattern}`,
        });
      }
    }
  }

  return matches;
}
