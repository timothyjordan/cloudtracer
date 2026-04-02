import { describe, it, expect } from "vitest";
import { formatTree } from "../../src/output/tree.js";
import type { ScanResult } from "../../src/types.js";

describe("formatTree", () => {
  it("should format a minimal result", () => {
    const result: ScanResult = {
      domain: "example.com",
      scannedAt: new Date().toISOString(),
    };

    const output = formatTree(result);
    expect(output).toContain("example.com");
  });

  it("should include all sections when data is present", () => {
    const result: ScanResult = {
      domain: "example.com",
      scannedAt: new Date().toISOString(),
      registration: {
        registrar: "MarkMonitor Inc.",
        source: "rdap",
      },
      dns: {
        nameservers: ["ns1.cloudflare.com"],
        provider: { name: "Cloudflare", confidence: "high" },
      },
      cdn: {
        providers: [
          {
            provider: { name: "Cloudflare", confidence: "high" },
            evidence: ["Header: CF-Ray"],
          },
        ],
      },
      hosting: {
        ipAddresses: { v4: ["1.2.3.4"], v6: [] },
        asn: { number: 13335, name: "CLOUDFLARENET" },
        provider: { name: "Cloudflare", confidence: "high" },
      },
      ssl: {
        issuer: "Let's Encrypt",
        subject: "example.com",
        san: ["example.com"],
        validFrom: "2024-01-01T00:00:00Z",
        validTo: "2025-01-01T00:00:00Z",
        daysUntilExpiry: 180,
        protocol: "TLSv1.3",
      },
      email: {
        mxRecords: [{ priority: 10, exchange: "aspmx.l.google.com" }],
        provider: { name: "Google Workspace", confidence: "high" },
        spf: "v=spf1 include:_spf.google.com ~all",
      },
      thirdPartyServices: [
        { name: "Google Analytics", category: "analytics", evidence: "script src: gtag" },
      ],
    };

    const output = formatTree(result);
    expect(output).toContain("Registration");
    expect(output).toContain("DNS");
    expect(output).toContain("CDN");
    expect(output).toContain("Hosting");
    expect(output).toContain("SSL/TLS");
    expect(output).toContain("Email");
    expect(output).toContain("Third-Party Services");
  });

  it("should show platform on infrastructure when platform is detected", () => {
    const result: ScanResult = {
      domain: "example.com",
      scannedAt: new Date().toISOString(),
      hosting: {
        ipAddresses: { v4: ["216.198.79.1"], v6: [] },
        asn: { number: 16509, name: "AMAZON-02" },
        provider: { name: "Amazon Web Services", confidence: "high" },
        platform: { name: "Vercel", confidence: "high" },
      },
    };

    const output = formatTree(result);
    expect(output).toContain("Vercel (on Amazon Web Services)");
    expect(output).not.toContain("Provider : Amazon Web Services");
  });

  it("should show performance metrics with timing labels", () => {
    const result: ScanResult = {
      domain: "example.com",
      scannedAt: new Date().toISOString(),
      performance: {
        dnsResolutionMs: 12,
        tlsHandshakeMs: 45,
        ttfbMs: 128,
        totalResponseMs: 234,
        contentSizeBytes: 43320,
      },
    };

    const output = formatTree(result);
    expect(output).toContain("Performance");
    expect(output).toContain("12ms");
    expect(output).toContain("45ms");
    expect(output).toContain("128ms");
    expect(output).toContain("234ms");
    expect(output).toContain("42.3 KB");
  });
});
