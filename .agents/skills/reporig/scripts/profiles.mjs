import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { REPORIG_VERSION } from './catalog.mjs';
import { validateConfig } from './schema.mjs';

const RESERVED_PROFILE_NAMES = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;

export class ProfileError extends Error {
  constructor(message, errors = null) {
    super(message);
    this.name = 'ProfileError';
    this.errors = Array.isArray(errors) ? errors : null;
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sortPlainObjectKeys(obj) {
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    const val = obj[key];
    sorted[key] = isPlainObject(val) ? sortPlainObjectKeys(val) : val;
  }
  return sorted;
}

function stripPackRuntimeFields(pack) {
  return {
    source: pack.source,
    url: pack.url,
    kind: pack.kind,
    ...(Array.isArray(pack.includePaths)
      ? { includePaths: [...pack.includePaths] }
      : {}),
    ...(Array.isArray(pack.excludePaths)
      ? { excludePaths: [...pack.excludePaths] }
      : {}),
    ...(Array.isArray(pack.selectedSkills)
      ? { selectedSkills: [...pack.selectedSkills] }
      : {}),
  };
}

function extractFromNormalizedConfig(validated) {
  const { protectedPaths: _ignoredProtectedPaths, ...restAutonomy } =
    validated.sdlc.autonomy;
  return {
    harnesses: [...validated.harnesses],
    customHarnesses: structuredClone(validated.customHarnesses),
    sdlc: {
      ...structuredClone(validated.sdlc),
      autonomy: {
        askFirst: [...restAutonomy.askFirst],
        never: [...restAutonomy.never],
      },
    },
    providers: structuredClone(validated.providers),
    skills: {
      packs: validated.skills.packs.map(stripPackRuntimeFields),
      spinePrecedence: structuredClone(validated.skills.spinePrecedence),
    },
  };
}

function validatePreferencesObject(rawPreferences, contextLabel = 'preferences', extraTextToScan = '') {
  if (!isPlainObject(rawPreferences)) {
    throw new ProfileError(`${contextLabel} must be an object.`, [
      `${contextLabel} must be an object.`,
    ]);
  }
  const rawSdlc = isPlainObject(rawPreferences.sdlc) ? rawPreferences.sdlc : null;
  const rawAutonomy =
    rawSdlc && isPlainObject(rawSdlc.autonomy) ? rawSdlc.autonomy : null;
  const rawSkills = isPlainObject(rawPreferences.skills)
    ? rawPreferences.skills
    : null;

  const syntheticConfig = {
    schemaVersion: 1,
    reporigVersion: REPORIG_VERSION,
    project: {
      name: 'profile-validation',
      description: extraTextToScan,
      packageManager: 'npm',
      commands: {},
    },
    harnesses: rawPreferences.harnesses,
    customHarnesses: rawPreferences.customHarnesses ?? [],
    sdlc: rawSdlc
      ? {
          ...rawSdlc,
          autonomy: rawAutonomy
            ? {
                ...rawAutonomy,
                protectedPaths: [],
              }
            : rawSdlc.autonomy,
        }
      : rawPreferences.sdlc,
    providers: rawPreferences.providers,
    skills: rawSkills
      ? {
          ...rawSkills,
          packs: Array.isArray(rawSkills.packs)
            ? rawSkills.packs.map((pack) =>
                isPlainObject(pack)
                  ? {
                      ...pack,
                      installedDirs: [],
                      commitSha: null,
                      installedAt: null,
                    }
                  : pack,
              )
            : rawSkills.packs,
        }
      : rawPreferences.skills,
  };

  const validation = validateConfig(syntheticConfig);
  if (!validation.valid) {
    throw new ProfileError(
      `Invalid profile preferences in ${contextLabel}.`,
      validation.errors,
    );
  }
  return extractFromNormalizedConfig(validation.value);
}

export function resolveProfilesPath(
  explicitPath,
  env = process.env,
  platform = process.platform,
  homedir = os.homedir(),
) {
  if (typeof explicitPath === 'string' && explicitPath.trim().length > 0) {
    return path.resolve(explicitPath.trim());
  }
  if (
    isPlainObject(env) &&
    typeof env.REPORIG_PROFILES_PATH === 'string' &&
    env.REPORIG_PROFILES_PATH.trim().length > 0
  ) {
    return path.resolve(env.REPORIG_PROFILES_PATH.trim());
  }
  if (
    isPlainObject(env) &&
    typeof env.XDG_CONFIG_HOME === 'string' &&
    env.XDG_CONFIG_HOME.trim().length > 0
  ) {
    return path.join(
      path.resolve(env.XDG_CONFIG_HOME.trim()),
      'reporig',
      'profiles.json',
    );
  }
  if (platform === 'win32') {
    const appData =
      isPlainObject(env) &&
      typeof env.APPDATA === 'string' &&
      env.APPDATA.trim().length > 0
        ? env.APPDATA.trim()
        : path.join(homedir, 'AppData', 'Roaming');
    return path.join(appData, 'reporig', 'profiles.json');
  }
  return path.join(homedir, '.config', 'reporig', 'profiles.json');
}

export function validateProfileName(rawName) {
  if (typeof rawName !== 'string') {
    throw new ProfileError('Profile name must be a non-empty string.', [
      'Profile name must be a non-empty string.',
    ]);
  }
  const trimmed = rawName.trim();
  if (trimmed.length === 0 || trimmed.length > 64) {
    throw new ProfileError(
      'Profile name must be between 1 and 64 characters after trimming.',
      ['Profile name must be between 1 and 64 characters after trimming.'],
    );
  }
  if (CONTROL_CHAR_RE.test(trimmed)) {
    throw new ProfileError(
      'Profile name must not contain control characters.',
      ['Profile name must not contain control characters.'],
    );
  }
  if (RESERVED_PROFILE_NAMES.has(trimmed)) {
    throw new ProfileError(`Profile name "${trimmed}" is reserved.`, [
      `Profile name "${trimmed}" is reserved.`,
    ]);
  }
  return trimmed;
}

export function extractPortablePreferences(config) {
  const validation = validateConfig(config);
  if (!validation.valid) {
    throw new ProfileError(
      'Cannot extract profile preferences from an invalid reporig config.',
      validation.errors,
    );
  }
  return extractFromNormalizedConfig(validation.value);
}

export function summarizePreferences(preferences) {
  const normalized = validatePreferencesObject(preferences, 'preferences');
  return {
    preset: normalized.sdlc.preset,
    prGate: normalized.sdlc.prGate,
    harnesses: [...normalized.harnesses],
    providers: {
      source: normalized.providers.source.id,
      issues: normalized.providers.issues.id,
      ci: normalized.providers.ci.id,
      specs: normalized.providers.specs.id,
    },
    skillPacks: normalized.skills.packs.map((pack) => pack.source),
  };
}

export function adaptPreferencesForInspection(preferences, inspection) {
  const normalized = validatePreferencesObject(preferences, 'preferences');
  const adaptations = [];

  if (!isPlainObject(inspection)) {
    return { preferences: normalized, adaptations };
  }

  const currentE2e = normalized.sdlc.e2eTool;
  const hasPlaywright = Boolean(inspection.hasPlaywright);
  const hasFrontendUi = Boolean(inspection.hasFrontendUi);

  if (currentE2e === 'playwright' && !hasPlaywright && !hasFrontendUi) {
    normalized.sdlc.e2eTool = 'none';
    adaptations.push({
      field: 'sdlc.e2eTool',
      from: 'playwright',
      to: 'none',
      reason: 'No Playwright or frontend UI detected in repository.',
    });
  } else if (currentE2e === 'none' && hasPlaywright) {
    normalized.sdlc.e2eTool = 'playwright';
    adaptations.push({
      field: 'sdlc.e2eTool',
      from: 'none',
      to: 'playwright',
      reason: 'Playwright detected in repository.',
    });
  }

  return {
    preferences: normalized,
    adaptations,
  };
}

export function draftConfigFromProfile({ profile, inspection }) {
  if (!isPlainObject(profile) || !isPlainObject(profile.preferences)) {
    throw new ProfileError('Invalid profile object supplied to draftConfigFromProfile.');
  }
  if (!isPlainObject(inspection)) {
    throw new ProfileError('Repository inspection object is required to draft config.');
  }

  const { preferences: adapted, adaptations } = adaptPreferencesForInspection(
    profile.preferences,
    inspection,
  );

  const rawDraft = {
    schemaVersion: 1,
    reporigVersion: REPORIG_VERSION,
    updatedAt: new Date().toISOString(),
    project: {
      name:
        typeof inspection.projectName === 'string' &&
        inspection.projectName.trim().length > 0
          ? inspection.projectName.trim()
          : 'app',
      description: '',
      packageManager:
        typeof inspection.packageManager === 'string' &&
        inspection.packageManager.trim().length > 0
          ? inspection.packageManager.trim()
          : 'unknown',
      commands: isPlainObject(inspection.commands)
        ? structuredClone(inspection.commands)
        : {},
    },
    harnesses: [...adapted.harnesses],
    customHarnesses: structuredClone(adapted.customHarnesses),
    sdlc: {
      ...structuredClone(adapted.sdlc),
      autonomy: {
        askFirst: [...adapted.sdlc.autonomy.askFirst],
        never: [...adapted.sdlc.autonomy.never],
        protectedPaths: [],
      },
    },
    providers: structuredClone(adapted.providers),
    skills: {
      packs: adapted.skills.packs.map((pack) => ({
        ...stripPackRuntimeFields(pack),
        installedDirs: [],
        commitSha: null,
        installedAt: null,
      })),
      spinePrecedence: structuredClone(adapted.skills.spinePrecedence),
    },
  };

  const validation = validateConfig(rawDraft);
  if (!validation.valid) {
    throw new ProfileError(
      'Generated draft from profile failed schema validation.',
      validation.errors,
    );
  }

  const confirmationsNeeded = [];
  const issuesSlot = validation.value.providers.issues;
  if (
    issuesSlot.id !== 'none' &&
    (issuesSlot.id === 'linear' || issuesSlot.projectHint !== null)
  ) {
    confirmationsNeeded.push('providers.issues.projectHint');
  }

  return {
    config: validation.value,
    adaptations,
    confirmationsNeeded,
  };
}

function canonicalizePreferences(preferences) {
  const p = validatePreferencesObject(preferences, 'preferences');

  const sortedCustomHarnesses = [...p.customHarnesses]
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      notes: entry.notes ?? null,
    }))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id) ||
        String(a.notes ?? '').localeCompare(String(b.notes ?? '')),
    );

  const sortedPacks = [...p.skills.packs]
    .map((pack) => ({
      source: pack.source,
      url: pack.url,
      kind: pack.kind,
      ...(Array.isArray(pack.includePaths)
        ? { includePaths: [...new Set(pack.includePaths)].sort() }
        : {}),
      ...(Array.isArray(pack.excludePaths)
        ? { excludePaths: [...new Set(pack.excludePaths)].sort() }
        : {}),
      ...(Array.isArray(pack.selectedSkills)
        ? { selectedSkills: [...new Set(pack.selectedSkills)].sort() }
        : {}),
    }))
    .sort(
      (a, b) =>
        a.source.localeCompare(b.source) ||
        a.url.localeCompare(b.url) ||
        a.kind.localeCompare(b.kind),
    );

  return JSON.stringify({
    harnesses: [...new Set(p.harnesses)].sort(),
    customHarnesses: sortedCustomHarnesses,
    sdlc: {
      preset: p.sdlc.preset,
      intentPlanning: p.sdlc.intentPlanning,
      verificationOracle: p.sdlc.verificationOracle,
      e2eTool: p.sdlc.e2eTool,
      commitCadence: p.sdlc.commitCadence,
      pushCadence: p.sdlc.pushCadence,
      prGate: p.sdlc.prGate,
      prGateCustom: p.sdlc.prGateCustom,
      mergeGate: p.sdlc.mergeGate,
      issueCadence: p.sdlc.issueCadence,
      autonomy: {
        askFirst: [...new Set(p.sdlc.autonomy.askFirst)].sort(),
        never: [...new Set(p.sdlc.autonomy.never)].sort(),
      },
      writingStyle: sortPlainObjectKeys(p.sdlc.writingStyle),
    },
    providers: {
      source: sortPlainObjectKeys(p.providers.source),
      issues: sortPlainObjectKeys({
        ...p.providers.issues,
        projectHint: null,
      }),
      ci: sortPlainObjectKeys(p.providers.ci),
      specs: sortPlainObjectKeys(p.providers.specs),
    },
    skills: {
      packs: sortedPacks,
      spinePrecedence:
        p.skills.spinePrecedence === null
          ? null
          : sortPlainObjectKeys(p.skills.spinePrecedence),
    },
  });
}

