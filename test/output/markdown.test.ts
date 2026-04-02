import { describe, it, expect } from "vitest";
import { formatMarkdown } from "../../src/output/markdown.js";
import type { ScanResult } from "../../src/types.js";

describe("formatMarkdown", () => {
  it("should include domain in heading", () => {
    const result: ScanResult = {
      domain: "example.com",
      scannedAt: new Date().toISOString(),
    };

    const output = formatMarkdown(result);
    expect(output).toContain("# Site Stack Report: example.com");
  });

  it("should include Mermaid diagram", () => {
    const result: ScanResult = {
      domain: "example.com",
      scannedAt: new Date().toISOString(),
      dns: {
        nameservers: ["ns1.cloudflare.com"],
        provider: { name: "Cloudflare", confidence: "high" },
      },
      hosting: {
        ipAddresses: { v4: ["1.2.3.4"], v6: [] },
        provider: { name: "Cloudflare", confidence: "high" },
      },
    };

    const output = formatMarkdown(result);
    expect(output).toContain("```mermaid");
    expect(output).toContain("graph TD");
    expect(output).toContain("DNS");
  });

  it("should include third-party services table", () => {
    const result: ScanResult = {
      domain: "example.com",
      scannedAt: new Date().toISOString(),
      thirdPartyServices: [
        { name: "Stripe", category: "payments", evidence: "script src: js.stripe.com" },
      ],
    };

    const output = formatMarkdown(result);
    expect(output).toContain("| Stripe | payments |");
  });
});
