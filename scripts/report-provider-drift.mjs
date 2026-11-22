#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function compareAscii(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function markerFor(slug) {
  return `<!-- provider-drift:${slug} -->`;
}

export function branchFor(slug) {
  return `provider-drift/${slug}`;
}

export function formatDriftIssueTitle(provider) {
  return `Provider drift: ${provider.name} (${provider.status})`;
}

export function formatDriftIssueBody(provider, generatedAt) {
  const lines = [
    markerFor(provider.id),
    "",
    `Automated freshness verification detected **${provider.status}** status for [\`providers/${provider.id}.json\`](https://github.com/timothyjordan/cloudtracer/blob/main/providers/${provider.id}.json) on ${generatedAt}.`,
    "",
    "### Summary",
    "",
    `- **Provider:** ${provider.name} (\`${provider.id}\`)`,
    `- **Status:** ${provider.status}`,
    `- **Expected layers:** ${provider.expectedLayers.join(", ") || "none"}`,
    `- **Matched layers:** ${provider.matchedLayers.join(", ") || "none"}`,
    `- **Missed layers:** ${provider.missedLayers.join(", ") || "none"}`,
  ];

  if (provider.timedOutLayers?.length) {
    lines.push(`- **Timed out (inconclusive) layers:** ${provider.timedOutLayers.join(", ")}`);
  }

  if (provider.newSignals.length > 0) {
    lines.push("", "### New observable signals", "");
    for (const sig of provider.newSignals) {
      if (sig.type === "unrecorded_asn") {
        lines.push(`- Unrecorded ASN on \`${sig.domain}\`: **AS${sig.asn}** (${sig.asnName})`);
      } else {
        lines.push(`- ${sig.key}`);
      }
    }
  }

  if (provider.domains.length > 0) {
    lines.push("", "### Verification domains", "");
    for (const d of provider.domains) {
      if (d.ok && d.timedOut) {
        lines.push(`- \`${d.domain}\`: partial (timed out); matched [${d.matchedLayers.join(", ") || "none"}]`);
      } else if (d.ok) {
        lines.push(`- \`${d.domain}\`: matched [${d.matchedLayers.join(", ") || "none"}]`);
      } else {
        lines.push(`- \`${d.domain}\`: error (${d.error})`);
      }
    }
  }

  lines.push(
    "",
    "### Next steps",
    "",
    `1. Cross-check \`providers/${provider.id}.json\` against official provider documentation (published IP ranges, ASNs, CNAMEs, and response headers) following [\`prompts/provider-review.md\`](https://github.com/timothyjordan/cloudtracer/blob/main/prompts/provider-review.md).`,
    "2. If confirmed, open a draft PR on branch `" + branchFor(provider.id) + "` after running `npm run providers:build`, `npm run providers:validate`, and `npm run test:unit`.",
    "",
  );

  return lines.join("\n");
}

export function planDriftActions({
  report,
  openIssues = [],
  openPrs = [],
  maxItems = 5,
}) {
  const flagged = (report.providers ?? [])
    .filter((p) => p.status === "failing" || p.status === "degraded")
    .sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "failing" ? -1 : 1;
      }
      return compareAscii(a.id, b.id);
    });

  const actions = [];
  let createdCount = 0;

  for (const provider of flagged) {
    const expectedBranch = branchFor(provider.id);
    const existingPr = openPrs.find((pr) => pr.headRefName === expectedBranch);
    if (existingPr) {
      actions.push({
        type: "skip_existing_pr",
        id: provider.id,
        prNumber: existingPr.number,
      });
      continue;
    }

    const marker = markerFor(provider.id);
    const existingIssue = openIssues.find(
      (issue) => typeof issue.body === "string" && issue.body.includes(marker),
    );
    if (existingIssue) {
      actions.push({
        type: "skip_existing_issue",
        id: provider.id,
        issueNumber: existingIssue.number,
        status: provider.status,
      });
      continue;
    }

    if (createdCount >= maxItems) {
      actions.push({
        type: "skip_capped",
        id: provider.id,
      });
      continue;
    }

    createdCount++;
    actions.push({
      type: "create_issue",
      id: provider.id,
      title: formatDriftIssueTitle(provider),
      body: formatDriftIssueBody(provider, report.generatedAt),
    });
  }

  return actions;
}

export function parseArgs(argv) {
  const opts = {
    reportPath: null,
    maxItems: 5,
    dryRun: false,
    commentExisting: false,
    repo: process.env.GITHUB_REPOSITORY ?? "timothyjordan/cloudtracer",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--report" && argv[i + 1]) {
      opts.reportPath = argv[++i];
    } else if (arg === "--max-items" && argv[i + 1]) {
      const parsed = parseInt(argv[++i], 10);
      opts.maxItems = Number.isNaN(parsed) ? 5 : Math.max(0, parsed);
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--comment-existing") {
      opts.commentExisting = true;
    } else if (arg === "--repo" && argv[i + 1]) {
      opts.repo = argv[++i];
    }
  }
  return opts;
}

function ghJson(args) {
  const out = execFileSync("gh", args, { encoding: "utf8" });
  return JSON.parse(out);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.reportPath) {
    console.error("Usage: node scripts/report-provider-drift.mjs --report <drift-report.json> [--max-items 5] [--dry-run]");
    process.exit(1);
  }

  const report = JSON.parse(readFileSync(opts.reportPath, "utf8"));
  const openIssues = ghJson([
    "issue",
    "list",
    "--repo",
    opts.repo,
    "--label",
    "provider-drift",
    "--state",
    "open",
    "--json",
    "number,body",
    "--limit",
    "200",
  ]);
  const openPrs = ghJson([
    "pr",
    "list",
    "--repo",
    opts.repo,
    "--state",
    "open",
    "--json",
    "number,headRefName",
    "--limit",
    "200",
  ]);

  const actions = planDriftActions({
    report,
    openIssues,
    openPrs,
    maxItems: opts.maxItems,
  });

  if (opts.dryRun) {
    console.log(JSON.stringify(actions, null, 2));
    process.exit(0);
  }

  if (actions.some((a) => a.type === "create_issue")) {
    execFileSync(
      "gh",
      [
        "label",
        "create",
        "provider-drift",
        "--repo",
        opts.repo,
        "--color",
        "d93f0b",
        "--description",
        "Automated provider definition drift report",
        "--force",
      ],
      { stdio: "inherit" },
    );
  }

  for (const action of actions) {
    if (action.type === "create_issue") {
      const url = execFileSync(
        "gh",
        [
          "issue",
          "create",
          "--repo",
          opts.repo,
          "--label",
          "provider-drift",
          "--title",
          action.title,
          "--body",
          action.body,
        ],
        { encoding: "utf8" },
      ).trim();
      console.log(`Opened drift issue for ${action.id}: ${url}`);
    } else if (action.type === "skip_existing_issue" && opts.commentExisting) {
      execFileSync(
        "gh",
        [
          "issue",
          "comment",
          String(action.issueNumber),
          "--repo",
          opts.repo,
          "--body",
          `Freshness check on ${report.generatedAt}: still **${action.status}**.`,
        ],
        { stdio: "inherit" },
      );
      console.log(`Updated existing issue #${action.issueNumber} for ${action.id}`);
    } else {
      console.log(`Skipped ${action.id} (${action.type})`);
    }
  }
}
