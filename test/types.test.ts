import { describe, it, expect } from "vitest";
import type { ScanResult, ProviderMatch } from "../src/types.js";

describe("types", () => {
  it("should create a valid ScanResult", () => {
    const result: ScanResult = {
      domain: "example.com",
      scannedAt: new Date().toISOString(),
    };
    expect(result.domain).toBe("example.com");
    expect(result.scannedAt).toBeTruthy();
  });

  it("should create a valid ProviderMatch", () => {
    const match: ProviderMatch = {
      name: "Cloudflare",
      confidence: "high",
    };
    expect(match.name).toBe("Cloudflare");
    expect(match.confidence).toBe("high");
  });

  it("should create a ScanResult with all optional fields", () => {
    const result: ScanResult = {
      domain: "example.com",
      scannedAt: new Date().toISOString(),
      registration: {
        registrar: "MarkMonitor Inc.",
        registeredDate: "1995-08-14",
        expirationDate: "2025-08-13",
        source: "rdap",
      },
      dns: {
        nameservers: ["ns1.example.com", "ns2.example.com"],
        provider: { name: "Route 53", confidence: "high" },
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
        ipAddresses: { v4: ["93.184.216.34"], v6: [] },
        asn: { number: 15169, name: "Google LLC" },
        provider: { name: "Google Cloud Platform", confidence: "high" },
      },
      ssl: {
        issuer: "DigiCert Inc",
        subject: "example.com",
        san: ["example.com", "www.example.com"],
        validFrom: "2024-01-01",
        validTo: "2025-01-01",
        daysUntilExpiry: 180,
        protocol: "TLSv1.3",
      },
      email: {
        mxRecords: [{ priority: 10, exchange: "aspmx.l.google.com" }],
        provider: { name: "Google Workspace", confidence: "high" },
        spf: "v=spf1 include:_spf.google.com ~all",
        dmarc: "v=DMARC1; p=reject",
      },
      thirdPartyServices: [
        {
          name: "Google Analytics",
          category: "analytics",
          evidence: "script src: googletagmanager.com",
        },
      ],
    };

    expect(result.registration?.registrar).toBe("MarkMonitor Inc.");
    expect(result.dns?.nameservers).toHaveLength(2);
    expect(result.cdn?.providers).toHaveLength(1);
    expect(result.hosting?.asn?.number).toBe(15169);
    expect(result.ssl?.daysUntilExpiry).toBe(180);
    expect(result.email?.mxRecords).toHaveLength(1);
    expect(result.thirdPartyServices).toHaveLength(1);
  });
});
