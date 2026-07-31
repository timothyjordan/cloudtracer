---
name: cloudtracer
description: Use when the user wants to know what cloud providers, infrastructure, and third-party services a website depends on — audit your own stack, vet a vendor, or map a competitor's infrastructure. Runs the read-only CloudTracer CLI against a domain and reports registrar, DNS, CDN/WAF, hosting/ASN, SSL/TLS, performance timings, email posture, and embedded third-party services as one tree. Read-only: it scans and reports, it never changes the target site or your project.
license: Apache-2.0
compatibility: Requires Node.js 18+ for `npx`, network access to reach the target domain, and shell access. Works with any coding agent that supports the agentskills.io spec (Claude Code, Codex, Cursor, OpenCode, etc.).
metadata:
  version: "0.1.0"
  homepage: https://cloudtracer.dev
  source: https://github.com/timothyjordan/cloudtracer
  spec: https://agentskills.io/specification
allowed-tools: Bash(npx:*) Bash(cloudtracer:*) Read
---

# CloudTracer — map a website's cloud stack

Scan a domain with the open-source [CloudTracer](https://cloudtracer.dev) CLI and report every
cloud provider, CDN, registrar, hosting platform, and third-party service it depends on.

CloudTracer runs eight scanners in parallel and prints the result as a single tree:
**Registration, DNS, CDN/WAF, Hosting, SSL/TLS, Performance, Email, and Third-Party Services.**
It is **read-only** — it inspects public DNS, RDAP/WHOIS, TLS certificates, HTTP headers, and the
rendered HTML of the target. It never modifies the target site, and it never edits your project.

## When to use

Use this skill when the user says any of:

- "What does <site> run on?" / "What's <site>'s tech/infra stack?"
- "Who hosts <site>?", "What CDN / DNS / registrar does <site> use?"
- "Audit our own infrastructure", "what cloud services does our site touch?"
- "Vet this vendor's stack before we sign", "where does this SaaS actually live?"
- "What analytics / third-party scripts is <site> loading?"
- "Compare the infrastructure of <site A> and <site B>."

Don't use this skill for:

- Changing, deploying, or configuring infrastructure — CloudTracer only reports, it doesn't act.
- Agent-readability / `llms.txt` / `AGENTS.md` scoring — that's a different tool (a14y).
- Scanning hosts you are not authorized to inspect beyond what is publicly observable.

## Workflow

### 1. Determine the target domain

CloudTracer takes a bare domain (it strips a leading `https://`/`http://`, any path, and a
`:port`, so a full URL also works). If the user gave a URL, reduce it to the registrable domain
(e.g. `https://shop.example.com/cart` → `shop.example.com`). If no target is given, ask which
domain to scan — don't guess.

### 2. Run the scan

For a human-readable summary, run the default tree:

```bash
npx cloudtracer <domain>
```

When you need to parse the result programmatically (to compare sites, extract one field, or feed
another step), use a machine-readable format instead:

```bash
npx cloudtracer <domain> --json     # or --yaml, or --markdown (with a Mermaid diagram)
```

Useful flags:

- `--json` / `--yaml` / `--markdown` — machine-readable output (default is a colorized tree).
- `--timeout <ms>` — per-scanner timeout in milliseconds (default `10000`); raise it for slow hosts.
- `--verbose` — stream debug information while scanning.

Capture stdout — that's the report you'll interpret in the next step.

### 3. Interpret the result

Summarize the eight sections, preserving CloudTracer's structure. Lead with what the user asked
about, then give the rest as supporting context:

- **Registration** — registrar, registration/expiration dates (RDAP, WHOIS fallback).
- **DNS** — authoritative nameservers and the provider behind them.
- **CDN/WAF** — CDN and firewall inferred from headers and CNAMEs.
- **Hosting** — IPv4/IPv6, ASN, and the hosting platform.
- **SSL/TLS** — certificate issuer, protocol version, SANs, days to expiry.
- **Performance** — DNS resolution, TLS handshake, TTFB, total response time, content size.
- **Email** — MX provider, SPF presence, DMARC presence.
- **Third-Party Services** — analytics, marketing, and monitoring tools in the rendered HTML.

When a scanner returns nothing, say so plainly ("no DMARC record found") rather than omitting it —
absence is often the point of the audit. Cite the tool as **CloudTracer** and don't invent
providers it didn't report.

## Quick reference

| Task | Command |
|---|---|
| Scan a domain (tree) | `npx cloudtracer <domain>` |
| Get JSON for scripting | `npx cloudtracer <domain> --json` |
| Get YAML | `npx cloudtracer <domain> --yaml` |
| Markdown + Mermaid diagram | `npx cloudtracer <domain> --markdown` |
| Slow host | `npx cloudtracer <domain> --timeout 20000` |
| Debug a scan | `npx cloudtracer <domain> --verbose` |
| Install the CLI globally | `npm install -g cloudtracer` |

## Common mistakes

- **Passing a full URL with a path and treating sub-paths as separate scans.** CloudTracer scans
  a domain, not a page. `example.com/pricing` and `example.com/blog` resolve to the same scan.
- **Reading the SSL/TLS section from the Chrome extension as authoritative.** The extension derives
  certificates from Certificate Transparency logs (best-effort); the CLI reads the live cert. Prefer
  the CLI when certificate detail matters.
- **Reporting an empty section as "unknown."** Distinguish "CloudTracer could not determine X"
  (timeout/transient) from "X is genuinely absent" (e.g. no SPF/DMARC). Re-run with a higher
  `--timeout` before calling a slow scanner a failure.
- **Treating detection as exhaustive.** Third-party detection reads the rendered HTML; scripts
  injected later or server-side calls won't appear. Say what was observed, not what is impossible.
- **Expecting the skill to change anything.** CloudTracer is read-only. If the user wants to act on
  the findings (migrate a CDN, add DMARC), that's normal follow-up work for the host agent — the
  skill's job ends at the report.

## Reference

- Homepage, docs, and example output: <https://cloudtracer.dev>
- Agent guide: <https://cloudtracer.dev/AGENTS.md>
- Source: <https://github.com/timothyjordan/cloudtracer>
- npm package: <https://www.npmjs.com/package/cloudtracer>
- Skill discovery (this file via the live site): `https://cloudtracer.dev/.well-known/agent-skills/cloudtracer/SKILL.md`
- agentskills.io spec: <https://agentskills.io/specification>
