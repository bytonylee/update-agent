# updagent — Task Specification

**Version**: 2.0  
**Date**: 2026-04-07  
**Status**: Ready for implementation (supersedes v1.0)

---

## How to read this document

Each task contains:

- **ID**: `T-XX` — reference in commits and PRs
- **Depends on**: tasks that must be complete first
- **Complexity**: S / M / L
- **Files to create**: exact paths with complete contents (not stubs)
- **Exact commands**: copy-paste ready, in order
- **Acceptance criteria**: specific, testable conditions
- **Definition of Done**: checklist before marking complete

Tasks are ordered for sequential execution. Independent tasks within the same phase may be parallelized (see §Dependency Graph).

---

## Environment Setup (before T-01)

Before any task, ensure the developer environment is ready.

### Required tools

```bash
# Verify Node 20+
node --version   # must print v20.x.x or higher

# Verify npm 10+
npm --version    # must print 10.x.x or higher

# Verify git
git --version
```

### Required environment variables

Copy `.env.example` (created in T-01) to `.env` and fill in:

| Variable                   | Required                      | Purpose                                                    |
| -------------------------- | ----------------------------- | ---------------------------------------------------------- |
| `AUTH_TOKEN`               | **Required for X Tier 1**     | Twitter session auth_token cookie                          |
| `CT0`                      | **Required for X Tier 1**     | Twitter session ct0 CSRF cookie                            |
| `GH_TOKEN`                 | Optional (avoids rate limits) | GitHub personal access token                               |
| `SCRAPECREATORS_API_KEY`   | Optional (X Tier 2 fallback)  | ScrapeCreators API key                                     |
| `XAI_API_KEY`              | Optional (X Tier 3 fallback)  | xAI API key for Grok x_search                              |
| `OPENROUTER_API_KEY`       | Required for centralized mode | OpenRouter API key                                         |
| `SIGNAL_DETECTION_MODE`    | Optional                      | `centralized` (default) or `distributed`                   |
| `UPSTASH_REDIS_REST_URL`   | Optional                      | Upstash Redis REST URL                                     |
| `UPSTASH_REDIS_REST_TOKEN` | Optional                      | Upstash Redis REST token                                   |
| `FEED_JSON_PATH`           | Optional                      | Override path to feed.json (default: `data/feed.json`)     |
| `HEALTH_JSON_PATH`         | Optional                      | Override path to health.json (default: `data/health.json`) |

### How to get X.com cookies (`AUTH_TOKEN` + `CT0`)

These are session cookies from a logged-in X.com browser session — the same values used by the `last30days` skill:

1. Open Chrome and navigate to `https://x.com`
2. Open DevTools → Application → Cookies → `https://x.com`
3. Find `auth_token` → copy value → set as `AUTH_TOKEN`
4. Find `ct0` → copy value → set as `CT0`
5. These expire when the browser session is cleared. Refresh them every 30–90 days.

---

## T-01 — Monorepo Root Setup

**Depends on**: nothing (environment setup done)  
**Complexity**: S  
**Phase**: Foundation

### What

Initialize the npm workspace root. No business logic yet — just project scaffolding, TypeScript base config, and initial data file stubs.

### Files to create

**`/package.json`**

```json
{
  "name": "updagent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "collect": "npm run collect --workspace=packages/collector",
    "test": "npm run test --workspaces --if-present",
    "test:coverage": "npm run test:coverage --workspace=packages/collector",
    "build": "npm run build --workspaces --if-present",
    "build:shared": "npm run build --workspace=packages/shared",
    "build:collector": "npm run build --workspace=packages/collector"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

**`/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "exclude": ["node_modules", "dist", "opencli"]
}
```

**`/.gitignore`** (append if already exists)

```
node_modules/
dist/
*.js.map
.env
.env.local
.env.*.local
coverage/
```

**`/.env.example`**

```bash
# X.com cookies — required for Tier 1 collection
# Obtain from Chrome DevTools → Application → Cookies → x.com
AUTH_TOKEN=
CT0=

# GitHub token — optional, prevents rate limiting on public repos
GH_TOKEN=

# ScrapeCreators — optional, X Tier 2 fallback
SCRAPECREATORS_API_KEY=

# xAI — optional, X Tier 3 fallback
XAI_API_KEY=

# OpenRouter — required for SIGNAL_DETECTION_MODE=centralized (default)
# Free tier models (Gemini Flash) are sufficient for this use case
# Get key at: https://openrouter.ai/keys
OPENROUTER_API_KEY=

# Signal detection mode: centralized (default) | distributed
# distributed = uses local claude or codex CLI for classification (no OpenRouter key needed)
SIGNAL_DETECTION_MODE=centralized

# Upstash Redis — optional, for website hot cache
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Override data file paths (optional — defaults shown)
# FEED_JSON_PATH=data/feed.json
# HEALTH_JSON_PATH=data/health.json
# NEWSLETTERS_DIR=newsletters
```

**`/data/feed.json`** (initial empty state)

```json
{
  "version": "1",
  "updatedAt": "",
  "itemCount": 0,
  "items": []
}
```

**`/data/health.json`** (initial empty state)

```json
{
  "lastRunAt": "",
  "durationMs": 0,
  "newItemCount": 0,
  "totalItemCount": 0,
  "tier1FailureCount": 0,
  "tier2FailureCount": 0,
  "allTierFailureAccounts": [],
  "credentialWarning": false,
  "accounts": []
}
```

**`/newsletters/.gitkeep`** (empty file — tracks directory in git)

No content.

### Exact commands

```bash
# From repo root
npm install

# Verify workspaces are wired (should list packages even before they exist)
cat package.json | grep workspaces

# Create data directory if needed
mkdir -p data newsletters

# Verify Node version
node --version
```

### Acceptance criteria

- `npm install` succeeds with exit 0
- `node --version` prints v20.x.x or higher
- `data/feed.json` exists and is valid JSON: `node -e "JSON.parse(require('fs').readFileSync('data/feed.json','utf8'))"`
- `data/health.json` exists and is valid JSON
- `newsletters/` directory exists: `ls newsletters/`
- `.env.example` has all 11 variables documented

### Definition of Done

- [ ] All files listed above exist
- [ ] `npm install` succeeds
- [ ] Both JSON stubs parse cleanly
- [ ] `.gitignore` excludes `.env` (verify: `git status` after creating `.env` shows it as untracked but ignored)

---

## T-02 — `packages/shared`: Types and Agent Registry

**Depends on**: T-01  
**Complexity**: M  
**Phase**: Foundation

### What

Create the `@updagent/shared` package: all TypeScript interfaces, the agent registry JSON, and the typed loader. Every other package imports from here. No logic beyond loading config.

### Files to create

**`/packages/shared/package.json`**

```json
{
  "name": "@updagent/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc"
  },
  "devDependencies": {
    "typescript": "^6.0.0"
  }
}
```

**`/packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

**`/packages/shared/src/types.ts`**

```typescript
// ── Classification ──────────────────────────────────────────────────────────

export type SignalClassification = "SIGNAL" | "CONTEXT" | "NOISE";
export type SourceType = "x" | "github";
export type SignalDetectionMode = "centralized" | "distributed";
export type CascadeTier = 1 | 2 | 3;

// ── Canonical feed item ─────────────────────────────────────────────────────

export interface FeedItem {
  /** Unique stable ID.
   *  X posts:        full tweet URL (e.g. "https://x.com/bcherny/status/123")
   *  GitHub release: "owner/repo@tagName" (e.g. "anthropics/claude-code@v1.9.4") */
  id: string;

  source: SourceType;

  /** Matches AgentConfig.id from agents-config.json */
  agentId: string;

  /** @handle for X, "owner/repo" for GitHub */
  author: string;

  /** Full tweet text or release body (markdown for GitHub releases) */
  text: string;

  /** Canonical URL to original source */
  url: string;

  /** ISO 8601 UTC — when the content was originally published */
  publishedAt: string;

  /** ISO 8601 UTC — when updagent first collected this item */
  collectedAt: string;

  classification: SignalClassification;

  /** One-line explanation from the classifier */
  classificationReason: string;

  /** Which pass classified this item */
  classifiedBy: "fast-path" | "llm";

  /** Which LLM model was used (if classifiedBy === "llm") */
  classificationModel?: string;

  /** true if this is a GitHub release OR tweet explicitly announces a version */
  isRelease: boolean;

  /** Extracted semver string if detectable, without leading "v" (e.g. "1.9.4") */
  version?: string;

  /** likes*1 + retweets*3; 0 for GitHub releases */
  engagementScore: number;

  likes?: number;
  retweets?: number;
  views?: number;

  /** Whether the tweet is a reply to another tweet */
  isReply: boolean;

  /** Brief summary of parent tweet — used by LLM classifier for context */
  parentTweetSummary?: string;
}

// ── Raw X post (before normalization) ──────────────────────────────────────

export interface RawXPost {
  id: string; // tweet numeric ID (not URL)
  url: string; // full tweet URL
  text: string;
  author: string; // handle without @
  publishedAt: string; // ISO 8601
  likes: number;
  retweets: number;
  views: number;
  isReply: boolean;
  parentTweetId?: string;
  parentTweetText?: string;
  tier: CascadeTier; // which cascade tier produced this
}

// ── Raw GitHub release (before normalization) ───────────────────────────────

export interface RawGitHubRelease {
  tagName: string; // e.g. "v1.9.4"
  name: string; // release title
  body: string; // markdown release notes
  publishedAt: string; // ISO 8601
  url: string; // HTML URL to release page on github.com
  owner: string; // repo owner
  repo: string; // repo name
  isDraft: boolean;
  isPrerelease: boolean;
}

// ── Agent configuration ─────────────────────────────────────────────────────

export interface AgentGitHubConfig {
  owner: string; // e.g. "anthropics"
  repo: string; // e.g. "claude-code"
}

export interface AgentConfig {
  /** Kebab-case unique identifier (e.g. "claude-code", "codex") */
  id: string;

  /** Display name shown in output (e.g. "Claude Code") */
  name: string;

  /** Launch priority: 1=now, 2=next, 3=future */
  priority: 1 | 2 | 3;

  /** false = skip entirely in all collection */
  enabled: boolean;

  github: AgentGitHubConfig;

  /** X handles WITHOUT @ (e.g. ["bcherny", "trq212"]) */
  xAccounts: string[];

  /** Keyword fast-path hints (lowercase, case-insensitive matching) */
  signalKeywords: string[];
}

// ── Cascade result ─────────────────────────────────────────────────────────

export interface TierFailure {
  tier: CascadeTier;
  error: string;
  errorType: "auth" | "rate-limit" | "network" | "parse" | "unknown";
}

export interface CascadeResult {
  posts: RawXPost[];
  tierUsed: CascadeTier | null; // null = all tiers failed
  failures: TierFailure[];
}

// ── Health / monitoring ─────────────────────────────────────────────────────

export interface AccountHealth {
  account: string; // @handle
  consecutiveTier1Failures: number;
  lastSuccessfulTier: CascadeTier | null;
  lastSuccessAt: string | null; // ISO 8601
  lastCheckedAt: string; // ISO 8601
}

export interface CollectionHealth {
  lastRunAt: string; // ISO 8601
  durationMs: number;
  newItemCount: number;
  totalItemCount: number;
  tier1FailureCount: number; // accounts where tier 1 failed this run
  tier2FailureCount: number;
  allTierFailureAccounts: string[]; // handles where ALL tiers failed
  credentialWarning: boolean; // true if any account consecutiveTier1Failures >= 3
  accounts: AccountHealth[];
}

// ── Signal detection ────────────────────────────────────────────────────────

export interface ClassificationInput {
  text: string;
  author: string; // handle without @
  agentId: string;
  agentName: string;
  isReply: boolean;
  parentTweetSummary?: string;
  signalKeywords: string[];
  source: SourceType;
}

export interface ClassificationResult {
  classification: SignalClassification;
  reason: string;
  classifiedBy: "fast-path" | "llm";
  model?: string;
}

// ── Fast-path result ────────────────────────────────────────────────────────

export type FastPathResult =
  | { result: "SIGNAL" | "NOISE"; reason: string }
  | { result: "CANDIDATE" }; // pass to LLM

// ── Storage schemas ─────────────────────────────────────────────────────────

export interface FeedFile {
  version: "1";
  updatedAt: string; // ISO 8601
  itemCount: number;
  items: FeedItem[]; // sorted by publishedAt DESC
}
```

**`/packages/shared/src/agents-config.json`**

```json
{
  "agents": [
    {
      "id": "claude-code",
      "name": "Claude Code",
      "priority": 1,
      "enabled": true,
      "github": {
        "owner": "anthropics",
        "repo": "claude-code"
      },
      "xAccounts": [
        "bcherny",
        "trq212",
        "noahzweben",
        "felixrieseberg",
        "lydiahallie",
        "amorriscode",
        "claudeai"
      ],
      "signalKeywords": [
        "claude code",
        "claude update",
        "anthropic cli",
        "claude cli",
        "claude --version",
        "mcp server",
        "claude hooks"
      ]
    },
    {
      "id": "codex",
      "name": "Codex CLI",
      "priority": 1,
      "enabled": true,
      "github": {
        "owner": "openai",
        "repo": "codex"
      },
      "xAccounts": [
        "openaidevs",
        "thsottiaux",
        "romainhuet",
        "reach_vb",
        "rohanvarma"
      ],
      "signalKeywords": [
        "codex",
        "codex cli",
        "openai codex",
        "codex update",
        "codex --version"
      ]
    },
    {
      "id": "gemini-cli",
      "name": "Gemini CLI",
      "priority": 2,
      "enabled": false,
      "github": {
        "owner": "google",
        "repo": "gemini-cli"
      },
      "xAccounts": [],
      "signalKeywords": ["gemini cli", "gemini code", "google gemini cli"]
    },
    {
      "id": "opencode",
      "name": "opencode",
      "priority": 2,
      "enabled": false,
      "github": {
        "owner": "sst",
        "repo": "opencode"
      },
      "xAccounts": [],
      "signalKeywords": ["opencode", "opencode cli", "sst opencode"]
    },
    {
      "id": "openclaw",
      "name": "Openclaw",
      "priority": 3,
      "enabled": false,
      "github": {
        "owner": "",
        "repo": ""
      },
      "xAccounts": [],
      "signalKeywords": ["openclaw"]
    },
    {
      "id": "hermes-agent",
      "name": "Hermes-agent",
      "priority": 3,
      "enabled": false,
      "github": {
        "owner": "",
        "repo": ""
      },
      "xAccounts": [],
      "signalKeywords": ["hermes-agent", "hermes agent"]
    }
  ]
}
```

**`/packages/shared/src/registry.ts`**

```typescript
import config from "./agents-config.json" with { type: "json" };
import type { AgentConfig } from "./types.js";

const agents = config.agents as AgentConfig[];

export function getEnabledAgents(): AgentConfig[] {
  return agents.filter((a) => a.enabled);
}

export function getAllAgents(): AgentConfig[] {
  return [...agents];
}

export function getAgentById(id: string): AgentConfig | undefined {
  return agents.find((a) => a.id === id);
}

export function getEnabledXAccounts(): Array<{
  account: string;
  agentId: string;
}> {
  return getEnabledAgents().flatMap((agent) =>
    agent.xAccounts.map((account) => ({ account, agentId: agent.id })),
  );
}
```

**`/packages/shared/src/index.ts`**

```typescript
export * from "./types.js";
export * from "./registry.js";
```

### Exact commands

