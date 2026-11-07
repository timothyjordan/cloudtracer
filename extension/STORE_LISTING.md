# Chrome Web Store listing

The exact text submitted to the Chrome Web Store, kept in the repo so updates
can be diffed against what was actually filed. The dashboard is the system of
record; this file is the source the dashboard is filled from.

**This must stay consistent with <https://cloudtracer.dev/privacy.html>.** A
listing that contradicts the privacy policy is a rejection risk, so change both
or neither.

---

## Store listing tab

### Item name

```
CloudTracer
```

### Summary

122 of the 132 characters allowed.

```
See the cloud providers behind any website: DNS, CDN, hosting, SSL, email and third-party services, for the tab you're on.
```

### Description

```
CloudTracer shows you the infrastructure behind any website. Click the toolbar icon and it scans the domain of the tab you're on, then lays out the cloud stack in eight sections.

What you get:

Registration: the domain registrar, registration date, and expiration.
DNS: the authoritative nameservers and the provider behind them, such as Cloudflare, Route 53, or NS1.
CDN: the content delivery network and WAF, inferred from response headers.
Hosting: IPv4 and IPv6 addresses, the ASN, and the hosting platform, such as Vercel, Netlify, or Fly.io.
SSL/TLS: the certificate issuer, Subject Alternative Names, and days until expiration.
Performance: DNS resolution, TLS handshake, time to first byte, and total response time.
Email: the MX provider, plus whether SPF and DMARC are present.
Third-party services: analytics, marketing, and monitoring tools detected in the page.

Scanning happens entirely in your browser. There is no CloudTracer server in the scan path and no account. CloudTracer reads public infrastructure records directly: DNS over HTTPS via Cloudflare, registration data over RDAP, certificates from public Certificate Transparency logs, and the page's own HTML to spot third-party scripts.

The site you scan and the content of the page are not tracked. Not the domain, not the results.

CloudTracer does count anonymous usage so we can tell which parts are worth improving: that the popup was opened, which of the eight cards resolved, roughly how long a scan took, and which button you pressed. Not the domain, not your results. It is on by default and there is a "Share anonymous usage" toggle in the popup footer, plus a one-click opt out on the notice shown the first time you open it. Full detail at https://cloudtracer.dev/privacy.html

Results fill in progressively, so the fast lookups appear immediately while slower ones resolve.

CloudTracer is free and open source under Apache 2.0. There is also a command-line version with the same eight scanners, plus JSON, YAML, and Markdown output for scripting:

  npx cloudtracer example.com

Source: https://github.com/timothyjordan/cloudtracer
Homepage: https://cloudtracer.dev
```

### Category

```
Developer Tools
```

### Language

```
English (United States)
```

### URLs

| Field | Value |
| --- | --- |
| Official URL | `https://cloudtracer.dev` |
| Support URL | `https://github.com/timothyjordan/cloudtracer/issues` |

### Images

| Asset | Size | Source |
| --- | --- | --- |
| Store icon | 128x128 | `extension/icons/icon-128.png` |
| Screenshots | 1280x800 or 640x400, 1 required and 5 preferred | Captured by hand |
| Small promo tile | 440x280 | Optional |
| Marquee | 1400x560 | Optional |

The popup is 380px wide with a 600px max height, so it does not fill 1280x800
on its own and needs composing on a background rather than screenshotting raw.
Worth capturing, in order of usefulness: a full scan of a well-known site, the
DNS and CDN cards, the SSL and performance cards, the third-party services
card, and the empty state on a new tab.

---

## Privacy tab

### Single purpose

```
CloudTracer displays the cloud infrastructure and third-party services behind the website in the user's active tab: its registrar, DNS, CDN, hosting, TLS certificate, email provider, and detected third-party scripts.
```

### Permission justifications

Only three permissions are requested. `tabs` was deliberately removed: the
Chrome docs state that host permissions already allow reading a matching tab's
four sensitive `tabs.Tab` properties, so `tabs` added review scrutiny without
adding capability.

#### `activeTab`

```
CloudTracer needs the hostname of the tab the user is viewing in order to scan it. activeTab grants that only for the tab the user is on, and only when they click the CloudTracer toolbar icon. No tab is read unless the user explicitly opens the popup.
```

#### `storage`

```
Used only to remember two local preferences: whether the user has opted out of anonymous usage analytics, and whether the first-run notice has already been shown. It also holds a randomly generated identifier for those analytics, which is not derived from the user, the machine, or anything scanned. Nothing about the sites visited or scanned is stored. All of it is local to the browser via chrome.storage.local and none of it is readable by any website.
```

#### `host_permissions` (`<all_urls>`)

```
CloudTracer scans whatever site the user is currently on, so it cannot know the set of hosts in advance. Two of its eight checks require a direct request to that site: reading response headers to identify the CDN and WAF, and reading the page's HTML to detect third-party scripts such as analytics and fonts. Both requests go only to the domain of the tab the user is actively viewing, and only when the user opens the popup. CloudTracer injects nothing into pages and reads no page content beyond the HTML it fetches for script detection.
```

### Remote code

```
No, I am not using remote code
```

If detail is requested:

```
All code is bundled in the extension package. CloudTracer executes no remotely hosted scripts and uses no eval. It makes network requests to public read-only APIs for data only (Cloudflare DNS over HTTPS, RDAP, and Certificate Transparency logs), and to one analytics endpoint, never to fetch executable code.
```

### Data usage

Tick **User activity** only.

- **User activity**: yes. CloudTracer records which popup control was pressed
  (re-scan, copy, the link to the homepage, the analytics toggle), that the
  popup was opened, which of the eight cards resolved, and a coarse duration
  bucket for a scan.
- **Web browsing activity**: **no**, and this is defensible rather than
  optimistic. Chrome defines it as "any information about the websites or other
  web resources a user requests or interacts with, including the domains or
  URLs the browser interacts with". No analytics event carries the scanned
  domain, the tab URL, the tab title, or any page content. This is enforced in
  code, not by convention: event payloads are typed so there is no field a
  hostname could be passed in, and a second allowlist check drops any property
  the event schema does not name before anything is sent. An earlier draft
  included a boolean for whether the current tab was scannable; it was removed
  precisely so this answer needs no qualification.
- Everything else (personally identifiable information, health, financial,
  authentication, personal communications, location, website content): no.

### Certifications

All three are checkable and true:

- I do not sell or transfer user data to third parties, outside of the approved
  use cases
- I do not use or transfer user data for purposes that are unrelated to my
  item's single purpose
- I do not use or transfer user data to determine creditworthiness or for
  lending purposes

### Privacy policy URL

```
https://cloudtracer.dev/privacy.html
```

---

## Distribution tab

Visibility **Public**, all regions, free, no in-app purchases, not for mature
audiences.

---

## Before submitting

- Merge the pending release-please PR so the uploaded zip is a real released
  artifact, then take `cloudtracer-extension-<version>.zip` from the
  `extension-v<version>` GitHub Release, or rebuild it with
  `npm run package:ext`.
- Confirm `https://cloudtracer.dev/privacy.html` is live. It is a required
  field and the listing text above points at it.
- Record the Extension ID and Publisher ID afterwards. Approval unblocks the
  automated store deploys.
