/**
 * The one-time first-run disclosure.
 *
 * Written to stderr, never stdout. `--json`, `--yaml`, and `--markdown` output
 * exists to be piped into other tools, and a notice on stdout would corrupt
 * it. That is the single most important property of this module.
 */

import type { Telemetry, TelemetryConfigProvider } from "./types.js";

export const NOTICE_TEXT = `CloudTracer collects anonymous usage analytics (which commands run, which
scanners resolved, errors by type) to decide what to build next.

The domain you scan and your results are never sent. Nothing about the sites
you look up leaves your machine.

Turn it off any time:  cloudtracer telemetry off
Or set DO_NOT_TRACK=1. Analytics is off automatically in CI.
`;

export interface NoticeDeps {
  telemetry: Telemetry;
  provider: TelemetryConfigProvider;
  /** Defaults to stderr. Injected for tests. */
  write?: (text: string) => void;
}

/**
 * Show the disclosure once, if telemetry is actually on.
 *
 * Deliberately silent when telemetry is off, including when the environment
 * forced it off: announcing collection that is not happening is just noise in
 * someone's CI logs.
 */
export async function maybeShowNotice(deps: NoticeDeps): Promise<void> {
  const write = deps.write ?? ((text: string) => process.stderr.write(text));
  try {
    if (!(await deps.telemetry.isEnabled())) return;
    if (await deps.provider.hasShownNotice()) return;
    write(`\n${NOTICE_TEXT}\n`);
    await deps.provider.markNoticeShown();
  } catch {
    // Never let the disclosure path break the command it precedes.
  }
}