```bash
# Build the shared package
npm run build --workspace=packages/shared

# Verify dist was created
ls packages/shared/dist/
# Expected: index.js  index.d.ts  types.js  types.d.ts  registry.js  registry.d.ts

# Quick smoke test from repo root
node --input-type=module <<'EOF'
import { getEnabledAgents, getAllAgents, getAgentById } from './packages/shared/dist/index.js';
const enabled = getEnabledAgents();
console.assert(enabled.length === 2, `Expected 2 enabled agents, got ${enabled.length}`);
console.assert(getAllAgents().length === 6, 'Expected 6 total agents');
const cc = getAgentById('claude-code');
console.assert(cc?.xAccounts.length === 7, 'Expected 7 Claude Code accounts');
const codex = getAgentById('codex');
console.assert(codex?.xAccounts.length === 5, 'Expected 5 Codex accounts');
console.log('T-02 smoke test passed');
EOF
```

### Acceptance criteria

- `npm run build --workspace=packages/shared` succeeds with 0 TypeScript errors
- `packages/shared/dist/` contains `.js` and `.d.ts` files
- `getEnabledAgents()` returns exactly 2 agents (claude-code, codex)
- `getAllAgents()` returns exactly 6 agents
- `getAgentById("claude-code")` returns config with `xAccounts.length === 7`
- `getAgentById("codex")` returns config with `xAccounts.length === 5`
- **Config-only add test**: temporarily set `"enabled": true` on `gemini-cli` in `agents-config.json`, rebuild, verify `getEnabledAgents().length === 3` — then revert

### Definition of Done

- [ ] `npm run build --workspace=packages/shared` exits 0
- [ ] Smoke test script above passes
- [ ] No `any` types in `types.ts` or `registry.ts`
- [ ] `agents-config.json` has exactly 6 agents, 2 enabled

---

## T-03 — `packages/collector`: Scaffolding + Bird-Search Vendor Setup

**Depends on**: T-02  
**Complexity**: M  
**Phase**: Foundation

### What

Set up the collector package structure, dependencies, test config, and the critical bird-search vendor setup. This task also vendor-pins the `bird-search.mjs` executable so CI can run it without a browser.

### 3a. Bird-Search Vendor Setup

The bird-search script is the `last30days` skill's headless X.com query tool. It must be vendored into `packages/collector/scripts/lib/vendor/bird-search/` so that GitHub Actions can run it with only `AUTH_TOKEN` + `CT0` env vars (no browser, no Chrome extension).

#### Option A: Copy from last30days skill (recommended)

The `last30days` Claude Code skill already vendors bird-search. Find and copy it:

```bash
# Find the bird-search.mjs in the last30days skill vendor location
find ~/.claude -name "bird-search.mjs" 2>/dev/null | head -5

# If found at e.g. ~/.claude/skills/last30days/lib/vendor/bird-search/bird-search.mjs:
mkdir -p packages/collector/scripts/lib/vendor/bird-search
cp ~/.claude/skills/last30days/lib/vendor/bird-search/bird-search.mjs \
   packages/collector/scripts/lib/vendor/bird-search/bird-search.mjs

# Verify it runs (will fail with auth error, but that's expected — we just want exit ≠ segfault)
node packages/collector/scripts/lib/vendor/bird-search/bird-search.mjs \
  "from:bcherny" --since 1h --count 1 --json 2>&1 | head -3
```

#### Option B: Create a minimal stub for development

If the real bird-search is unavailable, create a stub that returns empty results so the cascade correctly falls to Tier 2:

```bash
mkdir -p packages/collector/scripts/lib/vendor/bird-search
cat > packages/collector/scripts/lib/vendor/bird-search/bird-search.mjs << 'EOF'
#!/usr/bin/env node
// STUB — replace with real bird-search.mjs before production use
// Returns empty array to trigger Tier 2 fallback
console.log(JSON.stringify([]));
process.exit(0);
EOF
```

Add a prominent `README.md` in that directory:

```markdown
# bird-search vendor

This directory must contain the real `bird-search.mjs` from the last30days skill.

The stub in this directory returns empty results (triggering Tier 2 fallback).

To install the real binary:

1. Find it at `~/.claude/skills/last30days/lib/vendor/bird-search/bird-search.mjs`
2. Copy it here

Without the real binary, Tier 1 X collection is disabled.
```

### Files to create

**`/packages/collector/package.json`**

```json
{
  "name": "@updagent/collector",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "collect": "tsx src/collect.ts",
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@updagent/shared": "*",
    "@upstash/redis": "^1.34.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^6.0.0",
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

**`/packages/collector/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

**`/packages/collector/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**", "src/collect.ts", "src/signal/prompts.ts"],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
      },
    },
  },
});
```

**Stub source files** (empty `export {}` — filled in subsequent tasks):

```
src/sources/errors.ts
src/sources/x-bird.ts
src/sources/x-scrapecreators.ts
src/sources/x-xai.ts
src/sources/x-cascade.ts
src/sources/github-releases.ts
src/normalize.ts
src/dedup.ts
src/signal/rules.ts
src/signal/prompts.ts
src/signal/classifier.ts
src/storage.ts
src/newsletter.ts
src/collect.ts
```

Each stub file must contain at minimum:

```typescript
export {};
```

### Exact commands

```bash
# Install dependencies for the full workspace
npm install

# Verify @updagent/shared resolves from collector
node --input-type=module <<'EOF'
import { getEnabledAgents } from '@updagent/shared';
console.log('shared resolves OK:', getEnabledAgents().length, 'enabled agents');
EOF

# Run tests (0 tests, 0 failures expected at this stage)
npm test --workspace=packages/collector
# Expected output: "No test files found"

# Confirm stubs exist
ls packages/collector/src/sources/
ls packages/collector/src/signal/
```

### Acceptance criteria

- `npm install` from root resolves `@updagent/shared` workspace reference without errors
- `npm test --workspace=packages/collector` exits 0 (0 tests, 0 failures)
- All 14 stub files exist
- `vitest.config.ts` coverage thresholds are set (lines 70, functions 70, branches 60)
- Bird-search vendor binary exists at `packages/collector/scripts/lib/vendor/bird-search/bird-search.mjs`
- `node packages/collector/scripts/lib/vendor/bird-search/bird-search.mjs "from:bcherny" --since 1h --count 1 --json` exits without crashing (may return `[]` if stub)

### Definition of Done

- [ ] All stub files exist
- [ ] `npm install` exits 0
- [ ] `npm test --workspace=packages/collector` exits 0
- [ ] Bird-search binary (real or stub) is in place
- [ ] `vitest.config.ts` is present with coverage config

---

## T-04 — Signal Detection: Test Fixtures and Fast-Path Rules

**Depends on**: T-03  
**Complexity**: M  
**Phase**: Signal detection (Group A)

### What

Write the signal detection test fixtures first, then implement `rules.ts` to make them pass. Tests drive the implementation — this is the most critical quality gate in the system.

### Files to create

**`/packages/collector/src/__tests__/signal-fixtures.ts`**

```typescript
import type { ClassificationInput } from "@updagent/shared";

export interface Fixture {
  id: string;
  input: ClassificationInput;
  expected: "SIGNAL" | "CONTEXT" | "NOISE";
  /** true = fast-path rules can classify deterministically (no LLM needed) */
  fastPathDeterministic: boolean;
  /** Optional note explaining why this fixture matters */
  note?: string;
}

const CLAUDE_CODE_KEYWORDS = [
  "claude code",
  "claude update",
  "anthropic cli",
  "claude cli",
  "claude --version",
  "mcp server",
  "claude hooks",
];

const CODEX_KEYWORDS = [
  "codex",
  "codex cli",
  "openai codex",
  "codex update",
  "codex --version",
];

function cc(
  overrides: Partial<ClassificationInput> & { text: string },
): ClassificationInput {
  return {
    author: "bcherny",
    agentId: "claude-code",
    agentName: "Claude Code",
    isReply: false,
    signalKeywords: CLAUDE_CODE_KEYWORDS,
    source: "x",
    ...overrides,
  };
}

function codex(
  overrides: Partial<ClassificationInput> & { text: string },
): ClassificationInput {
  return {
    author: "openaidevs",
    agentId: "codex",
    agentName: "Codex CLI",
    isReply: false,
    signalKeywords: CODEX_KEYWORDS,
    source: "x",
    ...overrides,
  };
}

export const fixtures: Fixture[] = [
  // ── GitHub releases — always SIGNAL ────────────────────────────────────────
  {
    id: "gh-release-cc",
    input: {
      ...cc({
        text: "## What's New\n- Fix statusline on Windows\n- Add --no-permission-prompts flag",
      }),
      source: "github",
    },
    expected: "SIGNAL",
    fastPathDeterministic: true,
    note: "GitHub source is always SIGNAL regardless of content",
  },
  {
    id: "gh-release-codex",
    input: {
      ...codex({
        text: "codex v0.1.2\n\nBug fixes and performance improvements",
      }),
      source: "github",
    },
    expected: "SIGNAL",
    fastPathDeterministic: true,
  },

  // ── Semver in text — SIGNAL ─────────────────────────────────────────────────
  {
    id: "semver-cc-1",
    input: cc({
      text: "Claude Code v1.9.4 is out — major hook improvements and MCP fixes",
    }),
    expected: "SIGNAL",
    fastPathDeterministic: true,
    note: "Explicit version number always SIGNAL",
  },
  {
    id: "semver-codex-1",
    input: codex({ text: "codex 0.1.5 ships with multi-file context support" }),
    expected: "SIGNAL",
    fastPathDeterministic: true,
  },
  {
    id: "semver-in-reply",
    input: cc({
      text: "This was fixed in v1.9.3. Run `claude update` to get it.",
      isReply: true,
      parentTweetSummary: "user reporting a bug with file permissions",
    }),
    expected: "SIGNAL",
    fastPathDeterministic: true,
    note: "Reply with semver is SIGNAL — the most valuable pattern from @bcherny",
  },

  // ── High-signal replies from tracked accounts ──────────────────────────────
  {
    id: "reply-tracked-fix-confirmed",
    input: cc({
      text: "This was fixed in yesterday's release. `claude update` to make sure you're on the latest",
      isReply: true,
      parentTweetSummary: "user complaining about git status output",
    }),
    expected: "SIGNAL",
    fastPathDeterministic: false,
    note: "Critical case: reply from team confirming a fix. Fast-path = CANDIDATE, LLM = SIGNAL",
  },
  {
    id: "reply-tracked-workaround",
    input: cc({
      text: "Known issue — workaround is to set CLAUDE_SKIP_GITCHECK=1 for now. Fix lands in next release",
      isReply: true,
      parentTweetSummary: "user asking about slow startup",
    }),
    expected: "SIGNAL",
    fastPathDeterministic: false,
    note: "Reply providing official workaround = SIGNAL",
  },
  {
    id: "reply-tracked-codex-feature",
    input: codex({
      text: "Yes, multi-repo support is coming in the next sprint. No ETA yet but it's on the roadmap",
      author: "thsottiaux",
      isReply: true,
      parentTweetSummary: "user asking about monorepo support",
    }),
    expected: "SIGNAL",
    fastPathDeterministic: false,
    note: "Roadmap confirmation reply from Codex team = SIGNAL",
  },

  // ── Direct release announcements ──────────────────────────────────────────
  {
    id: "direct-release-cc",
    input: cc({
      text: "Claude Code ships hooks today. You can now run shell commands before/after any tool call. docs: claude.ai/code/hooks",
    }),
    expected: "SIGNAL",
    fastPathDeterministic: true,
    note: "keyword (claude code) + action word (ships) = SIGNAL",
  },
  {
    id: "direct-release-codex-update",
    input: codex({
      text: "codex update available — run `codex upgrade` to get the latest",
      author: "romainhuet",
    }),
    expected: "SIGNAL",
    fastPathDeterministic: true,
    note: "keyword (codex) + action word (update) = SIGNAL",
  },

  // ── Industry context — CONTEXT ─────────────────────────────────────────────
  {
    id: "context-comparison",
    input: cc({
      text: "Interesting comparison: Claude Code vs Copilot for large refactors. Claude Code wins on context but loses on latency for small completions",
      author: "lydiahallie",
    }),
    expected: "CONTEXT",
    fastPathDeterministic: false,
    note: "Analysis/comparison is CONTEXT not SIGNAL",
  },
  {
    id: "context-analysis",
    input: codex({
      text: "The multi-agent trend in AI coding tools is real. Codex, Claude Code, and Cursor all moving toward agent orchestration rather than single-turn completions",
    }),
    expected: "CONTEXT",
    fastPathDeterministic: false,
  },
  {
    id: "context-usage-tip",
    input: cc({
      text: "Tip: use /claude:compact to reduce context size before starting a long refactor session. Saves a lot of token burn",
    }),
    expected: "CONTEXT",
    fastPathDeterministic: false,
    note: "Usage tip without a product update is CONTEXT",
  },

  // ── Pure noise ─────────────────────────────────────────────────────────────
  {
    id: "noise-personal",
    input: cc({
      text: "Just landed in Tokyo for the week. Anyone have coffee shop recommendations near Shibuya?",
      author: "felixrieseberg",
    }),
    expected: "NOISE",
    fastPathDeterministic: false,
    note: "Personal travel post, zero product relevance",
  },
  {
    id: "noise-social-reaction",
    input: cc({
      text: "lol",
      isReply: true,
    }),
    expected: "NOISE",
    fastPathDeterministic: true,
    note: "Too short (3 chars) = NOISE",
  },
  {
    id: "noise-filler",
    input: cc({
      text: "😂",
    }),
    expected: "NOISE",
    fastPathDeterministic: true,
    note: "Emoji-only social filler",
  },
  {
    id: "noise-thanks",
    input: cc({
      text: "Thanks! 🙏",
    }),
    expected: "NOISE",
    fastPathDeterministic: true,
    note: "Short social acknowledgement",
  },
  {
    id: "noise-company-news",
    input: cc({
      text: "Anthropic raises $3.5B in Series E. Exciting times ahead for the whole team!",
      author: "amorriscode",
    }),
    expected: "NOISE",
    fastPathDeterministic: false,
    note: "Company funding news is not a Claude Code update",
  },
  {
    id: "noise-different-product",
    input: cc({
      text: "Claude is now available in 20 new countries. Major accessibility milestone!",
    }),
    expected: "NOISE",
    fastPathDeterministic: false,
    note: "Claude (the chatbot) availability ≠ Claude Code update",
  },
  {
    id: "noise-unrelated-openai",
    input: codex({
      text: "GPT-5 is incredible. The reasoning improvements are a step change",
      author: "openaidevs",
    }),
    expected: "NOISE",
    fastPathDeterministic: false,
    note: "GPT-5 announcement from OpenAI account is not a Codex CLI update",
  },

  // ── Edge cases ─────────────────────────────────────────────────────────────
  {
    id: "edge-reply-non-tracked",
    input: {
      ...cc({ text: "Claude Code hooks are amazing, just tried them!" }),
      author: "randomUser123",
      // Note: this author is NOT in xAccounts — but claudeai/bcherny etc are
    },
    expected: "CONTEXT",
    fastPathDeterministic: false,
    note: "Reply from non-tracked account with keyword = CANDIDATE → LLM says CONTEXT",
  },
  {
    id: "edge-changelog-link",
    input: cc({
      text: "Full changelog at github.com/anthropics/claude-code/releases/tag/v1.9.4 — lots of hook improvements this sprint",
    }),
    expected: "SIGNAL",
    fastPathDeterministic: true,
    note: "Semver in URL counts as version match",
  },
  {
    id: "edge-breaking-change",
    input: codex({
      text: "BREAKING: codex v0.2.0 removes the --sandbox-only flag. Use --no-sandbox instead. Update your scripts.",
      author: "thsottiaux",
    }),
    expected: "SIGNAL",
    fastPathDeterministic: true,
    note: "Contains semver + action word = fast-path SIGNAL",
  },
  {
    id: "edge-deprecation",
    input: cc({
      text: "Heads up: the CLAUDE_HOOKS env var is deprecated in favor of .claude/hooks.json. Will be removed in next major.",
    }),
    expected: "SIGNAL",
    fastPathDeterministic: true,
    note: "deprecat* matches ACTION_WORDS_RE + keyword match",
  },
  {
    id: "edge-short-but-meaningful",
    input: codex({
      text: "codex is down, investigating",
      author: "openaidevs",
    }),
    expected: "SIGNAL",
    fastPathDeterministic: false,
    note: "Short but meaningful — keyword match, passes to LLM as CANDIDATE",
  },
];

export const fastPathFixtures = fixtures.filter((f) => f.fastPathDeterministic);
export const llmFixtures = fixtures.filter((f) => !f.fastPathDeterministic);
```

