import fs from 'node:fs';
import {
  REPORIG_VERSION,
  SPINE_STAGES,
  SDLC_PRESETS,
  PR_GATES,
  ISSUE_CADENCES,
  SKILL_PACK_KINDS,
  KNOWN_HARNESSES,
  PROVIDER_SLOTS,
} from './catalog.mjs';

const SECRET_TOKEN_PATTERN =
  /(?<![A-Za-z0-9_])(?:lin_api_[A-Za-z0-9]+|ghp_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]{10,}|glpat-[A-Za-z0-9_]{10,}|sk-(?:proj-|ant-[A-Za-z0-9]+-)?[A-Za-z0-9]{20,})/;

const SAFE_SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const DEFAULT_COMMANDS = {
  install: null,
  dev: null,
  build: null,
  lint: null,
  typecheck: null,
  testUnit: null,
  testE2e: null,
};

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNullableString(value) {
  return value === null || value === undefined || typeof value === 'string';
}

function findSecretTokens(node, currentPath, errors) {
  if (typeof node === 'string') {
    if (SECRET_TOKEN_PATTERN.test(node)) {
      errors.push(
        `Secret or API token detected at ${currentPath}; credentials must never be stored in reporig.json.`,
      );
    }
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      findSecretTokens(node[i], `${currentPath}[${i}]`, errors);
    }
    return;
  }
  if (isPlainObject(node)) {
    for (const [key, val] of Object.entries(node)) {
      if (SECRET_TOKEN_PATTERN.test(key)) {
        errors.push(
          `Secret or API token detected in key ${currentPath}.${key}; credentials must never be stored in reporig.json.`,
        );
      }
      findSecretTokens(val, `${currentPath}.${key}`, errors);
    }
  }
}

