# CLI telemetry

> Let the CLI report anonymous usage, default on, trivially switchable off, and
> never at the cost of a scan or its output.

Analytics is opt-out, so the burden is on the CLI to be well behaved: it must
announce itself once, obey the conventional environment signals without needing
any config, and never corrupt piped output or delay a scan.

These units sit between the shared telemetry core and Commander. The core
already guarantees that a build without an injected key sends nothing.

## `envOverride(env)`

Decide whether the environment forces telemetry on or off, before any config
file is consulted.

### Should

- Return `false` when `DO_NOT_TRACK` is `"1"` or `"true"`. This is a
  conventional cross-tool signal and honouring it is the whole point.
- Return `false` when `CI` is set to a truthy value. A build agent is not a
  user, and counting it is both noise and a surprise.
- Return `false` when `CLOUDTRACER_TELEMETRY` is `"0"` or `"false"`.
- Return `true` when `CLOUDTRACER_TELEMETRY` is `"1"` or `"true"`, even if `CI`
  is set. An explicit, tool-specific opt-in is more specific intent than
  inferred CI detection, so it wins.
- Return `undefined` when nothing in the environment speaks to it, leaving the
  decision to the stored config.
- Treat `DO_NOT_TRACK=0` as not speaking to it, rather than as an opt-in.
- Never throw, for any env shape, including an empty object.

### Precedence

Most specific first: `CLOUDTRACER_TELEMETRY`, then `DO_NOT_TRACK`, then `CI`.

### Acceptance criteria

- `envOverride({ DO_NOT_TRACK: "1" })` is `false`.
- `envOverride({ CI: "true" })` is `false`.
- `envOverride({ CLOUDTRACER_TELEMETRY: "1", CI: "true" })` is `true`.
- `envOverride({ CLOUDTRACER_TELEMETRY: "0", DO_NOT_TRACK: "0" })` is `false`.
- `envOverride({})` is `undefined`.
- `envOverride({ DO_NOT_TRACK: "0" })` is `undefined`.

## `durationBucket(ms)`

### Should

- Return `"<1s"` below 1000ms, `"1-3s"` below 3000ms, `"3-10s"` below 10000ms,
  and `">10s"` at or above 10000ms.
- Be total for any finite non-negative number, and not throw on `0`.
- Never return a raw duration. The bucket exists because a precise timing is a
  weak fingerprint of the thing scanned.

### Acceptance criteria

- `durationBucket(0)` is `"<1s"`, `durationBucket(999)` is `"<1s"`.
- `durationBucket(1000)` is `"1-3s"`, `durationBucket(2999)` is `"1-3s"`.
- `durationBucket(3000)` is `"3-10s"`, `durationBucket(9999)` is `"3-10s"`.
- `durationBucket(10000)` is `">10s"`.

## `resolvedScanners(result)`

Report which of the eight scanners produced data, as scanner names only.

### Should

- Include a scanner's name when its corresponding field on the result is
  present, and omit it when absent.
- Map `registration` to `domain` and `thirdPartyServices` to `thirdparty`, so
  the reported names match the scanner vocabulary rather than the result shape.
- Treat an empty `thirdPartyServices` array as resolved. The scanner ran and
  found nothing, which is a different fact from not running.
- Return names in a stable order, so two identical scans produce identical
  payloads.
- Never include the domain, the timestamp, or any scanned value.
- Never throw, including for an empty object.

### Acceptance criteria

- A result with only `dns` and `cdn` present yields exactly `["dns", "cdn"]`.
- A result with `registration` present includes `"domain"`, not
  `"registration"`.
- A result with `thirdPartyServices: []` includes `"thirdparty"`.
- `resolvedScanners({})` is `[]`.

## `createNodeConfigProvider({ fs, configDir })`

Persist the opt-out flag, the notice-shown flag, and the anonymous id in a JSON
file. Backed by the existing `FsFacade` seam so tests use an in-memory fake.

### Should

- Default to **enabled** when no config file exists, because the agreed model
  is opt-out.
- Generate a random anonymous id on first use and return the same id on every
  later call. The id must not be derived from the machine, the user, the
  working directory, or anything scanned.
- Persist a changed enabled flag so `setEnabled(false)` survives into the next
  process.
- Report the notice as not yet shown on a fresh install, and as shown after
  `markNoticeShown`.
- Survive a corrupt or non-JSON config file by falling back to defaults rather
  than throwing. A broken file must not stop a scan.
- Survive an unwritable config directory without throwing from `getDistinctId`.
  Degrading to an unstable id is acceptable; crashing the CLI is not.

### Acceptance criteria

- With an empty filesystem, `isEnabled()` is `true`.
- `getDistinctId()` called twice returns the same value.
- After `setEnabled(false)`, a provider constructed fresh over the same
  filesystem reports `isEnabled()` as `false`.
- With the config file containing `"not json"`, `isEnabled()` is `true` and
  nothing throws.
- With a filesystem whose `writeFile` always rejects, `getDistinctId()`
  resolves to a non-empty string.

## The first-run notice

### Should

- Be written to **stderr**, never stdout. `--json`, `--yaml`, and `--markdown`
  output is routinely piped into other tools, and a notice on stdout would
  corrupt it.
- Appear at most once per installation, gated on the provider's notice flag.
- Not appear at all when telemetry is already off, including when the
  environment forced it off. Announcing collection that is not happening is
  just noise.
- State what is collected, state plainly that the scanned domain is never sent,
  and name the exact command to turn it off.

### Acceptance criteria

- With a fresh provider and telemetry enabled, running a scan writes the notice
  to stderr and writes nothing extra to stdout.
- A second run writes no notice.
- With `DO_NOT_TRACK=1`, no notice is written at all.
- With `--json` and a fresh provider, stdout parses as JSON.

## Notes

- Telemetry must never delay a scan: the core fires without awaiting, and the
  CLI flushes before exit.
- The help and version paths must not initialise telemetry, so `--help` stays
  fast and side-effect free.