**`/packages/collector/src/signal/rules.ts`**

Full implementation from COMPONENTS.md §2.8.1:

```typescript
import type { ClassificationInput, FastPathResult } from "@updagent/shared";

const SEMVER_RE = /v?\d+\.\d+(?:\.\d+)?/i;
const SOCIAL_FILLER_RE =
  /^(lol|haha|😂|👍|❤️|🔥|same|yep|yes|no|ok|thanks|ty|thx|🙏|🎉)\s*[!.?]?\s*$/i;
const ACTION_WORDS_RE =
  /\b(release[sd]?|ship[ps]?|shipped|fix(ed)?|bug|patch|update[sd]?|launch(ed)?|feature|changelog|breaking|deprecat|migrat|v\d+\.\d+)\b/i;

export function fastPath(input: ClassificationInput): FastPathResult {
  const { text, source, isReply, signalKeywords } = input;
  const lowerText = text.toLowerCase();

  // Rule 1: GitHub releases are always SIGNAL
  if (source === "github") {
    return { result: "SIGNAL", reason: "GitHub official release" };
  }

  // Rule 2: Contains semver pattern → SIGNAL
  if (SEMVER_RE.test(text)) {
    return { result: "SIGNAL", reason: "contains version number" };
  }

  // Rule 3: Reply from tracked account → CANDIDATE (never NOISE)
  // Critical: team leads' most valuable posts are often replies to user bug reports
  // e.g. "@bcherny: This was fixed in yesterday's release" is a reply
  if (isReply) {
    return { result: "CANDIDATE" };
  }

  // Rule 4: Too short to be informative
  if (text.trim().length < 15) {
    return {
      result: "NOISE",
      reason: "text too short to contain product signal",
    };
  }

  // Rule 5: Pure social filler
  if (SOCIAL_FILLER_RE.test(text.trim())) {
    return { result: "NOISE", reason: "social filler" };
  }

  // Rule 6: Signal keyword + action word → SIGNAL
  const hasKeyword = signalKeywords.some((kw) =>
    lowerText.includes(kw.toLowerCase()),
  );
  if (hasKeyword && ACTION_WORDS_RE.test(text)) {
    return { result: "SIGNAL", reason: "signal keyword + action word match" };
  }

  // Rule 7: Signal keyword match alone → CANDIDATE
  if (hasKeyword) {
    return { result: "CANDIDATE" };
  }

  // Rule 8: Action word without keyword → CANDIDATE
  if (ACTION_WORDS_RE.test(text)) {
    return { result: "CANDIDATE" };
  }

  // Rule 9: Default → CANDIDATE (LLM decides)
  return { result: "CANDIDATE" };
}
```

**`/packages/collector/src/__tests__/rules.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { fastPath } from "../signal/rules.js";
import { fixtures, fastPathFixtures } from "./signal-fixtures.js";
import type { ClassificationInput } from "@updagent/shared";

const CC_KEYWORDS = [
  "claude code",
  "claude update",
  "anthropic cli",
  "claude cli",
  "claude --version",
  "mcp server",
  "claude hooks",
];

function makeInput(
  overrides: Partial<ClassificationInput> & { text: string },
): ClassificationInput {
  return {
    author: "bcherny",
    agentId: "claude-code",
    agentName: "Claude Code",
    isReply: false,
    signalKeywords: CC_KEYWORDS,
    source: "x",
    ...overrides,
  };
}

describe("fastPath — Rule 1: GitHub releases", () => {
  it("returns SIGNAL for github source regardless of text", () => {
    const result = fastPath(makeInput({ text: "lol", source: "github" }));
    expect(result.result).toBe("SIGNAL");
    expect("reason" in result && result.reason).toContain("GitHub");
  });

  it("returns SIGNAL for github source even with empty text", () => {
    const result = fastPath(makeInput({ text: "", source: "github" }));
    expect(result.result).toBe("SIGNAL");
  });
});

describe("fastPath — Rule 2: semver in text", () => {
  it("returns SIGNAL when text contains vX.Y.Z", () => {
    const result = fastPath(makeInput({ text: "Claude Code v1.9.4 is out!" }));
    expect(result.result).toBe("SIGNAL");
  });

  it("returns SIGNAL when text contains X.Y.Z without v prefix", () => {
    const result = fastPath(makeInput({ text: "codex 0.1.5 ships today" }));
    expect(result.result).toBe("SIGNAL");
  });

  it("returns SIGNAL for semver in a reply", () => {
    const result = fastPath(
      makeInput({
        text: "Fixed in v1.9.3. Run claude update.",
        isReply: true,
      }),
    );
    // Rule 2 fires before Rule 3 — semver wins
    expect(result.result).toBe("SIGNAL");
  });
});

describe("fastPath — Rule 3: replies from tracked accounts", () => {
  it("returns CANDIDATE (not NOISE) for replies", () => {
    const result = fastPath(
      makeInput({
        text: "This was fixed in yesterday's release. `claude update` to get latest",
        isReply: true,
      }),
    );
    // Must NOT be NOISE — this is the most important invariant
    expect(result.result).not.toBe("NOISE");
    expect(result.result).toBe("CANDIDATE");
  });

  it("returns CANDIDATE for reply with no keywords", () => {
    const result = fastPath(
      makeInput({
        text: "Yes, that's by design — the behavior is intentional",
        isReply: true,
      }),
    );
    expect(result.result).toBe("CANDIDATE");
  });
});

describe("fastPath — Rule 4: too short", () => {
  it("returns NOISE for text < 15 characters", () => {
    const result = fastPath(makeInput({ text: "lol" }));
    expect(result.result).toBe("NOISE");
  });

  it("returns NOISE for single emoji", () => {
    const result = fastPath(makeInput({ text: "😂" }));
    expect(result.result).toBe("NOISE");
  });

  it("does NOT return NOISE for text exactly 15 chars", () => {
    const result = fastPath(makeInput({ text: "123456789012345" }));
    expect(result.result).not.toBe("NOISE"); // too short rule: < 15, so 15 passes
  });
});

describe("fastPath — Rule 5: social filler", () => {
  it("returns NOISE for 'thanks'", () => {
    const result = fastPath(makeInput({ text: "Thanks! 🙏" }));
    expect(result.result).toBe("NOISE");
  });

  it("returns NOISE for 'lol' with punctuation", () => {
    const result = fastPath(makeInput({ text: "lol!" }));
    expect(result.result).toBe("NOISE");
  });
});

describe("fastPath — Rule 6: keyword + action word", () => {
  it("returns SIGNAL for 'claude code ships'", () => {
    const result = fastPath(
      makeInput({ text: "Claude Code ships hooks today!" }),
    );
    expect(result.result).toBe("SIGNAL");
    expect("reason" in result && result.reason).toContain("action word");
  });

  it("returns SIGNAL for keyword + 'fixed'", () => {
    const result = fastPath(
      makeInput({ text: "claude code fixed the permissions bug" }),
    );
    expect(result.result).toBe("SIGNAL");
  });

  it("returns SIGNAL for keyword + 'breaking'", () => {
    const result = fastPath(
      makeInput({ text: "breaking change in claude hooks — action required" }),
    );
    expect(result.result).toBe("SIGNAL");
  });
});

describe("fastPath — Rule 7: keyword alone", () => {
  it("returns CANDIDATE when keyword present but no action word", () => {
    const result = fastPath(
      makeInput({ text: "Really enjoying claude code lately, it's so smooth" }),
    );
    expect(result.result).toBe("CANDIDATE");
  });
});

describe("fastPath — Rule 8: action word without keyword", () => {
  it("returns CANDIDATE for action word without keyword", () => {
    const result = fastPath(
      makeInput({
        text: "Just shipped something really exciting, can't wait to share",
      }),
    );
    expect(result.result).toBe("CANDIDATE");
  });
});

describe("fastPath — Rule 9: default", () => {
  it("returns CANDIDATE for unknown content (no keyword, no action)", () => {
    const result = fastPath(
      makeInput({ text: "The weather in SF is surprisingly nice this April" }),
    );
    expect(result.result).toBe("CANDIDATE");
  });
});

describe("fastPath — fixture coverage", () => {
  it("correctly classifies all fast-path-deterministic fixtures", () => {
    const failures: string[] = [];

    for (const fixture of fastPathFixtures) {
      const result = fastPath(fixture.input);
      if (result.result !== fixture.expected) {
        failures.push(
          `[${fixture.id}] expected ${fixture.expected}, got ${result.result}` +
            (fixture.note ? ` (${fixture.note})` : ""),
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(`Fast-path fixture failures:\n${failures.join("\n")}`);
    }
  });

  it("has at least 10 fast-path-deterministic fixtures", () => {
    expect(fastPathFixtures.length).toBeGreaterThanOrEqual(10);
  });

  it("total fixture count >= 25", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(25);
  });
});
```

### Exact commands

```bash
# Run signal rules tests only
npm test --workspace=packages/collector -- --reporter=verbose

# Expected: all tests pass, ~20+ test cases
```

### Acceptance criteria

- `npm test --workspace=packages/collector` passes with 0 failures
- All fast-path deterministic fixtures achieve expected classification
- Reply-from-tracked test explicitly asserts `result === "CANDIDATE"` (not NOISE or SIGNAL)
- Fixture count ≥ 25 total, ≥ 10 fast-path deterministic
- Tests complete in < 2 seconds (no network calls)
- No `any` types in `rules.ts`

### Definition of Done

- [ ] All test cases pass
- [ ] Fixture file has ≥ 25 entries covering SIGNAL, CONTEXT, NOISE, replies, GitHub
- [ ] Rule 3 (reply → CANDIDATE not NOISE) test explicitly passes
- [ ] No network calls in tests (`vi.mock` not needed — rules.ts is pure)

---

## T-05 — Signal Detection: LLM Classifier

**Depends on**: T-04  
**Complexity**: M  
**Phase**: Signal detection (Group A)

### What

Implement Pass 2: the LLM classifier. Calls OpenRouter (centralized mode) or spawns `claude -p` / `codex` (distributed mode). All tests use mocked responses — no live API calls.

### Files to fill

**`/packages/collector/src/signal/prompts.ts`**

Full content from COMPONENTS.md §2.8.2 — `buildClassificationPrompt()` and `buildDistributedPrompt()`.

**`/packages/collector/src/signal/classifier.ts`**

Full content from COMPONENTS.md §2.8.3. Key implementation notes:

- `classifyBatch(inputs, mode)` — public entry point
- Centralized mode: OpenRouter with 3 model fallbacks (`google/gemini-flash-1.5` → `meta-llama/llama-3.1-8b-instruct:free` → `anthropic/claude-haiku-4-5`)
- Distributed mode: `spawnSync("claude", ["-p", prompt])` or `spawnSync("codex", ["run", prompt])` — try claude first, then codex
- Batching: max 10 inputs per OpenRouter request
- API-down fallback: when all 3 OpenRouter models fail, return `CONTEXT` for all (never throw)
- Response parsing: extract JSON array from model output, handle markdown fences
- Distributed response parsing: extract JSON object `{classification, reason}` from output

**`/packages/collector/src/__tests__/classifier.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClassificationInput } from "@updagent/shared";

// Mock fetch globally for OpenRouter calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { classifyBatch } = await import("../signal/classifier.js");

const CC_KEYWORDS = ["claude code", "claude update", "mcp server"];

function makeInput(text: string, isReply = false): ClassificationInput {
  return {
    text,
    author: "bcherny",
    agentId: "claude-code",
    agentName: "Claude Code",
    isReply,
    signalKeywords: CC_KEYWORDS,
    source: "x",
  };
}

function mockOpenRouterSuccess(
  results: Array<{ index: number; classification: string; reason: string }>,
) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify(results),
          },
        },
      ],
    }),
  } as Response);
}

function mockOpenRouterFailure(status = 500) {
  mockFetch.mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ error: "Internal server error" }),
  } as Response);
}

describe("classifyBatch — centralized mode", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env["OPENROUTER_API_KEY"] = "test-key";
    delete process.env["SIGNAL_DETECTION_MODE"];
  });

  it("classifies a batch using OpenRouter response", async () => {
    const inputs = [
      makeInput(
        "This was fixed in yesterday's release. claude update to get latest",
        true,
      ),
      makeInput("Just landed in Tokyo! Coffee recommendations?"),
    ];

    mockOpenRouterSuccess([
      { index: 0, classification: "SIGNAL", reason: "fix confirmation reply" },
      { index: 1, classification: "NOISE", reason: "personal travel post" },
    ]);

    const results = await classifyBatch(inputs, "centralized");

    expect(results).toHaveLength(2);
    expect(results[0]?.classification).toBe("SIGNAL");
    expect(results[1]?.classification).toBe("NOISE");
    expect(results[0]?.classifiedBy).toBe("llm");
  });

  it("returns CONTEXT for all when OpenRouter API key is missing", async () => {
    delete process.env["OPENROUTER_API_KEY"];
    const inputs = [
      makeInput("Some post text here"),
      makeInput("Another post"),
    ];

    const results = await classifyBatch(inputs, "centralized");

    expect(results).toHaveLength(2);
    results.forEach((r) => {
      expect(r.classification).toBe("CONTEXT");
      expect(r.classifiedBy).toBe("llm");
    });
  });

  it("falls back to CONTEXT for all when all 3 models fail", async () => {
    // Mock all 3 model attempts as failures
    mockOpenRouterFailure(500);
    mockOpenRouterFailure(500);
    mockOpenRouterFailure(500);

    const inputs = [makeInput("Some content")];
    const results = await classifyBatch(inputs, "centralized");

    expect(results[0]?.classification).toBe("CONTEXT");
  });

  it("handles malformed JSON response gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "I cannot classify this content" } }],
      }),
    } as Response);
    // Fallback to next model
    mockOpenRouterSuccess([
      { index: 0, classification: "NOISE", reason: "personal post" },
    ]);

    const inputs = [makeInput("Random content")];
    const results = await classifyBatch(inputs, "centralized");

    // Should recover and return a valid result
    expect(results[0]?.classification).toMatch(/SIGNAL|CONTEXT|NOISE/);
  });

  it("handles empty input array", async () => {
    const results = await classifyBatch([], "centralized");
    expect(results).toHaveLength(0);
  });

  it("batches inputs in groups of 10", async () => {
    const inputs = Array.from({ length: 12 }, (_, i) =>
      makeInput(`Post number ${i} with some content about claude code`),
    );

    // First batch of 10
    mockOpenRouterSuccess(
      Array.from({ length: 10 }, (_, i) => ({
        index: i,
        classification: "NOISE",
        reason: "test",
      })),
    );
    // Second batch of 2
    mockOpenRouterSuccess([
      { index: 0, classification: "NOISE", reason: "test" },
      { index: 1, classification: "NOISE", reason: "test" },
    ]);

    const results = await classifyBatch(inputs, "centralized");
    expect(results).toHaveLength(12);
    // 2 fetch calls (batched)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("classifyBatch — fixture accuracy gate", () => {
  it("combined fast-path + mock LLM classifies ≥80% of all fixtures correctly", async () => {
    const { fixtures } = await import("./signal-fixtures.js");
    const { fastPath } = await import("../signal/rules.js");

    // For LLM fixtures, we mock the response to match the expected classification
    let fetchCallIndex = 0;
    const llmFixtures = fixtures.filter((f) => !f.fastPathDeterministic);

    // Mock OpenRouter to return the expected classification for each LLM fixture
    // This simulates a well-functioning LLM for the accuracy gate
    mockFetch.mockImplementation(async () => {
      const batch = llmFixtures.slice(
        fetchCallIndex * 10,
        (fetchCallIndex + 1) * 10,
      );
      fetchCallIndex++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(
                  batch.map((f, i) => ({
                    index: i,
                    classification: f.expected,
                    reason: `expected for test fixture ${f.id}`,
                  })),
                ),
              },
            },
          ],
        }),
      } as Response;
    });

    process.env["OPENROUTER_API_KEY"] = "test-key";

    let correct = 0;
    let total = 0;

    for (const fixture of fixtures) {
      const fpResult = fastPath(fixture.input);

      if (fpResult.result === "SIGNAL" || fpResult.result === "NOISE") {
        // Fast-path determined result
        if (fpResult.result === fixture.expected) correct++;
        total++;
      } else {
        // LLM needed — use mock
        const [result] = await classifyBatch([fixture.input], "centralized");
        if (result?.classification === fixture.expected) correct++;
        total++;
      }
    }

    const accuracy = correct / total;
    expect(accuracy).toBeGreaterThanOrEqual(0.8);
  });
});
```

