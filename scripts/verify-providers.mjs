#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PROVIDERS_DIR,
  loadProviderDefinitions,
} from "./build-providers.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function compareAscii(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Evaluate a single provider definition against one or more live scan results.
 * Each domainScan is `{ domain, result, error? }`.
 */
export function evaluateProviderResult(provider, domainScans) {
  const expectedLayers = [];
  if (provider.dns?.patterns?.length) expectedLayers.push("dns");
  if (
    provider.cdn &&
    (Object.keys(provider.cdn.headers ?? {}).length > 0 ||
      (provider.cdn.cnames?.length ?? 0) > 0)
  ) {
    expectedLayers.push("cdn");
  }
  if (
    provider.hosting &&
    ((provider.hosting.asns?.length ?? 0) > 0 ||
      (provider.hosting.ips?.length ?? 0) > 0)
  ) {
    expectedLayers.push("hosting");
  }
  if (provider.email?.mx_patterns?.length) expectedLayers.push("email");
  if (provider.thirdparty?.scripts?.length) expectedLayers.push("thirdparty");
  if (provider.html_frameworks?.html_patterns?.length) {
    expectedLayers.push("html_frameworks");
  }
  if (Array.isArray(provider.platform_rules) && provider.platform_rules.length > 0) {
    expectedLayers.push("platform_rules");
  }

  const matchedLayers = new Set();
  const newSignals = [];
  const domainDetails = [];
  let succeededScans = 0;

  for (const entry of domainScans) {
    if (entry.error || !entry.result) {
      domainDetails.push({
        domain: entry.domain,
        ok: false,
        error: entry.error ?? "scan returned no result",
        matchedLayers: [],
      });
      continue;
    }

    succeededScans++;
    const r = entry.result;
    const domainMatched = [];

    if (expectedLayers.includes("dns") && r.dns?.provider?.name === provider.name) {
      matchedLayers.add("dns");
      domainMatched.push("dns");
    }

    if (
      expectedLayers.includes("cdn") &&
      r.cdn?.providers?.some((p) => p.provider.name === provider.name)
    ) {
      matchedLayers.add("cdn");
      domainMatched.push("cdn");
    }

    if (
      expectedLayers.includes("hosting") &&
      (r.hosting?.provider?.name === provider.name ||
        r.hosting?.platform?.name === provider.name)
    ) {
      matchedLayers.add("hosting");
      domainMatched.push("hosting");
    }

    if (expectedLayers.includes("email") && r.email?.provider?.name === provider.name) {
      matchedLayers.add("email");
      domainMatched.push("email");
    }

    const tpHit = r.thirdPartyServices?.some((s) => s.name === provider.name);
    if (expectedLayers.includes("thirdparty") && tpHit) {
      matchedLayers.add("thirdparty");
      domainMatched.push("thirdparty");
    }
    if (expectedLayers.includes("html_frameworks") && tpHit) {
      matchedLayers.add("html_frameworks");
      domainMatched.push("html_frameworks");
    }

    if (
      expectedLayers.includes("platform_rules") &&
      (r.hosting?.platform?.name === provider.name ||
        r.dns?.provider?.name === provider.name)
    ) {
      matchedLayers.add("platform_rules");
      domainMatched.push("platform_rules");
    }

    // Detect unrecorded ASN on a verification domain when another layer matched
    // and the site is not proxied behind a CDN edge.
    if (
      domainMatched.length > 0 &&
      Array.isArray(provider.hosting?.asns) &&
      provider.hosting.asns.length > 0 &&
      r.hosting?.asn &&
      !r.hosting.behindCdn &&
      !provider.hosting.asns.includes(r.hosting.asn.number)
    ) {
      const sigKey = `asn:${r.hosting.asn.number}`;
      if (!newSignals.some((s) => s.key === sigKey)) {
        newSignals.push({
          key: sigKey,
          type: "unrecorded_asn",
          domain: entry.domain,
          asn: r.hosting.asn.number,
          asnName: r.hosting.asn.name,
        });
      }
    }

    domainDetails.push({
      domain: entry.domain,
      ok: true,
      matchedLayers: domainMatched,
    });
  }

  const matched = expectedLayers.filter((l) => matchedLayers.has(l));
  const missed = expectedLayers.filter((l) => !matchedLayers.has(l));

  let status;
  if (succeededScans === 0 || matched.length === 0) {
    status = "failing";
  } else if (missed.length > 0 || newSignals.length > 0) {
    status = "degraded";
  } else {
    status = "passing";
  }

  return {
    id: provider.id,
    name: provider.name,
    website: provider.website ?? null,
    status,
    expectedLayers,
    matchedLayers: matched,
    missedLayers: missed,
    newSignals,
    domains: domainDetails,
  };
}

