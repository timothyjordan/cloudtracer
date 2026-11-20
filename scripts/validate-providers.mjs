#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildProviders,
  DEFAULT_OUTPUT_PATH,
  DEFAULT_PROVIDERS_DIR,
} from "./build-providers.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;
const DOMAIN_RE = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const ALLOWED_TOP_KEYS = new Set([
  "id",
  "name",
  "website",
  "verification_domains",
  "shared_patterns",
  "dns",
  "cdn",
  "hosting",
  "email",
  "thirdparty",
  "html_frameworks",
  "platform_rules",
]);

const LAYER_KEYS = [
  "dns",
  "cdn",
  "hosting",
  "email",
  "thirdparty",
  "html_frameworks",
  "platform_rules",
];

const THIRDPARTY_CATEGORIES = new Set([
  "analytics",
  "advertising",
  "chat",
  "support",
  "marketing",
  "payments",
  "monitoring",
  "fonts",
  "framework",
  "security",
  "ab_testing",
  "cms",
  "video",
  "maps",
  "auth",
  "search",
  "consent",
  "social",
  "forms",
  "scheduling",
  "build_tool",
]);

const HTML_FRAMEWORK_CATEGORIES = new Set(["framework", "build_tool"]);

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkUnknownKeys(obj, allowed, prefix, errors) {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      errors.push(`${prefix}: unknown property "${key}"`);
    }
  }
}

function checkStringArray(arr, prefix, errors, { minItems = 0, pattern } = {}) {
  if (!Array.isArray(arr)) {
    errors.push(`${prefix}: must be an array`);
    return;
  }
  if (arr.length < minItems) {
    errors.push(`${prefix}: must contain at least ${minItems} item(s)`);
  }
  const seen = new Set();
  for (const item of arr) {
    if (typeof item !== "string" || item.length === 0) {
      errors.push(`${prefix}: every item must be a non-empty string`);
      continue;
    }
    if (pattern && !pattern.test(item)) {
      errors.push(`${prefix}: invalid value "${item}"`);
    }
    if (seen.has(item)) {
      errors.push(`${prefix}: duplicate item "${item}"`);
    }
    seen.add(item);
  }
}