export function buildConfigFromPreset(presetId, partialOverrides = {}) {
  const preset = SDLC_PRESETS[presetId];
  if (!preset) {
    throw new Error(
      `Unknown SDLC preset "${presetId}". Expected one of: ${Object.keys(SDLC_PRESETS).join(', ')}.`,
    );
  }

  const overrides = isPlainObject(partialOverrides) ? partialOverrides : {};
  const projectOverrides = isPlainObject(overrides.project) ? overrides.project : {};
  const commandOverrides = isPlainObject(projectOverrides.commands)
    ? projectOverrides.commands
    : {};
  const sdlcOverrides = isPlainObject(overrides.sdlc) ? overrides.sdlc : {};
  const autonomyOverrides = isPlainObject(sdlcOverrides.autonomy)
    ? sdlcOverrides.autonomy
    : {};
  const writingStyleOverrides = isPlainObject(sdlcOverrides.writingStyle)
    ? sdlcOverrides.writingStyle
    : {};
  const providerOverrides = isPlainObject(overrides.providers) ? overrides.providers : {};
  const skillsOverrides = isPlainObject(overrides.skills) ? overrides.skills : {};

  const hasExplicitHarnesses = Object.prototype.hasOwnProperty.call(overrides, 'harnesses');
  const hasExplicitCustomHarnesses = Object.prototype.hasOwnProperty.call(
    overrides,
    'customHarnesses',
  );

  const harnesses = hasExplicitHarnesses
    ? structuredClone(overrides.harnesses)
    : [];
  const customHarnesses = hasExplicitCustomHarnesses
    ? structuredClone(overrides.customHarnesses)
    : [];

  const packs = Array.isArray(skillsOverrides.packs)
    ? structuredClone(skillsOverrides.packs)
    : [];
  const spinePrecedence = Object.prototype.hasOwnProperty.call(
    skillsOverrides,
    'spinePrecedence',
  )
    ? structuredClone(skillsOverrides.spinePrecedence)
    : null;

  const primarySpineSource =
    spinePrecedence?.discoverySpec ??
    packs.find((pack) => pack?.kind === 'spine')?.source ??
    null;
  const usesSuperpowersSpecs = primarySpineSource === 'obra/superpowers';

  const defaultIssueProviderId =
    preset.issueCadence === 'none' ? 'none' : 'github-issues';
  const resolvedIssueProviderId =
    isPlainObject(providerOverrides.issues) &&
    providerOverrides.issues.id !== undefined
      ? providerOverrides.issues.id
      : defaultIssueProviderId;
  const defaultIncludeCliFallback =
    resolvedIssueProviderId === 'linear' &&
    Array.isArray(harnesses) &&
    harnesses.includes('antigravity');

  return {
    schemaVersion: Object.prototype.hasOwnProperty.call(overrides, 'schemaVersion')
      ? overrides.schemaVersion
      : 1,
    reporigVersion: overrides.reporigVersion ?? REPORIG_VERSION,
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    evaluatedUpgrades: Array.isArray(overrides.evaluatedUpgrades)
      ? [
          ...new Set(
            overrides.evaluatedUpgrades
              .map((id) => String(id).trim())
              .filter(Boolean),
          ),
        ].sort()
      : [],
    project: {
      name: projectOverrides.name ?? 'app',
      description: projectOverrides.description ?? '',
      packageManager: projectOverrides.packageManager ?? 'unknown',
      commands: {
        ...DEFAULT_COMMANDS,
        ...structuredClone(commandOverrides),
      },
    },
    harnesses,
    customHarnesses,
    sdlc: {
      preset: sdlcOverrides.preset ?? preset.id,
      intentPlanning: sdlcOverrides.intentPlanning ?? preset.intentPlanning,
      verificationOracle:
        sdlcOverrides.verificationOracle ?? preset.verificationOracle,
      e2eTool: Object.prototype.hasOwnProperty.call(sdlcOverrides, 'e2eTool')
        ? sdlcOverrides.e2eTool
        : preset.e2eTool,
      commitCadence: sdlcOverrides.commitCadence ?? preset.commitCadence,
      pushCadence: sdlcOverrides.pushCadence ?? preset.pushCadence,
      prGate: sdlcOverrides.prGate ?? preset.prGate,
      prGateCustom: Object.prototype.hasOwnProperty.call(sdlcOverrides, 'prGateCustom')
        ? sdlcOverrides.prGateCustom
        : preset.prGateCustom,
      mergeGate: sdlcOverrides.mergeGate ?? preset.mergeGate,
      issueCadence: sdlcOverrides.issueCadence ?? preset.issueCadence,
      autonomy: {
        askFirst: structuredClone(
          autonomyOverrides.askFirst ?? preset.autonomy.askFirst,
        ),
        never: structuredClone(autonomyOverrides.never ?? preset.autonomy.never),
        protectedPaths: structuredClone(
          autonomyOverrides.protectedPaths ?? preset.autonomy.protectedPaths,
        ),
      },
      writingStyle: {
        plainEnglish:
          writingStyleOverrides.plainEnglish ?? preset.writingStyle.plainEnglish,
        noEmDashes:
          writingStyleOverrides.noEmDashes ?? preset.writingStyle.noEmDashes,
      },
    },
    providers: {
      source: {
        id: 'github',
        customName: null,
        notes: null,
        ...(isPlainObject(providerOverrides.source)
          ? structuredClone(providerOverrides.source)
          : {}),
      },
      issues: {
        id: defaultIssueProviderId,
        projectHint: null,
        includeCliFallback: defaultIncludeCliFallback,
        customName: null,
        notes: null,
        ...(isPlainObject(providerOverrides.issues)
          ? structuredClone(providerOverrides.issues)
          : {}),
      },
      ci: {
        id: 'local-only',
        customName: null,
        notes: null,
        ...(isPlainObject(providerOverrides.ci)
          ? structuredClone(providerOverrides.ci)
          : {}),
      },
      specs: {
        id: 'in-repo',
        specsDir: usesSuperpowersSpecs ? 'docs/superpowers/specs' : 'docs/specs',
        plansDir: usesSuperpowersSpecs ? 'docs/superpowers/plans' : 'docs/plans',
        customName: null,
        notes: null,
        ...(isPlainObject(providerOverrides.specs)
          ? structuredClone(providerOverrides.specs)
          : {}),
      },
    },
    skills: {
      packs,
      spinePrecedence,
    },
  };
}

