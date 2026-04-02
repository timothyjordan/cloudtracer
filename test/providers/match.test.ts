import { describe, it, expect } from "vitest";
import {
  matchDnsProvider,
  matchCdnByHeaders,
  matchCdnByCname,
  matchHostingByAsn,
  matchEmailProvider,
  matchThirdPartyScripts,
  matchHtmlFrameworks,
} from "../../src/providers/match.js";

describe("matchDnsProvider", () => {
  it("should detect Cloudflare DNS", () => {
    const result = matchDnsProvider(["art.ns.cloudflare.com", "beth.ns.cloudflare.com"]);
    expect(result).toBeDefined();
    expect(result!.name).toBe("Cloudflare");
    expect(result!.confidence).toBe("high");
  });

  it("should detect Route 53", () => {
    const result = matchDnsProvider(["ns-1234.awsdns-01.org"]);
    expect(result).toBeDefined();
    expect(result!.name).toBe("Amazon Route 53");
  });

  it("should detect Google Cloud DNS", () => {
    const result = matchDnsProvider(["ns-cloud-a1.googledomains.com"]);
    expect(result).toBeDefined();
    expect(result!.name).toBe("Google Cloud DNS");
  });

  it("should return undefined for unknown nameservers", () => {
    const result = matchDnsProvider(["ns1.unknownprovider.xyz"]);
    expect(result).toBeUndefined();
  });
});

