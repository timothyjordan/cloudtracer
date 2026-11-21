# Provider Freshness Review Prompt

Use this playbook when reviewing a `provider-drift` GitHub issue or triaging output from `scripts/verify-providers.mjs`.

## Goal

Determine whether a flagged provider (`degraded` or `failing`) represents real infrastructure drift or a transient/verification-domain issue, and turn confirmed additive or corrective changes into a clean draft PR on branch `provider-drift/<slug>`.

## Steps

1. **Inspect the drift report:** Read the `provider-drift` issue (or `drift-report.json`) to see which layers matched, which layers missed, and any `newSignals` (such as an unrecorded ASN).
2. **Re-verify live:** Run the harness locally against the single provider:
   ```bash
   npm run build
   node scripts/verify-providers.mjs --provider <slug> --json
   ```
   Also run `node dist/cli.js <verification_domain> --format json` to inspect raw headers, CNAMEs, nameservers, MX records, and ASNs.
3. **Cross-check official documentation:** Verify any new IP range, ASN, nameserver pattern, CNAME, or HTTP header against the provider's official documentation (published IP ranges, BGP/ASN docs, or header reference) before editing `providers/<slug>.json`.
4. **Decide action:**
   - **Confirmed additive or corrective update:** Edit `providers/<slug>.json` (conforming to `providers/schema.json`), add or update a unit test in `test/providers/match.test.ts` or `test/scanner-accuracy.test.ts`, and run:
     ```bash
     npm run providers:build
     npm run providers:validate
     npm run lint
     npm run typecheck
     npm run test:unit
     ```
     Open a **draft PR** on branch `provider-drift/<slug>` referencing the `provider-drift` issue and attaching the verification output.
   - **Stale verification domain only:** If the provider's signals are still accurate and only the chosen `verification_domains` site moved away from that provider, update `verification_domains` in `providers/<slug>.json` to a current public domain and open a draft PR.
   - **Ambiguous change, transient outage, or signal removal:** Leave a clear comment on the `provider-drift` issue with your findings and do not remove existing signals without maintainer confirmation.
