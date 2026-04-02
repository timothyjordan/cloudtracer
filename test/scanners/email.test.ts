import { describe, it, expect, vi } from "vitest";
import { scanEmail } from "../../src/scanners/email.js";

vi.mock("../../src/utils/dns.js", () => ({
  resolveMx: vi.fn(),
  resolveTxt: vi.fn(),
}));

import { resolveMx, resolveTxt } from "../../src/utils/dns.js";

describe("scanEmail", () => {
  it("should detect Google Workspace", async () => {
    vi.mocked(resolveMx).mockResolvedValue([
      { priority: 10, exchange: "aspmx.l.google.com" },
      { priority: 20, exchange: "alt1.aspmx.l.google.com" },
    ]);
    vi.mocked(resolveTxt).mockResolvedValue([
      "v=spf1 include:_spf.google.com ~all",
    ]);

    const result = await scanEmail("example.com");

    expect(result.provider).toBeDefined();
    expect(result.provider!.name).toBe("Google Workspace");
    expect(result.mxRecords).toHaveLength(2);
    expect(result.mxRecords[0].priority).toBe(10);
    expect(result.spf).toBe("v=spf1 include:_spf.google.com ~all");
  });

  it("should handle no MX records", async () => {
    vi.mocked(resolveMx).mockResolvedValue([]);
    vi.mocked(resolveTxt).mockResolvedValue([]);

    const result = await scanEmail("example.com");

    expect(result.mxRecords).toHaveLength(0);
    expect(result.provider).toBeUndefined();
  });

  it("should detect DMARC record", async () => {
    vi.mocked(resolveMx).mockResolvedValue([
      { priority: 10, exchange: "mx.example.com" },
    ]);
    // First call: domain TXT records, second call: _dmarc TXT
    vi.mocked(resolveTxt)
      .mockResolvedValueOnce(["v=spf1 -all"])
      .mockResolvedValueOnce(["v=DMARC1; p=reject"]);

    const result = await scanEmail("example.com");

    expect(result.spf).toBe("v=spf1 -all");
    expect(result.dmarc).toBe("v=DMARC1; p=reject");
  });
});
