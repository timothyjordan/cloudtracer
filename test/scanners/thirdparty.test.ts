import { describe, it, expect, vi } from "vitest";
import { scanThirdParty } from "../../src/scanners/thirdparty.js";

vi.mock("../../src/utils/http.js", () => ({
  fetchHtml: vi.fn(),
}));

import { fetchHtml } from "../../src/utils/http.js";

describe("scanThirdParty", () => {
  it("should detect Google Analytics and Stripe", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(`
      <!DOCTYPE html>
      <html>
      <head>
        <script src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script>
      </head>
      <body>
        <script src="https://js.stripe.com/v3/"></script>
      </body>
      </html>
    `);

    const result = await scanThirdParty("example.com");

    expect(result).toHaveLength(2);
    const names = result.map((r) => r.name);
    expect(names).toContain("Google Analytics");
    expect(names).toContain("Stripe");
  });

  it("should detect Google Fonts from link tags", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(`
      <html>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
      </head>
      <body></body>
      </html>
    `);

    const result = await scanThirdParty("example.com");

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Google Fonts");
    expect(result[0].category).toBe("fonts");
  });

  it("should return empty for pages with no third-party scripts", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(`
      <html><body><p>Hello</p></body></html>
    `);

    const result = await scanThirdParty("example.com");
    expect(result).toHaveLength(0);
  });

  it("should return empty when HTML fetch fails", async () => {
    vi.mocked(fetchHtml).mockResolvedValue("");

    const result = await scanThirdParty("example.com");
    expect(result).toHaveLength(0);
  });

  it("should detect Next.js from HTML patterns", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(`
      <!DOCTYPE html>
      <html>
      <head>
        <script src="/_next/static/chunks/main-abc123.js"></script>
      </head>
      <body>
        <div id="__next">
          <script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>
        </div>
      </body>
      </html>
    `);

    const result = await scanThirdParty("example.com");
    const names = result.map((r) => r.name);
    expect(names).toContain("Next.js");
  });

  it("should detect both script-based and HTML-based services", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(`
      <html>
      <head>
        <script src="https://www.googletagmanager.com/gtag/js"></script>
      </head>
      <body>
        <div id="__next">
          <script id="__NEXT_DATA__">{"props":{}}</script>
        </div>
      </body>
      </html>
    `);

    const result = await scanThirdParty("example.com");
    const names = result.map((r) => r.name);
    expect(names).toContain("Google Analytics");
    expect(names).toContain("Next.js");
  });
});
