export interface ScanResult {
  domain: string;
  scannedAt: string;
  registration?: RegistrationInfo;
  dns?: DnsInfo;
  cdn?: CdnInfo;
  hosting?: HostingInfo;
  ssl?: SslInfo;
  email?: EmailInfo;
  thirdPartyServices?: ThirdPartyInfo[];
  performance?: PerformanceInfo;
}

export interface PerformanceInfo {
  dnsResolutionMs: number;
  tlsHandshakeMs: number;
  ttfbMs: number;
  totalResponseMs: number;
  contentSizeBytes?: number;
}

export interface RegistrationInfo {
  registrar: string;
  registeredDate?: string;
  expirationDate?: string;
  source: "rdap" | "whois";
}

export interface DnsInfo {
  nameservers: string[];
  provider?: ProviderMatch;
}

export interface CdnInfo {
  providers: CdnProvider[];
  waf?: ProviderMatch;
}

export interface CdnProvider {
  provider: ProviderMatch;
  evidence: string[];
}

export interface HostingInfo {
  ipAddresses: { v4: string[]; v6: string[] };
  asn?: { number: number; name: string };
  provider?: ProviderMatch;
  platform?: ProviderMatch;
  /** Set when resolved IP/ASN only reflects a CDN edge and no origin platform was matched. */
  behindCdn?: string;
}

export interface SslInfo {
  issuer: string;
  subject: string;
  san: string[];
  validFrom: string;
  validTo: string;
  daysUntilExpiry: number;
  protocol: string;
}

export interface EmailInfo {
  mxRecords: { priority: number; exchange: string }[];
  provider?: ProviderMatch;
  spf?: string;
  dmarc?: string;
}

export interface ThirdPartyInfo {
  name: string;
  category: string;
  evidence: string;
}

export interface ProviderMatch {
  name: string;
  confidence: "high" | "medium" | "low";
}
