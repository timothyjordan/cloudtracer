# TJ-1983: Pre-launch Chrome Extension and Detection Accuracy Release

**Date:** 2026-11-19
**Issues:** TJ-1983 (parent), TJ-1984, TJ-1985, TJ-1986, TJ-1987, TJ-1988, TJ-1906
**Branch:** `timothy/tj-1983-pre-launch-chrome-extension-and-detection`

## Goal

Ship Wave 1 (Critical Path) before launch: every change that affects the Chrome extension bundle, core detection accuracy, the Chrome Web Store listing, and automated CWS deployment. This lets Chrome Web Store review run in parallel while remaining launch tasks proceed.

## Scope and Requirements

### 1. GitHub Pages detection behind Fastly (TJ-1984)

GitHub Pages serves traffic through Fastly (ASN 54113), so sites such as `cloudtracer.dev` are currently reported as `Hosting -> Provider: Fastly` with no platform.

**Detection signals:**
- Response headers in `src/providers/providers.json` under `cdn.github_pages`:
  - `Server: GitHub.com`
  - `X-GitHub-Request-Id: *`
  - `X-GitHub-Edge-Region: *`
- CNAMEs in `src/providers/providers.json` under `cdn.github_pages`:
  - `*.github.io`
- Documented GitHub Pages apex IP addresses in `src/scanner.ts` (`PLATFORM_IPS["GitHub Pages"]`):
  - IPv4: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
  - IPv6: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` (matched after IPv6 normalization via `ipaddr.js` so expanded forms also match)

**Cross-referencing (`src/scanner.ts`):**
- `PLATFORM_PROVIDERS` already includes `"GitHub Pages"`, so header or CNAME matches populate `result.hosting.platform = { name: "GitHub Pages", confidence: "high" }`.
- Direct IP matches against `PLATFORM_IPS["GitHub Pages"]` also populate `result.hosting.platform = { name: "GitHub Pages", confidence: "high" }` even when HTTP headers or CNAMEs are absent.
- Output renders as `Platform : GitHub Pages (on Fastly)` in CLI tree, `- **Platform**: GitHub Pages (on Fastly)` in Markdown, and `GitHub Pages (on Fastly)` in the extension popup's Hosting card.

### 2. Distinguish CDN edge from origin host (TJ-1985)

When a site sits behind a CDN and no hosting platform is identified, CloudTracer currently labels the CDN ASN as the hosting provider.

**Public API contract (`src/types.ts`):**
- Add an optional `behindCdn?: string` field to `HostingInfo` (backwards-compatible; existing `provider` and `asn` fields remain intact for callers inspecting them).
- When `behindCdn` is set, its value is the CDN name (for example, `"Fastly"`, `"Cloudflare"`, `"Akamai"`, or `"Amazon CloudFront"`).

**Detection rules (`src/scanner.ts`):**
- Maintain `CDN_EDGE_PROVIDERS`: `"Cloudflare"`, `"Fastly"`, `"Akamai"`, `"Amazon CloudFront"`, `"BunnyCDN"`, `"KeyCDN"`, `"StackPath"`, `"Sucuri"`, `"Imperva Incapsula"`.
- In `crossReferencePlatform(result)`:
  - If `result.hosting.platform` is identified (for example, GitHub Pages on Fastly, Firebase Hosting on Fastly, or Vercel on AWS), clear `result.hosting.behindCdn` so progressive `onResult` updates never leave stale state.
  - Otherwise, if `result.hosting.provider` is in `CDN_EDGE_PROVIDERS`, set `result.hosting.behindCdn = result.hosting.provider.name`.
  - Otherwise, if `result.cdn?.providers` contains a non-platform CDN provider and either `result.hosting.provider` is undefined or (`cdnName === "Amazon CloudFront"` and `result.hosting.provider.name === "Amazon Web Services"`), set `result.hosting.behindCdn = cdnName`.

**Output formatting:**
- CLI tree (`src/output/tree.ts`): when `h.behindCdn` is set and `h.platform` is absent, render `Origin   : unknown (behind <CDN>)` instead of `Provider : <CDN>`.
- Markdown (`src/output/markdown.ts`): render `- **Origin**: unknown (behind <CDN>)`, and in the Mermaid diagram render `Host[Origin: unknown (behind <CDN>)\nIP: <ip>]:::cloud`.
- JSON and YAML (`src/output/json.ts`, `src/output/yaml.ts`): serialize `hosting.behindCdn` automatically via `ScanResult`.
- Chrome extension popup (`extension/src/popup.ts`):
  - When `h.platform && h.provider`: render primary `h.platform.name` and row `Infrastructure` with `h.provider.name` (matching the platform-on-infra distinction cleanly in the 380px popup).
  - When `h.platform` only: render primary `h.platform.name`.
  - When `h.behindCdn`: render muted primary `Origin: unknown (behind ${h.behindCdn})`.
  - Otherwise: render `h.provider?.name ?? "Unknown provider"`.

### 3. Fix provider pattern collisions and duplicates (TJ-1986)

- **NS1 vs. Netlify DNS collision (`src/providers/providers.json`, `src/scanner.ts`):**
  - Remove `"netlify": { "patterns": ["dns*.p*.nsone.net"] }` from `providers.dns` so `dns*.p*.nsone.net` matches `"ns1"` (`"NS1"`) by default.
  - In `crossReferencePlatform(result)` (in `src/scanner.ts`), if `result.dns?.provider?.name === "NS1"` and Netlify is detected in `result.cdn?.providers` or `result.hosting?.platform?.name === "Netlify"`, attribute `result.dns.provider = { name: "Netlify", confidence: "high" }`.
- **Duplicate Heap entry (`src/providers/providers.json`, `src/providers/match.ts`):**
  - Remove `"heap_analytics"` from `providers.thirdparty` in `src/providers/providers.json` (keeping `"heap"`).
  - Remove `heap_analytics: "Heap"` from `formatProviderName` in `src/providers/match.ts`.

### 4. Non-blocking "Rate CloudTracer" link in extension popup (TJ-1987)

- Add a small testable module `extension/src/review.ts`:
  - Stores a local integer scan counter under `completedScanCount` in `chrome.storage.local` (no domains stored, never sent in telemetry).
  - `REVIEW_SCAN_THRESHOLD = 5`.
  - `getReviewUrl(extensionId?: string)`: returns `https://chromewebstore.google.com/detail/${extensionId}/reviews` when `extensionId` is a non-empty string, or `null` otherwise.
  - `getCompletedScanCount()` and `incrementCompletedScanCount()`: resilient to storage errors (never throw).