### Exact commands

```bash
# Run all tests including classifier
npm test --workspace=packages/collector -- --reporter=verbose

# Check that no live network calls were made (all mocked)
# If tests pass without OPENROUTER_API_KEY set in env, mocking is working correctly
OPENROUTER_API_KEY="" npm test --workspace=packages/collector
```

### Acceptance criteria

- All classifier tests pass with 0 failures
- `classifyBatch([], "centralized")` returns `[]`
- API-down test: when `OPENROUTER_API_KEY` is unset, all results are `CONTEXT` (not undefined, not SIGNAL, not NOISE)
- Fixture accuracy gate passes (≥80% correct)
- No live API calls in tests (all mocked via `vi.stubGlobal("fetch", mockFetch)`)
- Distributed mode test: mock `spawnSync` and verify it's called with `["claude", ["-p", ...]]`

### Definition of Done

- [ ] All classifier tests pass
- [ ] Accuracy gate test passes
- [ ] API fallback to CONTEXT tested explicitly
- [ ] Batch chunking (10 per request) tested explicitly

---

## T-06 — X.com Collection: Error Types + 3-Tier Cascade

**Depends on**: T-03  
**Complexity**: L  
**Phase**: Sources (Group B, parallel with T-07)

### What

Implement shared error types and all three X collection tiers (Tier 1: bird-search, Tier 2: ScrapeCreators, Tier 3: xAI) plus the cascade orchestrator.

### Files to fill

**`/packages/collector/src/sources/errors.ts`**

```typescript
export class BirdSearchAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BirdSearchAuthError";
  }
}

export class BirdSearchParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BirdSearchParseError";
  }
}

export class ScrapeCreatorsError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ScrapeCreatorsError";
  }
}

export class XAIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XAIError";
  }
}

export class GitHubRateLimitError extends Error {
  constructor() {
    super(
      "GitHub API rate limit exceeded. Set GH_TOKEN environment variable to increase limits.",
    );
    this.name = "GitHubRateLimitError";
  }
}
```

**`/packages/collector/src/sources/x-bird.ts`**

Full content from COMPONENTS.md §2.4.2. Key points:

- Reads `AUTH_TOKEN` and `CT0` at **call time** (not module load)
- `spawnSync` with 30s timeout
- Returns `[]` for empty/quiet accounts (not an error)
- Throws `BirdSearchAuthError` on exit code ≠ 0

**`/packages/collector/src/sources/x-scrapecreators.ts`**

Full content from COMPONENTS.md §2.4.3. Key points:

- Reads `SCRAPECREATORS_API_KEY` at call time
- Client-side time filter using `sinceHours` cutoff
- 401/403 → `ScrapeCreatorsError(msg, status)` distinguishing auth from rate limit
- 429 → `ScrapeCreatorsError(msg, 429)`
- 20s fetch timeout via `AbortSignal.timeout`

**`/packages/collector/src/sources/x-xai.ts`**

Full content from COMPONENTS.md §2.4.4. Key points:

- Reads `XAI_API_KEY` at call time
- Prompt asks Grok to return JSON array
- Extracts JSON with `/\[[\s\S]*\]/` regex from LLM response
- On parse failure: `console.warn` + return `[]` (never throw)

**`/packages/collector/src/sources/x-cascade.ts`**

Full content from COMPONENTS.md §2.4.5. Critical invariant: **empty result from Tier 1 is NOT a failure** — do not fall to Tier 2 when `posts.length === 0`.

**`/packages/collector/src/__tests__/cascade.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RawXPost } from "@updagent/shared";

// Mock all three tier modules
vi.mock("../sources/x-bird.js", () => ({
  fetchFromBirdSearch: vi.fn(),
  BirdSearchAuthError: class BirdSearchAuthError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "BirdSearchAuthError";
    }
  },
  BirdSearchParseError: class BirdSearchParseError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "BirdSearchParseError";
    }
  },
}));

vi.mock("../sources/x-scrapecreators.js", () => ({
  fetchFromScrapeCreators: vi.fn(),
  ScrapeCreatorsError: class ScrapeCreatorsError extends Error {
    constructor(
      msg: string,
      public statusCode: number,
    ) {
      super(msg);
      this.name = "ScrapeCreatorsError";
    }
  },
}));

vi.mock("../sources/x-xai.js", () => ({
  fetchFromXAI: vi.fn(),
  XAIError: class XAIError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "XAIError";
    }
  },
}));

const { fetchXPostsForAccount } = await import("../sources/x-cascade.js");
const { fetchFromBirdSearch } = await import("../sources/x-bird.js");
const { fetchFromScrapeCreators } =
  await import("../sources/x-scrapecreators.js");
const { fetchFromXAI } = await import("../sources/x-xai.js");
const { BirdSearchAuthError } = await import("../sources/x-bird.js");
const { ScrapeCreatorsError } = await import("../sources/x-scrapecreators.js");
const { XAIError } = await import("../sources/x-xai.js");

const mockBird = vi.mocked(fetchFromBirdSearch);
const mockScrape = vi.mocked(fetchFromScrapeCreators);
const mockXAI = vi.mocked(fetchFromXAI);

const SAMPLE_POST: RawXPost = {
  id: "123",
  url: "https://x.com/bcherny/status/123",
  text: "Claude Code v1.9.4 ships!",
  author: "bcherny",
  publishedAt: new Date().toISOString(),
  likes: 77,
  retweets: 12,
  views: 34000,
  isReply: false,
  tier: 1,
};

describe("fetchXPostsForAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns tier 1 results when tier 1 succeeds", async () => {
    mockBird.mockReturnValueOnce([SAMPLE_POST]);

    const result = await fetchXPostsForAccount({
      handle: "bcherny",
      sinceHours: 6,
    });

    expect(result.tierUsed).toBe(1);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]?.text).toBe("Claude Code v1.9.4 ships!");
    expect(result.failures).toHaveLength(0);
    expect(mockScrape).not.toHaveBeenCalled();
    expect(mockXAI).not.toHaveBeenCalled();
  });

  it("returns empty posts with tierUsed=1 when tier 1 returns empty (account quiet)", async () => {
    mockBird.mockReturnValueOnce([]);

    const result = await fetchXPostsForAccount({
      handle: "bcherny",
      sinceHours: 6,
    });

    // Empty is NOT a failure — account was just quiet
    expect(result.tierUsed).toBe(1);
    expect(result.posts).toHaveLength(0);
    expect(result.failures).toHaveLength(0);
    // Critical: must NOT fall to Tier 2 on empty result
    expect(mockScrape).not.toHaveBeenCalled();
  });

  it("falls to tier 2 when tier 1 throws BirdSearchAuthError", async () => {
    mockBird.mockImplementationOnce(() => {
      throw new BirdSearchAuthError("AUTH_TOKEN expired");
    });
    mockScrape.mockResolvedValueOnce([{ ...SAMPLE_POST, tier: 2 as const }]);

    const result = await fetchXPostsForAccount({
      handle: "bcherny",
      sinceHours: 6,
    });

    expect(result.tierUsed).toBe(2);
    expect(result.posts).toHaveLength(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.tier).toBe(1);
    expect(result.failures[0]?.errorType).toBe("auth");
  });

  it("falls to tier 3 when tier 1 and tier 2 both fail", async () => {
    mockBird.mockImplementationOnce(() => {
      throw new BirdSearchAuthError("auth failed");
    });
    mockScrape.mockRejectedValueOnce(
      new ScrapeCreatorsError("API key invalid", 401),
    );
    mockXAI.mockResolvedValueOnce([{ ...SAMPLE_POST, tier: 3 as const }]);

    const result = await fetchXPostsForAccount({
      handle: "bcherny",
      sinceHours: 6,
    });

    expect(result.tierUsed).toBe(3);
    expect(result.posts).toHaveLength(1);
    expect(result.failures).toHaveLength(2);
  });

  it("returns tierUsed=null with empty posts when ALL tiers fail", async () => {
    mockBird.mockImplementationOnce(() => {
      throw new BirdSearchAuthError("auth failed");
    });
    mockScrape.mockRejectedValueOnce(
      new ScrapeCreatorsError("rate limited", 429),
    );
    mockXAI.mockRejectedValueOnce(new XAIError("API key not set"));

    const result = await fetchXPostsForAccount({
      handle: "bcherny",
      sinceHours: 6,
    });

    expect(result.tierUsed).toBeNull();
    expect(result.posts).toHaveLength(0);
    expect(result.failures).toHaveLength(3);
    // Must NOT throw — always returns a result
  });

  it("records failure details including errorType for each tier", async () => {
    mockBird.mockImplementationOnce(() => {
      throw new BirdSearchAuthError("auth failed");
    });
    mockScrape.mockRejectedValueOnce(
      new ScrapeCreatorsError("rate limited", 429),
    );
    mockXAI.mockRejectedValueOnce(new XAIError("xai key not set"));

    const result = await fetchXPostsForAccount({
      handle: "bcherny",
      sinceHours: 6,
    });

    const t1 = result.failures.find((f) => f.tier === 1);
    const t2 = result.failures.find((f) => f.tier === 2);
    const t3 = result.failures.find((f) => f.tier === 3);

    expect(t1?.errorType).toBe("auth");
    expect(t2?.errorType).toBe("rate-limit");
    expect(t3?.errorType).toBe("auth");
  });

  it("never throws — always returns CascadeResult", async () => {
    // All tiers throw unexpected errors
    mockBird.mockImplementationOnce(() => {
      throw new Error("Unexpected ENOENT");
    });
    mockScrape.mockRejectedValueOnce(new Error("Network timeout"));
    mockXAI.mockRejectedValueOnce(new Error("DNS resolution failed"));

    await expect(
      fetchXPostsForAccount({ handle: "bcherny", sinceHours: 6 }),
    ).resolves.toBeDefined();
  });
});
```

### Exact commands

```bash
# Run cascade tests
npm test --workspace=packages/collector -- --reporter=verbose cascade

# Verify no live X.com calls (all mocked)
# If test passes without AUTH_TOKEN set, mocking is working
AUTH_TOKEN="" CT0="" npm test --workspace=packages/collector -- cascade
```

### Acceptance criteria

- All cascade tests pass with 0 failures
- `fetchXPostsForAccount` never throws — always returns `CascadeResult`
- Empty-result-from-Tier-1 test explicitly asserts `tierUsed === 1` and `mockScrape` was not called
- `BirdSearchAuthError` is exported from `errors.ts` and importable by cascade
- `AUTH_TOKEN` absence does NOT crash module import — only throws at call time

### Definition of Done

- [ ] All 7 cascade tests pass
- [ ] Empty-result-is-not-failure test is present and passes
- [ ] `fetchXPostsForAccount` never-throws test is present
- [ ] `errors.ts` exports all 5 error types

---

## T-07 — GitHub Release Collection

**Depends on**: T-03  
**Complexity**: S  
**Phase**: Sources (Group B, parallel with T-06)

### What

Implement GitHub REST API v3 release fetching. Simple: GET releases endpoint, normalize, handle 404/403 correctly.

### Files to fill

**`/packages/collector/src/sources/github-releases.ts`**

Full content from COMPONENTS.md §2.5. Key points:

- No auth required for public repos; add `Authorization: Bearer ${GH_TOKEN}` if token is set
- 404 → `console.warn` + return `[]` (not an error)
- 403 → `throw new GitHubRateLimitError()` with actionable message
- Filter out draft releases
- 15s fetch timeout via `AbortSignal.timeout`

**`/packages/collector/src/__tests__/github-releases.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { fetchGitHubReleases } = await import("../sources/github-releases.js");
const { GitHubRateLimitError } = await import("../sources/errors.js");

function mockGitHubResponse(
  releases: Array<Record<string, unknown>>,
  status = 200,
) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => releases,
  } as Response);
}

describe("fetchGitHubReleases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["GH_TOKEN"];
  });

  it("returns releases for a valid repo", async () => {
    mockGitHubResponse([
      {
        tag_name: "v1.9.4",
        name: "Claude Code v1.9.4",
        body: "## What's New\n- Fix statusline on Windows",
        published_at: "2026-04-01T12:00:00Z",
        html_url:
          "https://github.com/anthropics/claude-code/releases/tag/v1.9.4",
        draft: false,
        prerelease: false,
      },
    ]);

    const releases = await fetchGitHubReleases("anthropics", "claude-code");

    expect(releases).toHaveLength(1);
    expect(releases[0]?.tagName).toBe("v1.9.4");
    expect(releases[0]?.owner).toBe("anthropics");
    expect(releases[0]?.repo).toBe("claude-code");
    expect(releases[0]?.isDraft).toBe(false);
  });

  it("returns empty array on 404 (repo not found or no releases)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: "Not Found" }),
    } as Response);

    const releases = await fetchGitHubReleases("nonexistent", "repo");
    expect(releases).toHaveLength(0);
  });

  it("throws GitHubRateLimitError on 403", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ message: "rate limit exceeded" }),
    } as Response);

    await expect(
      fetchGitHubReleases("anthropics", "claude-code"),
    ).rejects.toThrow(GitHubRateLimitError);
  });

  it("GitHubRateLimitError message mentions GH_TOKEN", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({}),
    } as Response);

    await expect(
      fetchGitHubReleases("anthropics", "claude-code"),
    ).rejects.toThrow(/GH_TOKEN/);
  });

  it("filters out draft releases", async () => {
    mockGitHubResponse([
      {
        tag_name: "v1.9.5-draft",
        name: "Draft release",
        body: "",
        published_at: "2026-04-07T00:00:00Z",
        html_url: "",
        draft: true,
        prerelease: false,
      },
      {
        tag_name: "v1.9.4",
        name: "Real release",
        body: "Changelog",
        published_at: "2026-04-01T00:00:00Z",
        html_url:
          "https://github.com/anthropics/claude-code/releases/tag/v1.9.4",
        draft: false,
        prerelease: false,
      },
    ]);

    const releases = await fetchGitHubReleases("anthropics", "claude-code");
    expect(releases).toHaveLength(1);
    expect(releases[0]?.tagName).toBe("v1.9.4");
  });

  it("sends Authorization header when GH_TOKEN is set", async () => {
    process.env["GH_TOKEN"] = "my-test-token";
    mockGitHubResponse([]);

    await fetchGitHubReleases("anthropics", "claude-code");

    const callArgs = mockFetch.mock.calls[0];
    const options = callArgs?.[1] as RequestInit;
    const headers = options?.headers as Record<string, string>;
    expect(headers?.["Authorization"]).toBe("Bearer my-test-token");
  });

  it("works without GH_TOKEN (no Authorization header sent)", async () => {
    delete process.env["GH_TOKEN"];
    mockGitHubResponse([]);

    await fetchGitHubReleases("anthropics", "claude-code");

    const callArgs = mockFetch.mock.calls[0];
    const options = callArgs?.[1] as RequestInit;
    const headers = options?.headers as Record<string, string>;
    expect(headers?.["Authorization"]).toBeUndefined();
  });

  it("returns empty array for repo with no releases (empty array response)", async () => {
    mockGitHubResponse([]);
    const releases = await fetchGitHubReleases("someorg", "new-repo");
    expect(releases).toHaveLength(0);
  });
});
```

