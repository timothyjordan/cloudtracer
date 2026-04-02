import * as tls from "node:tls";
import * as net from "node:net";
import type { SslInfo } from "../types.js";

export async function scanSsl(domain: string): Promise<SslInfo | undefined> {
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
          issuer: cert.issuer?.O ?? cert.issuer?.CN ?? "Unknown",
          subject: cert.subject?.CN ?? domain,
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
