import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  evaluateProviderResult,
  formatDriftMarkdown,
  runVerification,
  summarizeReport,
  // @ts-expect-error verify-providers.mjs is an ESM Node script without d.ts
} from "../../scripts/verify-providers.mjs";

describe("verify-providers harness", () => {
  const cloudflare = {
    id: "cloudflare",
    name: "Cloudflare",
    website: "https://cloudflare.com",
    dns: { patterns: ["*.ns.cloudflare.com"] },
    cdn: { headers: { "CF-Ray": "*" }, is_cdn_edge: true },
    hosting: { asns: [13335], is_cdn_edge: true },
  };

  it("classifies a provider as passing when all declared layers match", () => {
    const res = evaluateProviderResult(cloudflare, [
      {
        domain: "cloudflare.com",
        result: {
          domain: "cloudflare.com",
          scannedAt: "2026-11-21T00:00:00Z",
          dns: { nameservers: ["ns1.ns.cloudflare.com"], provider: { name: "Cloudflare", confidence: "high" } },
          cdn: { providers: [{ provider: { name: "Cloudflare", confidence: "high" }, evidence: ["Header: cf-ray"] }] },
          hosting: {
            ipAddresses: { v4: ["104.16.132.229"], v6: [] },
            asn: { number: 13335, name: "CLOUDFLARENET" },
            provider: { name: "Cloudflare", confidence: "high" },
            behindCdn: "Cloudflare",
          },
        },
      },
    ]);

    expect(res.status).toBe("passing");
    expect(res.matchedLayers).toEqual(["dns", "cdn", "hosting"]);
    expect(res.missedLayers).toEqual([]);
    expect(res.newSignals).toEqual([]);
  });

  it("classifies a provider as degraded when only a subset of layers match", () => {
    const res = evaluateProviderResult(cloudflare, [
      {
        domain: "cloudflare.com",
        result: {
          domain: "cloudflare.com",
          scannedAt: "2026-11-21T00:00:00Z",
          dns: { nameservers: ["ns1.ns.cloudflare.com"], provider: { name: "Cloudflare", confidence: "high" } },
          cdn: { providers: [] },
          hosting: { ipAddresses: { v4: ["1.2.3.4"], v6: [] } },
        },
      },
    ]);

    expect(res.status).toBe("degraded");
    expect(res.matchedLayers).toEqual(["dns"]);
    expect(res.missedLayers).toEqual(["cdn", "hosting"]);
  });

  it("flags an unrecorded ASN as degraded when another layer matches and host is not behind a CDN", () => {
    const provider = {
      id: "acme",
      name: "Acme Cloud",
      cdn: { headers: { "X-Acme": "*" } },
      hosting: { asns: [64500] },
    };

    const res = evaluateProviderResult(provider, [
      {
        domain: "acme.example",
        result: {
          domain: "acme.example",
          scannedAt: "2026-11-21T00:00:00Z",
          cdn: { providers: [{ provider: { name: "Acme Cloud", confidence: "high" }, evidence: ["Header: x-acme"] }] },
          hosting: {
            ipAddresses: { v4: ["203.0.113.10"], v6: [] },
            asn: { number: 64501, name: "ACME-NEW" },
          },
        },
      },
    ]);

    expect(res.status).toBe("degraded");
    expect(res.newSignals).toEqual([
      {
        key: "asn:64501",
        type: "unrecorded_asn",
        domain: "acme.example",
        asn: 64501,
        asnName: "ACME-NEW",
      },
    ]);
  });

  it("classifies a provider as failing when all domains error or zero layers match", () => {
    const errRes = evaluateProviderResult(cloudflare, [
      { domain: "cloudflare.com", result: null, error: "timed out after 10000ms" },
    ]);
    expect(errRes.status).toBe("failing");

    const missRes = evaluateProviderResult(cloudflare, [
      {
        domain: "cloudflare.com",
        result: {
          domain: "cloudflare.com",
          scannedAt: "2026-11-21T00:00:00Z",
          dns: { nameservers: [] },
          cdn: { providers: [] },
          hosting: { ipAddresses: { v4: [], v6: [] } },
        },
      },
    ]);
    expect(missRes.status).toBe("failing");
  });

  it("summarizes counts and formats Markdown drift table", () => {
    const report = summarizeReport(
      [
        {
          id: "vercel",
          name: "Vercel",
          website: null,
          status: "passing",
          expectedLayers: ["cdn"],
          matchedLayers: ["cdn"],
          missedLayers: [],
          newSignals: [],
          domains: [],
        },
        {
          id: "acme",
          name: "Acme",
          website: null,
          status: "failing",
          expectedLayers: ["dns"],
          matchedLayers: [],
          missedLayers: ["dns"],
          newSignals: [],
          domains: [],
        },
      ],
      "2026-11-21T09:00:00Z",
    );

    expect(report.counts).toEqual({ passing: 1, degraded: 0, failing: 1 });
    const md = formatDriftMarkdown(report);
    expect(md).toContain("**Passing:** 1");
    expect(md).toContain("**Failing:** 1");
    expect(md).toContain("`acme` (Acme)");
    expect(md).not.toContain("`vercel`");
  });

  it("preserves partial results emitted via onResult when a scan times out and does not mark unfinished layers as missed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cloudtracer-verify-"));
    try {
      writeFileSync(
        join(dir, "route53.json"),
        JSON.stringify({
          id: "route53",
          name: "Amazon Route 53",
          verification_domains: ["slack.com"],
          dns: { patterns: ["*.awsdns-*"] },
          thirdparty: { scripts: ["example-sdk.js"], category: "analytics" },
        }),
      );

      const report = await runVerification({
        providersDir: dir,
        timeoutMs: 30,
        scanFn: (domain: string, opts: { onResult?: (partial: unknown) => void }) =>
          new Promise(() => {
            opts.onResult?.({
              domain,
              scannedAt: "2026-11-22T00:00:00Z",
              dns: {
                nameservers: ["ns-166.awsdns-20.com"],
                provider: { name: "Amazon Route 53", confidence: "high" },
              },
            });
          }),
      });

      expect(report.counts).toEqual({ passing: 1, degraded: 0, failing: 0 });
      expect(report.providers[0].status).toBe("passing");
      expect(report.providers[0].matchedLayers).toEqual(["dns"]);
      expect(report.providers[0].missedLayers).toEqual([]);
      expect(report.providers[0].timedOutLayers).toEqual(["thirdparty"]);
      expect(report.providers[0].domains[0].timedOut).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