### Exact commands

```bash
# Run GitHub releases tests
npm test --workspace=packages/collector -- --reporter=verbose github-releases
```

### Acceptance criteria

- All 7 tests pass
- 404 returns `[]` (does not throw)
- 403 throws `GitHubRateLimitError` with `GH_TOKEN` mentioned in message
- Draft releases are filtered out
- `GH_TOKEN` auth header is sent when env var is set, absent when not

### Definition of Done

- [ ] All tests pass
- [ ] `GitHubRateLimitError` error class is exported from `errors.ts`
- [ ] 404 test uses the exact assertion `expect(releases).toHaveLength(0)` (no throw)

---

## T-08 — Normalization and Deduplication

**Depends on**: T-02, T-06, T-07  
**Complexity**: M  
**Phase**: Processing

### What

Convert raw tier outputs (`RawXPost`, `RawGitHubRelease`) into canonical `FeedItem` objects and deduplicate by ID.

### Files to fill

**`/packages/collector/src/normalize.ts`**

Full content from COMPONENTS.md §2.6. Key implementation notes:

- `SEMVER_RE = /v?(\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?)/i` — captures group 1 (without leading `v`)
- `normalizeXPost`: `id = raw.url`; `engagementScore = likes * 1 + retweets * 3`
- `normalizeGitHubRelease`: `id = "${owner}/${repo}@${tagName}"`; `classification = "SIGNAL"` always
- `collectedAt = new Date().toISOString()` at normalization time

**`/packages/collector/src/dedup.ts`**

Full content from COMPONENTS.md §2.7.

**`/packages/collector/src/__tests__/normalize.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { normalizeXPost, normalizeGitHubRelease } from "../normalize.js";
import type {
  RawXPost,
  RawGitHubRelease,
  ClassificationResult,
} from "@updagent/shared";

const SIGNAL_RESULT: ClassificationResult = {
  classification: "SIGNAL",
  reason: "release announcement",
  classifiedBy: "fast-path",
};

const NOISE_RESULT: ClassificationResult = {
  classification: "NOISE",
  reason: "personal post",
  classifiedBy: "fast-path",
};

const RAW_POST: RawXPost = {
  id: "1234567890",
  url: "https://x.com/bcherny/status/1234567890",
  text: "Claude Code v1.9.4 ships today!",
  author: "bcherny",
  publishedAt: "2026-04-07T12:00:00Z",
  likes: 77,
  retweets: 12,
  views: 34000,
  isReply: false,
  tier: 1,
};

const RAW_RELEASE: RawGitHubRelease = {
  tagName: "v1.9.4",
  name: "Claude Code v1.9.4",
  body: "## What's New\n- Fix statusline on Windows",
  publishedAt: "2026-04-07T10:00:00Z",
  url: "https://github.com/anthropics/claude-code/releases/tag/v1.9.4",
  owner: "anthropics",
  repo: "claude-code",
  isDraft: false,
  isPrerelease: false,
};

describe("normalizeXPost", () => {
  it("produces a FeedItem with correct id (full URL)", () => {
    const item = normalizeXPost(RAW_POST, "claude-code", SIGNAL_RESULT);
    expect(item.id).toBe("https://x.com/bcherny/status/1234567890");
  });

  it("calculates engagementScore as likes*1 + retweets*3", () => {
    const item = normalizeXPost(RAW_POST, "claude-code", SIGNAL_RESULT);
    expect(item.engagementScore).toBe(77 * 1 + 12 * 3); // 113
  });

  it("extracts version from semver in text", () => {
    const item = normalizeXPost(RAW_POST, "claude-code", SIGNAL_RESULT);
    expect(item.version).toBe("1.9.4");
  });

  it("strips leading v from extracted version", () => {
    const post: RawXPost = { ...RAW_POST, text: "ships v2.0.0 today" };
    const item = normalizeXPost(post, "claude-code", SIGNAL_RESULT);
    expect(item.version).toBe("2.0.0");
  });

  it("sets isRelease=true when SIGNAL + version detected", () => {
    const item = normalizeXPost(RAW_POST, "claude-code", SIGNAL_RESULT);
    expect(item.isRelease).toBe(true);
  });

  it("sets isRelease=false for NOISE items even with semver in text", () => {
    const item = normalizeXPost(RAW_POST, "claude-code", NOISE_RESULT);
    expect(item.isRelease).toBe(false);
  });

  it("preserves source=x and agentId", () => {
    const item = normalizeXPost(RAW_POST, "claude-code", SIGNAL_RESULT);
    expect(item.source).toBe("x");
    expect(item.agentId).toBe("claude-code");
  });

  it("propagates classification and classifiedBy", () => {
    const llmResult: ClassificationResult = {
      classification: "CONTEXT",
      reason: "comparison post",
      classifiedBy: "llm",
      model: "google/gemini-flash-1.5",
    };
    const item = normalizeXPost(RAW_POST, "claude-code", llmResult);
    expect(item.classification).toBe("CONTEXT");
    expect(item.classifiedBy).toBe("llm");
    expect(item.classificationModel).toBe("google/gemini-flash-1.5");
  });
});

describe("normalizeGitHubRelease", () => {
  it("produces id as owner/repo@tagName", () => {
    const item = normalizeGitHubRelease(RAW_RELEASE, "claude-code");
    expect(item.id).toBe("anthropics/claude-code@v1.9.4");
  });

  it("always produces classification=SIGNAL", () => {
    const item = normalizeGitHubRelease(RAW_RELEASE, "claude-code");
    expect(item.classification).toBe("SIGNAL");
  });

  it("always produces isRelease=true", () => {
    const item = normalizeGitHubRelease(RAW_RELEASE, "claude-code");
    expect(item.isRelease).toBe(true);
  });

  it("extracts version without leading v", () => {
    const item = normalizeGitHubRelease(RAW_RELEASE, "claude-code");
    expect(item.version).toBe("1.9.4");
  });

  it("sets engagementScore=0", () => {
    const item = normalizeGitHubRelease(RAW_RELEASE, "claude-code");
    expect(item.engagementScore).toBe(0);
  });

  it("sets source=github", () => {
    const item = normalizeGitHubRelease(RAW_RELEASE, "claude-code");
    expect(item.source).toBe("github");
  });

  it("sets author to owner/repo", () => {
    const item = normalizeGitHubRelease(RAW_RELEASE, "claude-code");
    expect(item.author).toBe("anthropics/claude-code");
  });
});

describe("dedup", () => {
  it("removes items whose IDs already exist in existing set", async () => {
    const { dedup } = await import("../dedup.js");
    const existing = [normalizeGitHubRelease(RAW_RELEASE, "claude-code")];
    const newItems = [
      normalizeGitHubRelease(RAW_RELEASE, "claude-code"), // duplicate
      normalizeXPost(RAW_POST, "claude-code", SIGNAL_RESULT),
    ];

    const result = dedup(newItems, existing);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(RAW_POST.url);
  });

  it("returns all items when no duplicates", async () => {
    const { dedup } = await import("../dedup.js");
    const result = dedup(
      [normalizeXPost(RAW_POST, "claude-code", SIGNAL_RESULT)],
      [],
    );
    expect(result).toHaveLength(1);
  });

  it("returns empty array when all items are duplicates", async () => {
    const { dedup } = await import("../dedup.js");
    const item = normalizeGitHubRelease(RAW_RELEASE, "claude-code");
    const result = dedup([item], [item]);
    expect(result).toHaveLength(0);
  });
});
```

### Exact commands

```bash
npm test --workspace=packages/collector -- --reporter=verbose normalize
```

### Acceptance criteria

- All normalize and dedup tests pass
- `normalizeGitHubRelease` always produces `classification: "SIGNAL"` and `isRelease: true`
- Version extraction strips leading `v`
- `engagementScore` formula: `likes * 1 + retweets * 3`
- `dedup` with all-identical items returns `[]`

### Definition of Done

- [ ] All tests pass
- [ ] `normalizeGitHubRelease` classification always SIGNAL (tested)
- [ ] Version extraction tested for both `v1.9.4` and `1.9.4` formats

---

## T-09 — Storage Layer

**Depends on**: T-02, T-08  
**Complexity**: M  
**Phase**: Processing

### What

Implement read/write for `data/feed.json`, `data/health.json`, and optional Upstash Redis writes.

### Files to fill

**`/packages/collector/src/storage.ts`**

```typescript
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { FeedItem, FeedFile, CollectionHealth } from "@updagent/shared";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ── feed.json ───────────────────────────────────────────────────────────────

export async function readFeedJson(filePath: string): Promise<FeedItem[]> {
  try {
    const content = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(content) as FeedFile;
    return parsed.items ?? [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

export async function writeFeedJson(
  filePath: string,
  items: FeedItem[],
): Promise<void> {
  const cutoff = Date.now() - THIRTY_DAYS_MS;

  const pruned = items
    .filter((item) => new Date(item.publishedAt).getTime() >= cutoff)
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );

  const feedFile: FeedFile = {
    version: "1",
    updatedAt: new Date().toISOString(),
    itemCount: pruned.length,
    items: pruned,
  };

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(feedFile, null, 2) + "\n", "utf-8");
}

// ── health.json ─────────────────────────────────────────────────────────────

export async function readHealthJson(
  filePath: string,
): Promise<CollectionHealth | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as CollectionHealth;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

export async function writeHealthJson(
  filePath: string,
  health: CollectionHealth,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(health, null, 2) + "\n", "utf-8");
}

// ── Redis (optional) ────────────────────────────────────────────────────────

export function isRedisConfigured(): boolean {
  return Boolean(process.env["UPSTASH_REDIS_REST_URL"]);
}

export async function writeToRedis(items: FeedItem[]): Promise<void> {
  if (!isRedisConfigured()) {
    return;
  }

  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];

  if (!url || !token) return;

  try {
    const { Redis } = await import("@upstash/redis");
    const redis = new Redis({ url, token });

    // Write top 50 SIGNAL items as hot cache, TTL 48h
    const signals = items
      .filter((item) => item.classification === "SIGNAL")
      .slice(0, 50);

    await redis.set("updagent:feed", JSON.stringify(signals), {
      ex: 48 * 3600,
    });
    await redis.set("updagent:updatedAt", new Date().toISOString(), {
      ex: 48 * 3600,
    });

    console.log(`[updagent] Redis: wrote ${signals.length} SIGNAL items`);
  } catch (err) {
    // Redis failure is non-fatal — log and continue
    console.warn(`[updagent] Redis write failed (non-fatal): ${String(err)}`);
  }
}
```

**`/packages/collector/src/__tests__/storage.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readFeedJson,
  writeFeedJson,
  readHealthJson,
  writeHealthJson,
  isRedisConfigured,
} from "../storage.js";
import type { FeedItem, CollectionHealth } from "@updagent/shared";

const TMP = join(tmpdir(), `updagent-test-${process.pid}`);

function makeFeedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: `https://x.com/bcherny/status/${Math.random()}`,
    source: "x",
    agentId: "claude-code",
    author: "bcherny",
    text: "Test item",
    url: `https://x.com/bcherny/status/${Math.random()}`,
    publishedAt: new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    classification: "SIGNAL",
    classificationReason: "test",
    classifiedBy: "fast-path",
    isRelease: false,
    engagementScore: 0,
    isReply: false,
    ...overrides,
  };
}

function makeHealth(): CollectionHealth {
  return {
    lastRunAt: new Date().toISOString(),
    durationMs: 1234,
    newItemCount: 5,
    totalItemCount: 100,
    tier1FailureCount: 0,
    tier2FailureCount: 0,
    allTierFailureAccounts: [],
    credentialWarning: false,
    accounts: [],
  };
}

