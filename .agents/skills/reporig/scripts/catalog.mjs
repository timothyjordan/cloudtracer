export const REPORIG_VERSION = '0.1.2'; // x-release-please-version

export const REPORIG_REPO_URL = 'https://github.com/timothyjordan/reporig.git';

export const SELF_SKILL_NAMES = ['reporig', 'reporig-audit'];

export const SPINE_STAGES = [
  'discoverySpec',
  'taskBreakdown',
  'implementation',
  'codeReview',
];

export const SPINE_STAGE_LABELS = {
  discoverySpec: 'Discovery and Spec Authoring',
  taskBreakdown: 'Task and Ticket Breakdown',
  implementation: 'Implementation and Testing Loop',
  codeReview: 'Code Review and Pre-Ship Audit',
};

export const CURATED_SPINES = {
  'obra/superpowers': {
    source: 'obra/superpowers',
    url: 'https://github.com/obra/superpowers.git',
    label: 'Superpowers (obra/superpowers)',
    description:
      'Brainstorming, specs, implementation plans, TDD, systematic debugging, and verification before completion.',
    recommended: true,
    callout: null,
    includePaths: [],
    excludePaths: [],
    stageSkills: {
      discoverySpec: ['brainstorming'],
      taskBreakdown: ['writing-plans'],
      implementation: [
        'test-driven-development',
        'subagent-driven-development',
        'executing-plans',
        'dispatching-parallel-agents',
        'using-git-worktrees',
      ],
      codeReview: [
        'requesting-code-review',
        'receiving-code-review',
        'verification-before-completion',
        'finishing-a-development-branch',
      ],
      utility: [
        'systematic-debugging',
        'using-superpowers',
        'writing-skills',
        'diagnosing-superpowers',
      ],
    },
  },
  'mattpocock/skills': {
    source: 'mattpocock/skills',
    url: 'https://github.com/mattpocock/skills.git',
    label: 'Matt Pocock Engineering Skills (mattpocock/skills)',
    description:
      'Design grilling with docs, spec synthesis, vertical-slice ticket breakdown, TDD implementation, and code review.',
    recommended: false,
    callout: null,
    includePaths: [
      'skills/engineering/**',
      'skills/productivity/grill-me/**',
      'skills/productivity/grilling/**',
      'skills/productivity/handoff/**',
      'skills/productivity/to-questionnaire/**',
      'skills/productivity/writing-for-agents/**',
    ],
    excludePaths: [],
    stageSkills: {
      discoverySpec: [
        'grill-me',
        'grill-with-docs',
        'grilling',
        'to-spec',
        'improve-codebase-architecture',
        'codebase-design',
        'domain-modeling',
        'prototype',
        'research',
      ],
      taskBreakdown: ['to-tickets', 'triage'],
      implementation: ['implement', 'implement-spec', 'tdd'],
      codeReview: ['code-review', 'pr'],
      utility: [
        'diagnosing-bugs',
        'handoff',
        'to-questionnaire',
        'writing-for-agents',
        'retro',
        'wayfinder',
        'wizard',
        'ask-matt',
        'setup-matt-pocock-skills',
      ],
    },
  },
  'addyosmani/agent-skills': {
    source: 'addyosmani/agent-skills',
    url: 'https://github.com/addyosmani/agent-skills.git',
    label: 'Addy Osmani Agent Skills (addyosmani/agent-skills)',
    description:
      'Define, plan, incremental build, verification, security and performance review, and ship gates.',
    recommended: false,
    callout: null,
    includePaths: [],
    excludePaths: [],
    stageSkills: {
      discoverySpec: ['interview-me', 'idea-refine', 'spec-driven-development'],
      taskBreakdown: ['planning-and-task-breakdown'],
      implementation: [
        'incremental-implementation',
        'test-driven-development',
        'source-driven-development',
        'doubt-driven-development',
        'frontend-ui-engineering',
        'api-and-interface-design',
      ],
      codeReview: [
        'code-review-and-quality',
        'security-hardening',
        'performance-optimization',
        'code-simplification',
        'shipping-and-launch',
      ],
      utility: [
        'using-agent-skills',
        'context-engineering',
        'browser-testing-with-devtools',
        'debugging-and-error-recovery',
        'ci-cd-and-automation',
        'observability-and-instrumentation',
      ],
    },
  },
  'EveryInc/compound-engineering-plugin': {
    source: 'EveryInc/compound-engineering-plugin',
    url: 'https://github.com/EveryInc/compound-engineering-plugin.git',
    label: 'Compound Engineering (EveryInc/compound-engineering-plugin)',
    description:
      'Brainstorm, plan, work, review, and capture institutional learnings in docs/solutions/.',
    recommended: false,
    callout: null,
    includePaths: ['skills/**'],
    excludePaths: ['skills/ce-riffrec-feedback-analysis/**'],
    stageSkills: {
      discoverySpec: ['ce-brainstorm', 'ce-ideate', 'ce-strategy', 'ce-prototype'],
      taskBreakdown: ['ce-plan'],
      implementation: ['ce-work', 'ce-worktree', 'lfg'],
      codeReview: [
        'ce-code-review',
        'ce-simplify-code',
        'ce-proof',
        'ce-noslop',
        'ce-polish',
        'ce-compound',
        'ce-compound-refresh',
      ],
      utility: [
        'ce-debug',
        'ce-doc-review',
        'ce-bakeoff',
        'ce-explain',
        'ce-handoff',
        'ce-commit',
        'ce-commit-push-pr',
        'ce-babysit-pr',
        'ce-resolve-pr-feedback',
        'ce-retro',
        'ce-help',
        'ce-setup',
        'ce-dogfood',
        'ce-optimize',
        'ce-pov',
        'ce-product-pulse',
        'ce-promote',
        'ce-retune',
        'ce-sweep',
        'ce-test-browser',
        'ce-test-xcode',
        'wtf',
      ],
    },
  },
  'garrytan/gstack': {
    source: 'garrytan/gstack',
    url: 'https://github.com/garrytan/gstack.git',
    label: 'gstack Portable Markdown Subset (garrytan/gstack)',
    description:
      'Founder scope review, engineering architecture review, staff diff review, and retrospectives.',
    recommended: false,
    callout:
      'Filtered to portable Markdown-only skills; excludes Bun and compiled browser-binary skills (browse, qa, setup, ship).',
    includePaths: [
      'office-hours/**',
      'spec/**',
      'plan-ceo-review/**',
      'plan-eng-review/**',
      'plan-design-review/**',
      'plan-devex-review/**',
      'autoplan/**',
      'review/**',
      'devex-review/**',
      'test-audit/**',
      'cso/**',
      'document-release/**',
      'retro/**',
    ],
    excludePaths: [],
    stageSkills: {
      discoverySpec: ['office-hours', 'spec', 'plan-ceo-review'],
      taskBreakdown: [
        'plan-eng-review',
        'plan-design-review',
        'plan-devex-review',
        'autoplan',
      ],
      implementation: [],
      codeReview: ['review', 'devex-review', 'test-audit', 'cso'],
      utility: ['document-release', 'retro'],
    },
  },
};

