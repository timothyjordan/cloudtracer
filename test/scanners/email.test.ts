import { describe, it, expect, vi } from "vitest";
import { scanEmail } from "../../src/scanners/email.js";
import { mockPlatform } from "../helpers/platform.js";

describe("scanEmail", () => {
  it("should detect Google Workspace", async () => {
    const platform = mockPlatform({
      dns: {
        resolveMx: vi.fn().mockResolvedValue([
          { priority: 10, exchange: "aspmx.l.google.com" },
          { priority: 20, exchange: "alt1.aspmx.l.google.com" },
        ]),
        resolveTxt: vi.fn().mockResolvedValue([
          "v=spf1 include:_spf.google.com ~all",
        ]),
      },
    });

    const result = await scanEmail("example.com", platform);

    expect(result.provider).toBeDefined();
    expect(result.provider!.name).toBe("Google Workspace");
    expect(result.mxRecords).toHaveLength(2);
    expect(result.mxRecords[0].priority).toBe(10);
    expect(result.spf).toBe("v=spf1 include:_spf.google.com ~all");
  });

  it("should handle no MX records", async () => {
    const platform = mockPlatform();

    const result = await scanEmail("example.com", platform);

    expect(result.mxRecords).toHaveLength(0);
    expect(result.provider).toBeUndefined();
  });

  it("should detect DMARC record", async () => {
    const platform = mockPlatform({
      dns: {
        resolveMx: vi.fn().mockResolvedValue([
          { priority: 10, exchange: "mx.example.com" },
        ]),
        // First call: domain TXT records, second call: _dmarc TXT
        resolveTxt: vi
          .fn()
          .mockResolvedValueOnce(["v=spf1 -all"])
          .mockResolvedValueOnce(["v=DMARC1; p=reject"]),
      },
    });

    const result = await scanEmail("example.com", platform);

    expect(result.spf).toBe("v=spf1 -all");
    expect(result.dmarc).toBe("v=DMARC1; p=reject");
  });
});
