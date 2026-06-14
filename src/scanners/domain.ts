import type { RegistrationInfo } from "../types.js";
import type { Platform } from "../platform/types.js";

export async function scanDomain(
  domain: string,
  platform: Platform,
): Promise<RegistrationInfo | undefined> {
  // Try RDAP first (works in both Node and the browser over plain HTTPS)
  const rdapResult = await tryRdap(domain);
  if (rdapResult) return rdapResult;

  // Fall back to WHOIS where the platform supports it (Node only)
  return platform.whois?.(domain);
}

const RDAP_TIMEOUT_MS = 8000;

async function tryRdap(domain: string): Promise<RegistrationInfo | undefined> {
  // rdap.org redirects to the authoritative server, which occasionally times out
  // or rate-limits. A single transient failure shouldn't silently drop the
  // registrar, so retry once before giving up. A 4xx (other than 429) is an
  // authoritative "no record" and is not retried.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`https://rdap.org/domain/${domain}`, {
        headers: { accept: "application/rdap+json" },
        signal: AbortSignal.timeout(RDAP_TIMEOUT_MS),
      });

      if (response.ok) {
        return parseRdap(await response.json() as RdapResponse);
      }
      if (response.status !== 429 && response.status < 500) return undefined;
    } catch {
      // network error / timeout — fall through and retry
    }
  }
  return undefined;
}

function parseRdap(data: RdapResponse): RegistrationInfo | undefined {
  const registrar = data.entities
    ?.find((e) => e.roles?.includes("registrar"))
    ?.vcardArray?.[1]
    ?.find((v) => v[0] === "fn")?.[3] as string | undefined;

  if (!registrar) return undefined;

  const registrationEvent = data.events?.find(
    (e) => e.eventAction === "registration",
  );
  const expirationEvent = data.events?.find(
    (e) => e.eventAction === "expiration",
  );

  return {
    registrar,
    registeredDate: registrationEvent?.eventDate,
    expirationDate: expirationEvent?.eventDate,
    source: "rdap",
  };
}

interface RdapResponse {
  entities?: Array<{
    roles?: string[];
    vcardArray?: [string, Array<[string, Record<string, unknown>, string, unknown]>];
  }>;
  events?: Array<{
    eventAction: string;
    eventDate: string;
  }>;
}