export function summarizeReport(results, generatedAt = new Date().toISOString()) {
  const sorted = [...results].sort((a, b) => compareAscii(a.id, b.id));
  const counts = { passing: 0, degraded: 0, failing: 0 };
  for (const r of sorted) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  return {
    generatedAt,
    totalVerified: sorted.length,
    counts,
    providers: sorted,
  };
}

export function formatDriftMarkdown(report) {
  const lines = [
    "# Provider Freshness Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `- **Total verified:** ${report.totalVerified}`,
    `- **Passing:** ${report.counts.passing}`,
    `- **Degraded:** ${report.counts.degraded}`,
    `- **Failing:** ${report.counts.failing}`,
    "",
  ];

  const flagged = report.providers.filter((p) => p.status !== "passing");
  if (flagged.length === 0) {
    lines.push("All verified providers are passing with no detected drift.");
    return lines.join("\n") + "\n";
  }

  lines.push("## Flagged Providers", "");
  lines.push("| Provider | Status | Matched | Missed | New Signals |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const p of flagged) {
    const sigs = p.newSignals
      .map((s) => (s.type === "unrecorded_asn" ? `AS${s.asn} (${s.asnName})` : s.key))
      .join(", ");
    lines.push(
      `| \`${p.id}\` (${p.name}) | **${p.status}** | ${p.matchedLayers.join(", ") || "none"} | ${p.missedLayers.join(", ") || "none"} | ${sigs || "none"} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

async function scanWithTimeout(scanFn, domain, timeoutMs) {
  let timer;
  try {
    const result = await Promise.race([
      scanFn(domain, { timeout: timeoutMs }),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
    return { domain, result };
  } catch (err) {
    return {
      domain,
      result: null,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runVerification({
  providersDir = DEFAULT_PROVIDERS_DIR,
  providerFilter = null,
  concurrency = 4,
  timeoutMs = 10000,
  scanFn,
} = {}) {
  const entries = loadProviderDefinitions(providersDir)
    .map((e) => e.data)
    .filter((p) => Array.isArray(p.verification_domains) && p.verification_domains.length > 0)
    .filter((p) => !providerFilter || p.id === providerFilter);

  const results = new Array(entries.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < entries.length) {
      const idx = nextIndex++;
      const provider = entries[idx];
      const domainScans = [];
      for (const domain of provider.verification_domains) {
        domainScans.push(await scanWithTimeout(scanFn, domain, timeoutMs));
      }
      results[idx] = evaluateProviderResult(provider, domainScans);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, entries.length || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return summarizeReport(results);
}

function parseArgs(argv) {
  const opts = {
    providerFilter: null,
    concurrency: 4,
    timeoutMs: 10000,
    outPath: null,
    markdownOutPath: null,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--provider" && argv[i + 1]) {
      opts.providerFilter = argv[++i];
    } else if (arg === "--concurrency" && argv[i + 1]) {
      opts.concurrency = Math.max(1, parseInt(argv[++i], 10) || 4);
    } else if (arg === "--timeout" && argv[i + 1]) {
      opts.timeoutMs = Math.max(1000, parseInt(argv[++i], 10) || 10000);
    } else if (arg === "--out" && argv[i + 1]) {
      opts.outPath = argv[++i];
    } else if (arg === "--markdown-out" && argv[i + 1]) {
      opts.markdownOutPath = argv[++i];
    } else if (arg === "--json") {
      opts.json = true;
    }
  }
  return opts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  const { scan } = await import(resolve(root, "dist/index.js"));
  const report = await runVerification({
    providerFilter: opts.providerFilter,
    concurrency: opts.concurrency,
    timeoutMs: opts.timeoutMs,
    scanFn: scan,
  });

  if (opts.outPath) {
    writeFileSync(opts.outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  }
  const md = formatDriftMarkdown(report);
  if (opts.markdownOutPath) {
    writeFileSync(opts.markdownOutPath, md, "utf8");
  }

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(md);
  }
}
