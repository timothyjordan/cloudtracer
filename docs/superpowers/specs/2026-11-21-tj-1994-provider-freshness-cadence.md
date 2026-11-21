# TJ-1994: Automated Provider-Freshness Agent Cadence

**Date:** 2026-11-21
**Issues:** TJ-1994 (parent), TJ-1995, TJ-1996, TJ-1997
**Branch:** `timothy/tj-1994-automated-provider-freshness-agent-cadence`

## Goal

Keep CloudTracer's per-provider definitions (`providers/*.json`) accurate over time by running an automated weekly verification harness against live `verification_domains`, emitting structured drift reports, and opening deduplicated, rate-limited GitHub Issues (`provider-drift`) or draft PRs when definitions drift.

## Scope and Architecture

### 1. Provider verification harness (`scripts/verify-providers.mjs`, TJ-1995)

- **Seed initial `verification_domains`:** Add stable, public `verification_domains` to a core set of high-signal providers (`cloudflare`, `fastly`, `github_pages`, `vercel`, `netlify`, `route53`, `google_workspace`, `stripe`) so the harness immediately monitors real production stacks out of the box.
- **Harness (`scripts/verify-providers.mjs`):**
  - Zero new third-party dependencies; imports the compiled scanner (`dist/index.js`).
  - Loads all `providers/*.json` with non-empty `verification_domains` (optionally filtered by `--provider <slug>`).
  - Runs scans with bounded concurrency (`--concurrency`, default `4`) and per-domain timeout (`--timeout`, default `10000` ms).
  - Evaluates each provider's declared layers (`dns`, `cdn`, `hosting`, `email`, `thirdparty`, `html_frameworks`, `platform_rules`) against the scan results and classifies each provider:
    - `passing`: all declared verifiable layers matched across its verification domains with no unrecorded ASN/header drift.
    - `degraded`: some declared layers matched and some missed, or new observable signals (such as an unrecorded ASN) appeared on a verification domain.
    - `failing`: none of the provider's declared layers matched (or all scans errored/timed out).
  - Emits both structured JSON (`--out <path>` / `--json`) and a concise Markdown summary (`--markdown-out <path>`).
  - Exports pure functions (`evaluateProviderResult`, `summarizeReport`, `formatDriftMarkdown`) for deterministic offline unit tests in `test/scripts/verify-providers.test.ts`.
- Add `npm run providers:verify` to `package.json`.

### 2. Deduplicated drift reporting (`scripts/report-provider-drift.mjs`, TJ-1997)

- Consumes the JSON drift report produced by `scripts/verify-providers.mjs`.
- Filters to `degraded` and `failing` providers and deduplicates by provider slug:
  - Looks up open GitHub Issues carrying the `provider-drift` label and embedded marker `<!-- provider-drift:<slug> -->`, plus open PRs on branch `provider-drift/<slug>`.
  - If an open issue or draft PR already exists for `<slug>`, skips opening a duplicate (optionally posting a brief status comment on an existing issue when `--comment-existing` is passed).
  - Caps newly opened items per run (`--max-items`, default `5`) so transient network outages never flood the issue tracker.
  - Supports `--dry-run` (prints planned actions without calling GitHub mutations) and `--create-draft-pr` for verified additive changes on `provider-drift/<slug>` branches (always running `npm run providers:build && npm run providers:validate` before pushing).
- Exports pure planning/formatting functions (`planDriftActions`, `formatDriftIssueBody`) tested offline in `test/scripts/report-provider-drift.test.ts`.

### 3. Scheduled GitHub Action and review prompt (TJ-1996)

- **Workflow (`.github/workflows/provider-freshness.yml`):**
  - Runs weekly on Mondays at 09:00 UTC (`cron: '0 9 * * 1'`) plus `workflow_dispatch` (with optional `provider` slug filter, `max_items`, and `dry_run` inputs).
  - Minimal permissions (`contents: read`, `issues: write`, `pull-requests: read`).
  - Steps: checkout, Node 20, `npm ci`, `npm run build`, run `scripts/verify-providers.mjs`, write `drift-report.md` to `$GITHUB_STEP_SUMMARY`, upload JSON/Markdown artifacts (`retention-days: 14`), ensure `provider-drift` label exists, and run `scripts/report-provider-drift.mjs`.
- **Agent review prompt (`prompts/provider-review.md`):**
  - Matches the existing `prompts/` convention (`resolve-issue.md`, `triage.md`, `respond.md`), instructing an agent picking up a `provider-drift` issue to cross-check the flagged provider against official documentation (published IP ranges, ASNs, CNAMEs, response headers), update `providers/<slug>.json`, run `npm run providers:build && npm run providers:validate && npm run test:unit`, and open a draft PR on `provider-drift/<slug>`.

## Verification Strategy

- Unit tests (`vitest`):
  - `test/scripts/verify-providers.test.ts`: passing, degraded (partial match & new observable ASN), failing, timeout/error handling, and Markdown report rendering.
  - `test/scripts/report-provider-drift.test.ts`: deduplication against existing open issues and PRs, `--max-items` cap, dry-run behavior, and issue body formatting with `<!-- provider-drift:<slug> -->` marker.
- Workflow YAML validation on `.github/workflows/provider-freshness.yml`.
- Full repo gates: `npm run providers:validate`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run build:ext`, `npm run test:unit`.
