# TJ-1983 Implementation Plan

**Spec:** [2026-11-19-tj-1983-chrome-extension-detection-accuracy.md](../specs/2026-11-19-tj-1983-chrome-extension-detection-accuracy.md)
**Branch:** `timothy/tj-1983-pre-launch-chrome-extension-and-detection`

## Task Breakdown (Atomic Commits)

### Task 1: Fix provider pattern collisions and duplicates (TJ-1986)
- Edit `src/providers/providers.json`:
  - Remove `dns.netlify` (`dns*.p*.nsone.net`) so `dns.ns1` matches by default.
  - Remove duplicate `thirdparty.heap_analytics`.
- Edit `src/providers/match.ts`:
  - Remove `heap_analytics` from `formatProviderName`.
- Edit `src/scanner.ts`:
  - Cross-reference NS1 DNS with Netlify CDN/platform so Netlify-hosted sites using `dns*.p*.nsone.net` attribute DNS to `"Netlify"`, while non-Netlify sites attribute DNS to `"NS1"`.
- Add unit tests in `test/providers/match.test.ts` and `test/scanner-accuracy.test.ts`.
- Run `npm run lint && npm run typecheck && npm run test:unit`, then commit.

### Task 2: Fix GitHub Pages detection behind Fastly (TJ-1984)
- Edit `src/providers/providers.json`:
  - Add `cdn.github_pages` with headers (`Server: GitHub.com`, `X-GitHub-Request-Id: *`, `X-GitHub-Edge-Region: *`) and CNAMEs (`*.github.io`).
- Edit `src/scanner.ts`:
  - Add `PLATFORM_IPS["GitHub Pages"]` with documented IPv4 (`185.199.108-111.153`) and IPv6 (`2606:50c0:8000-8003::153`) apex IPs, normalized via `ipaddr.js`.
  - Match direct GitHub Pages IPs in `crossReferencePlatform` so `result.hosting.platform` resolves to `{ name: "GitHub Pages", confidence: "high" }`.
- Add unit tests covering `cloudtracer.dev` (Fastly + `Server: GitHub.com` + apex IPs), `*.github.io` CNAME, and IPv6 apex IP fixtures.
- Run `npm run lint && npm run typecheck && npm run test:unit`, then commit.

### Task 3: Distinguish CDN edge from origin host (TJ-1985)
- Edit `src/types.ts`:
  - Add `behindCdn?: string` to `HostingInfo`.
- Edit `src/scanner.ts`:
  - Add `CDN_EDGE_PROVIDERS` and populate/clear `result.hosting.behindCdn` in `crossReferencePlatform`.
- Edit `src/output/tree.ts`, `src/output/markdown.ts`, and `extension/src/popup.ts`:
  - Render `Origin : unknown (behind <CDN>)` when `behindCdn` is set and `platform` is absent.
  - Render platform-on-infrastructure cleanly in `extension/src/popup.ts`.
- Add unit tests in `test/scanner-accuracy.test.ts`, `test/output/tree.test.ts`, and `test/output/markdown.test.ts`.
- Run `npm run lint && npm run typecheck && npm run build && npm run build:ext && npm run test:unit`, then commit.

### Task 4: Add non-blocking "Rate CloudTracer" link to extension popup (TJ-1987)
- Create `extension/src/review.ts` for local `completedScanCount` storage (`chrome.storage.local`), threshold check (`>= 5`), and dynamic CWS review URL (`https://chromewebstore.google.com/detail/${extensionId}/reviews`).
- Update `extension/src/popup.html`, `extension/src/popup.css`, and `extension/src/popup.ts` to show `#rate-link` once `completedScanCount >= 5` and increment count on completed scans.
- Add unit tests in `test/extension/review.test.ts`.
- Run `npm run lint && npm run typecheck && npm run build:ext && npm run test:unit`, then commit.

### Task 5: Trim CWS description to 5 brands and update storage disclosure (TJ-1988, TJ-1987)
- Edit `extension/STORE_LISTING.md`:
  - Remove `NS1` and `Fly.io` from Description (leaving 4 distinct brands: Cloudflare, Route 53, Vercel, Netlify).
  - Mention the local completed scan counter in the `storage` permission justification (no domains, never leaves the browser).
- Run `npm run lint && npm run typecheck && npm run test:unit`, then commit.

### Task 6: Automate Chrome Web Store deploys in release workflow (TJ-1906)
- Edit `.github/workflows/release.yml`:
  - Upload the packaged extension zip as a workflow artifact in `publish-extension`.
  - Add `publish-cws` job using plain `curl` and `jq` against CWS API v2 (`:upload`, `:fetchStatus`, `:publish`).
- Validate workflow YAML and run full checks (`npm run lint`, `npm run typecheck`, `npm run build`, `npm run build:ext`, `npm run test:unit`, `npm run package:ext`), then commit.

### Task 7: Final verification and local test instructions
- Confirm all checks pass and working tree is clean.
- Push feature branch `timothy/tj-1983-pre-launch-chrome-extension-and-detection`.
- Provide step-by-step local verification instructions (CLI + Chrome extension) and wait for explicit sign-off before opening the PR.
