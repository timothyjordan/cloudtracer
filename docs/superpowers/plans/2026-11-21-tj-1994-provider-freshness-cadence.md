# TJ-1994 Implementation Plan

**Spec:** [2026-11-21-tj-1994-provider-freshness-cadence.md](../specs/2026-11-21-tj-1994-provider-freshness-cadence.md)
**Branch:** `timothy/tj-1994-automated-provider-freshness-agent-cadence`

## Task Breakdown (Atomic Commits)

### Task 1: Build provider verification harness and seed core verification domains (TJ-1995)
- Add `verification_domains` to core provider files (`cloudflare`, `fastly`, `github_pages`, `vercel`, `netlify`, `route53`, `google_workspace`, `stripe`) and run `npm run providers:build && npm run providers:validate`.
- Create `scripts/verify-providers.mjs` with bounded concurrency, per-domain timeout, layer-by-layer evaluation (`passing` / `degraded` / `failing` + new observable signals), and JSON + Markdown output.
- Add `providers:verify` script to `package.json`.
- Add unit tests in `test/scripts/verify-providers.test.ts`.
- Run `npm run providers:validate && npm run lint && npm run typecheck && npm run build && npm run test:unit`, then commit.

### Task 2: Add deduplicated drift issue and draft PR reporter (TJ-1997)
- Create `scripts/report-provider-drift.mjs` supporting deduplication by `<!-- provider-drift:<slug> -->` issue marker and `provider-drift/<slug>` PR branch, `--max-items` cap, and `--dry-run`.
- Add unit tests in `test/scripts/report-provider-drift.test.ts`.
- Run `npm run lint && npm run typecheck && npm run test:unit`, then commit.

### Task 3: Add scheduled GitHub Action and provider-review agent prompt (TJ-1996)
- Create `.github/workflows/provider-freshness.yml` (weekly Monday 09:00 UTC cron + `workflow_dispatch`).
- Create `prompts/provider-review.md` for cross-checking flagged providers against official docs and opening validated draft PRs.
- Validate YAML syntax and run full repo checks (`providers:validate`, `lint`, `typecheck`, `build`, `build:ext`, `test:unit`), then commit and push.

### Task 4: Local verification and PR gate
- Provide local verification steps (`node scripts/verify-providers.mjs --provider github_pages --json`, dry-run drift reporter) and wait for user sign-off before opening/merging the PR.
