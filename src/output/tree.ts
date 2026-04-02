import chalk from "chalk";
import type { ScanResult } from "../types.js";

export function formatTree(result: ScanResult): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(chalk.bold.cyan(`  🌐 ${result.domain}`));
  lines.push("");

  const sections: { label: string; items: string[] }[] = [];

  // Registration
  if (result.registration) {
    const r = result.registration;
    const items: string[] = [`Registrar  : ${r.registrar} (${r.source.toUpperCase()})`];
    if (r.registeredDate) items.push(`Registered : ${formatDate(r.registeredDate)}`);
    if (r.expirationDate) items.push(`Expires    : ${formatDate(r.expirationDate)}`);
    sections.push({ label: "Registration", items });
  }

  // DNS
  if (result.dns) {
    const d = result.dns;
    const items: string[] = [];
    if (d.provider) items.push(`Provider     : ${d.provider.name}`);
    if (d.nameservers.length > 0) {
      items.push(`Nameservers  : ${d.nameservers.join(", ")}`);
    }
    if (items.length > 0) sections.push({ label: "DNS", items });
  }

  // CDN
  if (result.cdn && result.cdn.providers.length > 0) {
    const items: string[] = [];
    for (const p of result.cdn.providers) {
      items.push(`${p.provider.name} (${p.evidence.join("; ")})`);
    }
    sections.push({ label: "CDN", items });
  }

  // Hosting
  if (result.hosting) {
    const h = result.hosting;
    const items: string[] = [];
    if (h.platform && h.provider) {
      items.push(`Platform : ${h.platform.name} (on ${h.provider.name})`);
    } else if (h.platform) {
      items.push(`Platform : ${h.platform.name}`);
    } else if (h.provider) {
      items.push(`Provider : ${h.provider.name}`);
    }
    if (h.asn) items.push(`ASN      : ${h.asn.number} (${h.asn.name})`);
    if (h.ipAddresses.v4.length > 0) items.push(`IPv4     : ${h.ipAddresses.v4.join(", ")}`);
    if (h.ipAddresses.v6.length > 0) items.push(`IPv6     : ${h.ipAddresses.v6.join(", ")}`);
    if (items.length > 0) sections.push({ label: "Hosting", items });
  }

  // SSL/TLS
  if (result.ssl) {
    const s = result.ssl;
    const items: string[] = [
      `Issuer   : ${s.issuer}`,
      `Protocol : ${s.protocol}`,
      `Expires  : ${formatDate(s.validTo)} (${formatDaysUntilExpiry(s.daysUntilExpiry)})`,
    ];
    if (s.san.length > 0 && s.san.length <= 5) {
      items.push(`SANs     : ${s.san.join(", ")}`);
    } else if (s.san.length > 5) {
      items.push(`SANs     : ${s.san.slice(0, 5).join(", ")} (+${s.san.length - 5} more)`);
    }
    sections.push({ label: "SSL/TLS", items });
  }

  // Email
  if (result.email) {
    const e = result.email;
    const items: string[] = [];
    if (e.provider) items.push(`Provider : ${e.provider.name}`);
    if (e.mxRecords.length > 0) {
      items.push(`MX       : ${e.mxRecords.map((r) => `${r.exchange} (pri ${r.priority})`).join(", ")}`);
    }
    if (e.spf) items.push(`SPF      : ${chalk.green("✓")} configured`);
    if (e.dmarc) items.push(`DMARC    : ${chalk.green("✓")} configured`);
    if (items.length > 0) sections.push({ label: "Email", items });
  }

  // Performance
  if (result.performance) {
    const p = result.performance;
    const items: string[] = [];
    if (p.dnsResolutionMs >= 0) items.push(`DNS      : ${colorTiming(p.dnsResolutionMs, 50, 150)}`);
    if (p.tlsHandshakeMs >= 0) items.push(`TLS      : ${colorTiming(p.tlsHandshakeMs, 100, 300)}`);
    if (p.ttfbMs >= 0) items.push(`TTFB     : ${colorTiming(p.ttfbMs, 200, 600)}`);
    if (p.totalResponseMs >= 0) items.push(`Response : ${colorTiming(p.totalResponseMs, 500, 1500)}`);
    if (p.contentSizeBytes != null) items.push(`Size     : ${formatBytes(p.contentSizeBytes)}`);
    if (items.length > 0) sections.push({ label: "Performance", items });
  }

  // Third-party services
  if (result.thirdPartyServices && result.thirdPartyServices.length > 0) {
    const grouped = new Map<string, string[]>();
    for (const svc of result.thirdPartyServices) {
      const list = grouped.get(svc.category) ?? [];
      list.push(svc.name);
      grouped.set(svc.category, list);
    }
    const items: string[] = [];
    for (const [category, names] of grouped) {
      items.push(`${capitalize(category)} : ${names.join(", ")}`);
    }
    sections.push({ label: "Third-Party Services", items });
  }

  // Render sections
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const isLast = i === sections.length - 1;
    const prefix = isLast ? "  └── " : "  ├── ";
    const childPrefix = isLast ? "      " : "  │   ";

    lines.push(`${prefix}${chalk.bold.yellow(section.label)}`);
    for (let j = 0; j < section.items.length; j++) {
      const itemPrefix = j === section.items.length - 1 && isLast ? childPrefix : childPrefix;
      lines.push(`${itemPrefix}${section.items[j]}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDaysUntilExpiry(days: number): string {
  if (days < 0) return chalk.red(`expired ${Math.abs(days)} days ago`);
  if (days < 30) return chalk.red(`${days} days remaining`);
  if (days < 90) return chalk.yellow(`${days} days remaining`);
  return chalk.green(`${days} days remaining`);
}

function colorTiming(ms: number, goodThreshold: number, warnThreshold: number): string {
  const label = `${ms}ms`;
  if (ms <= goodThreshold) return chalk.green(label);
  if (ms <= warnThreshold) return chalk.yellow(label);
  return chalk.red(label);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