export function validateConfig(raw) {
  if (!isPlainObject(raw)) {
    return {
      valid: false,
      errors: ['Config root must be a JSON object.'],
      value: null,
    };
  }

  const errors = [];

  if (raw.schemaVersion !== 1) {
    errors.push(
      `Unsupported or missing schemaVersion: expected 1, received ${JSON.stringify(raw.schemaVersion)}.`,
    );
  }

  findSecretTokens(raw, 'config', errors);

  if (raw.reporigVersion !== undefined && !isNonEmptyString(raw.reporigVersion)) {
    errors.push('reporigVersion must be a non-empty string when provided.');
  }
  if (raw.updatedAt !== undefined && !isNonEmptyString(raw.updatedAt)) {
    errors.push('updatedAt must be an ISO timestamp string when provided.');
  }

  let normalizedEvaluatedUpgrades = [];
  if (raw.evaluatedUpgrades !== undefined) {
    if (!Array.isArray(raw.evaluatedUpgrades)) {
      errors.push('evaluatedUpgrades must be an array of non-empty strings.');
    } else {
      let allValidStrings = true;
      for (const entry of raw.evaluatedUpgrades) {
        if (!isNonEmptyString(entry)) {
          allValidStrings = false;
          break;
        }
      }
      if (!allValidStrings) {
        errors.push('evaluatedUpgrades must be an array of non-empty strings.');
      } else {
        normalizedEvaluatedUpgrades = [
          ...new Set(raw.evaluatedUpgrades.map((item) => item.trim())),
        ].sort();
      }
    }
  }

  // Validate project
  let normalizedProject = null;
  if (!isPlainObject(raw.project)) {
    errors.push('project must be an object.');
  } else {
    if (!isNonEmptyString(raw.project.name)) {
      errors.push('project.name must be a non-empty string.');
    }
    if (
      raw.project.description !== undefined &&
      typeof raw.project.description !== 'string'
    ) {
      errors.push('project.description must be a string.');
    }
    if (!isNonEmptyString(raw.project.packageManager)) {
      errors.push('project.packageManager must be a non-empty string.');
    }
    const rawCommands = raw.project.commands ?? {};
    const normalizedCommands = { ...DEFAULT_COMMANDS };
    if (!isPlainObject(rawCommands)) {
      errors.push('project.commands must be an object.');
    } else {
      for (const [cmdKey, cmdVal] of Object.entries(rawCommands)) {
        if (!isNullableString(cmdVal)) {
          errors.push(`project.commands.${cmdKey} must be a string or null.`);
        } else {
          normalizedCommands[cmdKey] = cmdVal ?? null;
        }
      }
    }
    normalizedProject = {
      name: isNonEmptyString(raw.project.name) ? raw.project.name.trim() : '',
      description: raw.project.description ?? '',
      packageManager: isNonEmptyString(raw.project.packageManager)
        ? raw.project.packageManager.trim()
        : '',
      commands: normalizedCommands,
    };
  }

  // Validate harnesses and customHarnesses
  const normalizedHarnesses = [];
  if (raw.harnesses !== undefined && !Array.isArray(raw.harnesses)) {
    errors.push('harnesses must be an array of known harness IDs.');
  } else if (Array.isArray(raw.harnesses)) {
    for (const harness of raw.harnesses) {
      if (!KNOWN_HARNESSES.includes(harness)) {
        errors.push(
          `Unknown harness "${String(harness)}". Valid values: ${KNOWN_HARNESSES.join(', ')}.`,
        );
      } else if (!normalizedHarnesses.includes(harness)) {
        normalizedHarnesses.push(harness);
      }
    }
  }

  const normalizedCustomHarnesses = [];
  if (raw.customHarnesses !== undefined && !Array.isArray(raw.customHarnesses)) {
    errors.push('customHarnesses must be an array.');
  } else if (Array.isArray(raw.customHarnesses)) {
    raw.customHarnesses.forEach((entry, index) => {
      if (!isPlainObject(entry) || !isNonEmptyString(entry.name)) {
        errors.push(
          `customHarnesses[${index}] must be an object with a non-empty string name.`,
        );
        return;
      }
      if (!isNullableString(entry.notes)) {
        errors.push(`customHarnesses[${index}].notes must be a string or null.`);
        return;
      }
      normalizedCustomHarnesses.push({
        id: isNonEmptyString(entry.id) ? entry.id.trim() : 'custom',
        name: entry.name.trim(),
        notes: entry.notes ?? null,
      });
    });
  }

  // Validate sdlc
  let normalizedSdlc = null;
  if (!isPlainObject(raw.sdlc)) {
    errors.push('sdlc must be an object.');
  } else {
    const s = raw.sdlc;
    if (!Object.prototype.hasOwnProperty.call(SDLC_PRESETS, s.preset)) {
      errors.push(
        `sdlc.preset must be one of: ${Object.keys(SDLC_PRESETS).join(', ')}.`,
      );
    }
    for (const field of [
      'intentPlanning',
      'verificationOracle',
      'commitCadence',
      'pushCadence',
      'mergeGate',
    ]) {
      if (!isNonEmptyString(s[field])) {
        errors.push(`sdlc.${field} must be a non-empty string.`);
      }
    }
    if (!isNullableString(s.e2eTool)) {
      errors.push('sdlc.e2eTool must be a string or null.');
    }
    if (!PR_GATES.includes(s.prGate)) {
      errors.push(`sdlc.prGate must be one of: ${PR_GATES.join(', ')}.`);
    }
    if (s.prGate === 'custom' && !isNonEmptyString(s.prGateCustom)) {
      errors.push('sdlc.prGateCustom is required when sdlc.prGate is "custom".');
    } else if (!isNullableString(s.prGateCustom)) {
      errors.push('sdlc.prGateCustom must be a string or null.');
    }
    if (!ISSUE_CADENCES.includes(s.issueCadence)) {
      errors.push(
        `sdlc.issueCadence must be one of: ${ISSUE_CADENCES.join(', ')}.`,
      );
    }

    if (!isPlainObject(s.autonomy)) {
      errors.push('sdlc.autonomy must be an object.');
    } else {
      for (const listName of ['askFirst', 'never']) {
        if (
          !Array.isArray(s.autonomy[listName]) ||
          !s.autonomy[listName].every(isNonEmptyString)
        ) {
          errors.push(`sdlc.autonomy.${listName} must be an array of strings.`);
        }
      }
      if (
        s.autonomy.protectedPaths !== undefined &&
        (!Array.isArray(s.autonomy.protectedPaths) ||
          !s.autonomy.protectedPaths.every(isNonEmptyString))
      ) {
        errors.push('sdlc.autonomy.protectedPaths must be an array of strings.');
      }
    }

    if (!isPlainObject(s.writingStyle)) {
      errors.push('sdlc.writingStyle must be an object.');
    } else {
      if (typeof s.writingStyle.plainEnglish !== 'boolean') {
        errors.push('sdlc.writingStyle.plainEnglish must be a boolean.');
      }
      if (typeof s.writingStyle.noEmDashes !== 'boolean') {
        errors.push('sdlc.writingStyle.noEmDashes must be a boolean.');
      }
    }

    if (isPlainObject(s.autonomy) && isPlainObject(s.writingStyle)) {
      normalizedSdlc = {
        preset: s.preset,
        intentPlanning: s.intentPlanning,
        verificationOracle: s.verificationOracle,
        e2eTool: s.e2eTool ?? 'none',
        commitCadence: s.commitCadence,
        pushCadence: s.pushCadence,
        prGate: s.prGate,
        prGateCustom: isNonEmptyString(s.prGateCustom) ? s.prGateCustom.trim() : null,
        mergeGate: s.mergeGate,
        issueCadence: s.issueCadence,
        autonomy: {
          askFirst: Array.isArray(s.autonomy.askFirst) ? [...s.autonomy.askFirst] : [],
          never: Array.isArray(s.autonomy.never) ? [...s.autonomy.never] : [],
          protectedPaths: Array.isArray(s.autonomy.protectedPaths)
            ? [...s.autonomy.protectedPaths]
            : [],
        },
        writingStyle: {
          plainEnglish: s.writingStyle.plainEnglish,
          noEmDashes: s.writingStyle.noEmDashes,
        },
      };
    }
  }

  // Validate providers
  let normalizedProviders = null;
  if (!isPlainObject(raw.providers)) {
    errors.push('providers must be an object with source, issues, ci, and specs slots.');
  } else {
    normalizedProviders = {};
    for (const slot of ['source', 'issues', 'ci', 'specs']) {
      const slotVal = raw.providers[slot];
      const allowedIds = PROVIDER_SLOTS[slot];
      if (!isPlainObject(slotVal)) {
        errors.push(`providers.${slot} must be an object.`);
        continue;
      }
      if (!allowedIds.includes(slotVal.id)) {
        errors.push(
          `providers.${slot}.id must be one of: ${allowedIds.join(', ')}.`,
        );
      }
      if (slotVal.id === 'custom' && !isNonEmptyString(slotVal.customName)) {
        errors.push(
          `providers.${slot}.customName is required when providers.${slot}.id is "custom".`,
        );
      } else if (!isNullableString(slotVal.customName)) {
        errors.push(`providers.${slot}.customName must be a string or null.`);
      }
      if (!isNullableString(slotVal.notes)) {
        errors.push(`providers.${slot}.notes must be a string or null.`);
      }

      const normalizedSlot = {
        id: slotVal.id,
        customName: isNonEmptyString(slotVal.customName)
          ? slotVal.customName.trim()
          : null,
        notes: isNonEmptyString(slotVal.notes) ? slotVal.notes.trim() : null,
      };

      if (slot === 'issues') {
        if (!isNullableString(slotVal.projectHint)) {
          errors.push('providers.issues.projectHint must be a string or null.');
        }
        if (
          slotVal.includeCliFallback !== undefined &&
          typeof slotVal.includeCliFallback !== 'boolean'
        ) {
          errors.push('providers.issues.includeCliFallback must be a boolean.');
        }
        normalizedSlot.projectHint = isNonEmptyString(slotVal.projectHint)
          ? slotVal.projectHint.trim()
          : null;
        normalizedSlot.includeCliFallback =
          typeof slotVal.includeCliFallback === 'boolean'
            ? slotVal.includeCliFallback
            : slotVal.id === 'linear' &&
              normalizedHarnesses.includes('antigravity');
      }

      if (slot === 'specs') {
        if (slotVal.id === 'in-repo') {
          const specsDir = slotVal.specsDir ?? 'docs/specs';
          const plansDir = slotVal.plansDir ?? 'docs/plans';
          if (!isNonEmptyString(specsDir)) {
            errors.push(
              'providers.specs.specsDir must be a non-empty string when specs.id is "in-repo".',
            );
          }
          if (!isNonEmptyString(plansDir)) {
            errors.push(
              'providers.specs.plansDir must be a non-empty string when specs.id is "in-repo".',
            );
          }
          normalizedSlot.specsDir = isNonEmptyString(specsDir) ? specsDir.trim() : '';
          normalizedSlot.plansDir = isNonEmptyString(plansDir) ? plansDir.trim() : '';
        } else {
          if (!isNullableString(slotVal.specsDir)) {
            errors.push('providers.specs.specsDir must be a string or null.');
          }
          if (!isNullableString(slotVal.plansDir)) {
            errors.push('providers.specs.plansDir must be a string or null.');
          }
          normalizedSlot.specsDir = slotVal.specsDir ?? null;
          normalizedSlot.plansDir = slotVal.plansDir ?? null;
        }
      }

      normalizedProviders[slot] = normalizedSlot;
    }
  }

  // Validate skills
  let normalizedSkills = null;
  if (!isPlainObject(raw.skills)) {
    errors.push('skills must be an object with packs and spinePrecedence.');
  } else {
    const normalizedPacks = [];
    if (!Array.isArray(raw.skills.packs)) {
      errors.push('skills.packs must be an array.');
    } else {
      raw.skills.packs.forEach((pack, index) => {
        if (!isPlainObject(pack)) {
          errors.push(`skills.packs[${index}] must be an object.`);
          return;
        }
        if (!isNonEmptyString(pack.source)) {
          errors.push(`skills.packs[${index}].source must be a non-empty string.`);
        }
        if (!isNonEmptyString(pack.url)) {
          errors.push(`skills.packs[${index}].url must be a non-empty string.`);
        }
        if (!SKILL_PACK_KINDS.includes(pack.kind)) {
          errors.push(
            `skills.packs[${index}].kind must be one of: ${SKILL_PACK_KINDS.join(', ')}.`,
          );
        }
        const installedDirs = pack.installedDirs ?? [];
        if (!Array.isArray(installedDirs) || !installedDirs.every(isNonEmptyString)) {
          errors.push(
            `skills.packs[${index}].installedDirs must be an array of strings.`,
          );
        }
        if (!isNullableString(pack.commitSha)) {
          errors.push(`skills.packs[${index}].commitSha must be a string or null.`);
        }
        if (!isNullableString(pack.installedAt)) {
          errors.push(`skills.packs[${index}].installedAt must be a string or null.`);
        }
        if (
          pack.includePaths !== undefined &&
          (!Array.isArray(pack.includePaths) ||
            !pack.includePaths.every(isNonEmptyString))
        ) {
          errors.push(
            `skills.packs[${index}].includePaths must be an array of non-empty strings.`,
          );
        }
        if (
          pack.excludePaths !== undefined &&
          (!Array.isArray(pack.excludePaths) ||
            !pack.excludePaths.every(isNonEmptyString))
        ) {
          errors.push(
            `skills.packs[${index}].excludePaths must be an array of non-empty strings.`,
          );
        }

        let normalizedSelectedSkills = undefined;
        if (pack.selectedSkills !== undefined) {
          if (
            !Array.isArray(pack.selectedSkills) ||
            pack.selectedSkills.length === 0 ||
            !pack.selectedSkills.every(
              (s) => typeof s === 'string' && SAFE_SKILL_NAME_RE.test(s.trim()),
            )
          ) {
            errors.push(
              `skills.packs[${index}].selectedSkills must be a non-empty array of lowercase kebab-case skill names.`,
            );
          } else {
            normalizedSelectedSkills = [
              ...new Set(pack.selectedSkills.map((s) => s.trim())),
            ].sort();
          }
        }

        normalizedPacks.push({
          source: isNonEmptyString(pack.source) ? pack.source.trim() : '',
          url: isNonEmptyString(pack.url) ? pack.url.trim() : '',
          kind: pack.kind,
          installedDirs: Array.isArray(installedDirs) ? [...installedDirs] : [],
          commitSha: pack.commitSha ?? null,
          installedAt: pack.installedAt ?? null,
          ...(Array.isArray(pack.includePaths) &&
          pack.includePaths.every(isNonEmptyString)
            ? { includePaths: pack.includePaths.map((p) => p.trim()) }
            : {}),
          ...(Array.isArray(pack.excludePaths) &&
          pack.excludePaths.every(isNonEmptyString)
            ? { excludePaths: pack.excludePaths.map((p) => p.trim()) }
            : {}),
          ...(normalizedSelectedSkills !== undefined
            ? { selectedSkills: normalizedSelectedSkills }
            : {}),
        });
      });
    }

    const spineSources = normalizedPacks
      .filter((pack) => pack.kind === 'spine' && pack.source.length > 0)
      .map((pack) => pack.source);

    let normalizedPrecedence = null;
    const rawPrecedence = raw.skills.spinePrecedence;

    if (spineSources.length >= 2) {
      if (!isPlainObject(rawPrecedence)) {
        errors.push(
          `skills.spinePrecedence is required and must assign all 4 stages (${SPINE_STAGES.join(', ')}) when 2 or more spine packs are selected.`,
        );
      } else {
        normalizedPrecedence = {};
        for (const stage of SPINE_STAGES) {
          const owner = rawPrecedence[stage];
          if (!isNonEmptyString(owner)) {
            errors.push(
              `skills.spinePrecedence.${stage} is required when 2 or more spine packs are selected.`,
            );
          } else if (!spineSources.includes(owner)) {
            errors.push(
              `skills.spinePrecedence.${stage} ("${owner}") must match one of the selected spine packs: ${spineSources.join(', ')}.`,
            );
          } else {
            normalizedPrecedence[stage] = owner;
          }
        }
      }
    } else if (rawPrecedence !== null && rawPrecedence !== undefined) {
      if (spineSources.length === 0) {
        errors.push(
          'skills.spinePrecedence must be null when no spine packs are selected.',
        );
      } else if (!isPlainObject(rawPrecedence)) {
        errors.push('skills.spinePrecedence must be null or a stage mapping object.');
      } else {
        normalizedPrecedence = {};
        for (const stage of SPINE_STAGES) {
          const owner = rawPrecedence[stage];
          if (!isNonEmptyString(owner)) {
            errors.push(
              `skills.spinePrecedence.${stage} must be a non-empty string when spinePrecedence is provided.`,
            );
          } else if (!spineSources.includes(owner)) {
            errors.push(
              `skills.spinePrecedence.${stage} ("${owner}") must match one of the selected spine packs: ${spineSources.join(', ')}.`,
            );
          } else {
            normalizedPrecedence[stage] = owner;
          }
        }
      }
    }

    normalizedSkills = {
      packs: normalizedPacks,
      spinePrecedence: normalizedPrecedence,
    };
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      value: null,
    };
  }

  return {
    valid: true,
    errors: [],
    value: {
      schemaVersion: 1,
      reporigVersion: raw.reporigVersion ?? REPORIG_VERSION,
      updatedAt: raw.updatedAt ?? new Date().toISOString(),
      evaluatedUpgrades: normalizedEvaluatedUpgrades,
      project: normalizedProject,
      harnesses: normalizedHarnesses,
      customHarnesses: normalizedCustomHarnesses,
      sdlc: normalizedSdlc,
      providers: normalizedProviders,
      skills: normalizedSkills,
    },
  };
}

export function parseConfigFile(filePath) {
  let rawText;
  try {
    rawText = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return {
        exists: false,
        valid: false,
        errors: [],
        config: null,
      };
    }
    return {
      exists: true,
      valid: false,
      errors: [`Unable to read config file ${filePath}: ${err.message}`],
      config: null,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    return {
      exists: true,
      valid: false,
      errors: [`Invalid JSON in ${filePath}: ${err.message}`],
      config: null,
    };
  }

  const validation = validateConfig(parsed);
  return {
    exists: true,
    valid: validation.valid,
    errors: validation.errors,
    config: validation.value,
  };
}