export const CURATED_SKILLS = {
  'cloudflare/security-audit-skill': {
    source: 'cloudflare/security-audit-skill',
    url: 'https://github.com/cloudflare/security-audit-skill.git',
    label: 'OWASP Security Audit (cloudflare/security-audit-skill)',
    kind: 'verification',
    tier: 1,
    suggestWhen: 'always',
    defaultWhen: 'always',
    choiceGroup: null,
    includePaths: ['skills/security-audit/**'],
    excludePaths: [],
    skillNames: ['security-audit'],
    description:
      'OWASP Top 10, authentication, authorization, injection, secrets, and dependency security audits.',
  },
  'trailofbits/skills#appsec': {
    source: 'trailofbits/skills#appsec',
    url: 'https://github.com/trailofbits/skills.git',
    label: 'Trail of Bits AppSec and Diff Review (trailofbits/skills#appsec)',
    kind: 'verification',
    tier: 1,
    suggestWhen: 'always',
    defaultWhen: 'always',
    choiceGroup: null,
    includePaths: [
      'plugins/differential-review/skills/**',
      'plugins/sharp-edges/skills/**',
      'plugins/property-based-testing/skills/**',
      'plugins/supply-chain-risk-auditor/skills/**',
      'plugins/spec-to-code-compliance/skills/**',
      'plugins/fp-check/skills/**',
      'plugins/static-analysis/skills/**',
    ],
    excludePaths: [],
    skillNames: [
      'codeql',
      'differential-review',
      'fp-check',
      'property-based-testing',
      'sarif-parsing',
      'semgrep',
      'sharp-edges',
      'spec-to-code-compliance',
      'supply-chain-risk-auditor',
    ],
    description:
      'Security differential review, API sharp-edge checks, property-based testing, spec compliance, and static analysis.',
  },
  'blader/humanizer': {
    source: 'blader/humanizer',
    url: 'https://github.com/blader/humanizer.git',
    label: 'Humanizer Prose Craft (blader/humanizer)',
    kind: 'craft',
    tier: 1,
    suggestWhen: 'always',
    defaultWhen: 'always',
    choiceGroup: null,
    includePaths: [],
    excludePaths: [],
    skillNames: ['humanizer'],
    description:
      'Eliminates AI-generated phrasing, filler, and formulaic cadence in docs, comments, and user-facing copy.',
  },
  'pbakaus/impeccable': {
    source: 'pbakaus/impeccable',
    url: 'https://github.com/pbakaus/impeccable.git',
    label: 'Impeccable UI Craft (pbakaus/impeccable)',
    kind: 'craft',
    tier: 1,
    suggestWhen: 'hasFrontendUi',
    defaultWhen: 'hasFrontendUi',
    choiceGroup: null,
    includePaths: [
      '.agents/skills/impeccable/**',
      '.claude/skills/impeccable/**',
      'skills/impeccable/**',
      'SKILL.md',
    ],
    excludePaths: [],
    skillNames: ['impeccable'],
    description:
      'UI and UX design craft floor, critique, layout, typography, and accessibility polish.',
  },
  'emilkowalski/skills': {
    source: 'emilkowalski/skills',
    url: 'https://github.com/emilkowalski/skills.git',
    label: 'Design Engineering and Motion Craft (emilkowalski/skills)',
    kind: 'craft',
    tier: 1,
    suggestWhen: 'hasFrontendUi',
    defaultWhen: 'hasFrontendUi',
    choiceGroup: null,
    includePaths: ['skills/**'],
    excludePaths: ['skills/ask-emil/**', 'skills/ask-sonner/**'],
    skillNames: [
      'animate',
      'animate-expo',
      'animation-performance',
      'animation-vocabulary',
      'apple-design',
      'break-ui',
      'choreograph',
      'emil-design-eng',
      'find-animation-opportunities',
      'gestures',
      'improve-animations',
      'learn-taste',
      'mobile-native',
      'pick-ui-library',
      'prototype',
      'remove-animations',
      'review-animations',
      'write-swift',
    ],
    description:
      'Interaction feel, purposeful UI motion, spring physics, gesture responsiveness, and 60fps animation performance.',
  },
  'anthropics/skills#frontend-design': {
    source: 'anthropics/skills#frontend-design',
    url: 'https://github.com/anthropics/skills.git',
    label: 'Anthropic Frontend Design (anthropics/skills#frontend-design)',
    kind: 'craft',
    tier: 1,
    suggestWhen: 'hasFrontendUi',
    defaultWhen: null,
    choiceGroup: null,
    includePaths: ['skills/frontend-design/**'],
    excludePaths: [],
    skillNames: ['frontend-design'],
    description:
      'Aesthetic direction, distinctive visual hierarchy, and anti-boilerplate layout craft for web interfaces.',
  },
  'addyosmani/web-quality-skills': {
    source: 'addyosmani/web-quality-skills',
    url: 'https://github.com/addyosmani/web-quality-skills.git',
    label: 'Web Quality and Core Web Vitals (addyosmani/web-quality-skills)',
    kind: 'verification',
    tier: 1,
    suggestWhen: 'hasWebSurface',
    defaultWhen: 'hasWebSurface',
    choiceGroup: null,
    includePaths: ['skills/**'],
    excludePaths: [],
    skillNames: [
      'accessibility',
      'best-practices',
      'core-web-vitals',
      'performance',
      'seo',
      'web-quality-audit',
    ],
    description:
      'Lighthouse quality audits covering Core Web Vitals, WCAG accessibility, browser best practices, and SEO.',
  },
  'timothyjordan/a14y': {
    source: 'timothyjordan/a14y',
    url: 'https://github.com/timothyjordan/a14y.git',
    label: 'a14y Agent Readability (timothyjordan/a14y)',
    kind: 'craft',
    tier: 1,
    suggestWhen: 'hasWebSurface',
    defaultWhen: 'hasWebSurface',
    choiceGroup: null,
    includePaths: [],
    excludePaths: [],
    skillNames: ['a14y'],
    description:
      'Agent-readability checks including llms.txt, semantic HTML, and markdown mirrors.',
  },
  'currents-dev/playwright-best-practices-skill': {
    source: 'currents-dev/playwright-best-practices-skill',
    url: 'https://github.com/currents-dev/playwright-best-practices-skill.git',
    label:
      'Playwright E2E Best Practices (currents-dev/playwright-best-practices-skill)',
    kind: 'verification',
    tier: 1,
    suggestWhen: 'hasPlaywrightOrWeb',
    defaultWhen: 'hasPlaywright',
    choiceGroup: null,
    includePaths: ['playwright-best-practices/**'],
    excludePaths: [],
    skillNames: ['playwright-best-practices'],
    description:
      'Deterministic Playwright locators, fixture isolation, web-first assertions, and zero-flake E2E patterns.',
  },
  'vercel-labs/agent-skills#writing-guidelines': {
    source: 'vercel-labs/agent-skills#writing-guidelines',
    url: 'https://github.com/vercel-labs/agent-skills.git',
    label: 'Technical Writing Guidelines (vercel-labs/agent-skills#writing-guidelines)',
    kind: 'craft',
    tier: 2,
    suggestWhen: 'always',
    defaultWhen: 'always',
    choiceGroup: null,
    includePaths: ['skills/writing-guidelines/**'],
    excludePaths: [],
    skillNames: ['writing-guidelines'],
    description:
      'Clear, active-voice technical documentation, developer guides, changelogs, and UI microcopy rules.',
  },
  'vercel-labs/agent-skills#react-web': {
    source: 'vercel-labs/agent-skills#react-web',
    url: 'https://github.com/vercel-labs/agent-skills.git',
    label:
      'React Composition and Performance (vercel-labs/agent-skills#react-web)',
    kind: 'craft',
    tier: 2,
    suggestWhen: 'hasReact',
    defaultWhen: 'hasReact',
    choiceGroup: null,
    includePaths: [
      'skills/react-best-practices/**',
      'skills/composition-patterns/**',
      'skills/react-view-transitions/**',
      'skills/web-design-guidelines/**',
    ],
    excludePaths: [],
    skillNames: [
      'composition-patterns',
      'react-best-practices',
      'react-view-transitions',
      'web-design-guidelines',
    ],
    description:
      'React 19 component composition, async waterfall elimination, view transitions, and web interface guidelines.',
  },
  'supabase/agent-skills#postgres-best-practices': {
    source: 'supabase/agent-skills#postgres-best-practices',
    url: 'https://github.com/supabase/agent-skills.git',
    label:
      'PostgreSQL Performance and Schema Craft (supabase/agent-skills#postgres-best-practices)',
    kind: 'craft',
    tier: 2,
    suggestWhen: 'hasPostgres',
    defaultWhen: 'hasPostgres',
    choiceGroup: 'postgres',
    includePaths: ['skills/supabase-postgres-best-practices/**'],
    excludePaths: [],
    skillNames: ['supabase-postgres-best-practices'],
    description:
      'Pure PostgreSQL indexing, query tuning, connection pooling, concurrency, locking, and schema design rules.',
  },
  'microsoft/postgres-skills#postgresql-best-practices': {
    source: 'microsoft/postgres-skills#postgresql-best-practices',
    url: 'https://github.com/microsoft/postgres-skills.git',
    label:
      'PostgreSQL Deep Reference (microsoft/postgres-skills#postgresql-best-practices)',
    kind: 'craft',
    tier: 2,
    suggestWhen: 'hasPostgres',
    defaultWhen: null,
    choiceGroup: 'postgres',
    includePaths: ['plugin/skills/postgresql-best-practices/**'],
    excludePaths: [],
    skillNames: ['postgresql-best-practices'],
    description:
      'Comprehensive PostgreSQL DDL, partitioning, JSONB, RLS, pgvector, vacuuming, and SQL tuning reference.',
  },
  'trailofbits/skills#modern-python': {
    source: 'trailofbits/skills#modern-python',
    url: 'https://github.com/trailofbits/skills.git',
    label: 'Modern Python Tooling and Craft (trailofbits/skills#modern-python)',
    kind: 'craft',
    tier: 2,
    suggestWhen: 'hasPython',
    defaultWhen: 'hasPython',
    choiceGroup: null,
    includePaths: ['plugins/modern-python/skills/**'],
    excludePaths: [],
    skillNames: ['modern-python'],
    description:
      'Modern Python standards covering uv, ruff, strict type checking, pytest structure, and pyproject.toml hygiene.',
  },
  'samber/cc-skills-golang': {
    source: 'samber/cc-skills-golang',
    url: 'https://github.com/samber/cc-skills-golang.git',
    label: 'Idiomatic Go Engineering (samber/cc-skills-golang)',
    kind: 'craft',
    tier: 2,
    suggestWhen: 'hasGo',
    defaultWhen: 'hasGo',
    choiceGroup: null,
    includePaths: ['skills/**'],
    excludePaths: ['skills/golang-samber-*/**'],
    skillNames: [
      'golang-benchmark',
      'golang-cli',
      'golang-code-style',
      'golang-concurrency',
      'golang-context',
      'golang-continuous-integration',
      'golang-data-structures',
      'golang-database',
      'golang-dependency-injection',
      'golang-dependency-management',
      'golang-design-patterns',
      'golang-documentation',
      'golang-error-handling',
      'golang-google-wire',
      'golang-gopls',
      'golang-graphql',
      'golang-grpc',
      'golang-how-to',
      'golang-lint',
      'golang-modernize',
      'golang-naming',
      'golang-observability',
      'golang-performance',
      'golang-pkg-go-dev',
      'golang-popular-libraries',
      'golang-project-layout',
      'golang-refactoring',
      'golang-safety',
      'golang-security',
      'golang-spf13-cobra',
      'golang-spf13-viper',
      'golang-stay-updated',
      'golang-stretchr-testify',
      'golang-structs-interfaces',
      'golang-swagger',
      'golang-testing',
      'golang-troubleshooting',
      'golang-uber-dig',
      'golang-uber-fx',
    ],
    description:
      'Idiomatic Go concurrency, context propagation, error handling, benchmarks, testing, and service layout.',
  },
  'morganlinton/BeautifulRust': {
    source: 'morganlinton/BeautifulRust',
    url: 'https://github.com/morganlinton/BeautifulRust.git',
    label: 'Idiomatic Rust Craft (morganlinton/BeautifulRust)',
    kind: 'craft',
    tier: 2,
    suggestWhen: 'hasRust',
    defaultWhen: 'hasRust',
    choiceGroup: null,
    includePaths: ['skills/**'],
    excludePaths: [],
    skillNames: ['rust-best-practices', 'rust-port', 'rust-review'],
    description:
      'Idiomatic Rust ownership, error modeling, zero-cost abstractions, unsafe invariants, and review checklists.',
  },
  'callstackincubator/agent-skills': {
    source: 'callstackincubator/agent-skills',
    url: 'https://github.com/callstackincubator/agent-skills.git',
    label: 'React Native Craft and Performance (callstackincubator/agent-skills)',
    kind: 'craft',
    tier: 2,
    suggestWhen: 'hasReactNative',
    defaultWhen: 'hasReactNative',
    choiceGroup: null,
    includePaths: [
      'skills/react-native-best-practices/**',
      'skills/react-navigation/**',
      'skills/upgrading-react-native/**',
      'skills/react-native-brownfield-migration/**',
      'skills/assess-react-native-migration/**',
      'skills/create-react-native-library/**',
      'skills/react-native-tv-best-practices/**',
    ],
    excludePaths: [],
    skillNames: [
      'assess-react-native-migration',
      'create-react-native-library',
      'react-native-best-practices',
      'react-native-brownfield-migration',
      'react-native-tv-best-practices',
      'react-navigation',
      'upgrading-react-native',
    ],
    description:
      'React Native New Architecture rendering, list performance, navigation patterns, and native module profiling.',
  },
  'AvdLee/SwiftUI-Agent-Skill': {
    source: 'AvdLee/SwiftUI-Agent-Skill',
    url: 'https://github.com/AvdLee/SwiftUI-Agent-Skill.git',
    label: 'Modern SwiftUI Craft (AvdLee/SwiftUI-Agent-Skill)',
    kind: 'craft',
    tier: 2,
    suggestWhen: 'hasSwift',
    defaultWhen: 'hasSwift',
    choiceGroup: null,
    includePaths: ['skills/swiftui-expert-skill/**'],
    excludePaths: [],
    skillNames: ['swiftui-expert-skill'],
    description:
      'Modern SwiftUI Observation state flow, view identity, Swift 6 concurrency safety, and Liquid Glass APIs.',
  },
};

