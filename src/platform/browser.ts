import type { SslInfo } from "../types.js";
import type { DnsResolver, Platform } from "./types.js";

/**
 * Browser platform: everything over plain HTTPS so it runs in a Chrome
 * extension with no backend. DNS uses Cloudflare DNS-over-HTTPS, and the TLS
 * certificate is derived from Certificate Transparency logs (crt.sh) since a
 * browser cannot open a raw TLS socket. `whois` and `measureTlsMs` are omitted
 * (not possible in the browser); the scanners degrade gracefully without them.
 */
export const browserPlatform: Platform = {
  dns: createDohResolver(),
  getCertificate,
};

// ---- DNS over HTTPS (Cloudflare JSON API) ------------------------------------

const DOH_URL = "https://cloudflare-dns.com/dns-query";

// DNS record type numbers used to filter the DoH Answer section.
const RECORD_TYPE = { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28 } as const;

interface DohAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

interface DohResponse {
  Status: number;
  Answer?: DohAnswer[];
}

async function doh(name: string, type: keyof typeof RECORD_TYPE): Promise<string[]> {
  try {
    const url = `${DOH_URL}?name=${encodeURIComponent(name)}&type=${type}`;
    const res = await fetch(url, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];

    const json = (await res.json()) as DohResponse;
    if (json.Status !== 0 || !json.Answer) return [];

    // The Answer section can include intermediate records (e.g. a CNAME in an
    // A-record response); keep only entries matching the requested type.
    const want = RECORD_TYPE[type];
    return json.Answer.filter((a) => a.type === want).map((a) => a.data);
  } catch {
    return [];
  }
}

const stripTrailingDot = (s: string): string => s.replace(/\.$/, "");

/** DoH returns TXT data as one or more quoted segments, e.g. `"part1" "part2"`. */
function parseTxt(data: string): string {
  const segments = data.match(/"([^"]*)"/g);
  if (segments) return segments.map((s) => s.slice(1, -1)).join("");
  return data;
}

function createDohResolver(): DnsResolver {
  return {
    async resolveNs(domain) {
      return (await doh(domain, "NS")).map(stripTrailingDot);
    },
    async resolveA(domain) {
      return doh(domain, "A");
    },
    async resolveAaaa(domain) {
      return doh(domain, "AAAA");
    },
    async resolveCname(domain) {
      return (await doh(domain, "CNAME")).map(stripTrailingDot);
    },
    async resolveMx(domain) {
      return (await doh(domain, "MX")).map((entry) => {
        const [priority, exchange] = entry.split(/\s+/);
        return {
          priority: parseInt(priority) || 0,
          exchange: stripTrailingDot(exchange ?? ""),
        };
      });
    },
    async resolveTxt(domain) {
      return (await doh(domain, "TXT")).map(parseTxt);
    },
  };
}

// ---- Certificate via Certificate Transparency logs (crt.sh) ------------------

interface CrtShEntry {
  issuer_name: string;
  common_name?: string;
  name_value: string;
  not_before: string;
  not_after: string;
}

async function getCertificate(domain: string): Promise<SslInfo | undefined> {
  const entries = await fetchCrtSh(domain);
  if (!entries || entries.length === 0) return undefined;

  try {
    const now = Date.now();
    const dated = entries
      .map((e) => ({
        e,
        from: Date.parse(asUtc(e.not_before)),
        to: Date.parse(asUtc(e.not_after)),
      }))
      .filter((x) => !isNaN(x.from) && !isNaN(x.to));
    if (dated.length === 0) return undefined;

    // Prefer certs that actually cover this exact host over subdomain certs,
    // then a currently-valid one, then the most recently issued.
    const covering = dated.filter((x) => certCovers(x.e, domain));
    const pool = covering.length ? covering : dated;
    const currentlyValid = pool.filter((x) => x.from <= now && x.to > now);
    const chosen = (currentlyValid.length ? currentlyValid : pool).sort(
      (a, b) => b.from - a.from,
    )[0];

    const san = Array.from(
      new Set(
        chosen.e.name_value
          .split(/\n/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    );

    return {
      issuer: parseIssuer(chosen.e.issuer_name),
      subject: chosen.e.common_name || domain,
      san,
      validFrom: new Date(chosen.from).toISOString(),
      validTo: new Date(chosen.to).toISOString(),
      daysUntilExpiry: Math.floor((chosen.to - now) / (1000 * 60 * 60 * 24)),
      // CT logs do not record the negotiated TLS version.
      protocol: "unknown",
    };
  } catch {
    return undefined;
  }
}

/**
 * Fetch certificate entries from crt.sh. The service is fast but intermittently
 * returns 502s or times out, so we try a couple of query variants before giving
 * up. `exclude=expired` returns a small current-cert payload; the plain query is
 * the fallback. Returns null if every attempt fails.
 */
async function fetchCrtSh(domain: string): Promise<CrtShEntry[] | null> {
  const q = encodeURIComponent(domain);
  const urls = [
    `https://crt.sh/?q=${q}&output=json&exclude=expired`,
    `https://crt.sh/?q=${q}&output=json`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as unknown;
      if (Array.isArray(data)) return data as CrtShEntry[];
    } catch {
      // transient failure (502 / timeout) — fall through to the next variant
    }
  }
  return null;
}

/** Does a crt.sh entry cover this exact host (by common name or a SAN line)? */
function certCovers(entry: CrtShEntry, domain: string): boolean {
  if (entry.common_name === domain) return true;
  return entry.name_value
    .split(/\n/)
    .map((s) => s.trim().toLowerCase())
    .includes(domain.toLowerCase());
}

/** crt.sh timestamps look like "2026-01-01T00:00:00" with no zone; treat as UTC. */
function asUtc(ts: string): string {
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(ts) ? ts : `${ts}Z`;
}

/** issuer_name is an RDN string, e.g. "C=US, O=Let's Encrypt, CN=R3". Prefer O, then CN. */
function parseIssuer(issuerName: string): string {
  const org = issuerName.match(/(?:^|,\s*)O=([^,]+)/);
  if (org) return unquote(org[1]);
  const cn = issuerName.match(/(?:^|,\s*)CN=([^,]+)/);
  if (cn) return unquote(cn[1]);
  return issuerName || "Unknown";
}

function unquote(value: string): string {
  return value.trim().replace(/^"|"$/g, "");
}
