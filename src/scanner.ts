import ipaddr from "ipaddr.js";
import type { ScanResult } from "./types.js";
import type { Platform } from "./platform/types.js";
import { scanDns } from "./scanners/dns.js";
import { scanDomain } from "./scanners/domain.js";
import { scanSsl } from "./scanners/ssl.js";
import { scanHosting } from "./scanners/hosting.js";
import { scanCdn } from "./scanners/cdn.js";
import { scanEmail } from "./scanners/email.js";
import { scanThirdParty } from "./scanners/thirdparty.js";
import { scanPerformance } from "./scanners/performance.js";
import {
  CDN_EDGE_PROVIDER_NAMES,
  DIRECT_PLATFORM_IPS,
  DNS_CROSS_REF_RULES,
  HOSTING_PLATFORM_PROVIDER_NAMES,
  PLATFORM_INFRA_RULES,
  PLATFORM_PROVIDER_NAMES,
} from "./providers/generated.js";

export interface ScanOptions {
  timeout?: number;
  verbose?: boolean;
  /**
   * Called each time a scanner finishes, with the result assembled so far.
   * Lets a UI render fast categories immediately and fill slower ones (e.g.
   * the browser's crt.sh SSL lookup) as they arrive.
   */
  onResult?: (partial: ScanResult) => void;
}

/**
 * Platform-agnostic scan orchestrator. Runs every scanner in parallel against
 * the supplied platform (Node or browser) and cross-references the results.
 * The Node entry point wraps this as `scan(domain, options)` with nodePlatform;
 * the Chrome extension calls it directly with browserPlatform.
 */
export async function runScan(
  domain: string,
  platform: Platform,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const { verbose, onResult } = options;

  const log = verbose
    ? (msg: string) => console.error(`[cloudtracer] ${msg}`)
    : () => {};

  log(`Starting scan of ${domain}`);

  const scanners = [
    { name: "dns", fn: () => scanDns(domain, platform) },
    { name: "registration", fn: () => scanDomain(domain, platform) },
    { name: "ssl", fn: () => scanSsl(domain, platform) },
    { name: "hosting", fn: () => scanHosting(domain, platform) },
    { name: "cdn", fn: () => scanCdn(domain, platform) },
    { name: "email", fn: () => scanEmail(domain, platform) },
    { name: "thirdparty", fn: () => scanThirdParty(domain) },
    { name: "performance", fn: () => scanPerformance(domain, platform) },
  ];

  const result: ScanResult = {
    domain,
    scannedAt: new Date().toISOString(),
  };

  // Run every scanner in parallel; assemble results as each one settles so a UI
  // can render progressively. A single scanner failing never aborts the scan.
  await Promise.all(
    scanners.map(async ({ name, fn }) => {
      log(`Running ${name} scanner...`);
      const start = Date.now();
      try {
        const scanResult = await fn();
        assign(result, name, scanResult);
        log(`${name} scanner completed in ${Date.now() - start}ms`);
      } catch (err) {
        log(`${name} scanner failed: ${err}`);
        return;
      }
      crossReferencePlatform(result);
      onResult?.({ ...result });
    }),
  );

  // Final cross-reference once every scanner has reported.
  crossReferencePlatform(result);

  log("Scan complete");
  return result;
}

function assign(result: ScanResult, name: string, scanResult: unknown): void {
  switch (name) {
    case "dns":
      result.dns = scanResult as ScanResult["dns"];
      break;
    case "registration":
      result.registration = scanResult as ScanResult["registration"];
      break;
    case "ssl":
      result.ssl = scanResult as ScanResult["ssl"];
      break;
    case "hosting":
      result.hosting = scanResult as ScanResult["hosting"];
      break;
    case "cdn":
      result.cdn = scanResult as ScanResult["cdn"];
      break;
    case "email":
      result.email = scanResult as ScanResult["email"];
      break;
    case "thirdparty":
      result.thirdPartyServices = scanResult as ScanResult["thirdPartyServices"];
      break;
    case "performance":
      result.performance = scanResult as ScanResult["performance"];
      break;
  }
}

const PLATFORM_PROVIDERS = new Set<string>(PLATFORM_PROVIDER_NAMES);
const HOSTING_PLATFORM_PROVIDERS = new Set<string>(HOSTING_PLATFORM_PROVIDER_NAMES);
const CDN_EDGE_PROVIDERS = new Set<string>(CDN_EDGE_PROVIDER_NAMES);

