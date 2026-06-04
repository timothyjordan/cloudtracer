import {
  runScan,
  browserPlatform,
  type ScanResult,
} from "../../src/browser-entry.js";

const content = document.getElementById("content") as HTMLElement;
const domainEl = document.getElementById("domain") as HTMLElement;

void main();

async function main(): Promise<void> {
  const tab = await getActiveTab();
  const domain = tab?.url ? domainFromUrl(tab.url) : null;

  if (!domain) {
    renderEmpty();
    return;
  }

  domainEl.textContent = domain;

  let latest: ScanResult = { domain, scannedAt: "" };
  render(latest, false);

  try {
    latest = await runScan(domain, browserPlatform, {
      onResult: (partial) => {
        latest = partial;
        render(partial, false);
      },
    });
  } catch {
    // fall through and render whatever was gathered
  }
  render(latest, true);
}

// ---- tab / domain ------------------------------------------------------------

function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) =>
      resolve(tabs[0]),
    );
  });
}

function domainFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ---- rendering ---------------------------------------------------------------

function render(r: ScanResult, done: boolean): void {
  const frag = document.createDocumentFragment();
  frag.appendChild(registrationCard(r, done));
  frag.appendChild(dnsCard(r, done));
  frag.appendChild(cdnCard(r, done));
  frag.appendChild(hostingCard(r, done));
  frag.appendChild(sslCard(r, done));
  frag.appendChild(emailCard(r, done));
  frag.appendChild(thirdPartyCard(r, done));
  frag.appendChild(performanceCard(r, done));
  content.replaceChildren(frag);
}

function registrationCard(r: ScanResult, done: boolean): HTMLElement {
  const { body, set } = card("Registration");
  if (r.registration) {
    body.appendChild(primary(r.registration.registrar));
    if (r.registration.registeredDate)
      body.appendChild(row("Registered", formatDate(r.registration.registeredDate)));
    if (r.registration.expirationDate)
      body.appendChild(row("Expires", formatDate(r.registration.expirationDate)));
    set(r.registration.source.toUpperCase());
  } else {
    fillPending(body, r.registration, done, "Not found");
  }
  return body.parentElement as HTMLElement;
}

function dnsCard(r: ScanResult, done: boolean): HTMLElement {
  const { body } = card("DNS");
  if (r.dns) {
    body.appendChild(primary(r.dns.provider?.name ?? "Unknown provider", !r.dns.provider));
    if (r.dns.nameservers.length) body.appendChild(chips(r.dns.nameservers.slice(0, 4)));
  } else {
    fillPending(body, r.dns, done);
  }
  return body.parentElement as HTMLElement;
}

function cdnCard(r: ScanResult, done: boolean): HTMLElement {
  const { body } = card("CDN / WAF");
  if (r.cdn) {
    if (r.cdn.providers.length) {
      body.appendChild(primary(r.cdn.providers.map((p) => p.provider.name).join(", ")));
      const evidence = r.cdn.providers.flatMap((p) => p.evidence).slice(0, 3);
      for (const e of evidence) body.appendChild(row("", e));
    } else {
      body.appendChild(primary("None detected", true));
    }
  } else {
    fillPending(body, r.cdn, done);
  }
  return body.parentElement as HTMLElement;
}

function hostingCard(r: ScanResult, done: boolean): HTMLElement {
  const { body } = card("Hosting");
  if (r.hosting) {
    body.appendChild(primary(r.hosting.provider?.name ?? "Unknown provider", !r.hosting.provider));
    if (r.hosting.platform)
      body.appendChild(row("Platform", r.hosting.platform.name));
    if (r.hosting.asn)
      body.appendChild(row("ASN", `${r.hosting.asn.number} · ${r.hosting.asn.name}`));
    const ips = [...r.hosting.ipAddresses.v4, ...r.hosting.ipAddresses.v6].slice(0, 4);
    if (ips.length) body.appendChild(row("IP", ips.join(", ")));
  } else {
    fillPending(body, r.hosting, done);
  }
  return body.parentElement as HTMLElement;
}

function sslCard(r: ScanResult, done: boolean): HTMLElement {
  const { body, set } = card("SSL / TLS");
  if (r.ssl) {
    body.appendChild(primary(r.ssl.issuer));
    const cls = r.ssl.daysUntilExpiry < 14 ? "bad" : r.ssl.daysUntilExpiry < 45 ? "warn" : "ok";
    body.appendChild(row("Expires", `${formatDate(r.ssl.validTo)} (${r.ssl.daysUntilExpiry}d)`, cls));
    if (r.ssl.protocol && r.ssl.protocol !== "unknown")
      body.appendChild(row("Protocol", r.ssl.protocol));
    if (r.ssl.san.length) body.appendChild(row("SANs", String(r.ssl.san.length)));
  } else if (done) {
    body.appendChild(primary("Unavailable", true));
    body.appendChild(row("", "Certificate Transparency lookup failed (crt.sh)"));
    set("CT logs");
  } else {
    fillPending(body, r.ssl, done);
    set("CT logs");
  }
  return body.parentElement as HTMLElement;
}

