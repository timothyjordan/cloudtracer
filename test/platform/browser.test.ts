import { describe, it, expect, vi, beforeEach } from "vitest";
import { browserPlatform } from "../../src/platform/browser.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function dohResponse(answer: { name?: string; type: number; data: string }[]) {
  return {
    ok: true,
    json: async () => ({
      Status: 0,
      Answer: answer.map((a) => ({ name: a.name ?? "x", TTL: 300, ...a })),
    }),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("browserPlatform.dns (DNS-over-HTTPS)", () => {
  it("resolves NS records and strips the trailing dot", async () => {
    mockFetch.mockResolvedValueOnce(
      dohResponse([
        { type: 2, data: "ns1.example.com." },
        { type: 2, data: "ns2.example.com." },
      ]),
    );

    const result = await browserPlatform.dns.resolveNs("example.com");
    expect(result).toEqual(["ns1.example.com", "ns2.example.com"]);

    // Confirms it hit the DoH endpoint with the right type.
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("cloudflare-dns.com");
    expect(url).toContain("type=NS");
  });

  it("resolves A records and ignores entries of other types", async () => {
    mockFetch.mockResolvedValueOnce(
      dohResponse([
        { type: 5, data: "alias.example.com." }, // CNAME in the chain, ignored
        { type: 1, data: "93.184.216.34" },
      ]),
    );

    const result = await browserPlatform.dns.resolveA("example.com");
    expect(result).toEqual(["93.184.216.34"]);
  });

  it("parses MX records into priority/exchange", async () => {
    mockFetch.mockResolvedValueOnce(
      dohResponse([
        { type: 15, data: "10 mail.example.com." },
        { type: 15, data: "20 alt.example.com." },
      ]),
    );

    const result = await browserPlatform.dns.resolveMx("example.com");
    expect(result).toEqual([
      { priority: 10, exchange: "mail.example.com" },
      { priority: 20, exchange: "alt.example.com" },
    ]);
  });

  it("unquotes TXT records (including the cymru ASN format)", async () => {
    mockFetch.mockResolvedValueOnce(
      dohResponse([
        { type: 16, data: '"15169 | 8.8.8.0/24 | US | arin | "' },
      ]),
    );

    const result = await browserPlatform.dns.resolveTxt("8.8.8.8.origin.asn.cymru.com");
    expect(result).toEqual(["15169 | 8.8.8.0/24 | US | arin | "]);
  });

  it("returns [] when the DoH status is an error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ Status: 2, Answer: [] }),
    });

    expect(await browserPlatform.dns.resolveCname("example.com")).toEqual([]);
  });

  it("returns [] when the request throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));
    expect(await browserPlatform.dns.resolveA("example.com")).toEqual([]);
  });
});

describe("browserPlatform.getCertificate (crt.sh)", () => {
  it("maps the most recent valid cert into SslInfo", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          issuer_name: "C=US, O=Let's Encrypt, CN=R3",
          common_name: "example.com",
          name_value: "example.com\nwww.example.com\nexample.com",
          not_before: "2020-01-01T00:00:00",
          not_after: "2030-01-01T00:00:00",
        },
        {
          // older issuance, should not be chosen
          issuer_name: "C=US, O=Old CA, CN=Old",
          common_name: "example.com",
          name_value: "example.com",
          not_before: "2019-01-01T00:00:00",
          not_after: "2019-06-01T00:00:00",
        },
      ],
    });

    const ssl = await browserPlatform.getCertificate("example.com");
    expect(ssl).toBeDefined();
    expect(ssl!.issuer).toBe("Let's Encrypt");
    expect(ssl!.subject).toBe("example.com");
    expect(ssl!.san).toEqual(["example.com", "www.example.com"]); // deduped
    expect(ssl!.protocol).toBe("unknown");
    expect(ssl!.daysUntilExpiry).toBeGreaterThan(0);
    expect(ssl!.validTo).toBe("2030-01-01T00:00:00.000Z");
  });

  it("falls back to CN when the issuer has no O field", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          issuer_name: "CN=Some Internal CA",
          common_name: "internal.example",
          name_value: "internal.example",
          not_before: "2025-01-01T00:00:00",
          not_after: "2035-01-01T00:00:00",
        },
      ],
    });

    const ssl = await browserPlatform.getCertificate("internal.example");
    expect(ssl!.issuer).toBe("Some Internal CA");
  });

  it("returns undefined for an empty crt.sh result", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    expect(await browserPlatform.getCertificate("example.com")).toBeUndefined();
  });

  it("returns undefined when the request fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("timeout"));
    expect(await browserPlatform.getCertificate("example.com")).toBeUndefined();
  });
});

describe("browserPlatform capabilities", () => {
  it("omits whois and measureTlsMs (not possible in the browser)", () => {
    expect(browserPlatform.whois).toBeUndefined();
    expect(browserPlatform.measureTlsMs).toBeUndefined();
  });
});
