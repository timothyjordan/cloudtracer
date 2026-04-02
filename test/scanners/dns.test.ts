import { describe, it, expect, vi } from "vitest";
import { scanDns } from "../../src/scanners/dns.js";

vi.mock("../../src/utils/dns.js", () => ({
  resolveNs: vi.fn(),
}));

import { resolveNs } from "../../src/utils/dns.js";

describe("scanDns", () => {
  it("should detect Cloudflare DNS provider", async () => {
    vi.mocked(resolveNs).mockResolvedValue([
      "art.ns.cloudflare.com",
      "beth.ns.cloudflare.com",
    ]);

    const result = await scanDns("example.com");

    expect(result.nameservers).toEqual([
      "art.ns.cloudflare.com",
      "beth.ns.cloudflare.com",
    ]);
    expect(result.provider).toBeDefined();
    expect(result.provider!.name).toBe("Cloudflare");
  });

  it("should return no provider for unknown nameservers", async () => {
    vi.mocked(resolveNs).mockResolvedValue(["ns1.example.com"]);

    const result = await scanDns("example.com");

    expect(result.nameservers).toEqual(["ns1.example.com"]);
    expect(result.provider).toBeUndefined();
  });

  it("should handle empty nameservers", async () => {
    vi.mocked(resolveNs).mockResolvedValue([]);

    const result = await scanDns("nonexistent.example");

    expect(result.nameservers).toEqual([]);
    expect(result.provider).toBeUndefined();
  });
});