function emailCard(r: ScanResult, done: boolean): HTMLElement {
  const { body } = card("Email");
  if (r.email) {
    body.appendChild(primary(r.email.provider?.name ?? (r.email.mxRecords.length ? "Custom" : "No mail"), !r.email.provider));
    if (r.email.mxRecords.length)
      body.appendChild(row("MX", r.email.mxRecords.slice(0, 2).map((m) => m.exchange).join(", ")));
    const auth: string[] = [];
    if (r.email.spf) auth.push("SPF");
    if (r.email.dmarc) auth.push("DMARC");
    if (auth.length) body.appendChild(row("Auth", auth.join(" · "), "ok"));
  } else {
    fillPending(body, r.email, done);
  }
  return body.parentElement as HTMLElement;
}

function thirdPartyCard(r: ScanResult, done: boolean): HTMLElement {
  const { body, set } = card("Third-party");
  if (r.thirdPartyServices) {
    if (r.thirdPartyServices.length) {
      body.appendChild(chips(r.thirdPartyServices.map((s) => s.name)));
      set(String(r.thirdPartyServices.length));
    } else {
      body.appendChild(primary("None detected", true));
    }
  } else {
    fillPending(body, r.thirdPartyServices, done);
  }
  return body.parentElement as HTMLElement;
}

function performanceCard(r: ScanResult, done: boolean): HTMLElement {
  const { body } = card("Performance");
  if (r.performance) {
    const p = r.performance;
    body.appendChild(row("TTFB", ms(p.ttfbMs)));
    body.appendChild(row("Response", ms(p.totalResponseMs)));
    body.appendChild(row("DNS", ms(p.dnsResolutionMs)));
    if (p.contentSizeBytes != null) body.appendChild(row("Size", kb(p.contentSizeBytes)));
  } else {
    fillPending(body, r.performance, done);
  }
  return body.parentElement as HTMLElement;
}

// ---- small DOM helpers -------------------------------------------------------

function card(title: string): { body: HTMLElement; set: (status: string) => void } {
  const el = document.createElement("section");
  el.className = "card";
  const head = document.createElement("div");
  head.className = "card-head";
  const t = document.createElement("span");
  t.className = "card-title";
  t.textContent = title;
  const status = document.createElement("span");
  status.className = "card-status";
  head.append(t, status);
  const body = document.createElement("div");
  body.className = "card-body";
  el.append(head, body);
  return { body, set: (s) => (status.textContent = s) };
}

function primary(text: string, muted = false): HTMLElement {
  const el = document.createElement("div");
  el.className = muted ? "primary none" : "primary";
  el.textContent = text;
  return el;
}

function row(k: string, v: string, valueClass = ""): HTMLElement {
  const el = document.createElement("div");
  el.className = "row";
  const ke = document.createElement("span");
  ke.className = "k";
  ke.textContent = k;
  const ve = document.createElement("span");
  ve.className = `v ${valueClass}`.trim();
  ve.textContent = v;
  el.append(ke, ve);
  return el;
}

function chips(values: string[]): HTMLElement {
  const el = document.createElement("div");
  el.className = "chips";
  for (const v of values) {
    const c = document.createElement("span");
    c.className = "chip";
    c.textContent = v;
    el.appendChild(c);
  }
  return el;
}

function fillPending(
  body: HTMLElement,
  value: unknown,
  done: boolean,
  noneText = "Not detected",
): void {
  if (value !== undefined) return;
  if (done) {
    body.appendChild(primary(noneText, true));
    return;
  }
  const a = document.createElement("div");
  a.className = "skeleton";
  const b = document.createElement("div");
  b.className = "skeleton short";
  b.style.marginTop = "6px";
  body.append(a, b);
}

function renderEmpty(): void {
  domainEl.textContent = "";
  const wrap = document.createElement("div");
  wrap.className = "empty";
  const title = document.createElement("div");
  title.className = "empty-title";
  title.textContent = "Nothing to scan here";
  const msg = document.createElement("div");
  msg.textContent = "Open CloudTracer on a regular http(s) website to see its cloud stack.";
  wrap.append(title, msg);
  content.replaceChildren(wrap);
}

// ---- formatting --------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function ms(value: number): string {
  return value < 0 ? "n/a" : `${value} ms`;
}

function kb(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