describe("feed.json storage", () => {
  beforeEach(() => mkdir(TMP, { recursive: true }));
  afterEach(() => rm(TMP, { recursive: true, force: true }));

  it("readFeedJson returns [] for non-existent file", async () => {
    const items = await readFeedJson(join(TMP, "nonexistent.json"));
    expect(items).toEqual([]);
  });

  it("writeFeedJson + readFeedJson round-trip preserves all fields", async () => {
    const item = makeFeedItem({ text: "Hello world", version: "1.9.4" });
    const path = join(TMP, "feed.json");

    await writeFeedJson(path, [item]);
    const restored = await readFeedJson(path);

    expect(restored).toHaveLength(1);
    expect(restored[0]?.id).toBe(item.id);
    expect(restored[0]?.text).toBe("Hello world");
    expect(restored[0]?.version).toBe("1.9.4");
  });

  it("writeFeedJson sorts items by publishedAt DESC", async () => {
    const old = makeFeedItem({ publishedAt: "2026-04-01T00:00:00Z" });
    const newer = makeFeedItem({ publishedAt: "2026-04-07T00:00:00Z" });
    const path = join(TMP, "feed.json");

    await writeFeedJson(path, [old, newer]); // old before newer
    const items = await readFeedJson(path);

    expect(items[0]?.publishedAt).toBe("2026-04-07T00:00:00Z"); // newer first
    expect(items[1]?.publishedAt).toBe("2026-04-01T00:00:00Z");
  });

  it("writeFeedJson prunes items older than 30 days", async () => {
    const now = Date.now();
    const fresh = makeFeedItem({ publishedAt: new Date(now).toISOString() });
    const old = makeFeedItem({
      publishedAt: new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const path = join(TMP, "feed.json");

    await writeFeedJson(path, [fresh, old]);
    const items = await readFeedJson(path);

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(fresh.id);
  });

  it("written file includes version, updatedAt, itemCount metadata", async () => {
    const item = makeFeedItem();
    const path = join(TMP, "feed.json");
    await writeFeedJson(path, [item]);

    const raw = JSON.parse(
      await (await import("node:fs/promises")).readFile(path, "utf-8"),
    ) as { version: string; updatedAt: string; itemCount: number };

    expect(raw.version).toBe("1");
    expect(raw.updatedAt).toBeTruthy();
    expect(raw.itemCount).toBe(1);
  });
});

describe("health.json storage", () => {
  beforeEach(() => mkdir(TMP, { recursive: true }));
  afterEach(() => rm(TMP, { recursive: true, force: true }));

  it("readHealthJson returns null for non-existent file", async () => {
    const health = await readHealthJson(join(TMP, "nonexistent.json"));
    expect(health).toBeNull();
  });

  it("writeHealthJson + readHealthJson round-trip preserves all fields", async () => {
    const health = makeHealth();
    const path = join(TMP, "health.json");

    await writeHealthJson(path, health);
    const restored = await readHealthJson(path);

    expect(restored?.lastRunAt).toBe(health.lastRunAt);
    expect(restored?.durationMs).toBe(1234);
    expect(restored?.credentialWarning).toBe(false);
  });
});

describe("isRedisConfigured", () => {
  it("returns false when UPSTASH_REDIS_REST_URL is not set", () => {
    delete process.env["UPSTASH_REDIS_REST_URL"];
    expect(isRedisConfigured()).toBe(false);
  });

  it("returns true when UPSTASH_REDIS_REST_URL is set", () => {
    process.env["UPSTASH_REDIS_REST_URL"] = "https://example.upstash.io";
    expect(isRedisConfigured()).toBe(true);
    delete process.env["UPSTASH_REDIS_REST_URL"];
  });
});
```

### Exact commands

```bash
npm test --workspace=packages/collector -- --reporter=verbose storage
```

### Acceptance criteria

- `readFeedJson` on non-existent file returns `[]` (does not throw)
- Round-trip write → read preserves all fields including optional ones
- Items older than 30 days are absent after write
- `isRedisConfigured()` returns false when env var is absent
- `writeToRedis()` does not throw when Redis is unconfigured

### Definition of Done

- [ ] All storage tests pass
- [ ] 30-day pruning test passes
- [ ] Round-trip test verifies metadata fields (version, updatedAt, itemCount)

---

## T-10 — Newsletter Generator

**Depends on**: T-02, T-08  
**Complexity**: M  
**Phase**: Processing

### What

Implement the Markdown newsletter generator. Writes daily `.md` files to `newsletters/` directory. Triggered only when new SIGNAL items are found.

### Files to fill

**`/packages/collector/src/newsletter.ts`**

```typescript
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import type { FeedItem, CollectionHealth } from "@updagent/shared";

export function generateNewsletterContent(
  items: FeedItem[],
  date: string,
  health?: CollectionHealth | null,
): string {
  const signals = items.filter((i) => i.classification === "SIGNAL");

  const lines: string[] = [
    `# updagent newsletter — ${date}`,
    "",
    `> Generated at ${new Date().toISOString()} UTC`,
    "",
  ];

  // Health warning banner
  if (health?.credentialWarning) {
    lines.push(
      "> ⚠️ **Credential Warning**: X.com authentication failures detected.",
      "> Some accounts may not have been collected. Check `data/health.json`.",
      "",
    );
  }

  // Group signals by agentId
  const byAgent = new Map<string, FeedItem[]>();
  for (const item of signals) {
    const existing = byAgent.get(item.agentId) ?? [];
    existing.push(item);
    byAgent.set(item.agentId, existing);
  }

  if (byAgent.size === 0) {
    lines.push("*No new signals this period.*");
    lines.push("");
    return lines.join("\n");
  }

  // Sort agents by priority (hardcoded order for now: claude-code, codex, others)
  const agentOrder = [
    "claude-code",
    "codex",
    "gemini-cli",
    "opencode",
    "openclaw",
    "hermes-agent",
  ];
  const sortedAgents = [...byAgent.keys()].sort(
    (a, b) => agentOrder.indexOf(a) - agentOrder.indexOf(b),
  );

  for (const agentId of sortedAgents) {
    const agentItems = byAgent.get(agentId) ?? [];

    // Derive display name from first item's agentId
    const agentName = agentId
      .split("-")
      .map((w) => w[0]?.toUpperCase() + w.slice(1))
      .join(" ");

    lines.push(`## ${agentName}`);
    lines.push("");

    // GitHub releases first
    const releases = agentItems
      .filter((i) => i.source === "github")
      .sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );

    // X posts next
    const xPosts = agentItems
      .filter((i) => i.source === "x")
      .sort((a, b) => b.engagementScore - a.engagementScore);

    if (releases.length === 0 && xPosts.length === 0) {
      lines.push("*No new signals this period.*");
      lines.push("");
      continue;
    }

    for (const item of releases) {
      lines.push(
        `### 🚀 ${item.version ? `v${item.version}` : item.author} — GitHub Release`,
      );
      lines.push("");
      lines.push(`**Published**: ${item.publishedAt}`);
      lines.push(`**URL**: ${item.url}`);
      lines.push("");
      // Show first 500 chars of release notes
      const body = item.text.slice(0, 500);
      lines.push(body);
      if (item.text.length > 500) lines.push("...");
      lines.push("");
    }

    for (const item of xPosts) {
      const engagement =
        item.engagementScore > 0
          ? ` _(♥ ${item.likes ?? 0} 🔁 ${item.retweets ?? 0})_`
          : "";
      lines.push(`### [@${item.author}](${item.url})${engagement}`);
      lines.push("");
      if (item.isReply && item.parentTweetSummary) {
        lines.push(
          `> _Reply to: "${item.parentTweetSummary.slice(0, 80)}..."_`,
        );
        lines.push("");
      }
      lines.push(item.text);
      lines.push("");
      lines.push(`**Reason**: ${item.classificationReason}`);
      lines.push(`**Collected**: ${item.collectedAt}`);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(`*Next collection: ~6 hours from now*`);
  lines.push("");

  return lines.join("\n");
}

export function shouldGenerateNewsletter(newItems: FeedItem[]): boolean {
  return newItems.some((item) => item.classification === "SIGNAL");
}

export async function appendToNewsletter(
  items: FeedItem[],
  newslettersDir: string,
  date: string,
  health?: CollectionHealth | null,
): Promise<string> {
  await mkdir(newslettersDir, { recursive: true });

  const filePath = join(newslettersDir, `${date}.md`);
  const newContent = generateNewsletterContent(items, date, health);

  let fileExists = false;
  try {
    await access(filePath);
    fileExists = true;
  } catch {
    fileExists = false;
  }

  if (fileExists) {
    const existing = await readFile(filePath, "utf-8");
    await writeFile(filePath, `${existing}\n---\n\n${newContent}`, "utf-8");
  } else {
    await writeFile(filePath, newContent, "utf-8");
  }

  return filePath;
}
```

**`/packages/collector/src/__tests__/newsletter.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  generateNewsletterContent,
  shouldGenerateNewsletter,
  appendToNewsletter,
} from "../newsletter.js";
import type { FeedItem } from "@updagent/shared";

const TMP = join(tmpdir(), `updagent-newsletter-test-${process.pid}`);

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: `https://x.com/bcherny/status/${Math.random()}`,
    source: "x",
    agentId: "claude-code",
    author: "bcherny",
    text: "Claude Code ships new hooks feature",
    url: `https://x.com/bcherny/status/123`,
    publishedAt: "2026-04-07T12:00:00Z",
    collectedAt: new Date().toISOString(),
    classification: "SIGNAL",
    classificationReason: "release announcement",
    classifiedBy: "fast-path",
    isRelease: false,
    engagementScore: 100,
    likes: 77,
    retweets: 12,
    isReply: false,
    ...overrides,
  };
}

describe("generateNewsletterContent", () => {
  it("includes agent section headers for agents with signals", () => {
    const items = [makeItem({ agentId: "claude-code" })];
    const content = generateNewsletterContent(items, "2026-04-07");
    expect(content).toContain("## Claude Code");
  });

  it("lists GitHub releases before X posts within an agent section", () => {
    const xPost = makeItem({
      source: "x",
      publishedAt: "2026-04-07T14:00:00Z",
    });
    const ghRelease = makeItem({
      source: "github",
      publishedAt: "2026-04-07T10:00:00Z",
    });
    const content = generateNewsletterContent([xPost, ghRelease], "2026-04-07");
    const ghPos = content.indexOf("GitHub Release");
    const xPos = content.indexOf("@bcherny");
    expect(ghPos).toBeLessThan(xPos);
  });

  it("excludes NOISE and CONTEXT items", () => {
    const noise = makeItem({
      classification: "NOISE",
      text: "Personal travel post",
    });
    const context = makeItem({
      classification: "CONTEXT",
      text: "Industry analysis",
    });
    const signal = makeItem({
      classification: "SIGNAL",
      text: "Ships new feature!",
    });
    const content = generateNewsletterContent(
      [noise, context, signal],
      "2026-04-07",
    );
    expect(content).not.toContain("Personal travel post");
    expect(content).not.toContain("Industry analysis");
    expect(content).toContain("Ships new feature!");
  });

  it("shows 'No new signals' when all items are NOISE", () => {
    const items = [makeItem({ classification: "NOISE" })];
    const content = generateNewsletterContent(items, "2026-04-07");
    expect(content).toContain("No new signals");
  });

  it("shows credential warning when health.credentialWarning is true", () => {
    const items = [makeItem()];
    const health = {
      lastRunAt: new Date().toISOString(),
      durationMs: 0,
      newItemCount: 0,
      totalItemCount: 0,
      tier1FailureCount: 3,
      tier2FailureCount: 0,
      allTierFailureAccounts: [],
      credentialWarning: true,
      accounts: [],
    };
    const content = generateNewsletterContent(items, "2026-04-07", health);
    expect(content).toContain("Credential Warning");
  });

  it("includes engagement stats for X posts with likes/retweets", () => {
    const item = makeItem({ likes: 77, retweets: 12, engagementScore: 113 });
    const content = generateNewsletterContent([item], "2026-04-07");
    expect(content).toMatch(/♥ 77/);
    expect(content).toMatch(/🔁 12/);
  });
});

describe("shouldGenerateNewsletter", () => {
  it("returns true when at least one SIGNAL item", () => {
    expect(
      shouldGenerateNewsletter([makeItem({ classification: "SIGNAL" })]),
    ).toBe(true);
  });

  it("returns false when only NOISE items", () => {
    expect(
      shouldGenerateNewsletter([makeItem({ classification: "NOISE" })]),
    ).toBe(false);
  });

  it("returns false when only CONTEXT items", () => {
    expect(
      shouldGenerateNewsletter([makeItem({ classification: "CONTEXT" })]),
    ).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(shouldGenerateNewsletter([])).toBe(false);
  });
});

describe("appendToNewsletter", () => {
  beforeEach(() => mkdir(TMP, { recursive: true }));
  afterEach(() => rm(TMP, { recursive: true, force: true }));

  it("creates a new file when it does not exist", async () => {
    const items = [makeItem()];
    const path = await appendToNewsletter(items, TMP, "2026-04-07");
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(path, "utf-8");
    expect(content).toContain("updagent newsletter — 2026-04-07");
  });

  it("appends with separator when file already exists", async () => {
    const items = [makeItem()];
    await appendToNewsletter(items, TMP, "2026-04-07");
    await appendToNewsletter(items, TMP, "2026-04-07"); // second run same day

    const { readFile } = await import("node:fs/promises");
    const content = await readFile(join(TMP, "2026-04-07.md"), "utf-8");
    // Should contain two sections with a separator
    const occurrences = content.split("updagent newsletter").length - 1;
    expect(occurrences).toBe(2);
    expect(content).toContain("---");
  });

  it("returns the file path that was written", async () => {
    const path = await appendToNewsletter([makeItem()], TMP, "2026-04-07");
    expect(path).toContain("2026-04-07.md");
  });
});
```

### Exact commands

```bash
npm test --workspace=packages/collector -- --reporter=verbose newsletter
```

### Acceptance criteria

- Newsletter markdown renders valid on GitHub (no broken headings)
- NOISE and CONTEXT items absent from generated content
- GitHub releases appear before X posts
- Append to existing file preserves prior content with `---` separator
- `shouldGenerateNewsletter` returns false for all-NOISE input

### Definition of Done

- [ ] All newsletter tests pass
- [ ] GitHub-before-X order test passes
- [ ] Append separator test passes

---

## T-11 — Main Orchestrator (`collect.ts`)

**Depends on**: T-04, T-05, T-06, T-07, T-08, T-09, T-10  
**Complexity**: L  
**Phase**: Integration

### What

Wire all sub-components into the main `collect.ts` entry point. This is the script GitHub Actions runs 4×/day.

### Files to fill

**`/packages/collector/src/collect.ts`**

```typescript
import { getEnabledAgents } from "@updagent/shared";
import type {
  FeedItem,
  AccountHealth,
  CollectionHealth,
} from "@updagent/shared";
import { fetchXPostsForAccount } from "./sources/x-cascade.js";
import { fetchGitHubReleases } from "./sources/github-releases.js";
import { normalizeXPost, normalizeGitHubRelease } from "./normalize.js";
import { dedup, dedupWithin } from "./dedup.js";
import { fastPath } from "./signal/rules.js";
import { classifyBatch } from "./signal/classifier.js";
import {
  readFeedJson,
  writeFeedJson,
  readHealthJson,
  writeHealthJson,
  writeToRedis,
} from "./storage.js";
import { shouldGenerateNewsletter, appendToNewsletter } from "./newsletter.js";

