# Extension telemetry

> Let the popup report anonymous usage, default on, visibly switchable off, and
> never at the cost of the scan the user actually opened it for.

This is the surface with the most review risk. The extension holds
`<all_urls>`, so the disclosure has to be genuinely visible and the no-domain
guarantee has to hold without qualification.

A second constraint shapes the design: the popup has **no background service
worker**. Telemetry only runs while the popup is open, and the popup is
destroyed the moment it loses focus, which is usually immediately after a
click. Anything that assumes a settled request will lose most click events.

## `createBrowserConfigProvider()`

Persist the opt-out flag, the notice flag, and the anonymous id in
`chrome.storage.local`.

### Should

- Default to **enabled** when nothing is stored, because the agreed model is
  opt-out.
- Treat only an explicit stored `false` as disabled. A missing key, `undefined`,
  or a junk value must not be read as an opt-out, and must not be read as an
  opt-in either: absent means the default.
- Generate a random anonymous id on first use and return the same id on every
  later call.
- Derive the id from nothing: not the machine, the installation, the tab, or
  anything scanned.
- Persist `setEnabled(false)` so a later popup session still reports disabled.
- Report the notice as unshown initially and as shown after `markNoticeShown`.
- Survive a `chrome.storage` layer that throws or is entirely absent, resolving
  rather than rejecting. A broken storage layer must not cost the user a scan,
  and the extension must still function with telemetry simply inert.

### Acceptance criteria

- With empty storage, `isEnabled()` is `true`.
- With `{ telemetryEnabled: false }` stored, `isEnabled()` is `false`.
- `getDistinctId()` twice returns the same value.
- After `setEnabled(false)`, a freshly constructed provider over the same
  storage reports `false`.
- With a `chrome.storage.local.get` that throws, `isEnabled()` resolves to
  `true` and nothing is thrown.
- With `chrome` undefined entirely, every method resolves.

## Event payloads

### Should

- Carry no hostname, no tab URL, and no page content, on any event. The popup
  knows the scanned domain, so this is the one place the guarantee is actually
  under pressure.
- Report `popup_opened` with only whether the active tab was scannable, never
  what it was.
- Report `scan_completed` with which scanners resolved and a duration bucket,
  matching the CLI.
- Report each control press as `ui_clicked` with a control name from a fixed
  set.

### Acceptance criteria

- A `popup_opened` payload for a scannable tab serializes to exactly
  `{ surface: "extension", has_domain: true }`.
- A `ui_clicked` payload with an unrecognised control drops the control rather
  than emitting it.
- An attempt to attach a domain to any extension event is dropped by
  serialization.

## The notice

### Should

- Appear once, inline above the results rather than as an overlay. The popup is
  380px wide, and an overlay would hide the thing the user opened it to see.
- Offer a one-click opt out in the notice itself, not only a dismissal.
- Not appear at all when telemetry is already off.
- State what is collected and that the scanned site never leaves the browser.

## The toggle

### Should

- Be visible in the popup chrome rather than hidden behind a menu, and reflect
  the stored state when the popup opens.
- Meet the contrast and focus-visible standards the popup already holds, using
  the darkened WCAG AA tokens rather than reintroducing a lighter grey.
- Send the opt-out event **before** the flag takes effect. Afterwards,
  telemetry is off and the single event that explains why the numbers dropped
  would be the one event never sent.

## Notes

- Sends use `keepalive`, so a request outlives the popup closing. Without it
  most click events never arrive, and there is no background worker to retry.
- The `tabs` permission was removed. `tab.url` is available to
  `chrome.tabs.query` through the declared `<all_urls>` host permission, so
  `tabs` added review scrutiny without adding capability. This needs verifying
  in a real loaded extension, because getting it wrong means the popup sees no
  domain at all.
