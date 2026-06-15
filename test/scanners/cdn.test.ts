import { describe, it, expect, vi } from "vitest";
import { scanCdn } from "../../src/scanners/cdn.js";
import { mockPlatform } from "../helpers/platform.js";

vi.mock("../../src/utils/http.js", () => ({
  fetchHeaders: vi.fn(),
}));

import { fetchHeaders } from "../../src/utils/http.js";

describe("scanCdn", () => {
  it("should detect Cloudflare by headers", async () => {
    vi.mocked(fetchHeaders).mockResolvedValue({
      "cf-ray": "abc123",
      "server": "cloudflare",
    });
    const platform = mockPlatform({
      dns: { resolveCname: vi.fn().mockResolvedValue([]) },
    });

    const result = await scanCdn("example.com", platform);

    expect(result.providers).toHaveLength(1);
    expect(result.providers[0].provider.name).toBe("Cloudflare");
    expect(result.providers[0].evidence.length).toBeGreaterThan(0);
  });

  it("should detect CDN by CNAME", async () => {
    vi.mocked(fetchHeaders).mockResolvedValue({});
    const platform = mockPlatform({
      dns: { resolveCname: vi.fn().mockResolvedValue(["d1234.cloudfront.net"]) },
    });

    const result = await scanCdn("example.com", platform);

    expect(result.providers).toHaveLength(1);
    expect(result.providers[0].provider.name).toBe("Amazon CloudFront");
  });

  it("should merge header and CNAME evidence for same provider", async () => {
    vi.mocked(fetchHeaders).mockResolvedValue({
      "x-amz-cf-id": "abc",
    });
    const platform = mockPlatform({
      dns: { resolveCname: vi.fn().mockResolvedValue(["d1234.cloudfront.net"]) },
    });

    const result = await scanCdn("example.com", platform);

    expect(result.providers).toHaveLength(1);
    expect(result.providers[0].provider.name).toBe("Amazon CloudFront");
    expect(result.providers[0].evidence.length).toBe(2);
  });

  it("should return empty providers when no CDN detected", async () => {
    vi.mocked(fetchHeaders).mockResolvedValue({ "content-type": "text/html" });
    const platform = mockPlatform({
      dns: { resolveCname: vi.fn().mockResolvedValue([]) },
    });

    const result = await scanCdn("example.com", platform);

    expect(result.providers).toHaveLength(0);
  });
});
