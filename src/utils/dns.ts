import { promises as dns } from "node:dns";

export async function resolveNs(domain: string): Promise<string[]> {
  try {
    return await dns.resolveNs(domain);
  } catch {
    return [];
  }
}

export async function resolveA(domain: string): Promise<string[]> {
  try {
    return await dns.resolve4(domain);
  } catch {
    return [];
  }
}

export async function resolveAaaa(domain: string): Promise<string[]> {
  try {
    return await dns.resolve6(domain);
  } catch {
    return [];
  }
}

export async function resolveCname(domain: string): Promise<string[]> {
  try {
    return await dns.resolveCname(domain);
  } catch {
    return [];
  }
}

export async function resolveMx(
  domain: string,
): Promise<{ priority: number; exchange: string }[]> {
  try {
    return await dns.resolveMx(domain);
  } catch {
    return [];
  }
}

export async function resolveTxt(domain: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(domain);
    return records.map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}
