# TJ-1989: Per-Provider Definition File Set and Contributor Loop

**Date:** 2026-11-20
**Issues:** TJ-1989 (parent), TJ-1990, TJ-1991, TJ-1992, TJ-1993
**Branch:** `timothy/tj-1989-per-provider-definition-file-set-and`

## Goal

Replace the monolithic `src/providers/providers.json`, `formatProviderName` lookup table in `src/providers/match.ts`, and hardcoded platform tables in `src/scanner.ts` with a single-file-per-provider registry (`providers/<slug>.json`) backed by a strict JSON Schema, build-time compilation, CI validation and collision checks, contributor docs, and seeded `good first issue` GitHub tickets.

## Scope and Architecture

### 1. Per-provider registry and build-time compiler (TJ-1990)

- **Schema (`providers/schema.json`):** JSON Schema (Draft 2020-12) defining a strict provider document:
  - Required: `id` (`^[a-z0-9][a-z0-9_-]*$`, must match filename `<id>.json`), `name` (human-readable display name).
  - Optional metadata: `website` (`https://...`), `verification_domains` (`string[]`), `shared_patterns` (`string[]`, explicit allowlist for patterns intentionally shared across providers).
  - Optional layer blocks (at least one required):
    - `dns`: `{ patterns: string[] }`
    - `cdn`: `{ headers?: Record<string, string>, cnames?: string[], is_cdn_edge?: boolean, is_platform?: boolean }`
    - `hosting`: `{ asns?: number[], ips?: string[], is_cdn_edge?: boolean, is_platform?: boolean }`
    - `email`: `{ mx_patterns: string[] }`
    - `thirdparty`: `{ scripts: string[], category: string }`
    - `html_frameworks`: `{ html_patterns: string[], category: string }`
    - `platform_rules`: `Array<{ cdn?: string, ssl_issuer?: string, ips?: string[], dns_from?: string }>`
- **Migration:** Split all existing entries from `src/providers/providers.json`, `src/providers/match.ts` (`formatProviderName`), and `src/scanner.ts` (`PLATFORM_PROVIDERS`, `PLATFORM_IPS`, `DIRECT_PLATFORM_IP_SETS`, `PLATFORM_BY_INFRA`, `CDN_EDGE_PROVIDERS`, and the NS1-to-Netlify DNS cross-reference) into `providers/<slug>.json` files. Merge paired script + HTML entries that share the same provider and display name (`tailwind_css`, `angular`, `vue`) into single provider files. Remove `src/providers/providers.json`.
- **Build-time compilation (`scripts/build-providers.mjs`):**
  - Reads all `providers/*.json` (excluding `schema.json`) in sorted order and generates `src/providers/generated.ts` containing typed, zero-runtime-IO data structures consumed by `src/providers/match.ts` and `src/scanner.ts`.
  - Supports `--check` mode (exits non-zero if `src/providers/generated.ts` is out of date with `providers/*.json`).
  - Wired into `package.json` scripts (`providers:build`, `providers:validate`) and `npm run build` / `npm run build:ext` so both CLI (`tsup`) and Chrome extension (`esbuild`) bundle the compiled registry with zero runtime file IO.

### 2. CI schema validation and collision checks (TJ-1991)

- **Validator (`scripts/validate-providers.mjs`):** Zero-dependency Node script run via `npm run providers:validate` that checks every `providers/*.json`:
  - Valid JSON matching `providers/schema.json` (required fields, strict property names, types, non-empty patterns, valid categories).
  - Filename matches `id`.
  - No duplicate `id` or case-insensitive duplicate `name` across files.
  - No overlapping exact patterns across providers within the same layer (DNS patterns, CDN header key+value pairs, CDN CNAMEs, hosting ASNs, hosting IPs, email MX patterns, third-party script substrings, HTML framework patterns) unless explicitly listed in `shared_patterns`.
  - Generated registry `src/providers/generated.ts` is up to date (`build-providers.mjs --check`).
- **CI integration (`.github/workflows/ci.yml`):** Add `npm run providers:validate` to the `check` job before lint/typecheck/build/tests.
- **Unit tests (`test/providers/validate.test.ts`):** Cover valid files, missing required fields, filename/id mismatch, duplicate names, and cross-provider pattern collisions (such as the historical `ns1`/`netlify` collision).

### 3. Contributor docs and PR template (TJ-1992)

- **`CONTRIBUTING.md`:** Concise, plain-English guide explaining how to add or update a provider in one file (`providers/<slug>.json`), schema field reference, and local verification (`npm run providers:build`, `npm run providers:validate`, `npm run test:unit`).
- **`.github/PULL_REQUEST_TEMPLATE/provider.md`:** Checklist asking for the provider JSON file, a public verification domain (or sanitized header/DNS fixture), and confirmation that `npm run providers:validate` and `npm run test:unit` pass.

### 4. Seed 10 to 15 `good first issue` provider tickets on GitHub (TJ-1993)

- Once the PR merges (so `CONTRIBUTING.md` and `providers/schema.json` links resolve on `main`), create 12 focused `good first issue` tickets on `timothyjordan/cloudtracer` via `gh issue create`:
  1. Porkbun DNS
  2. Bunny.net edge and DNS
  3. Render edge headers
  4. Railway edge headers
  5. Fly.io edge headers
  6. Hetzner DNS and edge signals
  7. OVH DNS and edge signals
  8. Shopify edge hosting
  9. Squarespace edge hosting
  10. Cloudflare Pages vs. Workers distinction
  11. Fastmail / Migadu / ImprovMX email providers (e.g. Migadu Email)
  12. Deno Deploy / Supabase hosting platform headers

## Verification Strategy

- `npm run providers:validate`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run build:ext`
- `npm run test:unit` (all 1,073 existing tests plus new `test/providers/validate.test.ts`)
- `npm run package:ext`
