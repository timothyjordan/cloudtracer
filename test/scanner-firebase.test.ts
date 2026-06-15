import { describe, it, expect, vi } from "vitest";

vi.mock("../src/scanners/dns.js", () => ({
  scanDns: vi.fn().mockResolvedValue({ nameservers: [], provider: undefined }),
}));
vi.mock("../src/scanners/domain.js", () => ({
  scanDomain: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/scanners/ssl.js", () => ({
  scanSsl: vi.fn().mockResolvedValue({
    issuer: "Google Trust Services",
    subject: "example.com",
    san: ["example.com"],
    validFrom: "2026-01-01T00:00:00Z",
    validTo: "2026-06-01T00:00:00Z",
    daysUntilExpiry: 60,
    protocol: "TLSv1.3",
  }),
}));
vi.mock("../src/scanners/hosting.js", () => ({
  scanHosting: vi.fn().mockResolvedValue({
    ipAddresses: { v4: ["199.36.158.100"], v6: [] },
    asn: { number: 54113, name: "FASTLY - Fastly, Inc., US" },
    provider: { name: "Fastly", confidence: "high" },
  }),
}));
vi.mock("../src/scanners/cdn.js", () => ({
  scanCdn: vi.fn().mockResolvedValue({
    providers: [
      {
        provider: { name: "Fastly", confidence: "high" },
        evidence: ["Header: x-served-by: cache-sjc1000129-SJC"],
      },
    ],
  }),
}));
vi.mock("../src/scanners/email.js", () => ({
  scanEmail: vi.fn().mockResolvedValue({ mxRecords: [] }),
}));
vi.mock("../src/scanners/thirdparty.js", () => ({
  scanThirdParty: vi.fn().mockResolvedValue([]),
}));
vi.mock("../src/scanners/performance.js", () => ({
  scanPerformance: vi.fn().mockResolvedValue({
    dnsResolutionMs: 10,
    tlsHandshakeMs: 20,
    ttfbMs: 50,
    totalResponseMs: 60,
  }),
}));

import { scan } from "../src/index.js";

describe("Firebase Hosting detection", () => {
  it("should detect Firebase Hosting on Fastly by IP + SSL issuer", async () => {
    const result = await scan("example.com");

    expect(result.hosting?.provider?.name).toBe("Fastly");
    expect(result.hosting?.platform?.name).toBe("Firebase Hosting");
    expect(result.hosting?.platform?.confidence).toBe("high");
  });
});
