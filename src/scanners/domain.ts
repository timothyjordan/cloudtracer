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

async function tryRdap(domain: string): Promise<RegistrationInfo | undefined> {
  try {
    const response = await fetch(`https://rdap.org/domain/${domain}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return undefined;

    const data = await response.json() as RdapResponse;

    const registrar = data.entities
      ?.find((e) => e.roles?.includes("registrar"))
      ?.vcardArray?.[1]
      ?.find((v) => v[0] === "fn")?.[3] as string | undefined;

    const registrationEvent = data.events?.find(
      (e) => e.eventAction === "registration",
    );
    const expirationEvent = data.events?.find(
      (e) => e.eventAction === "expiration",
    );

    if (!registrar) return undefined;

    return {
      registrar,
      registeredDate: registrationEvent?.eventDate,
      expirationDate: expirationEvent?.eventDate,
      source: "rdap",
    };
  } catch {
    return undefined;
  }
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
