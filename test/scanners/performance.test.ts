import { describe, it, expect, vi } from "vitest";
import { scanPerformance } from "../../src/scanners/performance.js";
import { mockPlatform } from "../helpers/platform.js";

// Mock fetch
const mockFetch = vi.fn().mockResolvedValue({
  headers: new Headers({ "content-length": "12345" }),
  text: vi.fn().mockResolvedValue("<html>hello</html>"),
});
vi.stubGlobal("fetch", mockFetch);

function perfPlatform() {
  return mockPlatform({
    dns: { resolveA: vi.fn().mockResolvedValue(["1.2.3.4"]) },
    measureTlsMs: vi.fn().mockResolvedValue(20),
  });
}

describe("scanPerformance", () => {
  it("should return all timing metrics", async () => {
    const result = await scanPerformance("example.com", perfPlatform());

    expect(result.dnsResolutionMs).toBeTypeOf("number");
    expect(result.dnsResolutionMs).toBeGreaterThanOrEqual(0);
    expect(result.tlsHandshakeMs).toBeTypeOf("number");
    expect(result.tlsHandshakeMs).toBe(20);
    expect(result.ttfbMs).toBeTypeOf("number");
    expect(result.ttfbMs).toBeGreaterThanOrEqual(0);
    expect(result.totalResponseMs).toBeTypeOf("number");
    expect(result.totalResponseMs).toBeGreaterThanOrEqual(0);
    expect(result.contentSizeBytes).toBe(12345);
  });

  it("should have totalResponseMs >= ttfbMs", async () => {
    const result = await scanPerformance("example.com", perfPlatform());
    expect(result.totalResponseMs).toBeGreaterThanOrEqual(result.ttfbMs);
  });

  it("should report -1 TLS timing when the platform cannot measure it", async () => {
    const platform = mockPlatform({
      dns: { resolveA: vi.fn().mockResolvedValue(["1.2.3.4"]) },
    });

    const result = await scanPerformance("example.com", platform);
    expect(result.tlsHandshakeMs).toBe(-1);
  });
});
