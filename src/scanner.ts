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

export interface ScanOptions {
  timeout?: number;
  verbose?: boolean;
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
  const { verbose } = options;

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

  const results = await Promise.allSettled(
    scanners.map(async ({ name, fn }) => {
      log(`Running ${name} scanner...`);
      const start = Date.now();
      const result = await fn();
      log(`${name} scanner completed in ${Date.now() - start}ms`);
      return { name, result };
    }),
  );

  const result: ScanResult = {
    domain,
    scannedAt: new Date().toISOString(),
  };

  for (const entry of results) {
    if (entry.status === "rejected") {
      log(`Scanner failed: ${entry.reason}`);
      continue;
    }

    const { name, result: scanResult } = entry.value;

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

  // Cross-reference: if a PaaS platform (Vercel, Netlify, etc.) is detected
  // via CDN headers, enrich the hosting info to show "platform on infra"
  crossReferencePlatform(result);

  log("Scan complete");
  return result;
}

const PLATFORM_PROVIDERS = new Set([
  "Vercel",
  "Netlify",
  "Render",
  "Railway",
  "Fly.io",
  "GitHub Pages",
]);

// Known IP addresses used by hosting platforms that sit behind CDNs
const PLATFORM_IPS: Record<string, string[]> = {
  "Firebase Hosting": [
    "199.36.158.100",
    "151.101.1.195",
    "151.101.65.195",
  ],
};

// Platforms identifiable by CDN + SSL issuer combination
const PLATFORM_BY_INFRA: {
  cdn: string;
  sslIssuer: string;
  ips?: string[];
  platform: string;
}[] = [
  {
    cdn: "Fastly",
    sslIssuer: "Google Trust Services",
    ips: PLATFORM_IPS["Firebase Hosting"],
    platform: "Firebase Hosting",
  },
];

function crossReferencePlatform(result: ScanResult): void {
  // Check CDN header-detected platforms (Vercel, Netlify, etc.)
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

  // Check platforms identifiable by IP + CDN + SSL combination
  if (result.hosting && result.cdn) {
    const hostingIps = [
      ...result.hosting.ipAddresses.v4,
      ...result.hosting.ipAddresses.v6,
    ];
    const cdnNames = result.cdn.providers.map((p) => p.provider.name);
    const sslIssuer = result.ssl?.issuer;

    for (const rule of PLATFORM_BY_INFRA) {
      if (!cdnNames.includes(rule.cdn)) continue;
      if (sslIssuer && !sslIssuer.includes(rule.sslIssuer)) continue;

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