function validateProviderObject(file, data, errors) {
  if (!isPlainObject(data)) {
    errors.push(`${file}: root value must be a JSON object`);
    return;
  }

  checkUnknownKeys(data, ALLOWED_TOP_KEYS, file, errors);

  const expectedSlug = basename(file, ".json");
  if (typeof data.id !== "string" || !SLUG_RE.test(data.id)) {
    errors.push(`${file}: "id" must match ${SLUG_RE}`);
  } else if (data.id !== expectedSlug) {
    errors.push(`${file}: "id" ("${data.id}") must match filename ("${expectedSlug}")`);
  }

  if (typeof data.name !== "string" || data.name.trim().length === 0) {
    errors.push(`${file}: "name" must be a non-empty string`);
  }

  if (data.website !== undefined) {
    if (typeof data.website !== "string" || !data.website.startsWith("https://")) {
      errors.push(`${file}: "website" must be an https:// URL`);
    }
  }

  if (data.verification_domains !== undefined) {
    checkStringArray(data.verification_domains, `${file}.verification_domains`, errors, {
      pattern: DOMAIN_RE,
    });
  }

  if (data.shared_patterns !== undefined) {
    checkStringArray(data.shared_patterns, `${file}.shared_patterns`, errors);
  }

  if (!LAYER_KEYS.some((k) => data[k] !== undefined)) {
    errors.push(`${file}: must define at least one layer block (${LAYER_KEYS.join(", ")})`);
  }

  if (data.dns !== undefined) {
    if (!isPlainObject(data.dns)) {
      errors.push(`${file}.dns: must be an object`);
    } else {
      checkUnknownKeys(data.dns, new Set(["patterns"]), `${file}.dns`, errors);
      checkStringArray(data.dns.patterns, `${file}.dns.patterns`, errors, { minItems: 1 });
    }
  }

  if (data.cdn !== undefined) {
    if (!isPlainObject(data.cdn)) {
      errors.push(`${file}.cdn: must be an object`);
    } else {
      checkUnknownKeys(
        data.cdn,
        new Set(["headers", "cnames", "is_cdn_edge", "is_platform"]),
        `${file}.cdn`,
        errors,
      );
      if (data.cdn.headers !== undefined) {
        if (!isPlainObject(data.cdn.headers)) {
          errors.push(`${file}.cdn.headers: must be an object`);
        } else {
          for (const [k, v] of Object.entries(data.cdn.headers)) {
            if (typeof v !== "string" || v.length === 0) {
              errors.push(`${file}.cdn.headers["${k}"]: must be a non-empty string`);
            }
          }
        }
      }
      if (data.cdn.cnames !== undefined) {
        checkStringArray(data.cdn.cnames, `${file}.cdn.cnames`, errors);
      }
      if (data.cdn.is_cdn_edge !== undefined && typeof data.cdn.is_cdn_edge !== "boolean") {
        errors.push(`${file}.cdn.is_cdn_edge: must be a boolean`);
      }
      if (data.cdn.is_platform !== undefined && typeof data.cdn.is_platform !== "boolean") {
        errors.push(`${file}.cdn.is_platform: must be a boolean`);
      }
    }
  }

  if (data.hosting !== undefined) {
    if (!isPlainObject(data.hosting)) {
      errors.push(`${file}.hosting: must be an object`);
    } else {
      checkUnknownKeys(
        data.hosting,
        new Set(["asns", "ips", "is_cdn_edge", "is_platform"]),
        `${file}.hosting`,
        errors,
      );
      if (data.hosting.asns !== undefined) {
        if (!Array.isArray(data.hosting.asns)) {
          errors.push(`${file}.hosting.asns: must be an array`);
        } else {
          const seen = new Set();
          for (const asn of data.hosting.asns) {
            if (!Number.isInteger(asn) || asn < 1) {
              errors.push(`${file}.hosting.asns: every ASN must be a positive integer`);
            } else if (seen.has(asn)) {
              errors.push(`${file}.hosting.asns: duplicate ASN ${asn}`);
            }
            seen.add(asn);
          }
        }
      }
      if (data.hosting.ips !== undefined) {
        checkStringArray(data.hosting.ips, `${file}.hosting.ips`, errors);
      }
      if (
        data.hosting.is_cdn_edge !== undefined &&
        typeof data.hosting.is_cdn_edge !== "boolean"
      ) {
        errors.push(`${file}.hosting.is_cdn_edge: must be a boolean`);
      }
      if (
        data.hosting.is_platform !== undefined &&
        typeof data.hosting.is_platform !== "boolean"
      ) {
        errors.push(`${file}.hosting.is_platform: must be a boolean`);
      }
    }
  }

  if (data.email !== undefined) {
    if (!isPlainObject(data.email)) {
      errors.push(`${file}.email: must be an object`);
    } else {
      checkUnknownKeys(data.email, new Set(["mx_patterns"]), `${file}.email`, errors);
      checkStringArray(data.email.mx_patterns, `${file}.email.mx_patterns`, errors, {
        minItems: 1,
      });
    }
  }

  if (data.thirdparty !== undefined) {
    if (!isPlainObject(data.thirdparty)) {
      errors.push(`${file}.thirdparty: must be an object`);
    } else {
      checkUnknownKeys(
        data.thirdparty,
        new Set(["scripts", "category"]),
        `${file}.thirdparty`,
        errors,
      );
      checkStringArray(data.thirdparty.scripts, `${file}.thirdparty.scripts`, errors, {
        minItems: 1,
      });
      if (!THIRDPARTY_CATEGORIES.has(data.thirdparty.category)) {
        errors.push(`${file}.thirdparty.category: invalid category "${data.thirdparty.category}"`);
      }
    }
  }

  if (data.html_frameworks !== undefined) {
    if (!isPlainObject(data.html_frameworks)) {
      errors.push(`${file}.html_frameworks: must be an object`);
    } else {
      checkUnknownKeys(
        data.html_frameworks,
        new Set(["html_patterns", "category"]),
        `${file}.html_frameworks`,
        errors,
      );
      checkStringArray(
        data.html_frameworks.html_patterns,
        `${file}.html_frameworks.html_patterns`,
        errors,
        { minItems: 1 },
      );
      if (!HTML_FRAMEWORK_CATEGORIES.has(data.html_frameworks.category)) {
        errors.push(
          `${file}.html_frameworks.category: invalid category "${data.html_frameworks.category}"`,
        );
      }
    }
  }

  if (data.platform_rules !== undefined) {
    if (!Array.isArray(data.platform_rules) || data.platform_rules.length === 0) {
      errors.push(`${file}.platform_rules: must be a non-empty array`);
    } else {
      data.platform_rules.forEach((rule, idx) => {
        const p = `${file}.platform_rules[${idx}]`;
        if (!isPlainObject(rule)) {
          errors.push(`${p}: must be an object`);
          return;
        }
        checkUnknownKeys(rule, new Set(["cdn", "ssl_issuer", "ips", "dns_from"]), p, errors);
        if (rule.cdn !== undefined && (typeof rule.cdn !== "string" || !rule.cdn)) {
          errors.push(`${p}.cdn: must be a non-empty string`);
        }
        if (
          rule.ssl_issuer !== undefined &&
          (typeof rule.ssl_issuer !== "string" || !rule.ssl_issuer)
        ) {
          errors.push(`${p}.ssl_issuer: must be a non-empty string`);
        }
        if (rule.ips !== undefined) {
          checkStringArray(rule.ips, `${p}.ips`, errors, { minItems: 1 });
        }
        if (
          rule.dns_from !== undefined &&
          (typeof rule.dns_from !== "string" || !rule.dns_from)
        ) {
          errors.push(`${p}.dns_from: must be a non-empty string`);
        }
      });
    }
  }
}

