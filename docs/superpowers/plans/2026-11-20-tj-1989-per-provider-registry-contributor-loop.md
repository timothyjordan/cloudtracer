# TJ-1989 Implementation Plan

**Spec:** [2026-11-20-tj-1989-per-provider-registry-contributor-loop.md](../specs/2026-11-20-tj-1989-per-provider-registry-contributor-loop.md)
**Branch:** `timothy/tj-1989-per-provider-definition-file-set-and`

## Task Breakdown (Atomic Commits)

### Task 1: Define `providers/schema.json` and migrate existing providers to `providers/<slug>.json` (TJ-1990)
- Create `providers/schema.json` (JSON Schema Draft 2020-12).
- Write a one-time migration helper to split `src/providers/providers.json`, `formatProviderName`, and `src/scanner.ts` platform/CDN tables into deterministic `providers/<slug>.json` files, merging `tailwind_css`, `angular`, and `vue` script+HTML pairs cleanly.
- Create `scripts/build-providers.mjs` to compile `providers/*.json` into `src/providers/generated.ts` (with `--check` flag).
- Refactor `src/providers/match.ts` and `src/scanner.ts` to read from `src/providers/generated.ts` and remove `src/providers/providers.json`.
- Update `package.json` scripts (`providers:build`, `providers:validate`).
- Run `npm run lint && npm run typecheck && npm run build && npm run build:ext && npm run test:unit`, then commit.

### Task 2: Add schema validator, collision checks, unit tests, and CI step (TJ-1991)
- Create `scripts/validate-providers.mjs` validating schema rules, filename/id match, duplicate IDs/names, cross-provider pattern collisions, and generated file freshness.
- Add `test/providers/validate.test.ts` testing valid and invalid provider fixtures and collision detection.
- Add `npm run providers:validate` to `.github/workflows/ci.yml`.
- Run `npm run providers:validate && npm run lint && npm run typecheck && npm run test:unit`, then commit.

### Task 3: Publish `CONTRIBUTING.md` and provider PR template (TJ-1992)
- Create `CONTRIBUTING.md` with single-file provider PR instructions and schema reference.
- Create `.github/PULL_REQUEST_TEMPLATE/provider.md`.
- Run full checks (`npm run providers:validate`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run build:ext`, `npm run test:unit`), then commit and push.

### Task 4: Verification, PR, merge, and seed `good first issue` tickets (TJ-1993)
- Provide local verification steps and wait for user sign-off before opening/merging the PR.
- After merge to `main`, create 12 `good first issue` provider tickets on GitHub linking to `CONTRIBUTING.md` and `providers/schema.json` on `main`, and move TJ-1989..TJ-1993 to `Done`.