export function arePreferencesIdentical(
  candidatePreferences,
  storedPreferences,
  inspection = null,
) {
  const candidateKey = canonicalizePreferences(candidatePreferences);
  const rawStoredKey = canonicalizePreferences(storedPreferences);
  if (candidateKey === rawStoredKey) {
    return true;
  }
  if (isPlainObject(inspection)) {
    const adaptedStored = adaptPreferencesForInspection(
      storedPreferences,
      inspection,
    ).preferences;
    if (candidateKey === canonicalizePreferences(adaptedStored)) {
      return true;
    }
  }
  return false;
}

export function loadProfilesStore(profilesPath = resolveProfilesPath()) {
  const resolvedPath = resolveProfilesPath(profilesPath);
  let rawText;
  try {
    rawText = fs.readFileSync(resolvedPath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return {
        exists: false,
        profilesPath: resolvedPath,
        profiles: Object.create(null),
      };
    }
    throw new ProfileError(
      `Unable to read profiles file ${resolvedPath}: ${err.message}`,
      [`Unable to read profiles file ${resolvedPath}: ${err.message}`],
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new ProfileError(
      `Invalid JSON in profiles file ${resolvedPath}: ${err.message}`,
      [`Invalid JSON in profiles file ${resolvedPath}: ${err.message}`],
    );
  }

  if (!isPlainObject(parsed)) {
    throw new ProfileError(
      `Profiles file ${resolvedPath} root must be a JSON object.`,
      [`Profiles file ${resolvedPath} root must be a JSON object.`],
    );
  }
  if (parsed.schemaVersion !== 1) {
    throw new ProfileError(
      `Unsupported schemaVersion in ${resolvedPath}: expected 1, received ${JSON.stringify(parsed.schemaVersion)}.`,
      [
        `Unsupported schemaVersion in ${resolvedPath}: expected 1, received ${JSON.stringify(parsed.schemaVersion)}.`,
      ],
    );
  }
  if (!isPlainObject(parsed.profiles)) {
    throw new ProfileError(
      `Profiles file ${resolvedPath} must contain a "profiles" object.`,
      [`Profiles file ${resolvedPath} must contain a "profiles" object.`],
    );
  }

  const normalizedMap = Object.create(null);
  for (const [key, entry] of Object.entries(parsed.profiles)) {
    const validKey = validateProfileName(key);
    if (!isPlainObject(entry)) {
      throw new ProfileError(
        `Profile "${validKey}" in ${resolvedPath} must be an object.`,
        [`Profile "${validKey}" in ${resolvedPath} must be an object.`],
      );
    }
    const entryName =
      entry.name !== undefined ? validateProfileName(entry.name) : validKey;
    if (entryName !== validKey) {
      throw new ProfileError(
        `Profile key "${validKey}" does not match entry.name "${entryName}" in ${resolvedPath}.`,
        [
          `Profile key "${validKey}" does not match entry.name "${entryName}" in ${resolvedPath}.`,
        ],
      );
    }
    const savedAt =
      typeof entry.savedAt === 'string' && entry.savedAt.trim().length > 0
        ? entry.savedAt.trim()
        : null;
    if (!savedAt) {
      throw new ProfileError(
        `Profile "${validKey}" in ${resolvedPath} must have a non-empty savedAt timestamp.`,
        [
          `Profile "${validKey}" in ${resolvedPath} must have a non-empty savedAt timestamp.`,
        ],
      );
    }

    const normalizedPrefs = validatePreferencesObject(
      entry.preferences,
      `profiles["${validKey}"].preferences`,
      `${validKey} ${savedAt}`,
    );

    normalizedMap[validKey] = {
      name: validKey,
      savedAt,
      preferences: normalizedPrefs,
    };
  }

  return {
    exists: true,
    profilesPath: resolvedPath,
    profiles: normalizedMap,
  };
}

function writeProfilesStoreAtomically(profilesPath, profilesMap) {
  const dir = path.dirname(profilesPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  const sortedNames = Object.keys(profilesMap).sort((a, b) => a.localeCompare(b));
  const serializedProfiles = {};
  for (const name of sortedNames) {
    const entry = profilesMap[name];
    serializedProfiles[name] = {
      name: entry.name,
      savedAt: entry.savedAt,
      preferences: entry.preferences,
    };
  }

  const payload = {
    schemaVersion: 1,
    profiles: serializedProfiles,
  };

  const tmpPath = `${profilesPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    try {
      fs.chmodSync(tmpPath, 0o600);
    } catch {
      // Ignore chmod errors on filesystems without POSIX mode bits.
    }
    fs.renameSync(tmpPath, profilesPath);
  } catch (err) {
    fs.rmSync(tmpPath, { force: true });
    throw new ProfileError(
      `Failed to write profiles file ${profilesPath}: ${err.message}`,
      [`Failed to write profiles file ${profilesPath}: ${err.message}`],
    );
  }
}

export function listSavedProfiles({ profilesPath } = {}) {
  const store = loadProfilesStore(profilesPath);
  const sortedNames = Object.keys(store.profiles).sort((a, b) =>
    a.localeCompare(b),
  );
  const profiles = sortedNames.map((name) => {
    const entry = store.profiles[name];
    return {
      name: entry.name,
      savedAt: entry.savedAt,
      summary: summarizePreferences(entry.preferences),
      preferences: entry.preferences,
    };
  });

  return {
    ok: true,
    profilesPath: store.profilesPath,
    exists: store.exists,
    profiles,
  };
}

export function draftNamedProfile({ name, inspection, profilesPath }) {
  const validName = validateProfileName(name);
  const store = loadProfilesStore(profilesPath);
  if (!Object.hasOwn(store.profiles, validName)) {
    throw new ProfileError(
      `Saved profile "${validName}" not found in ${store.profilesPath}.`,
      [`Saved profile "${validName}" not found in ${store.profilesPath}.`],
    );
  }
  const drafted = draftConfigFromProfile({
    profile: store.profiles[validName],
    inspection,
  });

  return {
    ok: true,
    profileName: validName,
    profilesPath: store.profilesPath,
    adaptations: drafted.adaptations,
    confirmationsNeeded: drafted.confirmationsNeeded,
    config: drafted.config,
  };
}

export function matchSavedProfiles({
  config,
  inspection = null,
  profilesPath,
}) {
  const candidatePrefs = extractPortablePreferences(config);
  const store = loadProfilesStore(profilesPath);
  const sortedNames = Object.keys(store.profiles).sort((a, b) =>
    a.localeCompare(b),
  );

  const matchedProfiles = [];
  for (const name of sortedNames) {
    const stored = store.profiles[name];
    if (arePreferencesIdentical(candidatePrefs, stored.preferences, inspection)) {
      matchedProfiles.push(name);
    }
  }

  return {
    ok: true,
    profilesPath: store.profilesPath,
    matched: matchedProfiles.length > 0,
    matchedProfile: matchedProfiles[0] ?? null,
    matchedProfiles,
    profileCount: sortedNames.length,
  };
}

export function saveNamedProfile({
  name,
  config,
  overwrite = false,
  profilesPath,
}) {
  const validName = validateProfileName(name);
  const preferences = extractPortablePreferences(config);
  const store = loadProfilesStore(profilesPath);

  const alreadyExists = Object.hasOwn(store.profiles, validName);
  if (alreadyExists && !overwrite) {
    throw new ProfileError(
      `Profile "${validName}" already exists in ${store.profilesPath}. Pass --overwrite to replace it or choose a different name.`,
      [
        `Profile "${validName}" already exists in ${store.profilesPath}. Pass --overwrite to replace it or choose a different name.`,
      ],
    );
  }

  const savedAt = new Date().toISOString();
  const entry = {
    name: validName,
    savedAt,
    preferences,
  };

  store.profiles[validName] = entry;
  writeProfilesStoreAtomically(store.profilesPath, store.profiles);

  return {
    ok: true,
    profilesPath: store.profilesPath,
    overwritten: alreadyExists,
    profile: {
      name: validName,
      savedAt,
      summary: summarizePreferences(preferences),
      preferences,
    },
  };
}

export function deleteNamedProfile({ name, profilesPath }) {
  const validName = validateProfileName(name);
  const store = loadProfilesStore(profilesPath);

  if (!Object.hasOwn(store.profiles, validName)) {
    throw new ProfileError(
      `Saved profile "${validName}" not found in ${store.profilesPath}.`,
      [`Saved profile "${validName}" not found in ${store.profilesPath}.`],
    );
  }

  delete store.profiles[validName];
  writeProfilesStoreAtomically(store.profilesPath, store.profiles);

  const remainingProfiles = Object.keys(store.profiles).sort((a, b) =>
    a.localeCompare(b),
  );

  return {
    ok: true,
    profilesPath: store.profilesPath,
    deleted: validName,
    remainingProfiles,
  };
}
