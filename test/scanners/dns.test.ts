import { describe, it, expect, vi } from "vitest";
import { scanDns } from "../../src/scanners/dns.js";
import { mockPlatform } from "../helpers/platform.js";

describe("scanDns", () => {
  it("should detect Cloudflare DNS provider", async () => {
    const platform = mockPlatform({
      dns: {
        resolveNs: vi.fn().mockResolvedValue([
          "art.ns.cloudflare.com",
          "beth.ns.cloudflare.com",
        ]),
      },
    });

    const result = await scanDns("example.com", platform);

    expect(result.nameservers).toEqual([
      "art.ns.cloudflare.com",
      "beth.ns.cloudflare.com",
    ]);
    expect(result.provider).toBeDefined();
    expect(result.provider!.name).toBe("Cloudflare");
  });

  it("should return no provider for unknown nameservers", async () => {
    const platform = mockPlatform({
      dns: { resolveNs: vi.fn().mockResolvedValue(["ns1.example.com"]) },
    });

    const result = await scanDns("example.com", platform);

    expect(result.nameservers).toEqual(["ns1.example.com"]);
    expect(result.provider).toBeUndefined();
  });

  it("should handle empty nameservers", async () => {
    const platform = mockPlatform();

    const result = await scanDns("nonexistent.example", platform);

    expect(result.nameservers).toEqual([]);
    expect(result.provider).toBeUndefined();
  });
});
