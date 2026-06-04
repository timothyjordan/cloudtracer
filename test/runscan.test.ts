import { describe, it, expect, vi, beforeEach } from "vitest";
import { runScan } from "../src/scanner.js";
import { mockPlatform } from "./helpers/platform.js";

// The scanners that talk to the network directly (CDN headers, third-party
// HTML, RDAP, HTTP timing) use global fetch. Stub it with a benign empty
// response so they degrade quietly and the test stays focused on platform
// dependency-injection wiring.
const mockFetch = vi.fn().mockResolvedValue({
  ok: false,
  status: 503,
  headers: new Headers(),
  text: async () => "",
  json: async () => ({}),
});
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => mockFetch.mockClear());

describe("runScan dependency injection", () => {
  it("threads the injected platform through every scanner", async () => {
    const platform = mockPlatform({
      dns: { resolveNs: vi.fn().mockResolvedValue(["art.ns.cloudflare.com"]) },
      getCertificate: vi.fn().mockResolvedValue({
        issuer: "Let's Encrypt",
        subject: "example.com",
        san: ["example.com"],
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: "2026-06-01T00:00:00.000Z",
        daysUntilExpiry: 42,
        protocol: "unknown",
      }),
      measureTlsMs: vi.fn().mockResolvedValue(7),
    });

    const result = await runScan("example.com", platform);

    expect(result.domain).toBe("example.com");
    expect(result.scannedAt).toBeTruthy();
    expect(result.dns?.provider?.name).toBe("Cloudflare");
    expect(result.ssl?.issuer).toBe("Let's Encrypt");
    expect(result.performance?.tlsHandshakeMs).toBe(7);
    expect(platform.getCertificate).toHaveBeenCalledWith("example.com");
  });

  it("emits progressive partial results via onResult", async () => {
    const platform = mockPlatform({
      dns: { resolveNs: vi.fn().mockResolvedValue(["art.ns.cloudflare.com"]) },
    });

    const partials: number[] = [];
    const final = await runScan("example.com", platform, {
      onResult: (partial) => {
        // Count how many top-level categories are populated at each step.
        partials.push(
          [partial.dns, partial.registration, partial.ssl, partial.hosting,
           partial.cdn, partial.email, partial.thirdPartyServices,
           partial.performance].filter((v) => v !== undefined).length,
        );
      },
    });

    // One callback per scanner, monotonically filling in categories.
    expect(partials.length).toBe(8);
    expect(partials[partials.length - 1]).toBeGreaterThanOrEqual(partials[0]);
    expect(final.dns?.provider?.name).toBe("Cloudflare");
  });

  it("degrades gracefully when the platform omits optional capabilities", async () => {
    const platform = mockPlatform(); // no whois, no measureTlsMs

    const result = await runScan("example.com", platform);

    // No raw TLS timing available -> reported as -1, scan still completes.
    expect(result.performance?.tlsHandshakeMs).toBe(-1);
    expect(result.domain).toBe("example.com");
  });
});