export function validateProvidersDir(
  providersDir = DEFAULT_PROVIDERS_DIR,
  { checkGenerated = false, outputPath = DEFAULT_OUTPUT_PATH } = {},
) {
  const errors = [];
  const files = readdirSync(providersDir)
    .filter((f) => f.endsWith(".json") && f !== "schema.json")
    .sort((a, b) => a.localeCompare(b));

  const seenIds = new Map();
  const seenNames = new Map();
  const layerMaps = {
    dns: new Map(),
    cdn_header: new Map(),
    cdn_cname: new Map(),
    hosting_asn: new Map(),
    hosting_ip: new Map(),
    email_mx: new Map(),
    thirdparty_script: new Map(),
    html_pattern: new Map(),
  };

  function claim(layer, rawKey, file, sharedSet) {
    const normalized = String(rawKey).toLowerCase();
    if (sharedSet.has(rawKey) || sharedSet.has(normalized)) return;
    const map = layerMaps[layer];
    if (map.has(normalized)) {
      errors.push(
        `Pattern collision in ${layer}: "${rawKey}" is claimed by both ${map.get(normalized)} and ${file}`,
      );
    } else {
      map.set(normalized, file);
    }
  }

  for (const file of files) {
    const fullPath = resolve(providersDir, file);
    let data;
    try {
      data = JSON.parse(readFileSync(fullPath, "utf8"));
    } catch (err) {
      errors.push(`${file}: invalid JSON (${err.message})`);
      continue;
    }

    validateProviderObject(file, data, errors);
    if (!isPlainObject(data)) continue;

    if (typeof data.id === "string") {
      if (seenIds.has(data.id)) {
        errors.push(`Duplicate provider id "${data.id}" in ${seenIds.get(data.id)} and ${file}`);
      } else {
        seenIds.set(data.id, file);
      }
    }

    if (typeof data.name === "string" && data.name.trim()) {
      const normName = data.name.trim().toLowerCase();
      if (seenNames.has(normName)) {
        errors.push(
          `Duplicate provider name "${data.name}" in ${seenNames.get(normName)} and ${file}`,
        );
      } else {
        seenNames.set(normName, file);
      }
    }

    const sharedSet = new Set(
      Array.isArray(data.shared_patterns)
        ? data.shared_patterns.flatMap((p) => [p, p.toLowerCase()])
        : [],
    );

    if (Array.isArray(data.dns?.patterns)) {
      for (const pat of data.dns.patterns) claim("dns", pat, file, sharedSet);
    }
    if (isPlainObject(data.cdn?.headers)) {
      for (const [h, v] of Object.entries(data.cdn.headers)) {
        claim("cdn_header", `${h}:${v}`, file, sharedSet);
      }
    }
    if (Array.isArray(data.cdn?.cnames)) {
      for (const c of data.cdn.cnames) claim("cdn_cname", c, file, sharedSet);
    }
    if (Array.isArray(data.hosting?.asns)) {
      for (const asn of data.hosting.asns) claim("hosting_asn", String(asn), file, sharedSet);
    }
    if (Array.isArray(data.hosting?.ips)) {
      for (const ip of data.hosting.ips) claim("hosting_ip", ip, file, sharedSet);
    }
    if (Array.isArray(data.email?.mx_patterns)) {
      for (const mx of data.email.mx_patterns) claim("email_mx", mx, file, sharedSet);
    }
    if (Array.isArray(data.thirdparty?.scripts)) {
      for (const s of data.thirdparty.scripts) claim("thirdparty_script", s, file, sharedSet);
    }
    if (Array.isArray(data.html_frameworks?.html_patterns)) {
      for (const h of data.html_frameworks.html_patterns) {
        claim("html_pattern", h, file, sharedSet);
      }
    }
  }

  if (checkGenerated && errors.length === 0) {
    const built = buildProviders({ providersDir, outputPath, check: true });
    if (!built.ok) {
      errors.push(
        "src/providers/generated.ts is out of date with providers/*.json. Run `npm run providers:build`.",
      );
    }
  }

  return { ok: errors.length === 0, errors, count: files.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = validateProvidersDir(resolve(root, "providers"), {
    checkGenerated: true,
    outputPath: DEFAULT_OUTPUT_PATH,
  });
  if (!result.ok) {
    for (const err of result.errors) {
      console.error(`ERROR: ${err}`);
    }
    process.exit(1);
  }
  console.log(`Validated ${result.count} provider definitions with zero collisions.`);
}