- Popup UI (`extension/src/popup.html`, `extension/src/popup.css`, `extension/src/popup.ts`):
  - Add a subtle, non-blocking `<a id="rate-link" class="rate-link" target="_blank" rel="noopener noreferrer" hidden>Rate CloudTracer</a>` in the footer.
  - On popup open: if `completedScanCount >= 5` and `chrome.runtime?.id` is present, set `href` and unhide `#rate-link`.
  - After each completed scan (when `latest.scannedAt` is truthy): increment `completedScanCount`; if the updated count is `>= 5` and `chrome.runtime?.id` is present, set `href` and unhide `#rate-link`.
  - Never block or gate any feature, and never send the scan count in telemetry.
- Update `extension/STORE_LISTING.md` (`storage` permission justification) to mention the local scan counter so store disclosures remain accurate.

### 5. Trim CWS description to 5 brands (TJ-1988)

- Update `extension/STORE_LISTING.md` Description:
  - Line 37: drop `NS1` (`such as Cloudflare or Route 53.`).
  - Line 39: drop `Fly.io` (`such as Vercel or Netlify.`).
  - Result: 4 distinct named brands (`Cloudflare`, `Route 53`, `Vercel`, `Netlify`), strictly within Google's 5-brand limit.

### 6. Automated Chrome Web Store deploys (TJ-1906)

