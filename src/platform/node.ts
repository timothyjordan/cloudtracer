import * as tls from "node:tls";
import * as net from "node:net";
import type { RegistrationInfo, SslInfo } from "../types.js";
import type { Platform } from "./types.js";
import {
  resolveNs,
  resolveA,
  resolveAaaa,
  resolveCname,
  resolveMx,
  resolveTxt,
} from "../utils/dns.js";

/**
 * Node platform: native DNS (node:dns), a live TLS handshake for certificate
 * extraction, the whoiser WHOIS fallback, and raw TLS handshake timing.
 * This is the default platform used by the CLI and library.
 */
export const nodePlatform: Platform = {
  dns: { resolveNs, resolveA, resolveAaaa, resolveCname, resolveMx, resolveTxt },
  getCertificate,
  whois,
  measureTlsMs,
};

function getCertificate(domain: string): Promise<SslInfo | undefined> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: domain,
        port: 443,
        servername: domain,
        rejectUnauthorized: false,
      },
      () => {
        const cert = socket.getPeerCertificate();
        const protocol = socket.getProtocol() ?? "unknown";

        if (!cert || !cert.subject) {
          socket.destroy();
          resolve(undefined);
          return;
        }

        const validFrom = new Date(cert.valid_from).toISOString();
        const validTo = new Date(cert.valid_to).toISOString();
        const daysUntilExpiry = Math.floor(
          (new Date(cert.valid_to).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );

        resolve({
          issuer: firstString(cert.issuer?.O) ?? firstString(cert.issuer?.CN) ?? "Unknown",
          subject: firstString(cert.subject?.CN) ?? domain,
          san: cert.subjectaltname
            ? cert.subjectaltname.split(", ").map((s: string) => s.replace("DNS:", ""))
            : [],
          validFrom,
          validTo,
          daysUntilExpiry,
          protocol,
        });

        socket.destroy();
      },
    );

    socket.setTimeout(5000, () => {
      socket.destroy();
      resolve(undefined);
    });

    socket.on("error", () => {
      resolve(undefined);
    });

    // Ensure we clean up the underlying socket
    socket.on("close", () => {
      if (socket instanceof net.Socket) {
        socket.unref();
      }
    });
  });
}

async function whois(domain: string): Promise<RegistrationInfo | undefined> {
  try {
    const { whoisDomain } = await import("whoiser");
    const result = await whoisDomain(domain, { timeout: 10000 });

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

/** Certificate fields are typed `string | string[]`; take the first string value. */
function firstString(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
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

function measureTlsMs(domain: string): Promise<number> {
  return new Promise((resolve) => {
    const start = performance.now();

    const socket = tls.connect(
      {
        host: domain,
        port: 443,
        servername: domain,
        rejectUnauthorized: false,
      },
      () => {
        const elapsed = Math.round(performance.now() - start);
        socket.destroy();
        resolve(elapsed);
      },
    );

    socket.setTimeout(5000, () => {
      socket.destroy();
      resolve(-1);
    });

    socket.on("error", () => {
      resolve(-1);
    });
  });
}

interface WhoisResult {
  [key: string]: unknown;
}