describe("matchCdnByHeaders", () => {
  it("should detect Cloudflare by CF-Ray header", () => {
    const result = matchCdnByHeaders({ "cf-ray": "abc123", "server": "cloudflare" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Cloudflare");
    expect(result[0].evidence.length).toBeGreaterThan(0);
  });

  it("should detect CloudFront by X-Amz-Cf-Id", () => {
    const result = matchCdnByHeaders({ "x-amz-cf-id": "abc123" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Amazon CloudFront");
  });

  it("should detect Vercel", () => {
    const result = matchCdnByHeaders({ "server": "Vercel", "x-vercel-id": "iad1::abc" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Vercel");
  });

  it("should detect multiple CDNs", () => {
    const result = matchCdnByHeaders({
      "cf-ray": "abc",
      "server": "cloudflare",
      "x-amz-cf-id": "def",
    });
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("should return empty for no matches", () => {
    const result = matchCdnByHeaders({ "content-type": "text/html" });
    expect(result).toHaveLength(0);
  });
});

describe("matchCdnByCname", () => {
  it("should detect CloudFront by CNAME", () => {
    const result = matchCdnByCname(["d1234.cloudfront.net"]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Amazon CloudFront");
  });

  it("should detect Netlify by CNAME", () => {
    const result = matchCdnByCname(["mysite.netlify.app"]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Netlify");
  });
});

describe("matchHostingByAsn", () => {
  it("should detect AWS by ASN", () => {
    const result = matchHostingByAsn(16509);
    expect(result).toBeDefined();
    expect(result!.name).toBe("Amazon Web Services");
  });

  it("should detect Google Cloud by ASN", () => {
    const result = matchHostingByAsn(15169);
    expect(result).toBeDefined();
    expect(result!.name).toBe("Google Cloud Platform");
  });

  it("should detect Cloudflare by ASN", () => {
    const result = matchHostingByAsn(13335);
    expect(result).toBeDefined();
    expect(result!.name).toBe("Cloudflare");
  });

  it("should return undefined for unknown ASN", () => {
    const result = matchHostingByAsn(99999);
    expect(result).toBeUndefined();
  });
});

describe("matchEmailProvider", () => {
  it("should detect Google Workspace", () => {
    const result = matchEmailProvider(["aspmx.l.google.com"]);
    expect(result).toBeDefined();
    expect(result!.name).toBe("Google Workspace");
  });

  it("should detect Microsoft 365", () => {
    const result = matchEmailProvider(["mycompany-com.mail.protection.outlook.com"]);
    expect(result).toBeDefined();
    expect(result!.name).toBe("Microsoft 365");
  });

  it("should return undefined for unknown MX", () => {
    const result = matchEmailProvider(["mail.custom-server.xyz"]);
    expect(result).toBeUndefined();
  });
});

describe("matchThirdPartyScripts", () => {
  it("should detect Google Analytics", () => {
    const result = matchThirdPartyScripts([
      "https://www.googletagmanager.com/gtag/js?id=G-ABC123",
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Google Analytics");
    expect(result[0].category).toBe("analytics");
  });

  it("should detect multiple third-party services", () => {
    const result = matchThirdPartyScripts([
      "https://www.googletagmanager.com/gtag/js",
      "https://js.stripe.com/v3/",
      "https://widget.intercom.io/widget/abc",
    ]);
    expect(result).toHaveLength(3);
    const names = result.map((r) => r.name);
    expect(names).toContain("Google Analytics");
    expect(names).toContain("Stripe");
    expect(names).toContain("Intercom");
  });

  it("should not duplicate matches", () => {
    const result = matchThirdPartyScripts([
      "https://www.googletagmanager.com/gtag/js",
      "https://www.google-analytics.com/analytics.js",
    ]);
    const gaMatches = result.filter((r) => r.name === "Google Analytics");
    expect(gaMatches).toHaveLength(1);
  });

  it("should return empty for no matches", () => {
    const result = matchThirdPartyScripts(["https://mysite.com/app.js"]);
    expect(result).toHaveLength(0);
  });
});

describe("matchHtmlFrameworks", () => {
  it("should detect Next.js from __NEXT_DATA__", () => {
    const html = '<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>';
    const result = matchHtmlFrameworks(html);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Next.js");
    expect(result[0].category).toBe("framework");
  });

  it("should detect Next.js from /_next/ paths", () => {
    const html = '<script src="/_next/static/chunks/main.js"></script>';
    const result = matchHtmlFrameworks(html);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Next.js");
  });

  it("should detect Nuxt from __NUXT__", () => {
    const html = '<script>window.__NUXT__={data:{}}</script>';
    const result = matchHtmlFrameworks(html);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Nuxt");
  });

  it("should detect Gatsby from ___gatsby", () => {
    const html = '<div id="___gatsby"><div id="gatsby-focus-wrapper">content</div></div>';
    const result = matchHtmlFrameworks(html);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Gatsby");
  });

  it("should detect Astro from astro-island", () => {
    const html = '<astro-island uid="abc" component-export="Counter"></astro-island>';
    const result = matchHtmlFrameworks(html);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Astro");
  });

  it("should detect TanStack Query", () => {
    const html = '<script>import { QueryClient } from "@tanstack/react-query"</script>';
    const result = matchHtmlFrameworks(html);
    const tq = result.find((r) => r.name === "TanStack Query");
    expect(tq).toBeDefined();
  });

  it("should detect Angular from ng-version", () => {
    const html = '<app-root ng-version="17.0.0"></app-root>';
    const result = matchHtmlFrameworks(html);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Angular");
  });

  it("should detect Vue from data-v- attributes", () => {
    const html = '<div data-v-1234abcd class="app">content</div>';
    const result = matchHtmlFrameworks(html);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Vue.js");
  });

  it("should detect Hugo from meta generator", () => {
    const html = '<meta name="generator" content="Hugo 0.120.0">';
    const result = matchHtmlFrameworks(html);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Hugo");
  });

  it("should detect multiple frameworks", () => {
    const html = `
      <script id="__NEXT_DATA__">{"props":{}}</script>
      <script src="/_next/static/chunks/main.js"></script>
      <div data-emotion="css abc123">styled</div>
    `;
    const result = matchHtmlFrameworks(html);
    const names = result.map((r) => r.name);
    expect(names).toContain("Next.js");
    expect(names).toContain("Emotion");
  });

  it("should return empty for plain HTML", () => {
    const html = "<html><body><p>Hello world</p></body></html>";
    const result = matchHtmlFrameworks(html);
    expect(result).toHaveLength(0);
  });
});