const FULL_AUTONOMY_BOUNDARIES = {
  askFirst: [
    'new-dependencies',
    'existing-migrations-and-contracts',
    'ci-and-deploy-configs',
    'other-repositories',
  ],
  never: [
    'secrets-and-env-files',
    'hand-edit-lockfiles-or-generated',
    'weaken-spec-tests-without-triage',
    'commit-or-force-push-main',
  ],
  protectedPaths: [],
};

const LIGHTWEIGHT_AUTONOMY_BOUNDARIES = {
  askFirst: ['other-repositories'],
  never: [
    'secrets-and-env-files',
    'hand-edit-lockfiles-or-generated',
    'commit-or-force-push-main',
  ],
  protectedPaths: [],
};

export const PR_GATES = [
  'pr-with-test-plan',
  'local-test-before-pr',
  'direct-or-fast',
  'custom',
];

export const ISSUE_CADENCES = [
  'all-work',
  'features-and-bugs',
  'existing-only',
  'none',
];

export const SKILL_PACK_KINDS = ['spine', 'verification', 'craft', 'custom'];

export const SDLC_PRESETS = {
  'adversarial-zero-trust': {
    id: 'adversarial-zero-trust',
    label: 'Adversarial Zero-Trust',
    description:
      'Written spec and plan before non-trivial code, black-box spec test oracle, strict 3-tier autonomy gates, and full issue lifecycle.',
    intentPlanning: 'spec-and-plan',
    verificationOracle: 'adversarial-spec-oracle',
    e2eTool: 'playwright',
    commitCadence: 'per-task',
    pushCadence: 'when-all-tasks-complete',
    prGate: 'pr-with-test-plan',
    prGateCustom: null,
    mergeGate: 'explicit-user-approval',
    issueCadence: 'all-work',
    autonomy: FULL_AUTONOMY_BOUNDARIES,
    writingStyle: {
      plainEnglish: true,
      noEmDashes: false,
    },
  },
  'spec-driven': {
    id: 'spec-driven',
    label: 'Spec-Driven',
    description:
      'Written spec and plan before non-trivial code, unit and integration tests covering spec criteria, and per-feature issue tracking.',
    intentPlanning: 'spec-and-plan',
    verificationOracle: 'spec-acceptance-tests',
    e2eTool: 'none',
    commitCadence: 'per-task',
    pushCadence: 'when-all-tasks-complete',
    prGate: 'pr-with-test-plan',
    prGateCustom: null,
    mergeGate: 'explicit-user-approval',
    issueCadence: 'features-and-bugs',
    autonomy: FULL_AUTONOMY_BOUNDARIES,
    writingStyle: {
      plainEnglish: true,
      noEmDashes: false,
    },
  },
  'test-driven': {
    id: 'test-driven',
    label: 'Test-Driven',
    description:
      'Failing test defines behavior first, strict Red-Green-Refactor loop, small green commits, and updates on existing tickets.',
    intentPlanning: 'test-first-plan-multi-file',
    verificationOracle: 'strict-tdd',
    e2eTool: 'none',
    commitCadence: 'small-green-commits',
    pushCadence: 'when-all-tasks-complete',
    prGate: 'pr-with-test-plan',
    prGateCustom: null,
    mergeGate: 'explicit-user-approval',
    issueCadence: 'existing-only',
    autonomy: FULL_AUTONOMY_BOUNDARIES,
    writingStyle: {
      plainEnglish: true,
      noEmDashes: false,
    },
  },
  lightweight: {
    id: 'lightweight',
    label: 'Lightweight',
    description:
      'Direct implementation with brief plans on multi-component changes, standard pre-commit checks, and essential safety boundaries.',
    intentPlanning: 'direct-brief-multi-component',
    verificationOracle: 'project-checks-and-core-tests',
    e2eTool: 'none',
    commitCadence: 'logical-units',
    pushCadence: 'ask-before-push',
    prGate: 'direct-or-fast',
    prGateCustom: null,
    mergeGate: 'ask-before-merge-or-push-main',
    issueCadence: 'none',
    autonomy: LIGHTWEIGHT_AUTONOMY_BOUNDARIES,
    writingStyle: {
      plainEnglish: true,
      noEmDashes: false,
    },
  },
};

