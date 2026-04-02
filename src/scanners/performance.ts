import { promises as dns } from "node:dns";
import * as tls from "node:tls";
import type { PerformanceInfo } from "../types.js";

export async function scanPerformance(
  domain: string,
): Promise<PerformanceInfo> {
  const [dnsResolutionMs, tlsHandshakeMs, httpTimings] = await Promise.all([
    measureDns(domain),
    measureTls(domain),
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

async function measureDns(domain: string): Promise<number> {
  const start = performance.now();
  try {
    await dns.resolve4(domain);
  } catch {
    // Domain may not have A records, that's fine
  }
  return Math.round(performance.now() - start);
}

function measureTls(domain: string): Promise<number> {
  return new Promise((resolve) => {
    const start = performance.now();

    const socket = tls.connect(
      {
        host: domain,
        port: 443,
        servername: domain,
        rejectUnauthorized: false,
      },
      () => {
        const elapsed = Math.round(performance.now() - start);
        socket.destroy();
        resolve(elapsed);
      },
    );

    socket.setTimeout(5000, () => {
      socket.destroy();
      resolve(-1);
    });

    socket.on("error", () => {
      resolve(-1);
    });
  });
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
          "sitestack/0.1 (https://github.com/timothyjordan/sitestack)",
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
