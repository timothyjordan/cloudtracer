import type { PerformanceInfo } from "../types.js";
import type { Platform } from "../platform/types.js";

export async function scanPerformance(
  domain: string,
  platform: Platform,
): Promise<PerformanceInfo> {
  const [dnsResolutionMs, tlsHandshakeMs, httpTimings] = await Promise.all([
    measureDns(domain, platform),
    platform.measureTlsMs ? platform.measureTlsMs(domain) : Promise.resolve(-1),
    measureHttp(domain),
  ]);

  return {
    dnsResolutionMs,
    tlsHandshakeMs,
    ttfbMs: httpTimings.ttfbMs,
    totalResponseMs: httpTimings.totalMs,
    contentSizeBytes: httpTimings.contentSizeBytes,
  };
}

async function measureDns(domain: string, platform: Platform): Promise<number> {
  const start = performance.now();
  // Domain may not have A records, that's fine — resolveA returns [] on failure.
  await platform.dns.resolveA(domain);
  return Math.round(performance.now() - start);
}

async function measureHttp(
  domain: string,
): Promise<{ ttfbMs: number; totalMs: number; contentSizeBytes?: number }> {
  const start = performance.now();

  try {
    const response = await fetch(`https://${domain}`, {
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
      headers: {
        "User-Agent":
          "cloudtracer/0.1 (https://github.com/timothyjordan/cloudtracer)",
      },
    });

    const ttfbMs = Math.round(performance.now() - start);

    const body = await response.text();
    const totalMs = Math.round(performance.now() - start);

    const contentLength = response.headers.get("content-length");
    const contentSizeBytes = contentLength
      ? parseInt(contentLength)
      : body.length;

    return { ttfbMs, totalMs, contentSizeBytes };
  } catch {
    try {
      const response = await fetch(`http://${domain}`, {
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
      });

      const ttfbMs = Math.round(performance.now() - start);
      const body = await response.text();
      const totalMs = Math.round(performance.now() - start);

      return { ttfbMs, totalMs, contentSizeBytes: body.length };
    } catch {
      return { ttfbMs: -1, totalMs: -1 };
    }
  }
}
