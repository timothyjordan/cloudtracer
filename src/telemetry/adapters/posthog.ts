import { serializeEvent } from "../serialize.js";
import type { TelemetryAdapter, TelemetryEvent } from "../types.js";

/** Injectable `fetch`, so tests never touch the network. */
export type FetchImpl = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number }>;

export interface PostHogAdapterOptions {
  key: string;
  /**
   * Full origin, used verbatim. Region is never inferred: a US key posted to
   * the EU endpoint is dropped silently, and the inverse is just as invisible,
   * so guessing here produces a bug with no error message.
   */
  host: string;
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 3000;

/**
 * PostHog's single-event capture endpoint. The project key is write-only by
 * design, which is why it is safe to ship inside a distributed extension.
 */
export function createPostHogAdapter(opts: PostHogAdapterOptions): TelemetryAdapter {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endpoint = `${opts.host.replace(/\/+$/, "")}/i/v0/e/`;
  const inFlight = new Set<Promise<void>>();

  const doFetch: FetchImpl =
    opts.fetchImpl ??
    ((input, init) => fetch(input, init as RequestInit) as unknown as ReturnType<FetchImpl>);

  async function send(event: TelemetryEvent, distinctId: string): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await doFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: opts.key,
          event: event.name,
          distinct_id: distinctId,
          properties: serializeEvent(event),
        }),
        signal: controller.signal,
      });
    } catch {
      // Swallowed on purpose. A dropped analytics event is never worth
      // surfacing to someone trying to scan a domain.
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    capture(event, distinctId) {
      const p = send(event, distinctId).finally(() => inFlight.delete(p));
      inFlight.add(p);
      return p;
    },
    async flush() {
      await Promise.allSettled([...inFlight]);
    },
  };
}
