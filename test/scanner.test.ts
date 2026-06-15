import { describe, it, expect, vi } from "vitest";

vi.mock("../src/scanners/dns.js", () => ({
  scanDns: vi.fn().mockResolvedValue({ nameservers: [], provider: undefined }),
}));
vi.mock("../src/scanners/domain.js", () => ({
  scanDomain: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/scanners/ssl.js", () => ({
  scanSsl: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/scanners/hosting.js", () => ({
  scanHosting: vi.fn().mockResolvedValue({
    ipAddresses: { v4: ["216.198.79.1"], v6: [] },
    asn: { number: 16509, name: "AMAZON-02" },
    provider: { name: "Amazon Web Services", confidence: "high" },
  }),
}));
vi.mock("../src/scanners/cdn.js", () => ({
  scanCdn: vi.fn().mockResolvedValue({
    providers: [
      {
        provider: { name: "Vercel", confidence: "high" },
        evidence: ["Header: server: Vercel"],
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

describe("scan orchestrator", () => {
  it("should cross-reference platform from CDN to hosting", async () => {
    const result = await scan("example.com");

    expect(result.hosting?.provider?.name).toBe("Amazon Web Services");
    expect(result.hosting?.platform?.name).toBe("Vercel");
  });

  it("should assemble results from all scanners", async () => {
    const result = await scan("example.com");

    expect(result.domain).toBe("example.com");
    expect(result.scannedAt).toBeTruthy();
    expect(result.hosting).toBeDefined();
    expect(result.cdn).toBeDefined();
  });
});
