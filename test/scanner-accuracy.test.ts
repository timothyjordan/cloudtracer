import { describe, it, expect, vi, beforeEach } from "vitest";
import { runScan } from "../src/scanner.js";
import { mockPlatform } from "./helpers/platform.js";

vi.mock("../src/utils/http.js", () => ({
  fetchHeaders: vi.fn(),
  fetchHtml: vi.fn().mockResolvedValue(""),
}));
vi.mock("../src/scanners/domain.js", () => ({
  scanDomain: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/scanners/performance.js", () => ({
  scanPerformance: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/scanners/thirdparty.js", () => ({
  scanThirdParty: vi.fn().mockResolvedValue([]),
}));

import { fetchHeaders } from "../src/utils/http.js";

describe("detection accuracy cross-referencing", () => {
  beforeEach(() => {
    vi.mocked(fetchHeaders).mockReset();
    vi.mocked(fetchHeaders).mockResolvedValue({});
  });

  it("keeps NS1 DNS as NS1 when Netlify is not present", async () => {
    vi.mocked(fetchHeaders).mockResolvedValue({
      server: "nginx",
    });

    const platform = mockPlatform({
      dns: {
        resolveNs: vi.fn().mockResolvedValue(["dns1.p01.nsone.net"]),
        resolveA: vi.fn().mockResolvedValue(["1.2.3.4"]),
      },
    });

    const result = await runScan("example.com", platform);
    expect(result.dns?.provider?.name).toBe("NS1");
  });

  it("attributes NS1 DNS to Netlify when Netlify CDN/hosting is present", async () => {
    vi.mocked(fetchHeaders).mockResolvedValue({
      server: "Netlify",
      "x-nf-request-id": "01ABC",
    });

    const platform = mockPlatform({
      dns: {
        resolveNs: vi.fn().mockResolvedValue(["dns1.p05.nsone.net"]),
        resolveA: vi.fn().mockResolvedValue(["75.2.60.5"]),
      },
    });

    const result = await runScan("example.com", platform);
    expect(result.hosting?.platform?.name).toBe("Netlify");
    expect(result.dns?.provider?.name).toBe("Netlify");
  });

  it("detects GitHub Pages on Fastly for cloudtracer.dev fixture", async () => {
    vi.mocked(fetchHeaders).mockResolvedValue({
      server: "GitHub.com",
      via: "1.1 varnish",
      "x-served-by": "cache-sjc1000129-SJC",
      "x-github-request-id": "1A2B:3C4D",
    });

    const platform = mockPlatform({
      dns: {
        resolveA: vi.fn().mockResolvedValue([
          "185.199.108.153",
          "185.199.109.153",
          "185.199.110.153",
          "185.199.111.153",
        ]),
        resolveTxt: vi.fn().mockImplementation(async (name: string) => {
          if (name.endsWith(".origin.asn.cymru.com")) {
            return ["54113 | 185.199.108.153 | 185.199.108.0/22 | US | arin"];
          }
          if (name === "AS54113.asn.cymru.com") {
            return ["54113 | US | arin | 2011-04-12 | FASTLY - Fastly, Inc., US"];
          }
          return [];
        }),
      },
    });

    const result = await runScan("cloudtracer.dev", platform);
    expect(result.hosting?.provider?.name).toBe("Fastly");
    expect(result.hosting?.platform).toEqual({
      name: "GitHub Pages",
      confidence: "high",
    });
  });

  it("detects GitHub Pages from *.github.io CNAME", async () => {
    vi.mocked(fetchHeaders).mockResolvedValue({
      "x-served-by": "cache-iad-kiad7000123-IAD",
    });

    const platform = mockPlatform({
      dns: {
        resolveCname: vi.fn().mockResolvedValue(["timothyjordan.github.io"]),
        resolveA: vi.fn().mockResolvedValue(["185.199.108.153"]),
      },
    });

    const result = await runScan("docs.example.com", platform);
    expect(result.hosting?.platform?.name).toBe("GitHub Pages");
  });

  it("detects GitHub Pages from documented IPv6 apex IP even without headers", async () => {
    vi.mocked(fetchHeaders).mockResolvedValue({});

    const platform = mockPlatform({
      dns: {
        resolveAaaa: vi.fn().mockResolvedValue(["2606:50c0:8000:0:0:0:0:153"]),
      },
    });

    const result = await runScan("ipv6-pages.example.com", platform);
    expect(result.hosting?.platform).toEqual({
      name: "GitHub Pages",
      confidence: "high",
    });
    expect(result.hosting?.behindCdn).toBeUndefined();
  });

  it("marks hosting as behindCdn when only a CDN ASN is matched (Cloudflare)", async () => {
    vi.mocked(fetchHeaders).mockResolvedValue({
      "cf-ray": "abc123-SJC",
      server: "cloudflare",
    });

    const platform = mockPlatform({
      dns: {
        resolveA: vi.fn().mockResolvedValue(["104.21.1.2"]),
        resolveTxt: vi.fn().mockImplementation(async (name: string) => {
          if (name.endsWith(".origin.asn.cymru.com")) {
            return ["13335 | 104.21.1.2 | 104.21.0.0/16 | US | arin"];
          }
          if (name === "AS13335.asn.cymru.com") {
            return ["13335 | US | arin | 2010-07-14 | CLOUDFLARENET, US"];
          }
          return [];
        }),
      },
    });

    const result = await runScan("behind-cf.example.com", platform);
    expect(result.hosting?.platform).toBeUndefined();
    expect(result.hosting?.behindCdn).toBe("Cloudflare");
  });

  it("marks hosting as behindCdn when CloudFront sits on AWS ASN with no platform", async () => {
    vi.mocked(fetchHeaders).mockResolvedValue({
      "x-amz-cf-id": "abc123",
      via: "1.1 abc.cloudfront.net (CloudFront)",
    });

    const platform = mockPlatform({
      dns: {
        resolveA: vi.fn().mockResolvedValue(["13.225.1.2"]),
        resolveTxt: vi.fn().mockImplementation(async (name: string) => {
          if (name.endsWith(".origin.asn.cymru.com")) {
            return ["16509 | 13.225.1.2 | 13.225.0.0/16 | US | arin"];
          }
          if (name === "AS16509.asn.cymru.com") {
            return ["16509 | US | arin | 2000-05-04 | AMAZON-02, US"];
          }
          return [];
        }),
      },
    });

    const result = await runScan("behind-cf-aws.example.com", platform);
    expect(result.hosting?.platform).toBeUndefined();
    expect(result.hosting?.behindCdn).toBe("Amazon CloudFront");
  });

  it("sets behindCdn alongside platform when a platform sits behind a CDN edge", async () => {
    vi.mocked(fetchHeaders).mockResolvedValue({
      server: "cloudflare",
      "cf-ray": "a5d98c92dd5633fc-SJC",
      "x-github-request-id": "0C2C:329D7C",
      "x-github-edge-region": "westus3",
    });

    const platform = mockPlatform({
      dns: {
        resolveA: vi.fn().mockResolvedValue(["104.21.54.121"]),
        resolveTxt: vi.fn().mockImplementation(async (name: string) => {
          if (name.endsWith(".origin.asn.cymru.com")) {
            return ["13335 | 104.21.54.121 | 104.21.0.0/16 | US | arin"];
          }
          if (name === "AS13335.asn.cymru.com") {
            return ["13335 | US | arin | 2010-07-14 | CLOUDFLARENET, US"];
          }
          return [];
        }),
      },
    });

    const result = await runScan("cloudtracer.dev", platform);
    expect(result.hosting?.platform?.name).toBe("GitHub Pages");
    expect(result.hosting?.behindCdn).toBe("Cloudflare");
  });
});