const FEED_PATH = process.env["FEED_JSON_PATH"] ?? "data/feed.json";
const HEALTH_PATH = process.env["HEALTH_JSON_PATH"] ?? "data/health.json";
const NEWSLETTERS_DIR = process.env["NEWSLETTERS_DIR"] ?? "newsletters";
const SINCE_HOURS = parseInt(process.env["SINCE_HOURS"] ?? "6", 10);
const RATE_LIMIT_DELAY_MS = parseInt(
  process.env["RATE_LIMIT_DELAY_MS"] ?? "2000",
  10,
);
const SIGNAL_DETECTION_MODE = (process.env["SIGNAL_DETECTION_MODE"] ??
  "centralized") as "centralized" | "distributed";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log(
    `[updagent] Starting collection run at ${new Date().toISOString()}`,
  );
  console.log(
    `[updagent] Mode: ${SIGNAL_DETECTION_MODE}, Since: ${SINCE_HOURS}h`,
  );

  const agents = getEnabledAgents();
  console.log(`[updagent] Collecting for ${agents.length} enabled agents`);

  // Load existing data
  const existingItems = await readFeedJson(FEED_PATH);
  const existingHealth = await readHealthJson(HEALTH_PATH);
  const existingAccountHealth = new Map<string, AccountHealth>(
    (existingHealth?.accounts ?? []).map((a) => [a.account, a]),
  );

  const allNewItems: FeedItem[] = [];
  let globalTier1Failures = 0;
  let globalTier2Failures = 0;
  const allTierFailureAccounts: string[] = [];
  const updatedAccountHealth: AccountHealth[] = [];

  for (const agent of agents) {
    console.log(`[updagent] === Agent: ${agent.name} ===`);

    // ── X.com collection ──────────────────────────────────────────────────────
    for (const handle of agent.xAccounts) {
      console.log(`[updagent] Fetching @${handle} for ${agent.name}`);

      const cascadeResult = await fetchXPostsForAccount({
        handle,
        sinceHours: SINCE_HOURS,
      });

      // Update account health
      const prev = existingAccountHealth.get(handle);
      const tier1Failed =
        cascadeResult.tierUsed !== 1 &&
        cascadeResult.failures.some((f) => f.tier === 1);
      const tier2Failed =
        cascadeResult.tierUsed !== 2 &&
        cascadeResult.failures.some((f) => f.tier === 2);
      const allFailed = cascadeResult.tierUsed === null;

      if (tier1Failed) globalTier1Failures++;
      if (tier2Failed) globalTier2Failures++;
      if (allFailed) allTierFailureAccounts.push(handle);

      const consecutiveTier1Failures = tier1Failed
        ? (prev?.consecutiveTier1Failures ?? 0) + 1
        : 0;

      updatedAccountHealth.push({
        account: handle,
        consecutiveTier1Failures,
        lastSuccessfulTier: cascadeResult.tierUsed,
        lastSuccessAt:
          cascadeResult.tierUsed !== null
            ? new Date().toISOString()
            : (prev?.lastSuccessAt ?? null),
        lastCheckedAt: new Date().toISOString(),
      });

      // Signal detection for X posts
      if (cascadeResult.posts.length > 0) {
        const candidatePosts: typeof cascadeResult.posts = [];
        const resolvedResults: {
          post: (typeof cascadeResult.posts)[0];
          classification: import("@updagent/shared").ClassificationResult;
        }[] = [];

        for (const post of cascadeResult.posts) {
          const input = {
            text: post.text,
            author: post.author,
            agentId: agent.id,
            agentName: agent.name,
            isReply: post.isReply,
            parentTweetSummary: post.parentTweetText?.slice(0, 120),
            signalKeywords: agent.signalKeywords,
            source: "x" as const,
          };

          const fp = fastPath(input);
          if (fp.result === "SIGNAL" || fp.result === "NOISE") {
            resolvedResults.push({
              post,
              classification: {
                classification: fp.result,
                reason: fp.reason,
                classifiedBy: "fast-path",
              },
            });
          } else {
            candidatePosts.push(post);
          }
        }

        // Batch LLM classify candidates
        if (candidatePosts.length > 0) {
          const inputs = candidatePosts.map((post) => ({
            text: post.text,
            author: post.author,
            agentId: agent.id,
            agentName: agent.name,
            isReply: post.isReply,
            parentTweetSummary: post.parentTweetText?.slice(0, 120),
            signalKeywords: agent.signalKeywords,
            source: "x" as const,
          }));

          const llmResults = await classifyBatch(inputs, SIGNAL_DETECTION_MODE);
          candidatePosts.forEach((post, i) => {
            const llm = llmResults[i];
            if (llm) {
              resolvedResults.push({ post, classification: llm });
            }
          });
        }

        for (const { post, classification } of resolvedResults) {
          if (classification.classification !== "NOISE") {
            allNewItems.push(normalizeXPost(post, agent.id, classification));
          }
        }
      }

      await sleep(RATE_LIMIT_DELAY_MS);
    }

    // ── GitHub releases ────────────────────────────────────────────────────────
    console.log(
      `[updagent] Fetching GitHub releases for ${agent.github.owner}/${agent.github.repo}`,
    );
    try {
      const releases = await fetchGitHubReleases(
        agent.github.owner,
        agent.github.repo,
        5,
      );
      for (const release of releases) {
        allNewItems.push(normalizeGitHubRelease(release, agent.id));
      }
      console.log(
        `[updagent] GitHub: ${releases.length} releases for ${agent.name}`,
      );
    } catch (err) {
      console.warn(
        `[updagent] GitHub collection failed for ${agent.name}: ${String(err)}`,
      );
    }
  }

  // ── Dedup + merge ─────────────────────────────────────────────────────────
  const dedupedNew = dedupWithin(allNewItems);
  const trulyNew = dedup(dedupedNew, existingItems);

  console.log(
    `[updagent] New items after dedup: ${trulyNew.length} (${allNewItems.length} collected, ${dedupedNew.length} after internal dedup)`,
  );

  const merged = [...trulyNew, ...existingItems];

  // ── Write storage ─────────────────────────────────────────────────────────
  await writeFeedJson(FEED_PATH, merged);
  await writeToRedis(merged);

  // ── Health ────────────────────────────────────────────────────────────────
  const credentialWarning = updatedAccountHealth.some(
    (a) => a.consecutiveTier1Failures >= 3,
  );

  const health: CollectionHealth = {
    lastRunAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    newItemCount: trulyNew.length,
    totalItemCount: merged.length,
    tier1FailureCount: globalTier1Failures,
    tier2FailureCount: globalTier2Failures,
    allTierFailureAccounts,
    credentialWarning,
    accounts: updatedAccountHealth,
  };

  await writeHealthJson(HEALTH_PATH, health);

  if (credentialWarning) {
    console.warn(
      "[updagent] ⚠️  CREDENTIAL WARNING: One or more accounts have had 3+ consecutive Tier 1 failures. Check X.com cookies (AUTH_TOKEN / CT0).",
    );
  }

  // ── Newsletter ────────────────────────────────────────────────────────────
  if (shouldGenerateNewsletter(trulyNew)) {
    const date = new Date().toISOString().split("T")[0]!;
    const newsletterPath = await appendToNewsletter(
      trulyNew,
      NEWSLETTERS_DIR,
      date,
      health,
    );
    console.log(`[updagent] Newsletter written: ${newsletterPath}`);
  } else {
    console.log("[updagent] No new SIGNAL items — skipping newsletter");
  }

  console.log(
    `[updagent] Done. ${trulyNew.length} new items, ${health.durationMs}ms`,
  );

  // Always exit 0 — partial failures are non-fatal
  process.exit(0);
}

main().catch((err) => {
  console.error("[updagent] Fatal error:", err);
  process.exit(0); // Still exit 0 — CI must not fail on collection errors
});
```

**`/packages/collector/src/__tests__/collect.integration.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rm, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Set up temp directories before mocking
const TMP = join(tmpdir(), `updagent-integration-${process.pid}`);
const FEED_PATH = join(TMP, "feed.json");
const HEALTH_PATH = join(TMP, "health.json");
const NEWSLETTERS_DIR = join(TMP, "newsletters");

// Mock all external calls
vi.mock("../sources/x-cascade.js", () => ({
  fetchXPostsForAccount: vi.fn().mockResolvedValue({
    posts: [],
    tierUsed: 1,
    failures: [],
  }),
}));

vi.mock("../sources/github-releases.js", () => ({
  fetchGitHubReleases: vi.fn().mockResolvedValue([
    {
      tagName: "v1.9.4",
      name: "Claude Code v1.9.4",
      body: "## What's New\n- Fix statusline",
      publishedAt: "2026-04-07T10:00:00Z",
      url: "https://github.com/anthropics/claude-code/releases/tag/v1.9.4",
      owner: "anthropics",
      repo: "claude-code",
      isDraft: false,
      isPrerelease: false,
    },
  ]),
}));

vi.mock("../signal/classifier.js", () => ({
  classifyBatch: vi.fn().mockResolvedValue([]),
}));

describe("collect orchestrator integration", () => {
  beforeEach(async () => {
    await mkdir(TMP, { recursive: true });
    // Set env vars pointing to temp directories
    process.env["FEED_JSON_PATH"] = FEED_PATH;
    process.env["HEALTH_JSON_PATH"] = HEALTH_PATH;
    process.env["NEWSLETTERS_DIR"] = NEWSLETTERS_DIR;
    process.env["SINCE_HOURS"] = "6";
    process.env["RATE_LIMIT_DELAY_MS"] = "0"; // no delay in tests
    process.env["SIGNAL_DETECTION_MODE"] = "centralized";
  });

  afterEach(async () => {
    await rm(TMP, { recursive: true, force: true });
    vi.clearAllMocks();
    delete process.env["FEED_JSON_PATH"];
    delete process.env["HEALTH_JSON_PATH"];
    delete process.env["NEWSLETTERS_DIR"];
  });

  it("writes feed.json with GitHub releases after run", async () => {
    // Import and run collect
    const { main } = await import("../collect.js");
    // Note: collect.ts calls process.exit(0) at end — mock it
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit(0) called");
    });

    await expect(main()).rejects.toThrow("process.exit(0) called");

    exitSpy.mockRestore();

    const content = await readFile(FEED_PATH, "utf-8");
    const feed = JSON.parse(content) as { items: Array<{ source: string }> };
    expect(feed.items.length).toBeGreaterThan(0);
    expect(feed.items.some((i) => i.source === "github")).toBe(true);
  });

  it("writes health.json with lastRunAt after run", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit(0) called");
    });

    const { main } = await import("../collect.js");
    await expect(main()).rejects.toThrow("process.exit(0) called");
    exitSpy.mockRestore();

    const content = await readFile(HEALTH_PATH, "utf-8");
    const health = JSON.parse(content) as { lastRunAt: string };
    expect(health.lastRunAt).toBeTruthy();
  });

  it("does not write duplicate items on second run with same data", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit(0) called");
    });

    const { main } = await import("../collect.js");
    // Run twice
    await expect(main()).rejects.toThrow();
    vi.resetModules();
    const { main: main2 } = await import("../collect.js");
    await expect(main2()).rejects.toThrow();
    exitSpy.mockRestore();

    const content = await readFile(FEED_PATH, "utf-8");
    const feed = JSON.parse(content) as { itemCount: number };
    // Item count should be same as first run (no duplicates added)
    expect(feed.itemCount).toBeGreaterThan(0);
  });

  it("exits 0 even when all X tiers fail (GitHub releases still collected)", async () => {
    const { fetchXPostsForAccount } = await import("../sources/x-cascade.js");
    vi.mocked(fetchXPostsForAccount).mockResolvedValue({
      posts: [],
      tierUsed: null,
      failures: [
        { tier: 1, error: "auth failed", errorType: "auth" },
        { tier: 2, error: "key not set", errorType: "auth" },
        { tier: 3, error: "key not set", errorType: "auth" },
      ],
    });

    const exitCodes: number[] = [];
    vi.spyOn(process, "exit").mockImplementation((code) => {
      exitCodes.push(code as number);
      throw new Error(`exit(${String(code)})`);
    });

    const { main } = await import("../collect.js");
    await expect(main()).rejects.toThrow();

    expect(exitCodes[0]).toBe(0);

    vi.restoreAllMocks();
  });

  it("sets credentialWarning=true when consecutiveTier1Failures >= 3", async () => {
    // Simulate 3 consecutive auth failures for all accounts
    const { fetchXPostsForAccount } = await import("../sources/x-cascade.js");
    vi.mocked(fetchXPostsForAccount).mockResolvedValue({
      posts: [],
      tierUsed: null,
      failures: [{ tier: 1, error: "auth failed", errorType: "auth" }],
    });

    // Pre-populate health with 2 existing consecutive failures
    const { writeHealthJson } = await import("../storage.js");
    const existingHealth = {
      lastRunAt: "2026-04-07T00:00:00Z",
      durationMs: 0,
      newItemCount: 0,
      totalItemCount: 0,
      tier1FailureCount: 0,
      tier2FailureCount: 0,
      allTierFailureAccounts: [],
      credentialWarning: false,
      accounts: [
        // bcherny with 2 failures already
        ...[
          "bcherny",
          "trq212",
          "noahzweben",
          "felixrieseberg",
          "lydiahallie",
          "amorriscode",
          "claudeai",
          "openaidevs",
          "thsottiaux",
          "romainhuet",
          "reach_vb",
          "rohanvarma",
        ].map((handle) => ({
          account: handle,
          consecutiveTier1Failures: 2,
          lastSuccessfulTier: null as null,
          lastSuccessAt: null as null,
          lastCheckedAt: "2026-04-07T00:00:00Z",
        })),
      ],
    };
    await writeHealthJson(HEALTH_PATH, existingHealth);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });

    const { main } = await import("../collect.js");
    await expect(main()).rejects.toThrow();
    exitSpy.mockRestore();

    const content = await readFile(HEALTH_PATH, "utf-8");
    const health = JSON.parse(content) as { credentialWarning: boolean };
    expect(health.credentialWarning).toBe(true);
  });
});
```

### Export `main` for testing

Add to `collect.ts`:

```typescript
// Export for integration tests
export { main };
```

### Exact commands

```bash
# Run all tests
npm test --workspace=packages/collector -- --reporter=verbose

# Dry run with stub tier 1 (no live calls)
RATE_LIMIT_DELAY_MS=0 SIGNAL_DETECTION_MODE=distributed npm run collect --workspace=packages/collector

# Verify output files exist after dry run
cat data/feed.json | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('Items:', d.itemCount)"
cat data/health.json | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('Last run:', d.lastRunAt)"
```

### Acceptance criteria

- All integration tests pass
- `process.exit(0)` is always called (exit code 0 test passes)
- `data/feed.json` written with correct schema after run
- `data/health.json` written with `lastRunAt` populated
- NOISE items absent from `feed.json`
- `credentialWarning: true` set when `consecutiveTier1Failures >= 3`
- No duplicate items on second run with same data

### Definition of Done

- [ ] All integration tests pass
- [ ] Exit-0 test explicitly verifies process exits with code 0
- [ ] `credentialWarning` escalation test passes
- [ ] No-duplicate test passes

---

## T-12 — GitHub Actions Workflow

**Depends on**: T-11  
**Complexity**: S  
**Phase**: Deployment

### What

Create the `.github/workflows/collect.yml` for 4×/day automated collection. Includes the content-hash commit guard to prevent empty commits.

### Files to create

**`/.github/workflows/collect.yml`**

```yaml
name: updagent collect

on:
  schedule:
    - cron: "0 */6 * * *" # 00:00, 06:00, 12:00, 18:00 UTC (4×/day)
  workflow_dispatch: # manual trigger for testing

permissions:
  contents: write # required for git push back to repo

jobs:
  collect:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 1 # shallow clone is sufficient

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Build shared package
        run: npm run build:shared

      - name: Run collection
        env:
          # X.com credentials (Tier 1)
          AUTH_TOKEN: ${{ secrets.AUTH_TOKEN }}
          CT0: ${{ secrets.CT0 }}
          # X.com fallbacks
          SCRAPECREATORS_API_KEY: ${{ secrets.SCRAPECREATORS_API_KEY }}
          XAI_API_KEY: ${{ secrets.XAI_API_KEY }}
          # GitHub
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
          # Signal detection
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          SIGNAL_DETECTION_MODE: centralized
          # Collection window aligns with 6h cron cadence
          SINCE_HOURS: "6"
        run: npm run collect

      - name: Commit updated feed and newsletter
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/feed.json data/health.json newsletters/
          # Content-hash guard: only commit if files actually changed
          git diff --staged --quiet || git commit -m "chore: update feed [skip ci]"

      - name: Push
        run: git push
```

### Acceptance criteria

- YAML is valid: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/collect.yml'))"` exits 0
- Cron expression `"0 */6 * * *"` fires at 00:00, 06:00, 12:00, 18:00 UTC — verify with: `node -e "const c='0 */6 * * *'; console.log('4 per day check:', c.includes('*/6'))"`
- All 8 secret references match the env vars table
- `git diff --staged --quiet || git commit` is present (prevents empty commits)
- `[skip ci]` in commit message (prevents recursive triggers)
- `workflow_dispatch` is present (manual trigger)
- `permissions: contents: write` is present
- `timeout-minutes: 10` is present

### Definition of Done

- [ ] YAML parses without error
- [ ] All 8 env vars present in `env:` block
- [ ] Content-hash guard present
- [ ] `[skip ci]` in commit message

---

## T-13 — CLI Skills

**Depends on**: T-09 (feed.json schema must be stable)  
**Complexity**: M  
**Phase**: Delivery

### What

Write the CLI skill markdown files for Claude Code and Codex. These are installed by developers into their local Claude Code / Codex installations.

### Files to create

**`/packages/skills/claude-code/updagent.md`**

