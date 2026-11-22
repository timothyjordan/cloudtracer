import { describe, it, expect } from "vitest";
import {
  branchFor,
  formatDriftIssueBody,
  markerFor,
  parseArgs,
  planDriftActions,
  // @ts-expect-error report-provider-drift.mjs is an ESM Node script without d.ts
} from "../../scripts/report-provider-drift.mjs";

function makeProvider(id: string, name: string, status: "passing" | "degraded" | "failing") {
  return {
    id,
    name,
    website: null,
    status,
    expectedLayers: ["dns", "cdn"],
    matchedLayers: status === "failing" ? [] : ["dns"],
    missedLayers: status === "passing" ? [] : ["cdn"],
    newSignals: [],
    domains: [{ domain: `${id}.example`, ok: true, matchedLayers: status === "failing" ? [] : ["dns"] }],
  };
}

describe("report-provider-drift planner", () => {
  it("deduplicates against open issues and open draft PRs, prioritizes failing, and enforces maxItems cap", () => {
    const report = {
      generatedAt: "2026-11-21T09:00:00Z",
      providers: [
        makeProvider("ok_provider", "OK Provider", "passing"),
        makeProvider("alpha_deg", "Alpha", "degraded"),
        makeProvider("beta_fail", "Beta", "failing"),
        makeProvider("gamma_fail", "Gamma", "failing"),
        makeProvider("delta_deg", "Delta", "degraded"),
        makeProvider("eps_deg", "Epsilon", "degraded"),
      ],
    };

    const actions = planDriftActions({
      report,
      openIssues: [{ number: 42, body: `details\n${markerFor("beta_fail")}` }],
      openPrs: [{ number: 55, headRefName: branchFor("alpha_deg") }],
      maxItems: 2,
    });

    expect(actions.map((a: { id: string; type: string }) => `${a.id}:${a.type}`)).toEqual([
      "beta_fail:skip_existing_issue",
      "gamma_fail:create_issue",
      "alpha_deg:skip_existing_pr",
      "delta_deg:create_issue",
      "eps_deg:skip_capped",
    ]);
  });

  it("embeds the deduplication marker and verification details in issue bodies", () => {
    const body = formatDriftIssueBody(
      {
        ...makeProvider("fastly", "Fastly", "degraded"),
        timedOutLayers: ["thirdparty"],
        newSignals: [
          {
            key: "asn:99999",
            type: "unrecorded_asn",
            domain: "fastly.com",
            asn: 99999,
            asnName: "FASTLY-NEW",
          },
        ],
      },
      "2026-11-21T09:00:00Z",
    );

    expect(body).toContain("<!-- provider-drift:fastly -->");
    expect(body).toContain("providers/fastly.json");
    expect(body).toContain("**Timed out (inconclusive) layers:** thirdparty");
    expect(body).toContain("AS99999");
    expect(body).toContain("provider-drift/fastly");
  });

  it("parses --max-items 0 as 0 and caps all newly created issues", () => {
    const opts = parseArgs(["--report", "drift.json", "--max-items", "0"]);
    expect(opts.maxItems).toBe(0);

    const actions = planDriftActions({
      report: {
        generatedAt: "2026-11-22T09:00:00Z",
        providers: [makeProvider("route53", "Amazon Route 53", "failing")],
      },
      maxItems: opts.maxItems,
    });
    expect(actions).toEqual([{ type: "skip_capped", id: "route53" }]);
  });
});
