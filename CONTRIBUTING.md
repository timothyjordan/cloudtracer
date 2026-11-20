# Contributing to CloudTracer

Thanks for helping make CloudTracer more accurate. The fastest way to contribute is to teach CloudTracer a new cloud provider, CDN, DNS host, email provider, or third-party service in a single-file pull request.

## Teach CloudTracer a provider (10-minute PR)

Every provider definition lives in its own JSON file under `providers/<slug>.json`, validated against [`providers/schema.json`](providers/schema.json).

### 1. Create or edit `providers/<slug>.json`

Use a lowercase slug matching `^[a-z0-9][a-z0-9_-]*$` for both the filename and `id` field.

Example (`providers/porkbun.json`):

```json
{
  "id": "porkbun",
  "name": "Porkbun",
  "website": "https://porkbun.com",
  "verification_domains": ["porkbun.com"],
  "dns": {
    "patterns": ["*.ns.porkbun.com"]
  }
}
```

### 2. Supported fields

| Field | Required | Purpose |
| --- | --- | --- |
| `id` | Yes | Unique lowercase slug matching `<id>.json` |
| `name` | Yes | Display name shown in CLI and Chrome extension output |
| `website` | No | Official `https://` homepage |
| `verification_domains` | No | Public domains known to use this provider |
| `shared_patterns` | No | Explicit allowlist when a pattern is intentionally shared with another provider |
| `dns` | Layer | `{ "patterns": ["*.ns.example.com"] }` |
| `cdn` | Layer | `{ "headers": { "Server": "Example*" }, "cnames": ["*.cdn.example.net"], "is_cdn_edge": true, "is_platform": false }` |
| `hosting` | Layer | `{ "asns": [12345], "ips": ["203.0.113.10"], "is_cdn_edge": false, "is_platform": false }` |
| `email` | Layer | `{ "mx_patterns": ["*.mail.example.com"] }` |
| `thirdparty` | Layer | `{ "scripts": ["cdn.example.com/sdk.js"], "category": "analytics" }` |
| `html_frameworks` | Layer | `{ "html_patterns": ["__EXAMPLE_DATA__"], "category": "framework" }` |
| `platform_rules` | Layer | Array of cross-reference rules (`cdn`, `ssl_issuer`, `ips`, `dns_from`) |

At least one layer block is required. See [`providers/schema.json`](providers/schema.json) for exact allowed values and categories.

### 3. Rebuild and validate locally

```bash
npm ci
npm run providers:build
npm run providers:validate
npm run lint
npm run typecheck
npm run test:unit
```

`npm run providers:build` compiles `providers/*.json` into `src/providers/generated.ts` so the CLI and Chrome extension bundle all providers with zero runtime file IO. Commit both your `providers/<slug>.json` file and the updated `src/providers/generated.ts`.

`npm run providers:validate` checks schema conformance, filename and `id` consistency, duplicate provider names, and overlapping patterns across providers.

### 4. Open a pull request

Use the provider PR template (`?template=provider.md`), include a public verification domain (or sanitized DNS/header fixture), and confirm local validation passes. One provider per PR keeps review fast.

## Other contributions

For bug fixes or features outside `providers/`:

1. Check existing issues or open one to align on scope before large changes.
2. Add unit tests covering your change.
3. Run `npm run providers:validate`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run build:ext`, and `npm run test:unit` before opening your PR.
