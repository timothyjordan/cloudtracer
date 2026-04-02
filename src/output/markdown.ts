import type { ScanResult } from "../types.js";

export function formatMarkdown(result: ScanResult): string {
  const lines: string[] = [];

  lines.push(`# Site Stack Report: ${result.domain}`);
  lines.push("");
  lines.push(`> Scanned at ${new Date(result.scannedAt).toUTCString()}`);
  lines.push("");

  // Registration
  if (result.registration) {
    const r = result.registration;
    lines.push("## Domain Registration");
    lines.push("");
    lines.push(`- **Registrar**: ${r.registrar} (via ${r.source.toUpperCase()})`);
    if (r.registeredDate) lines.push(`- **Registered**: ${r.registeredDate}`);
    if (r.expirationDate) lines.push(`- **Expires**: ${r.expirationDate}`);
    lines.push("");
  }

  // DNS
  if (result.dns) {
    lines.push("## DNS");
    lines.push("");
    if (result.dns.provider) {
      lines.push(`- **Provider**: ${result.dns.provider.name}`);
    }
    if (result.dns.nameservers.length > 0) {
      lines.push(`- **Nameservers**: ${result.dns.nameservers.join(", ")}`);
    }
    lines.push("");
  }

  // CDN
  if (result.cdn && result.cdn.providers.length > 0) {
    lines.push("## CDN / Edge Network");
    lines.push("");
    for (const p of result.cdn.providers) {
      lines.push(`- **${p.provider.name}**: ${p.evidence.join("; ")}`);
    }
    lines.push("");
  }

  // Hosting
  if (result.hosting) {
    const h = result.hosting;
    lines.push("## Hosting & Compute");
    lines.push("");
    if (h.platform && h.provider) {
      lines.push(`- **Platform**: ${h.platform.name} (on ${h.provider.name})`);
    } else if (h.platform) {
      lines.push(`- **Platform**: ${h.platform.name}`);
    } else if (h.provider) {
      lines.push(`- **Provider**: ${h.provider.name}`);
    }
    if (h.asn) lines.push(`- **ASN**: ${h.asn.number} (${h.asn.name})`);
    if (h.ipAddresses.v4.length > 0) lines.push(`- **IPv4**: ${h.ipAddresses.v4.join(", ")}`);
    if (h.ipAddresses.v6.length > 0) lines.push(`- **IPv6**: ${h.ipAddresses.v6.join(", ")}`);
    lines.push("");
  }

  // SSL/TLS
  if (result.ssl) {
    const s = result.ssl;
    lines.push("## SSL/TLS Certificate");
    lines.push("");
    lines.push(`- **Issuer**: ${s.issuer}`);
    lines.push(`- **Subject**: ${s.subject}`);
    lines.push(`- **Protocol**: ${s.protocol}`);
    lines.push(`- **Valid From**: ${s.validFrom}`);
    lines.push(`- **Valid To**: ${s.validTo}`);
    lines.push(`- **Days Until Expiry**: ${s.daysUntilExpiry}`);
    if (s.san.length > 0) {
      lines.push(`- **SANs**: ${s.san.join(", ")}`);
    }
    lines.push("");
  }

  // Email
  if (result.email) {
    const e = result.email;
    lines.push("## Email Infrastructure");
    lines.push("");
    if (e.provider) lines.push(`- **Provider**: ${e.provider.name}`);
    if (e.mxRecords.length > 0) {
      lines.push("- **MX Records**:");
      for (const mx of e.mxRecords) {
        lines.push(`  - \`${mx.exchange}\` (priority ${mx.priority})`);
      }
    }
    if (e.spf) lines.push(`- **SPF**: \`${e.spf}\``);
    if (e.dmarc) lines.push(`- **DMARC**: \`${e.dmarc}\``);
    lines.push("");
  }

  // Performance
  if (result.performance) {
    const p = result.performance;
    lines.push("## Performance");
    lines.push("");
    lines.push("| Metric | Time | Rating |");
    lines.push("|--------|------|--------|");
    if (p.dnsResolutionMs >= 0)
      lines.push(`| DNS Resolution | ${p.dnsResolutionMs}ms | ${rating(p.dnsResolutionMs, 50, 150)} |`);
    if (p.tlsHandshakeMs >= 0)
      lines.push(`| TLS Handshake | ${p.tlsHandshakeMs}ms | ${rating(p.tlsHandshakeMs, 100, 300)} |`);
    if (p.ttfbMs >= 0)
      lines.push(`| Time to First Byte | ${p.ttfbMs}ms | ${rating(p.ttfbMs, 200, 600)} |`);
    if (p.totalResponseMs >= 0)
      lines.push(`| Total Response | ${p.totalResponseMs}ms | ${rating(p.totalResponseMs, 500, 1500)} |`);
    if (p.contentSizeBytes != null)
      lines.push(`| Content Size | ${formatBytesMarkdown(p.contentSizeBytes)} | - |`);
    lines.push("");
  }

  // Third-party services
  if (result.thirdPartyServices && result.thirdPartyServices.length > 0) {
    lines.push("## Third-Party Services");
    lines.push("");
    lines.push("| Service | Category | Evidence |");
    lines.push("|---------|----------|----------|");
    for (const svc of result.thirdPartyServices) {
      lines.push(`| ${svc.name} | ${svc.category} | ${svc.evidence} |`);
    }
    lines.push("");
  }

  // Mermaid diagram
  lines.push("## Infrastructure Diagram");
  lines.push("");
  lines.push("```mermaid");
  lines.push(generateMermaid(result));
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

function generateMermaid(result: ScanResult): string {
  const lines: string[] = [];

  lines.push("graph TD");
  lines.push('    classDef user fill:#f9f9f9,stroke:#333,stroke-width:2px;');
  lines.push('    classDef dns fill:#d4e6f1,stroke:#2874a6,stroke-width:2px;');
  lines.push('    classDef edge fill:#d5f5e3,stroke:#239b56,stroke-width:2px;');
  lines.push('    classDef cloud fill:#fcf3cf,stroke:#b7950b,stroke-width:2px;');
  lines.push('    classDef thirdparty fill:#fadbd8,stroke:#b03a2e,stroke-width:2px;');
  lines.push("");
  lines.push("    User((User Request)):::user");

  // DNS
  if (result.dns?.provider) {
    lines.push(`    DNS[DNS: ${result.dns.provider.name}]:::dns`);
  } else {
    lines.push("    DNS[DNS]:::dns");
  }

  // Registration
  if (result.registration) {
    lines.push(`    Reg[Registrar: ${result.registration.registrar}]:::dns`);
    lines.push('    Reg -. "Delegates to" .-> DNS');
  }

  // CDN
  if (result.cdn && result.cdn.providers.length > 0) {
    const cdnName = result.cdn.providers.map((p) => p.provider.name).join(" + ");
    lines.push(`    CDN[CDN: ${cdnName}]:::edge`);
  }

  // SSL
  if (result.ssl) {
    lines.push(`    Cert[SSL: ${result.ssl.issuer}]:::edge`);
  }

  // Hosting
  if (result.hosting?.provider) {
    const ips = result.hosting.ipAddresses.v4.slice(0, 1).join(", ");
    lines.push(`    Host[Hosting: ${result.hosting.provider.name}\\nIP: ${ips}]:::cloud`);
  } else if (result.hosting) {
    const ips = result.hosting.ipAddresses.v4.slice(0, 1).join(", ");
    lines.push(`    Host[Hosting\\nIP: ${ips}]:::cloud`);
  }

  // Email
  if (result.email?.provider) {
    lines.push(`    Mail[Email: ${result.email.provider.name}]:::cloud`);
  }

  // Third-party
  if (result.thirdPartyServices && result.thirdPartyServices.length > 0) {
    for (let i = 0; i < Math.min(result.thirdPartyServices.length, 5); i++) {
      const svc = result.thirdPartyServices[i];
      lines.push(`    TP${i}[${svc.name}]:::thirdparty`);
    }
  }

  // Connections
  lines.push("");
  lines.push("    User -->|Queries| DNS");

  if (result.cdn && result.cdn.providers.length > 0) {
    lines.push("    DNS -->|Resolves to| CDN");
    if (result.ssl) lines.push('    CDN -->|Secured by| Cert');
    if (result.hosting) lines.push('    CDN -->|Routes to Origin| Host');
  } else {
    if (result.hosting) lines.push("    DNS -->|Resolves to| Host");
    if (result.ssl) lines.push('    Host -->|Secured by| Cert');
  }

  if (result.thirdPartyServices) {
    for (let i = 0; i < Math.min(result.thirdPartyServices.length, 5); i++) {
      lines.push(`    Host -. "Loads" .-> TP${i}`);
    }
  }

  return lines.join("\n");
}

function rating(ms: number, goodThreshold: number, warnThreshold: number): string {
  if (ms <= goodThreshold) return "🟢 Fast";
  if (ms <= warnThreshold) return "🟡 Moderate";
  return "🔴 Slow";
}

function formatBytesMarkdown(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
