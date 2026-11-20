import { describe, it, expect, vi, beforeEach } from "vitest";
import { runScan } from "../src/scanner.js";
import { mockPlatform } from "./helpers/platform.js";

vi.mock("../src/utils/http.js", () => ({
  fetchHeaders: vi.fn(),
  fetchHtml: vi.fn().mockResolvedValue(""),
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
});
