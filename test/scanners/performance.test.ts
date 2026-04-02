import { describe, it, expect, vi } from "vitest";
import { scanPerformance } from "../../src/scanners/performance.js";

// Mock dns
vi.mock("node:dns", () => ({
  promises: {
    resolve4: vi.fn().mockResolvedValue(["1.2.3.4"]),
  },
}));

// Mock tls
vi.mock("node:tls", () => ({
  connect: vi.fn((_opts: unknown, callback: () => void) => {
    setTimeout(callback, 10);
    return {
      destroy: vi.fn(),
      setTimeout: vi.fn(),
      on: vi.fn(),
    };
  }),
}));

// Mock fetch
const mockFetch = vi.fn().mockResolvedValue({
  headers: new Headers({ "content-length": "12345" }),
  text: vi.fn().mockResolvedValue("<html>hello</html>"),
});
vi.stubGlobal("fetch", mockFetch);

describe("scanPerformance", () => {
  it("should return all timing metrics", async () => {
    const result = await scanPerformance("example.com");

    expect(result.dnsResolutionMs).toBeTypeOf("number");
    expect(result.dnsResolutionMs).toBeGreaterThanOrEqual(0);
    expect(result.tlsHandshakeMs).toBeTypeOf("number");
    expect(result.ttfbMs).toBeTypeOf("number");
    expect(result.ttfbMs).toBeGreaterThanOrEqual(0);
    expect(result.totalResponseMs).toBeTypeOf("number");
    expect(result.totalResponseMs).toBeGreaterThanOrEqual(0);
    expect(result.contentSizeBytes).toBe(12345);
  });

  it("should have totalResponseMs >= ttfbMs", async () => {
    const result = await scanPerformance("example.com");
    expect(result.totalResponseMs).toBeGreaterThanOrEqual(result.ttfbMs);
  });
});
