import { describe, it, expect, vi, beforeEach } from "vitest";
import { scanDomain } from "../../src/scanners/domain.js";
import { mockPlatform } from "../helpers/platform.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function rdapResponse(registrar: string) {
  return {
    ok: true,
    json: async () => ({
      entities: [
        {
          roles: ["registrar"],
          vcardArray: ["vcard", [["fn", {}, "text", registrar]]],
        },
      ],
      events: [
        { eventAction: "registration", eventDate: "2010-01-01T00:00:00Z" },
        { eventAction: "expiration", eventDate: "2030-01-01T00:00:00Z" },
      ],
    }),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("scanDomain (RDAP)", () => {
  it("parses the registrar from an RDAP response", async () => {
    mockFetch.mockResolvedValueOnce(rdapResponse("Squarespace Domains II LLC"));

    const result = await scanDomain("example.com", mockPlatform());
    expect(result).toEqual({
      registrar: "Squarespace Domains II LLC",
      registeredDate: "2010-01-01T00:00:00Z",
      expirationDate: "2030-01-01T00:00:00Z",
      source: "rdap",
    });
  });

  it("retries once on a transient network failure", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(rdapResponse("GoDaddy.com, LLC"));

    const result = await scanDomain("example.com", mockPlatform());
    expect(result?.registrar).toBe("GoDaddy.com, LLC");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries on a 5xx response", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) })
      .mockResolvedValueOnce(rdapResponse("Cloudflare, Inc."));

    const result = await scanDomain("example.com", mockPlatform());
    expect(result?.registrar).toBe("Cloudflare, Inc.");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 404 (authoritative no-record) and falls back to whois", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const whois = vi.fn().mockResolvedValue({
      registrar: "From WHOIS",
      source: "whois" as const,
    });

    const result = await scanDomain("example.com", mockPlatform({ whois }));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result?.registrar).toBe("From WHOIS");
  });

  it("returns undefined when both attempts fail and no whois is available", async () => {
    mockFetch.mockRejectedValue(new Error("offline"));

    const result = await scanDomain("example.com", mockPlatform());
    expect(result).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
