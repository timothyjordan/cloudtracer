import { vi } from "vitest";
import type { Platform, DnsResolver } from "../../src/platform/types.js";

/**
 * Build a Platform for tests. DNS resolvers default to returning empty arrays
 * (mirroring the real "fail soft" contract); override the ones a test needs.
 * getCertificate/whois/measureTlsMs default to no-ops and can be overridden.
 */
export function mockPlatform(overrides: {
  dns?: Partial<DnsResolver>;
  getCertificate?: Platform["getCertificate"];
  whois?: Platform["whois"];
  measureTlsMs?: Platform["measureTlsMs"];
} = {}): Platform {
  return {
    dns: {
      resolveNs: vi.fn().mockResolvedValue([]),
      resolveA: vi.fn().mockResolvedValue([]),
      resolveAaaa: vi.fn().mockResolvedValue([]),
      resolveCname: vi.fn().mockResolvedValue([]),
      resolveMx: vi.fn().mockResolvedValue([]),
      resolveTxt: vi.fn().mockResolvedValue([]),
      ...overrides.dns,
    },
    getCertificate: overrides.getCertificate ?? vi.fn().mockResolvedValue(undefined),
    whois: overrides.whois,
    measureTlsMs: overrides.measureTlsMs,
  };
}