export const KNOWN_HARNESSES = [
  'claude-code',
  'antigravity',
  'codex',
  'cursor',
  'github-copilot',
];

export const PROVIDER_SLOTS = {
  source: ['github', 'gitlab', 'bitbucket', 'git-only', 'custom'],
  issues: ['linear', 'github-issues', 'jira', 'local-markdown', 'none', 'custom'],
  ci: ['github-actions', 'gitlab-ci', 'circleci', 'local-only', 'none', 'custom'],
  specs: ['in-repo', 'linear-docs', 'notion', 'confluence', 'none', 'custom'],
};

export function getSpineSelectableSkills(source) {
  const spine = CURATED_SPINES[source];
  if (!spine?.stageSkills) {
    return [];
  }
  const out = [];
  for (const stage of [...SPINE_STAGES, 'utility']) {
    for (const name of spine.stageSkills[stage] ?? []) {
      out.push({ name, stage });
    }
  }
  return out;
}

export function computeSpineStageConflicts(packs) {
  const spinePacks = Array.isArray(packs)
    ? packs.filter(
        (p) =>
          p &&
          p.kind === 'spine' &&
          typeof p.source === 'string' &&
          p.source.trim().length > 0,
      )
    : [];

  if (spinePacks.length < 2) {
    return {
      conflictingStages: [],
      autoAssignedStages: {},
      suggestedPrecedence: null,
    };
  }

  const spineSources = spinePacks.map((p) => p.source.trim());
  const defaultFallback = spineSources.includes('obra/superpowers')
    ? 'obra/superpowers'
    : spineSources[0];

  const conflictingStages = [];
  const autoAssignedStages = {};
  const suggestedPrecedence = {};

  for (const stage of SPINE_STAGES) {
    const owners = [];
    for (const pack of spinePacks) {
      const source = pack.source.trim();
      const curated = CURATED_SPINES[source];
      if (!curated) {
        owners.push(source);
        continue;
      }
      const stageList = curated.stageSkills?.[stage] ?? [];
      const activeList = Array.isArray(pack.selectedSkills)
        ? stageList.filter((name) => pack.selectedSkills.includes(name))
        : stageList;
      if (activeList.length > 0) {
        owners.push(source);
      }
    }

    if (owners.length >= 2) {
      conflictingStages.push(stage);
      suggestedPrecedence[stage] = owners.includes('obra/superpowers')
        ? 'obra/superpowers'
        : owners[0];
    } else if (owners.length === 1) {
      autoAssignedStages[stage] = owners[0];
      suggestedPrecedence[stage] = owners[0];
    } else {
      suggestedPrecedence[stage] = defaultFallback;
    }
  }

  return {
    conflictingStages,
    autoAssignedStages,
    suggestedPrecedence,
  };
}

