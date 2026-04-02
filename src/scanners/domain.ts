import type { RegistrationInfo } from "../types.js";

export async function scanDomain(domain: string): Promise<RegistrationInfo | undefined> {
  // Try RDAP first
  const rdapResult = await tryRdap(domain);
  if (rdapResult) return rdapResult;

  // Fall back to whoiser
  const whoisResult = await tryWhois(domain);
  return whoisResult;
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

async function tryWhois(domain: string): Promise<RegistrationInfo | undefined> {
  try {
    const { default: whoiser } = await import("whoiser");
    const result = await whoiser.domain(domain, { timeout: 10000 });

    // whoiser returns results keyed by WHOIS server
    const firstResult = Object.values(result)[0] as WhoisResult | undefined;
    if (!firstResult) return undefined;

    const registrar = firstResult["Registrar"] ?? firstResult["registrar"];
    if (!registrar) return undefined;

    return {
      registrar: Array.isArray(registrar) ? registrar[0] : registrar,
      registeredDate: normalizeDate(
        firstResult["Creation Date"] ??
        firstResult["Created Date"] ??
        firstResult["created"],
      ),
      expirationDate: normalizeDate(
        firstResult["Registry Expiry Date"] ??
        firstResult["Expiration Date"] ??
        firstResult["expires"],
      ),
      source: "whois",
    };
  } catch {
    return undefined;
  }
}

function normalizeDate(value: unknown): string | undefined {
  if (!value) return undefined;
  const str = Array.isArray(value) ? value[0] : String(value);
  try {
    return new Date(str).toISOString();
  } catch {
    return str;
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

interface WhoisResult {
  [key: string]: unknown;
}
