---
title: CloudTracer Privacy Policy
description: What CloudTracer collects, what it does not collect, and how to turn analytics off.
canonical: https://cloudtracer.dev/privacy.html
---

# CloudTracer Privacy Policy

Last updated: 7 November 2026

**The sites you scan and the results you get are not collected or tracked.** Not
the domain, not the tab you are on, not the report. That is the line worth
reading this page for, and the rest of this document explains how it holds.

CloudTracer does collect anonymous usage analytics, on by default, and you can
turn it off in one command or one click. What that covers is below.

## How scanning works

Every CloudTracer scan runs on your own machine. There is no CloudTracer server
in the path, no account, and nothing to log in to. The CLI and the Chrome
extension both read public infrastructure records directly from the sources
that publish them:

- **Cloudflare DNS over HTTPS** (`cloudflare-dns.com`) for DNS records
- **RDAP registry services**, with a WHOIS fallback in the CLI, for domain
  registration data
- **Certificate Transparency logs** via `crt.sh`, in the extension, for TLS
  certificate details. The CLI reads the live certificate directly instead.
- **The scanned site itself**, for response headers and page HTML, to identify
  its CDN and any third-party scripts

Those services necessarily see the domain you are looking up, in the same way
they would for any DNS query or web request your browser already makes. They do
not learn who you are from CloudTracer, and CloudTracer tells them nothing else.
Each operates under its own privacy policy.

Results are not written to disk. Closing the extension popup discards them. No
history of what you have scanned is kept anywhere.

## Analytics

CloudTracer reports anonymous usage so we can tell which parts are worth
improving. It is **on by default** and switchable off per surface.

### What is collected

**The CLI:**

- which command ran, and the flags shape it was run with
- which output format was used
- which of the eight scanners returned data
- how long a scan took, as a coarse bucket (`<1s`, `1-3s`, `3-10s`, `>10s`)
- errors by category only, such as `timeout` or `dns_failure`
- for the skill installer: how many targets were written, updated, or skipped,
  and the skill version

**The Chrome extension:**

- that the popup was opened, and whether the current tab was scannable at all
- which of the eight cards resolved, and the same coarse duration bucket
- which control you pressed: re-scan, copy, the link to this site, or the
  analytics toggle

**This website:**

- page views and referrers
- which install command was copied, identified by a label rather than its text

### What is not collected

- the domain you scanned, on any surface
- the URL or title of the tab you are on
- any scan result, or any content from a scanned page
- file paths, your username, or anything about your machine
- error messages, which can contain a hostname. Only the error category is sent.

This is enforced in the code rather than promised in this document. Event
payloads are typed so there is no field a hostname could be passed in, and a
second allowlist check drops any property the event schema does not name before
anything is sent.

### Turning it off

**CLI**, any of these:

```sh
cloudtracer telemetry off     # persists to your config
DO_NOT_TRACK=1                # the cross-tool convention, honoured
CLOUDTRACER_TELEMETRY=0       # per-invocation
```

It is also off automatically in CI, without you doing anything.

`cloudtracer telemetry status` reports the current state.

**Chrome extension:** the "Share anonymous usage" toggle in the popup footer,
or "Turn off" on the notice shown the first time you open it.

**This website:** the site honours your browser's Do Not Track setting.

### Who processes it

Analytics is processed by [PostHog](https://posthog.com) in their United States
region. We ask PostHog to discard IP addresses rather than store them with
events.

On this website, PostHog is configured in cookieless mode. It stores nothing in
cookies, local storage, or session storage, which is why you see no cookie
banner here. Instead of an identifier, it derives a privacy-preserving hash
server-side that rotates daily, so visitors are only distinguishable within a
single day.

The CLI and extension use a random identifier generated on your device. It is
not derived from your machine, your account, your network, or anything you have
scanned, and deleting your config file or extension storage resets it.

### What we do not do

We do not sell, rent, or share analytics data. There is no advertising, no
cross-site tracking, no profiles, and no attempt to work out who you are.

## Builds you compile yourself

Analytics keys are injected at build time and only present in official
releases. If you clone the repository, build a fork, or run from source, no
analytics are configured and nothing is sent, regardless of settings.

## Contact

Questions or corrections:
[github.com/timothyjordan/cloudtracer/issues](https://github.com/timothyjordan/cloudtracer/issues)