- Update `.github/workflows/release.yml`:
  - In `publish-extension`, upload the packaged `cloudtracer-extension-<version>.zip` as a workflow artifact (`actions/upload-artifact@v4`) so `publish-cws` reuses the exact zip without rebuilding.
  - Add a `publish-cws` job with `needs: [release-please, publish-extension]`, gated by the same `if:` condition as `publish-extension` (plus `needs.publish-extension.result == 'success'`).
  - Implement upload and publish using plain `curl` and `jq` against Chrome Web Store API v2 (no third-party marketplace action):
    1. Exchange `secrets.CWS_REFRESH_TOKEN`, `secrets.CWS_CLIENT_ID`, and `secrets.CWS_CLIENT_SECRET` at `https://oauth2.googleapis.com/token` for an access token; fail if `access_token` is missing.
    2. Upload the zip: `POST https://chromewebstore.googleapis.com/upload/v2/publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}:upload` with `-H "Authorization: Bearer ${ACCESS_TOKEN}" -H "Content-Type: application/zip" --data-binary "@${ZIP_PATH}"`. Validate HTTP 2xx and `uploadState`. If `uploadState` is `IN_PROGRESS`, poll `:fetchStatus` until upload completes; fail on `FAILED` or timeout.
    3. Publish: `POST https://chromewebstore.googleapis.com/v2/publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}:publish` with `{"publishType": "DEFAULT_PUBLISH"}` (note: Chrome Web Store API v2 removed `publishTarget`/`trustedTesters` and publishes using the item's dashboard visibility; `deployPercentage` is only available for items with >10,000 7-day active users). Fail on non-2xx or non-success `state`.
    4. Call `:fetchStatus` and print the returned status summary (no secrets) for auditability.
  - Use repository variables `vars.CWS_PUBLISHER_ID` and `vars.CWS_EXTENSION_ID` (or secrets if preferred; see open items below).

## Verification Strategy

- Unit tests (`vitest`):
  - `test/providers/match.test.ts`: NS1 default DNS matching, Heap single-match deduplication, GitHub Pages header and CNAME matching.
  - `test/scanner.test.ts` / new `test/scanner-accuracy.test.ts`: GitHub Pages behind Fastly (`cloudtracer.dev` and `*.github.io` fixtures, IPv4 and IPv6 apex IPs), CDN-only (`behindCdn` set for Fastly, Cloudflare, Akamai, CloudFront) vs. platform-behind-CDN (`behindCdn` absent for GitHub Pages, Firebase Hosting, Vercel), and NS1-to-Netlify DNS cross-reference when Netlify CDN/hosting is present.
  - `test/output/tree.test.ts` and `test/output/markdown.test.ts`: `Origin : unknown (behind <CDN>)` rendering vs. `Platform : GitHub Pages (on Fastly)` vs. normal `Provider`.
  - `test/extension/review.test.ts`: `getReviewUrl`, `getCompletedScanCount`, `incrementCompletedScanCount`, threshold behavior at 4 vs. 5 scans, and storage failure resilience.
- Full verification gates:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `npm run build:ext`
  - `npm run test:unit`
  - `npm run package:ext` (confirm zip builds cleanly)
  - YAML syntax validation on `.github/workflows/release.yml`

## Decisions Needed Before Implementing TJ-1906

1. **IDs and secrets:** Confirm whether `CWS_PUBLISHER_ID` and `CWS_EXTENSION_ID` should be read from GitHub repository variables (`vars.CWS_PUBLISHER_ID`, `vars.CWS_EXTENSION_ID`) or secrets (`secrets.*`), and confirm `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, and `CWS_REFRESH_TOKEN` will be set before the next extension release.
2. **Publish type:** Chrome Web Store API v2 supports `DEFAULT_PUBLISH` (goes live automatically after review) or `STAGED_PUBLISH` (waits for manual publish click in dashboard after review). Confirm `DEFAULT_PUBLISH` is desired.
