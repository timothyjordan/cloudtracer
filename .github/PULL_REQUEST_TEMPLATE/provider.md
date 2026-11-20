## Provider definition

- **Provider file:** `providers/<slug>.json`
- **Provider website:** https://
- **Layers added or updated:** (DNS / CDN / Hosting / Email / Third-party / HTML framework)

## Verification

Provide at least one public domain using this provider (or a sanitized DNS / HTTP header fixture):

- **Verification domain or fixture:**

## Checklist

- [ ] One provider per PR
- [ ] `providers/<slug>.json` matches `providers/schema.json`
- [ ] Ran `npm run providers:build` and included the updated `src/providers/generated.ts`
- [ ] Ran `npm run providers:validate` with zero errors or collisions
- [ ] Ran `npm run test:unit` (and added a matcher test if introducing new signals)