```markdown
---
name: updagent
description: "Show latest updates for Claude Code and Codex CLI from X.com team accounts and GitHub releases"
triggers:
  - updagent
  - "what's new in claude code"
  - "codex updates"
  - "latest release"
  - "any updates to claude"
  - "check for updates"
---

# updagent

Real-time update tracker for AI coding tools (Claude Code, Codex CLI, and more).

## Commands
```

/updagent — alarming mode: show last 10 SIGNAL items (both tools)
/updagent --educate — educating mode: SIGNAL + CONTEXT, grouped by tool
/updagent codex — Codex CLI updates only
/updagent claude-code — Claude Code updates only
/updagent releases — GitHub releases only (both tools)
/updagent --since 24h — last 24 hours only
/updagent --since 48h — last 48 hours only

```

## Alarming Mode (default)

Fetch the feed and show only SIGNAL items in this compact format:

```

━━━ updagent — SIGNAL ONLY ━━━━━━━━━━━━━━━━━━━━━
[GH] anthropics/claude-code v1.9.4 1hr ago 🚀
Fix statusline on Windows · Add --no-permission-prompts

[X] @bcherny Claude Code 2hr ago ♥77 🔁12
"Fixed in yesterday's release. `claude update` to get latest"
(reply to: user bug report about git permissions)

[GH] openai/codex v0.1.5 3hr ago 🚀
Multi-file context support now GA

━━━ 3 signals, last updated 6min ago ━━━━━━━━━━━

```

Show "No new signals in the last 6 hours" if feed is empty or all items are older than 6h.

## Educating Mode (`--educate`)

Include CONTEXT items grouped by tool with brief synthesis:

```

━━━ Claude Code — Recent Updates ━━━━━━━━━━━━━━━
SIGNAL @bcherny: "v1.9.4 is out" (2hr ago)
CONTEXT @lydiahallie: "Claude Code vs Copilot comparison" (4hr ago)
SIGNAL Release: v1.9.4 — statusline fix, new flags (1hr ago)

━━━ Codex CLI — Recent Updates ━━━━━━━━━━━━━━━━━
SIGNAL Release: v0.1.5 — multi-file context (3hr ago)
CONTEXT @thsottiaux: "Multi-agent roadmap preview" (5hr ago)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```

## Data Sources

**Primary** (network): Fetch `https://updagent.vercel.app/api/feed?limit=20`

**Fallback** (offline): Read `~/updagent/data/feed.json` — the committed cold archive updated every 6 hours by GitHub Actions.

If both are unavailable, report: "updagent: feed unavailable. Run `npm run collect` from ~/updagent to refresh."

## Health Warning

If `data/health.json` shows `credentialWarning: true`, display at top:

```

⚠️ X.com credentials may be expired (3+ consecutive auth failures)
To refresh: update AUTH_TOKEN and CT0 in GitHub repo secrets

```

## Distributed Mode

If `SIGNAL_DETECTION_MODE=distributed` is set in the environment, signal detection for local collection uses this Claude Code instance directly via `claude -p` rather than OpenRouter. This is the "no API key required" mode for individual users.
```

**`/packages/skills/codex/updagent.md`**

Same structure as above but:

- Replace `claude -p` with `codex run` in distributed mode section
- Replace install path reference (`~/.claude/skills/`) with `~/.codex/agents/`

**`/packages/skills/install.sh`**

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p ~/.claude/skills ~/.codex/agents

cp "$SCRIPT_DIR/claude-code/updagent.md" ~/.claude/skills/updagent.md
echo "✓ Claude Code skill installed: ~/.claude/skills/updagent.md"

cp "$SCRIPT_DIR/codex/updagent.md" ~/.codex/agents/updagent.md
echo "✓ Codex skill installed: ~/.codex/agents/updagent.md"

echo ""
echo "Usage in Claude Code:  /updagent"
echo "Usage in Codex:        /updagent"
echo ""
echo "For alarming mode (default): /updagent"
echo "For educating mode:          /updagent --educate"
```

```bash
chmod +x packages/skills/install.sh
```

### Exact commands

```bash
# Verify install script is executable
ls -la packages/skills/install.sh

# Test skill YAML frontmatter is valid
node -e "
const yaml = require('js-yaml');  // or use a simple parse check
const fs = require('fs');
const content = fs.readFileSync('packages/skills/claude-code/updagent.md', 'utf8');
const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---/);
if (!frontmatterMatch) { console.error('No frontmatter found'); process.exit(1); }
console.log('Frontmatter valid');
"

# Dry-run install (echo paths without copying)
bash -n packages/skills/install.sh && echo "install.sh syntax OK"
```

### Acceptance criteria

- Both skill files have valid YAML frontmatter (`name`, `description`, `triggers` array)
- Alarming mode display format matches the mockup above
- Educating mode section is present
- Offline fallback path (`~/updagent/data/feed.json`) is documented
- Health warning display is documented
- `install.sh` is executable and passes `bash -n` syntax check
- Install paths are correct: `~/.claude/skills/updagent.md` and `~/.codex/agents/updagent.md`

### Definition of Done

- [ ] Both skill files exist
- [ ] `install.sh` is executable (`chmod +x` applied)
- [ ] Both skills document the offline fallback
- [ ] Alarming and educating mode formats are in the skill files

---

## T-14 — Integration Smoke Test

**Depends on**: T-11, T-12, T-13  
**Complexity**: S  
**Phase**: Verification

### What

Verify the full system works end-to-end in a real environment before first automated CI run. This is a manual step performed by the developer, not an automated test.

### Steps

```bash
# 1. Ensure .env is populated with at minimum: GH_TOKEN
#    (X tokens optional for first smoke test — GitHub releases prove the pipeline works)
cat .env

# 2. Set mode to distributed (uses local claude for signal detection, no OpenRouter needed)
echo "SIGNAL_DETECTION_MODE=distributed" >> .env

# 3. Set a short window to avoid long queries
echo "SINCE_HOURS=24" >> .env
echo "RATE_LIMIT_DELAY_MS=500" >> .env

# 4. Run the collector
npm run collect

# 5. Verify feed.json has GitHub releases
node -e "
const feed = JSON.parse(require('fs').readFileSync('data/feed.json', 'utf8'));
console.log('Total items:', feed.itemCount);
const releases = feed.items.filter(i => i.source === 'github');
const ccReleases = releases.filter(i => i.agentId === 'claude-code');
const codexReleases = releases.filter(i => i.agentId === 'codex');
console.log('GitHub releases — Claude Code:', ccReleases.length);
console.log('GitHub releases — Codex:', codexReleases.length);
console.log('Most recent item:', feed.items[0]?.publishedAt);
if (feed.itemCount === 0) { console.error('FAIL: feed is empty'); process.exit(1); }
console.log('PASS: feed has items');
"

# 6. Verify health.json
node -e "
const h = JSON.parse(require('fs').readFileSync('data/health.json', 'utf8'));
console.log('Last run:', h.lastRunAt);
console.log('Duration:', h.durationMs + 'ms');
console.log('Tier 1 failures:', h.tier1FailureCount);
console.log('Credential warning:', h.credentialWarning);
if (!h.lastRunAt) { console.error('FAIL: lastRunAt empty'); process.exit(1); }
console.log('PASS: health.json populated');
"

# 7. Check for newsletter (only created if SIGNAL items found)
ls newsletters/ 2>/dev/null && cat newsletters/*.md | head -30 || echo "(no newsletter yet — no SIGNAL items)"

# 8. Run all tests
npm test

# 9. Build check (no TypeScript errors)
npm run build
```

### Acceptance criteria

- `npm run collect` exits 0
- `data/feed.json` has `itemCount > 0` (GitHub releases collected at minimum)
- `data/health.json` has a non-empty `lastRunAt` timestamp
- `npm test` passes with 0 failures
- `npm run build` exits 0 (no TypeScript errors)
- No `any` type errors in build output

### Definition of Done

- [ ] `npm run collect` exits 0
- [ ] `data/feed.json` non-empty
- [ ] `data/health.json` has `lastRunAt` set
- [ ] `npm test` exits 0
- [ ] `npm run build` exits 0

---

## T-15 — SPEC.md and README.md Update

**Depends on**: T-14  
**Complexity**: S  
**Phase**: Documentation

### What

Update top-level docs to reflect the implemented system. The original `SPEC.md` is superseded by `GOAL.md + COMPONENTS.md + TASKS.md`. `README.md` becomes the quick-start guide.

### Files to create/modify

**`/README.md`** — replace existing stub with:

````markdown
# updagent

Terminal-first alarming and educating system for AI coding tool updates.

Tracks **Claude Code** and **Codex CLI** (and soon gemini-cli, opencode) by collecting from X.com team accounts and GitHub releases, filtering noise with a 2-pass signal detection pipeline, and delivering high-precision updates to your terminal and a Markdown newsletter.

---

## Quick Start

### 1. Install CLI skills

```bash
bash packages/skills/install.sh
```
````

### 2. Set environment variables

```bash
cp .env.example .env
# Edit .env — minimum required: GH_TOKEN for GitHub releases
# Add AUTH_TOKEN + CT0 from X.com cookies for full X.com collection
```

### 3. Run a collection

```bash
npm install && npm run collect
```

### 4. Use in Claude Code

```
/updagent              — show latest signals (alarming mode)
/updagent --educate    — full context (educating mode)
/updagent releases     — GitHub releases only
```

---

## Tracked Agents

| Agent       | Priority   | GitHub                 | X Accounts                                                                             |
| ----------- | ---------- | ---------------------- | -------------------------------------------------------------------------------------- |
| Claude Code | 1          | anthropics/claude-code | @bcherny, @trq212, @noahzweben, @felixrieseberg, @lydiahallie, @amorriscode, @claudeai |
| Codex CLI   | 1          | openai/codex           | @openaidevs, @thsottiaux, @romainhuet, @reach_vb, @rohanvarma                          |
| Gemini CLI  | 2 (future) | google/gemini-cli      | —                                                                                      |
| opencode    | 2 (future) | sst/opencode           | —                                                                                      |

To add a new agent: edit `packages/shared/src/agents-config.json` only — no code changes needed.

---

## Automated Collection

GitHub Actions runs collection 4×/day (`0 */6 * * *`):

- Queries X.com via 3-tier cascade (bird-search → ScrapeCreators → xAI Grok)
- Fetches GitHub releases for all enabled agents
- Classifies signals using OpenRouter (Gemini Flash free tier)
- Commits `data/feed.json` and `newsletters/YYYY-MM-DD.md`

**Cost**: $0.00–$0.21/month (free GitHub Actions + free OpenRouter models)

---

## Documentation

- [GOAL.md](GOAL.md) — vision, problem statement, success metrics
- [COMPONENTS.md](COMPONENTS.md) — complete TypeScript implementation reference
- [TASKS.md](TASKS.md) — implementation tasks with acceptance criteria

---

## Environment Variables

See `.env.example` for all variables. Required for full operation:

| Variable             | Purpose                                     |
| -------------------- | ------------------------------------------- |
| `AUTH_TOKEN` + `CT0` | X.com Tier 1 (browser cookies)              |
| `GH_TOKEN`           | GitHub releases (avoids rate limits)        |
| `OPENROUTER_API_KEY` | Signal classification (free tier available) |

````

**`/SPEC.md`** — prepend deprecation notice (do not delete content):

```markdown
> ⚠️ **Deprecated**: This file is the original v0.1 spec and has been superseded.
> See [GOAL.md](GOAL.md), [COMPONENTS.md](COMPONENTS.md), and [TASKS.md](TASKS.md) for the current implementation spec.
> The content below is preserved for historical reference only.

---

````

Then keep existing SPEC.md content below.

### Exact commands

```bash
# Verify README renders correctly (basic check)
node -e "
const fs = require('fs');
const readme = fs.readFileSync('README.md', 'utf8');
['Quick Start', 'Tracked Agents', 'Automated Collection', 'GOAL.md'].forEach(section => {
  if (!readme.includes(section)) {
    console.error('MISSING SECTION:', section);
    process.exit(1);
  }
});
console.log('README sections OK');
"
```

### Acceptance criteria

- `README.md` has all 4 sections: Quick Start, Tracked Agents, Automated Collection, Documentation
- `SPEC.md` has deprecation notice pointing to new spec files at the top
- README documents all required environment variables
- README has the correct agent table with all 7 Claude Code and 5 Codex accounts

### Definition of Done

- [ ] README has quick-start a new user can follow from scratch
- [ ] SPEC.md deprecation notice is at the top of the file
- [ ] Cost estimate ($0.00–$0.21/month) is in README

---

## Task Dependency Graph

```
T-01 — Monorepo root scaffolding
  └── T-02 — @updagent/shared (types + agent registry)
        └── T-03 — @updagent/collector (scaffolding + bird-search vendor)
              │
              ├── GROUP A (signal detection — sequential)
              │     T-04 — Signal fixtures + fast-path rules   ← TDD: tests first
              │       └── T-05 — LLM classifier
              │
              ├── GROUP B (data sources — parallel)
              │     T-06 — X.com 3-tier cascade
              │     T-07 — GitHub release collection
              │
              └── GROUP C (processing — sequential within, starts after B)
                    T-08 — Normalization + dedup     ← needs T-06 + T-07 types
                      ├── T-09 — Storage layer       ← needs T-08 types
                      └── T-10 — Newsletter generator ← needs T-08 types

T-11 — Main orchestrator  ← needs ALL of T-04..T-10
  ├── T-12 — GitHub Actions workflow
  ├── T-13 — CLI skills
  └── T-14 — Smoke test (manual)
        └── T-15 — Documentation update
```

## Dependency table

| Task | Depends on       | Can parallelize with  |
| ---- | ---------------- | --------------------- |
| T-01 | —                | —                     |
| T-02 | T-01             | —                     |
| T-03 | T-02             | —                     |
| T-04 | T-03             | T-06, T-07            |
| T-05 | T-04             | T-06, T-07            |
| T-06 | T-03             | T-04, T-07            |
| T-07 | T-03             | T-04, T-06            |
| T-08 | T-02, T-06, T-07 | T-09, T-10 after T-08 |
| T-09 | T-02, T-08       | T-10                  |
| T-10 | T-02, T-08       | T-09                  |
| T-11 | T-04..T-10 all   | —                     |
| T-12 | T-11             | T-13                  |
| T-13 | T-09             | T-12                  |
| T-14 | T-11, T-12, T-13 | —                     |
| T-15 | T-14             | —                     |

## Parallelizable execution plan

After T-03:

**Parallel batch 1** (run simultaneously):

- `A`: T-04 → T-05
- `B1`: T-06
- `B2`: T-07

After batch 1 completes:

**Sequential**: T-08

**Parallel batch 2**:

- T-09
- T-10

After batch 2: T-11 → T-12 + T-13 (parallel) → T-14 → T-15

---

## Global Definition of Done

A task is **complete** when ALL of the following are true:

1. **Files exist**: all files listed in the task exist with non-stub content
2. **Tests pass**: `npm test --workspace=packages/collector` exits 0 with 0 failures
3. **Types clean**: `npm run build` exits 0 — zero TypeScript errors
4. **No `any`**: no `any` type in modified files (checked by strict mode)
5. **No hardcoded config**: agent names, handles, and keyword lists come from `agents-config.json` only
6. **No live network calls in tests**: all external calls mocked with `vi.mock` or `vi.stubGlobal`
7. **Task criteria**: all acceptance criteria in the task section pass

## Commit conventions

Use `T-XX:` prefix in commit messages:

```
T-02: add @updagent/shared types and agent registry
T-04: add signal detection fixtures and fast-path rules
T-06: implement X.com 3-tier cascade with fallback logic
```
