# Telemetry core

> Report anonymous usage events from the CLI and the Chrome extension, without
> ever revealing what the user scanned.

CloudTracer's analytics are opt-out and on by default, so the core carries the
burden of being trustworthy by construction rather than by policy. Two things
matter more than anything else here: a disabled or unconfigured build must send
nothing at all, and no event may ever carry the scanned domain.

The core is platform-agnostic. It must not import `node:*`, because the same
module runs in the CLI and inside the browser extension. Persistence and
transport are injected.

## `serializeEvent(event)`

Turn a typed event into the flat property bag sent to the analytics backend.
This function is the enforcement point for the no-domain rule, so it is
deliberately an allowlist rather than a passthrough.

### Should

- Return only properties that the event's own schema declares. A key the schema
  does not name must be dropped, even when the caller supplied it.
- Drop a declared key whose value is the wrong type, rather than coercing it.
- Never return a property whose value is a free-form string supplied by the
  caller. Every string-valued property is drawn from a fixed set of allowed
  literals, so a hostname cannot survive serialization.
- Be total: never throw, for any input, including an object cast through `any`
  with extra keys, nested objects, or `null`.
- Produce the same output for the same input, with no dependence on call order
  or ambient state.

### Acceptance criteria

- Serializing a `scan_completed` event carrying an extra `domain: "example.com"`
  property returns an object with no `domain` key.
- Serializing a `scan_completed` event whose `format` is `"json"` keeps
  `format: "json"`.
- Serializing a `scan_completed` event whose `format` is `"example.com"` drops
  `format`, because that value is not one of the allowed output formats.
- Serializing `{} as any` does not throw.

## `createNoopAdapter()`

### Should

- Satisfy the adapter interface.
- Perform no network request under any circumstance.
- Resolve successfully from `capture` and `flush`, so callers need no special
  casing for the disabled path.

### Acceptance criteria

- Calling `capture` never invokes `fetch`.

## `createPostHogAdapter({ key, host, fetchImpl, timeoutMs })`

### Should

- POST a single event to `{host}/i/v0/e/` with a JSON body containing
  `api_key`, `event`, `distinct_id`, and `properties`.
- Send the `host` it was given, verbatim. It must not infer a region or rewrite
  the host, because a US key sent to the EU endpoint is dropped silently and
  the inverse is equally invisible.
- Resolve, not reject, when the request fails, times out, or returns a non-2xx
  status. A telemetry failure must never surface to the caller.
- Abandon a request that exceeds `timeoutMs` rather than hanging.

### Acceptance criteria

- Given `host: "https://us.i.posthog.com"`, the request URL is
  `https://us.i.posthog.com/i/v0/e/`.
- The request body parses as JSON and its `api_key` equals the configured key.
- When `fetchImpl` rejects, `capture` still resolves.
- When `fetchImpl` returns a 401, `capture` still resolves.

## `selectAdapter(config, deps)`

Decide which adapter a build gets.

### Should

- Return the noop adapter when no key is configured, which is the case for
  local dev builds, forks, and any build where the key was not injected.
- Return the noop adapter when no host is configured, even if a key is present.
  A key without a host cannot be routed, and guessing a region is worse than
  sending nothing.
- Return the PostHog adapter only when both a key and a host are present.

### Acceptance criteria

- `selectAdapter({})` yields an adapter that performs no network request.
- `selectAdapter({ key: "phc_x" })` with no host performs no network request.
- `selectAdapter({ key: "phc_x", host: "https://us.i.posthog.com" })` yields an
  adapter that does issue a request.

## `createTelemetry({ adapter, provider })`

The façade the CLI and extension use: `track`, `isEnabled`, `setEnabled`,
`flush`.

### Should

- Send nothing when the provider reports telemetry disabled, regardless of
  which adapter was selected. The enabled check gates the adapter, not the
  reverse.
- Attach the provider's stable anonymous `distinctId` to every event.
- Resolve `track` without waiting for the send to complete, so a scan is never
  delayed by analytics.
- Never throw out of `track`, even when the provider itself throws.
- Reflect a `setEnabled(false)` immediately: a `track` issued afterwards sends
  nothing, without needing re-initialisation.
- Report `isEnabled` consistently with the provider.

### Acceptance criteria

- With a provider reporting disabled, `track` produces zero adapter calls.
- With a provider reporting enabled, `track` produces exactly one adapter call
  per `track` call.
- Every captured event carries the provider's `distinctId`.
- After `setEnabled(false)`, a subsequent `track` produces no adapter call.
- When the provider's `isEnabled` rejects, `track` resolves and sends nothing.
  Failing closed is correct: an unreadable config must not be treated as
  consent.

## Notes

- The anonymous id is a random identifier held by the provider. It is never
  derived from the machine, the user, the account, or anything scanned.
- `flush` exists for the CLI, which is a short-lived process and may exit
  before an in-flight request settles.