function normalizeIp(ip: string): string {
  try {
    return ipaddr.parse(ip).toString();
  } catch {
    return ip.toLowerCase();
  }
}

const DIRECT_PLATFORM_IP_SETS = DIRECT_PLATFORM_IPS.map((entry) => ({
  platform: entry.platform,
  ips: new Set(entry.ips.map(normalizeIp)),
}));

function applyBehindCdn(result: ScanResult): void {
  if (!result.hosting) return;

  const hostProvider = result.hosting.provider?.name;
  if (hostProvider && CDN_EDGE_PROVIDERS.has(hostProvider)) {
    result.hosting.behindCdn = hostProvider;
    return;
  }

  const pureCdn = result.cdn?.providers.find(
    (p) =>
      !PLATFORM_PROVIDERS.has(p.provider.name) &&
      CDN_EDGE_PROVIDERS.has(p.provider.name),
  );
  if (
    pureCdn &&
    (!hostProvider ||
      (pureCdn.provider.name === "Amazon CloudFront" &&
        hostProvider === "Amazon Web Services"))
  ) {
    result.hosting.behindCdn = pureCdn.provider.name;
    return;
  }

  delete result.hosting.behindCdn;
}

function crossReferenceDns(result: ScanResult): void {
  const dns = result.dns;
  const dnsName = dns?.provider?.name;
  if (!dns || !dnsName) return;

  for (const rule of DNS_CROSS_REF_RULES) {
    if (dnsName !== rule.dnsFrom) continue;
    const hasPlatformCdn = result.cdn?.providers.some(
      (p) => p.provider.name === rule.platform,
    );
    const hasPlatformHost = result.hosting?.platform?.name === rule.platform;
    if (hasPlatformCdn || hasPlatformHost) {
      dns.provider = { name: rule.platform, confidence: "high" };
      return;
    }
  }
}

function detectHostingPlatform(result: ScanResult): void {
  // Check CDN header/CNAME-detected platforms (Vercel, Netlify, GitHub Pages, etc.)
  if (result.cdn && result.hosting) {
    for (const cdnProvider of result.cdn.providers) {
      if (PLATFORM_PROVIDERS.has(cdnProvider.provider.name)) {
        result.hosting.platform = {
          name: cdnProvider.provider.name,
          confidence: cdnProvider.provider.confidence,
        };
        return;
      }
    }
  }

  // Check platforms uniquely identified by documented apex IPs
  if (result.hosting) {
    const normalizedIps = [
      ...result.hosting.ipAddresses.v4,
      ...result.hosting.ipAddresses.v6,
    ].map(normalizeIp);

    for (const entry of DIRECT_PLATFORM_IP_SETS) {
      if (normalizedIps.some((ip) => entry.ips.has(ip))) {
        result.hosting.platform = {
          name: entry.platform,
          confidence: "high",
        };
        return;
      }
    }

    // Check hosting providers whose ASN uniquely identifies a platform (e.g. Fly.io, Render, Railway)
    if (
      result.hosting.provider &&
      HOSTING_PLATFORM_PROVIDERS.has(result.hosting.provider.name)
    ) {
      result.hosting.platform = {
        name: result.hosting.provider.name,
        confidence: result.hosting.provider.confidence,
      };
      return;
    }
  }

  // Check platforms identifiable by IP + CDN + SSL combination
  if (result.hosting && result.cdn) {
    const hostingIps = [
      ...result.hosting.ipAddresses.v4,
      ...result.hosting.ipAddresses.v6,
    ];
    const cdnNames = result.cdn.providers.map((p) => p.provider.name);
    const sslIssuer = result.ssl?.issuer;

    for (const rule of PLATFORM_INFRA_RULES) {
      if (!cdnNames.includes(rule.cdn)) continue;
      if (rule.sslIssuer && sslIssuer && !sslIssuer.includes(rule.sslIssuer)) continue;

      const ruleIps = rule.ips;
      // If IPs are specified, check at least one matches
      if (ruleIps && !hostingIps.some((ip) => ruleIps.includes(ip))) continue;

      const ipMatch = ruleIps && hostingIps.some((ip) => ruleIps.includes(ip));
      result.hosting.platform = {
        name: rule.platform,
        confidence: ipMatch ? "high" : "medium",
      };
      return;
    }
  }
}

function crossReferencePlatform(result: ScanResult): void {
  detectHostingPlatform(result);
  applyBehindCdn(result);
  crossReferenceDns(result);
}