export function matchesCatalogCondition(condition, inspection) {
  if (!condition) {
    return false;
  }
  const safe = inspection ?? {};
  const langs = Array.isArray(safe.languages) ? safe.languages : [];
  switch (condition) {
    case 'always':
      return true;
    case 'hasFrontendUi':
      return Boolean(safe.hasFrontendUi);
    case 'hasWebSurface':
      return Boolean(safe.hasWebSurface);
    case 'hasPlaywright':
      return Boolean(safe.hasPlaywright);
    case 'hasPlaywrightOrWeb':
      return Boolean(safe.hasPlaywright || safe.hasWebSurface);
    case 'hasReact':
      return Boolean(safe.stackSignals?.hasReact ?? safe.hasReact);
    case 'hasPostgres':
      return Boolean(safe.stackSignals?.hasPostgres ?? safe.hasPostgres);
    case 'hasReactNative':
      return Boolean(safe.stackSignals?.hasReactNative ?? safe.hasReactNative);
    case 'hasSwift':
      return Boolean(safe.stackSignals?.hasSwift ?? safe.hasSwift);
    case 'hasPython':
      return langs.includes('python');
    case 'hasGo':
      return langs.includes('go');
    case 'hasRust':
      return langs.includes('rust');
    default:
      return Boolean(safe[condition]);
  }
}
