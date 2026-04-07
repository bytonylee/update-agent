# updagent — Component Specification

**Version**: 2.0  
**Date**: 2026-04-07  
**Status**: Approved (supersedes v1.0)

---

## Monorepo Structure

```
updagent/
├── packages/
│   ├── shared/                          # Shared types, agent registry, config
│   │   ├── src/
│   │   │   ├── types.ts                 # All TypeScript interfaces
│   │   │   ├── agents-config.json       # Agent registry (edit to add agents)
│   │   │   ├── registry.ts              # Typed loader for agents-config.json
│   │   │   └── index.ts                 # Re-exports everything
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── collector/                       # Core collection + detection engine
│   │   ├── src/
│   │   │   ├── collect.ts               # Main entry point (GitHub Actions)
│   │   │   ├── sources/
│   │   │   │   ├── x-bird.ts            # Tier 1: bird-search subprocess
│   │   │   │   ├── x-scrapecreators.ts  # Tier 2: ScrapeCreators REST API
│   │   │   │   ├── x-xai.ts             # Tier 3: xAI Grok x_search
│   │   │   │   ├── x-cascade.ts         # 3-tier orchestrator with fallback
│   │   │   │   └── github-releases.ts   # GitHub REST API v3
│   │   │   ├── signal/
│   │   │   │   ├── rules.ts             # Pass 1: keyword fast-path
│   │   │   │   ├── prompts.ts           # LLM prompt templates
│   │   │   │   └── classifier.ts        # Pass 2: OpenRouter / local agent
│   │   │   ├── normalize.ts             # Raw → FeedItem canonical schema
│   │   │   ├── dedup.ts                 # Deduplication by item ID
│   │   │   ├── storage.ts               # feed.json + health.json + Redis
│   │   │   ├── newsletter.ts            # Markdown newsletter generator
│   │   │   └── __tests__/
│   │   │       ├── signal-fixtures.ts   # ≥25 labeled tweet examples
│   │   │       ├── rules.test.ts        # Fast-path unit tests
│   │   │       ├── classifier.test.ts   # LLM classifier tests (mocked)
│   │   │       ├── cascade.test.ts      # Cascade fallback logic tests
│   │   │       └── collect.integration.test.ts
│   │   ├── scripts/
│   │   │   └── lib/vendor/bird-search/  # Vendored bird-search Node.js client
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   │
│   └── skills/                          # CLI skill templates
│       ├── claude-code/
│       │   └── updagent.md              # Install to ~/.claude/skills/
│       ├── codex/
│       │   └── updagent.md              # Install to ~/.codex/agents/
│       └── install.sh                   # One-command skill installer
│
├── data/
│   ├── feed.json                        # Cold archive (committed every 6h)
│   └── health.json                      # Tier health + credential warnings
│
├── newsletters/
│   └── YYYY-MM-DD.md                    # Auto-generated daily newsletters
│
├── .github/
│   └── workflows/
│       └── collect.yml                  # Cron: "0 */6 * * *" (4×/day)
│
├── package.json                         # Workspace root
├── tsconfig.json                        # Base TypeScript config (strict)
├── GOAL.md                              # Goal specification
├── COMPONENTS.md                        # This file
├── TASKS.md                             # Implementation tasks
├── architecture.excalidraw             # Visual diagram
└── opencli/                             # Submodule — reference only
```

---

## Component 1: `packages/shared`

### 1.1 Purpose

Single source of truth for all TypeScript types and the agent registry. Every other package imports from `@updagent/shared`. The registry is pure data — no logic beyond loading JSON.

### 1.2 `package.json`

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

### 1.3 `src/types.ts` — Complete interface definitions

```typescript
// ── Classification ──────────────────────────────────────────────────────────

export type SignalClassification = "SIGNAL" | "CONTEXT" | "NOISE";
export type SourceType = "x" | "github";
export type SignalDetectionMode = "centralized" | "distributed";
export type CascadeTier = 1 | 2 | 3;

// ── Canonical feed item ─────────────────────────────────────────────────────

export interface FeedItem {
  /** Unique stable ID.
   *  X posts:       full tweet URL (e.g. "https://x.com/bcherny/status/123")
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

### 1.4 `src/agents-config.json` — Complete registry

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

### 1.5 `src/registry.ts`

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

### 1.6 `src/index.ts`

```typescript
export * from "./types.js";
export * from "./registry.js";
```

---

## Component 2: `packages/collector`

### 2.1 Purpose

The heart of updagent. Runs in GitHub Actions on a `0 */6 * * *` cron (4×/day). Fetches X posts and GitHub releases for all enabled agents, normalizes, deduplicates, runs signal detection, writes storage, generates newsletters.

### 2.2 `package.json`

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

### 2.3 `vitest.config.ts`

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

---

### 2.4 Sub-component: X.com Collection (`src/sources/`)

#### 2.4.1 Error types (used across all tiers)

```typescript
// Shared error classes — import in each tier file

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

#### 2.4.2 `src/sources/x-bird.ts` — Tier 1

Wraps the vendored `bird-search` Node.js script exactly as used in `last30days-skill_example.md`.

```typescript
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import type { RawXPost } from "@updagent/shared";
import { BirdSearchAuthError, BirdSearchParseError } from "./errors.js";

const BIRD_SEARCH_PATH = resolve(
  import.meta.dirname,
  "../../scripts/lib/vendor/bird-search/bird-search.mjs",
);

export interface BirdSearchOptions {
  handle: string;
  sinceHours: number; // e.g. 6 for cron runs
  count?: number; // default 20
}

export function fetchFromBirdSearch(opts: BirdSearchOptions): RawXPost[] {
  const { handle, sinceHours, count = 20 } = opts;

  const authToken = process.env["AUTH_TOKEN"];
  const ct0 = process.env["CT0"];

  if (!authToken || !ct0) {
    throw new BirdSearchAuthError(
      "AUTH_TOKEN and CT0 environment variables are required for bird-search (Tier 1)",
    );
  }

  const query = `from:${handle}`;
  const sinceArg = `${sinceHours}h`;

  const result = spawnSync(
    "node",
    [
      BIRD_SEARCH_PATH,
      query,
      "--since",
      sinceArg,
      "--count",
      String(count),
      "--json",
    ],
    {
      env: {
        ...process.env,
        AUTH_TOKEN: authToken,
        CT0: ct0,
      },
      encoding: "utf-8",
      timeout: 30_000, // 30 second timeout per account
    },
  );

  // Auth failure: bird-search exits with code 1 and outputs auth error
  if (result.status !== 0) {
    const stderr = result.stderr ?? "";
    if (
      stderr.includes("auth") ||
      stderr.includes("401") ||
      stderr.includes("403") ||
      stderr.includes("cookie")
    ) {
      throw new BirdSearchAuthError(
        `bird-search auth failure for @${handle}: ${stderr.slice(0, 200)}`,
      );
    }
    throw new BirdSearchAuthError(
      `bird-search exited ${result.status} for @${handle}: ${stderr.slice(0, 200)}`,
    );
  }

  // Parse JSON output
  let raw: unknown;
  try {
    raw = JSON.parse(result.stdout);
  } catch {
    throw new BirdSearchParseError(
      `bird-search returned non-JSON for @${handle}: ${result.stdout.slice(0, 200)}`,
    );
  }

  if (!Array.isArray(raw)) {
    // Empty result is valid (account was quiet)
    if (
      raw === null ||
      (typeof raw === "object" && Object.keys(raw as object).length === 0)
    ) {
      return [];
    }
    throw new BirdSearchParseError(
      `bird-search returned unexpected shape for @${handle}`,
    );
  }

  return raw.map((tweet: Record<string, unknown>) =>
    normalizeBirdSearchTweet(tweet, handle),
  );
}

function normalizeBirdSearchTweet(
  tweet: Record<string, unknown>,
  handle: string,
): RawXPost {
  const id = String(tweet["id"] ?? tweet["id_str"] ?? "");
  const text = String(tweet["full_text"] ?? tweet["text"] ?? "");
  const author = String(tweet["user"]?.["screen_name"] ?? handle);
  const publishedAt = String(tweet["created_at"] ?? new Date().toISOString());
  const likes = Number(tweet["favorite_count"] ?? tweet["likes"] ?? 0);
  const retweets = Number(tweet["retweet_count"] ?? tweet["retweets"] ?? 0);
  const views = Number(tweet["views"]?.["count"] ?? tweet["view_count"] ?? 0);
  const isReply =
    tweet["in_reply_to_status_id"] != null ||
    tweet["in_reply_to_status_id_str"] != null;
  const parentTweetId = tweet["in_reply_to_status_id_str"]
    ? String(tweet["in_reply_to_status_id_str"])
    : undefined;
  const parentTweetText = tweet["quoted_status"]?.["full_text"]
    ? String(tweet["quoted_status"]["full_text"])
    : undefined;

  return {
    id,
    url: `https://x.com/${author}/status/${id}`,
    text,
    author,
    publishedAt,
    likes,
    retweets,
    views,
    isReply,
    parentTweetId,
    parentTweetText,
    tier: 1,
  };
}
```

#### 2.4.3 `src/sources/x-scrapecreators.ts` — Tier 2

```typescript
import type { RawXPost } from "@updagent/shared";
import { ScrapeCreatorsError } from "./errors.js";

const BASE_URL = "https://api.scrapecreators.com/v1/twitter/user/tweets";

export interface ScrapeCreatorsOptions {
  handle: string;
  sinceHours: number;
  count?: number;
}

export async function fetchFromScrapeCreators(
  opts: ScrapeCreatorsOptions,
): Promise<RawXPost[]> {
  const { handle, sinceHours, count = 20 } = opts;

  const apiKey = process.env["SCRAPECREATORS_API_KEY"];
  if (!apiKey) {
    throw new ScrapeCreatorsError("SCRAPECREATORS_API_KEY not set", 0);
  }

  const url = new URL(BASE_URL);
  url.searchParams.set("handle", handle);
  url.searchParams.set("limit", String(count));

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (response.status === 401 || response.status === 403) {
    throw new ScrapeCreatorsError(
      `ScrapeCreators auth failure for @${handle}: ${response.status}`,
      response.status,
    );
  }

  if (response.status === 429) {
    throw new ScrapeCreatorsError(
      `ScrapeCreators rate limit for @${handle}`,
      429,
    );
  }

  if (!response.ok) {
    throw new ScrapeCreatorsError(
      `ScrapeCreators HTTP ${response.status} for @${handle}`,
      response.status,
    );
  }

  const data = (await response.json()) as { tweets?: unknown[] } | unknown[];

  const tweets = Array.isArray(data)
    ? data
    : ((data as { tweets?: unknown[] }).tweets ?? []);

  const cutoff = Date.now() - sinceHours * 60 * 60 * 1000;

  return tweets
    .map((t) =>
      normalizeScrapeCreatorsTweet(t as Record<string, unknown>, handle),
    )
    .filter((post) => new Date(post.publishedAt).getTime() >= cutoff);
}

function normalizeScrapeCreatorsTweet(
  tweet: Record<string, unknown>,
  handle: string,
): RawXPost {
  const id = String(tweet["id"] ?? "");
  const author = String(tweet["author_id"] ?? tweet["username"] ?? handle);
  const isReply = Boolean(tweet["in_reply_to_user_id"]);

  return {
    id,
    url: `https://x.com/${author}/status/${id}`,
    text: String(tweet["text"] ?? ""),
    author,
    publishedAt: String(tweet["created_at"] ?? new Date().toISOString()),
    likes: Number(tweet["public_metrics"]?.["like_count"] ?? 0),
    retweets: Number(tweet["public_metrics"]?.["retweet_count"] ?? 0),
    views: Number(tweet["public_metrics"]?.["impression_count"] ?? 0),
    isReply,
    tier: 2,
  };
}
```

#### 2.4.4 `src/sources/x-xai.ts` — Tier 3

```typescript
import type { RawXPost } from "@updagent/shared";
import { XAIError } from "./errors.js";

const XAI_BASE_URL = "https://api.x.ai/v1/responses";

export interface XAIOptions {
  handle: string;
  sinceHours: number;
  count?: number;
}

export async function fetchFromXAI(opts: XAIOptions): Promise<RawXPost[]> {
  const { handle, sinceHours, count = 20 } = opts;

  const apiKey = process.env["XAI_API_KEY"];
  if (!apiKey) {
    throw new XAIError("XAI_API_KEY not set");
  }

  const sinceDate = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const sinceStr = sinceDate.toISOString().split("T")[0]; // YYYY-MM-DD

  const prompt = `Search X.com for recent tweets from @${handle} posted after ${sinceStr}.
Return the ${count} most recent tweets as a JSON array with fields:
id, url, text, author, published_at (ISO 8601), likes, retweets, views, is_reply.
Only include tweets from @${handle}. Output ONLY valid JSON, no explanation.`;

  const response = await fetch(XAI_BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-2-latest",
      tools: [{ type: "x_search" }],
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new XAIError(`xAI API HTTP ${response.status} for @${handle}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content ?? "";

  // Extract JSON array from response (model may include explanation text)
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn(
      `[updagent] xAI Tier 3: no JSON array in response for @${handle}`,
    );
    return [];
  }

  let tweets: unknown[];
  try {
    tweets = JSON.parse(jsonMatch[0]) as unknown[];
  } catch {
    console.warn(`[updagent] xAI Tier 3: JSON parse failed for @${handle}`);
    return [];
  }

  return tweets.map((t) =>
    normalizeXAITweet(t as Record<string, unknown>, handle),
  );
}

function normalizeXAITweet(
  tweet: Record<string, unknown>,
  handle: string,
): RawXPost {
  const id = String(tweet["id"] ?? "");
  const author = String(tweet["author"] ?? handle);

  return {
    id,
    url: String(tweet["url"] ?? `https://x.com/${author}/status/${id}`),
    text: String(tweet["text"] ?? ""),
    author,
    publishedAt: String(
      tweet["published_at"] ?? tweet["created_at"] ?? new Date().toISOString(),
    ),
    likes: Number(tweet["likes"] ?? 0),
    retweets: Number(tweet["retweets"] ?? 0),
    views: Number(tweet["views"] ?? 0),
    isReply: Boolean(tweet["is_reply"]),
    tier: 3,
  };
}
```

#### 2.4.5 `src/sources/x-cascade.ts` — Orchestrator

```typescript
import type { CascadeResult, TierFailure } from "@updagent/shared";
import {
  fetchFromBirdSearch,
  BirdSearchAuthError,
  BirdSearchParseError,
} from "./x-bird.js";
import {
  fetchFromScrapeCreators,
  ScrapeCreatorsError,
} from "./x-scrapecreators.js";
import { fetchFromXAI, XAIError } from "./x-xai.js";

export interface CascadeOptions {
  handle: string;
  sinceHours: number;
  count?: number;
  rateLimitDelayMs?: number; // delay AFTER this account's call (caller sequences multiple)
}

export async function fetchXPostsForAccount(
  opts: CascadeOptions,
): Promise<CascadeResult> {
  const { handle, sinceHours, count = 20 } = opts;
  const failures: TierFailure[] = [];

  // ── Tier 1: bird-search ────────────────────────────────────────────────────
  try {
    console.log(`[updagent] Tier 1: @${handle} (bird-search)`);
    const posts = fetchFromBirdSearch({ handle, sinceHours, count });
    console.log(`[updagent] Tier 1 OK: @${handle} — ${posts.length} posts`);
    return { posts, tierUsed: 1, failures };
  } catch (err) {
    const isAuth = err instanceof BirdSearchAuthError;
    const isparse = err instanceof BirdSearchParseError;

    if (isAuth || isparse) {
      const errorType = isAuth ? "auth" : "parse";
      console.warn(
        `[updagent] Tier 1 FAIL (${errorType}): @${handle} — ${String(err)}`,
      );
      failures.push({
        tier: 1,
        error: String(err),
        errorType,
      });
      // Fall through to Tier 2 only on auth failure or parse failure
      // Note: empty result [] from Tier 1 is NOT a failure — account was quiet
    } else {
      // Unknown error — still fall through
      console.warn(
        `[updagent] Tier 1 FAIL (unknown): @${handle} — ${String(err)}`,
      );
      failures.push({ tier: 1, error: String(err), errorType: "unknown" });
    }
  }

  // ── Tier 2: ScrapeCreators ─────────────────────────────────────────────────
  try {
    console.log(`[updagent] Tier 2: @${handle} (ScrapeCreators)`);
    const posts = await fetchFromScrapeCreators({ handle, sinceHours, count });
    console.log(`[updagent] Tier 2 OK: @${handle} — ${posts.length} posts`);
    return { posts, tierUsed: 2, failures };
  } catch (err) {
    const errorType =
      err instanceof ScrapeCreatorsError
        ? err.statusCode === 429
          ? "rate-limit"
          : "auth"
        : "unknown";
    console.warn(
      `[updagent] Tier 2 FAIL (${errorType}): @${handle} — ${String(err)}`,
    );
    failures.push({ tier: 2, error: String(err), errorType });
  }

  // ── Tier 3: xAI Grok ──────────────────────────────────────────────────────
  try {
    console.log(`[updagent] Tier 3: @${handle} (xAI Grok)`);
    const posts = await fetchFromXAI({ handle, sinceHours, count });
    console.log(
      `[updagent] Tier 3 OK: @${handle} — ${posts.length} posts (best-effort)`,
    );
    return { posts, tierUsed: 3, failures };
  } catch (err) {
    const errorType = err instanceof XAIError ? "auth" : "unknown";
    console.warn(
      `[updagent] Tier 3 FAIL (${errorType}): @${handle} — ${String(err)}`,
    );
    failures.push({ tier: 3, error: String(err), errorType });
  }

  // All tiers failed
  console.error(`[updagent] ALL TIERS FAILED for @${handle}`);
  return { posts: [], tierUsed: null, failures };
}
```

---

### 2.5 Sub-component: GitHub Release Collection (`src/sources/github-releases.ts`)

```typescript
import type { RawGitHubRelease } from "@updagent/shared";
import { GitHubRateLimitError } from "./errors.js";

const GH_API = "https://api.github.com";

export async function fetchGitHubReleases(
  owner: string,
  repo: string,
  perPage = 5,
): Promise<RawGitHubRelease[]> {
  const url = `${GH_API}/repos/${owner}/${repo}/releases?per_page=${perPage}`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "updagent/1.0",
  };

  const token = process.env["GH_TOKEN"];
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status === 404) {
    console.warn(
      `[updagent] GitHub 404: ${owner}/${repo} — no releases or repo not found`,
    );
    return [];
  }

  if (response.status === 403) {
    throw new GitHubRateLimitError();
  }

  if (!response.ok) {
    console.warn(
      `[updagent] GitHub HTTP ${response.status} for ${owner}/${repo}`,
    );
    return [];
  }

  const data = (await response.json()) as Array<Record<string, unknown>>;

  return data
    .filter((r) => !r["draft"]) // skip drafts
    .map((r) => ({
      tagName: String(r["tag_name"] ?? ""),
      name: String(r["name"] ?? r["tag_name"] ?? ""),
      body: String(r["body"] ?? ""),
      publishedAt: String(
        r["published_at"] ?? r["created_at"] ?? new Date().toISOString(),
      ),
      url: String(r["html_url"] ?? ""),
      owner,
      repo,
      isDraft: Boolean(r["draft"]),
      isPrerelease: Boolean(r["prerelease"]),
    }));
}
```

---

### 2.6 Sub-component: Normalization (`src/normalize.ts`)

```typescript
import type {
  FeedItem,
  RawXPost,
  RawGitHubRelease,
  ClassificationResult,
} from "@updagent/shared";

const SEMVER_RE = /v?(\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?)/i;

export function normalizeXPost(
  raw: RawXPost,
  agentId: string,
  classification: ClassificationResult,
): FeedItem {
  const versionMatch = raw.text.match(SEMVER_RE);
  const version = versionMatch?.[1];

  const isRelease =
    classification.classification === "SIGNAL" &&
    (version !== undefined ||
      /\brelease\b|\bships?\b|\blaunche[sd]\b/i.test(raw.text));

  return {
    id: raw.url,
    source: "x",
    agentId,
    author: raw.author,
    text: raw.text,
    url: raw.url,
    publishedAt: new Date(raw.publishedAt).toISOString(),
    collectedAt: new Date().toISOString(),
    classification: classification.classification,
    classificationReason: classification.reason,
    classifiedBy: classification.classifiedBy,
    classificationModel: classification.model,
    isRelease,
    version,
    engagementScore: raw.likes * 1 + raw.retweets * 3,
    likes: raw.likes,
    retweets: raw.retweets,
    views: raw.views,
    isReply: raw.isReply,
    parentTweetSummary: raw.parentTweetText
      ? raw.parentTweetText.slice(0, 120)
      : undefined,
  };
}

export function normalizeGitHubRelease(
  raw: RawGitHubRelease,
  agentId: string,
): FeedItem {
  const versionMatch = raw.tagName.match(SEMVER_RE);
  const version = versionMatch?.[1] ?? raw.tagName.replace(/^v/, "");

  return {
    id: `${raw.owner}/${raw.repo}@${raw.tagName}`,
    source: "github",
    agentId,
    author: `${raw.owner}/${raw.repo}`,
    text: `${raw.name}\n\n${raw.body}`,
    url: raw.url,
    publishedAt: new Date(raw.publishedAt).toISOString(),
    collectedAt: new Date().toISOString(),
    classification: "SIGNAL",
    classificationReason: "GitHub official release",
    classifiedBy: "fast-path",
    isRelease: true,
    version,
    engagementScore: 0,
    isReply: false,
  };
}
```

---

### 2.7 Sub-component: Deduplication (`src/dedup.ts`)

```typescript
import type { FeedItem } from "@updagent/shared";

export function dedup(
  newItems: FeedItem[],
  existingItems: FeedItem[],
): FeedItem[] {
  const existingIds = new Set(existingItems.map((item) => item.id));
  return newItems.filter((item) => !existingIds.has(item.id));
}

export function dedupWithin(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
```

---

### 2.8 Sub-component: Signal Detection (`src/signal/`)

#### 2.8.1 `src/signal/rules.ts` — Pass 1: keyword fast-path

```typescript
import type { ClassificationInput, FastPathResult } from "@updagent/shared";

const SEMVER_RE = /v?\d+\.\d+(?:\.\d+)?/i;
const SOCIAL_FILLER_RE =
  /^(lol|haha|😂|👍|❤️|🔥|same|yep|yes|no|ok|thanks|ty|thx|🙏|🎉)\s*[!.?]?\s*$/i;
const ACTION_WORDS_RE =
  /\b(release[sd]?|ship[ps]?|shipped|fix(ed)?|bug|patch|update[sd]?|launch(ed)?|feature|changelog|breaking|deprecat|migrat|v\d+\.\d+)\b/i;

export function fastPath(input: ClassificationInput): FastPathResult {
  const { text, source, isReply, author, signalKeywords } = input;
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

#### 2.8.2 `src/signal/prompts.ts` — Prompt templates

```typescript
import type { ClassificationInput } from "@updagent/shared";

export interface PromptPost {
  index: number;
  author: string;
  agentName: string;
  text: string;
  isReply: boolean;
  parentTweetSummary?: string;
}

export function buildClassificationPrompt(
  inputs: ClassificationInput[],
): string {
  const posts: PromptPost[] = inputs.map((input, index) => ({
    index,
    author: `@${input.author}`,
    agentName: input.agentName,
    text: input.text,
    isReply: input.isReply,
    parentTweetSummary: input.parentTweetSummary,
  }));

  return `You are classifying social media posts for a developer update feed about AI coding tools.

For each post, classify it based on relevance to the named AI coding tool.

**Classifications:**
- SIGNAL: Direct product update — new feature, release, bug fix, breaking change, roadmap announcement, or a team member confirming a workaround for a known issue. Even if it's a reply, classify as SIGNAL if the content is about a product update.
- CONTEXT: Industry analysis, comparisons, commentary — adds understanding but isn't a direct product update or action item.
- NOISE: Personal posts, social reactions, audience banter, or content unrelated to the specified AI coding tool.

**Important rules:**
1. Replies from team members about their own product ARE SIGNAL (e.g. "This was fixed in yesterday's release. claude update to get latest")
2. Official release announcements are always SIGNAL
3. Personal opinions on unrelated topics are always NOISE
4. "Claude is now available in 20 countries" is NOISE for Claude Code (different product)

**Posts to classify:**
${JSON.stringify(posts, null, 2)}

Respond with a JSON array in the same order as the input:
[
  {
    "index": 0,
    "classification": "SIGNAL" | "CONTEXT" | "NOISE",
    "reason": "one-line explanation"
  },
  ...
]

Output ONLY the JSON array. No explanation, no markdown fences.`;
}

export function buildDistributedPrompt(input: ClassificationInput): string {
  return `Classify this social media post for a developer update feed.

Tool: ${input.agentName}
Author: @${input.author}
${input.isReply ? `(Reply to: ${input.parentTweetSummary ?? "another tweet"})` : ""}
Post: "${input.text}"

Classifications:
- SIGNAL: Direct product update for ${input.agentName} (release, fix, feature, roadmap)
- CONTEXT: Industry context/analysis about ${input.agentName}
- NOISE: Personal, unrelated, or social content

Reply with exactly one JSON object:
{"classification": "SIGNAL"|"CONTEXT"|"NOISE", "reason": "one-line explanation"}`;
}
```

#### 2.8.3 `src/signal/classifier.ts` — Pass 2: LLM classifier

````typescript
import { spawnSync } from "node:child_process";
import type {
  ClassificationInput,
  ClassificationResult,
  SignalDetectionMode,
} from "@updagent/shared";
import {
  buildClassificationPrompt,
  buildDistributedPrompt,
} from "./prompts.js";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";

// Models in preference order (free first, then cheap paid fallback)
const OPENROUTER_MODELS = [
  "google/gemini-flash-1.5", // free tier
  "meta-llama/llama-3.1-8b-instruct:free", // free tier
  "anthropic/claude-haiku-4-5", // paid fallback ~$0.007/day
];

export async function classifyBatch(
  inputs: ClassificationInput[],
  mode: SignalDetectionMode = "centralized",
): Promise<ClassificationResult[]> {
  if (inputs.length === 0) return [];

  if (mode === "distributed") {
    return classifyDistributed(inputs);
  }

  return classifyCentralized(inputs);
}

// ── Centralized: OpenRouter API ──────────────────────────────────────────────

async function classifyCentralized(
  inputs: ClassificationInput[],
): Promise<ClassificationResult[]> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) {
    console.warn(
      "[updagent] OPENROUTER_API_KEY not set — defaulting all to CONTEXT",
    );
    return inputs.map(() => ({
      classification: "CONTEXT",
      reason: "OpenRouter API key not configured",
      classifiedBy: "llm" as const,
    }));
  }

  // Process in batches of 10
  const results: ClassificationResult[] = [];
  for (let i = 0; i < inputs.length; i += 10) {
    const batch = inputs.slice(i, i + 10);
    const batchResults = await classifyBatchCentralized(batch, apiKey);
    results.push(...batchResults);
  }
  return results;
}

async function classifyBatchCentralized(
  batch: ClassificationInput[],
  apiKey: string,
): Promise<ClassificationResult[]> {
  const prompt = buildClassificationPrompt(batch);

  for (const model of OPENROUTER_MODELS) {
    try {
      const response = await fetch(OPENROUTER_BASE, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/jyoung105/updagent",
          "X-Title": "updagent",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 1000,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        console.warn(
          `[updagent] OpenRouter ${model} HTTP ${response.status} — trying next model`,
        );
        continue;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data.choices?.[0]?.message?.content ?? "";
      const parsed = parseClassificationResponse(content, batch.length);

      if (parsed) {
        return parsed.map((item) => ({
          classification: item.classification,
          reason: item.reason,
          classifiedBy: "llm" as const,
          model,
        }));
      }
    } catch (err) {
      console.warn(`[updagent] OpenRouter ${model} error: ${String(err)}`);
    }
  }

  // All models failed — safe fallback
  console.error(
    "[updagent] All OpenRouter models failed — defaulting to CONTEXT",
  );
  return batch.map(() => ({
    classification: "CONTEXT",
    reason: "LLM classifier unavailable — defaulting to CONTEXT",
    classifiedBy: "llm" as const,
  }));
}

function parseClassificationResponse(
  content: string,
  expectedCount: number,
): Array<{
  classification: "SIGNAL" | "CONTEXT" | "NOISE";
  reason: string;
}> | null {
  // Strip markdown fences if present
  const cleaned = content
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      index?: number;
      classification?: string;
      reason?: string;
    }>;

    if (!Array.isArray(parsed) || parsed.length !== expectedCount) return null;

    const valid: Array<{
      classification: "SIGNAL" | "CONTEXT" | "NOISE";
      reason: string;
    }> = [];
    for (const item of parsed) {
      const cls = item.classification?.toUpperCase();
      if (cls !== "SIGNAL" && cls !== "CONTEXT" && cls !== "NOISE") return null;
      valid.push({
        classification: cls,
        reason: String(item.reason ?? ""),
      });
    }
    return valid;
  } catch {
    return null;
  }
}

// ── Distributed: local claude / codex CLI ────────────────────────────────────

function classifyDistributed(
  inputs: ClassificationInput[],
): ClassificationResult[] {
  const localAgent = detectLocalAgent();

  return inputs.map((input) => {
    try {
      return classifyWithLocalAgent(input, localAgent);
    } catch {
      return {
        classification: "CONTEXT" as const,
        reason: "Local agent unavailable — defaulting to CONTEXT",
        classifiedBy: "llm" as const,
      };
    }
  });
}

type LocalAgent = "claude" | "codex" | null;

function detectLocalAgent(): LocalAgent {
  const mode = process.env["UPDAGENT_LOCAL_AGENT"];
  if (mode === "claude" || mode === "codex") return mode;

  // Auto-detect: try claude first
  const claudeCheck = spawnSync("claude", ["--version"], { encoding: "utf-8" });
  if (claudeCheck.status === 0) return "claude";

  const codexCheck = spawnSync("codex", ["--version"], { encoding: "utf-8" });
  if (codexCheck.status === 0) return "codex";

  return null;
}

function classifyWithLocalAgent(
  input: ClassificationInput,
  agent: LocalAgent,
): ClassificationResult {
  if (!agent) {
    return {
      classification: "CONTEXT",
      reason: "No local agent (claude/codex) found in PATH",
      classifiedBy: "llm",
    };
  }

  const prompt = buildDistributedPrompt(input);
  const args = agent === "claude" ? ["-p", prompt] : [prompt];

  const result = spawnSync(agent, args, {
    encoding: "utf-8",
    timeout: 30_000,
  });

  if (result.status !== 0 || !result.stdout) {
    throw new Error(`${agent} exited ${result.status}`);
  }

  const content = result.stdout.trim();
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in response");

  const parsed = JSON.parse(jsonMatch[0]) as {
    classification?: string;
    reason?: string;
  };

  const cls = parsed.classification?.toUpperCase();
  if (cls !== "SIGNAL" && cls !== "CONTEXT" && cls !== "NOISE") {
    throw new Error(`Invalid classification: ${cls}`);
  }

  return {
    classification: cls,
    reason: String(parsed.reason ?? ""),
    classifiedBy: "llm",
    model: agent,
  };
}
````

---

### 2.9 Sub-component: Storage (`src/storage.ts`)

```typescript
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { FeedItem, FeedFile, CollectionHealth } from "@updagent/shared";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ── feed.json ─────────────────────────────────────────────────────────────────

export function readFeedJson(path: string): FeedItem[] {
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as FeedFile;
    return raw.items ?? [];
  } catch {
    console.warn(`[updagent] Could not parse ${path} — starting fresh`);
    return [];
  }
}

export function writeFeedJson(path: string, items: FeedItem[]): void {
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  const pruned = items
    .filter((item) => new Date(item.publishedAt).getTime() >= cutoff)
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );

  const file: FeedFile = {
    version: "1",
    updatedAt: new Date().toISOString(),
    itemCount: pruned.length,
    items: pruned,
  };

  writeFileSync(path, JSON.stringify(file, null, 2) + "\n", "utf-8");
}

// ── health.json ───────────────────────────────────────────────────────────────

export function readHealthJson(path: string): CollectionHealth | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as CollectionHealth;
  } catch {
    return null;
  }
}

export function writeHealthJson(path: string, health: CollectionHealth): void {
  writeFileSync(path, JSON.stringify(health, null, 2) + "\n", "utf-8");
}

// ── Upstash Redis (optional) ──────────────────────────────────────────────────

export function isRedisConfigured(): boolean {
  return Boolean(
    process.env["UPSTASH_REDIS_REST_URL"] &&
    process.env["UPSTASH_REDIS_REST_TOKEN"],
  );
}

export async function writeToRedis(items: FeedItem[]): Promise<void> {
  if (!isRedisConfigured()) return;

  try {
    // Dynamic import so Redis SDK absence doesn't crash the whole collector
    const { Redis } = await import("@upstash/redis");
    const redis = Redis.fromEnv();

    for (const item of items) {
      const key = `feed:${item.agentId}:${encodeURIComponent(item.id)}`;
      await redis.set(key, JSON.stringify(item), { ex: 48 * 60 * 60 }); // 48h TTL
    }

    // Update index key
    const signalItems = items.filter((i) => i.classification === "SIGNAL");
    if (signalItems.length > 0) {
      await redis.set("feed:lastUpdated", new Date().toISOString(), {
        ex: 48 * 60 * 60,
      });
    }
  } catch (err) {
    console.warn(`[updagent] Redis write failed (non-fatal): ${String(err)}`);
  }
}
```

---

### 2.10 Sub-component: Newsletter Generator (`src/newsletter.ts`)

```typescript
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import type { FeedItem } from "@updagent/shared";
import { getAgentById, getEnabledAgents } from "@updagent/shared";

export function shouldGenerateNewsletter(newItems: FeedItem[]): boolean {
  return newItems.some((item) => item.classification === "SIGNAL");
}

export function generateNewsletterContent(
  items: FeedItem[],
  date: string,
  collectedAt: string,
  credentialWarning: boolean,
): string {
  const signalItems = items.filter((i) => i.classification === "SIGNAL");
  const enabledAgents = getEnabledAgents();
  const lines: string[] = [];

  lines.push(`# updagent Newsletter — ${date}`);
  lines.push("");
  lines.push(
    `> Auto-generated · ${signalItems.length} new signal${signalItems.length !== 1 ? "s" : ""} · Collected at ${collectedAt} UTC`,
  );
  lines.push(`> [Full feed](../data/feed.json) · [All newsletters](.)`);

  if (credentialWarning) {
    lines.push("");
    lines.push(
      `> ⚠️ **X data may be incomplete** — Tier 1 credentials degraded for some accounts. Check AUTH_TOKEN + CT0.`,
    );
  }

  for (const agent of enabledAgents) {
    const agentSignals = signalItems.filter((i) => i.agentId === agent.id);
    if (agentSignals.length === 0) continue;

    lines.push("");
    lines.push(`## ${agent.name}`);

    // Releases first
    const releases = agentSignals.filter((i) => i.source === "github");
    if (releases.length > 0) {
      lines.push("");
      lines.push("### 🚀 Releases");
      for (const item of releases) {
        const timeAgo = relativeTime(item.publishedAt);
        const summary = item.text.split("\n")[0]?.slice(0, 120) ?? "";
        lines.push(
          `- **${item.version ?? item.author}** (${timeAgo}) — ${summary}`,
        );
        lines.push(`  [Release notes →](${item.url})`);
      }
    }

    // X signals
    const xSignals = agentSignals.filter((i) => i.source === "x");
    if (xSignals.length > 0) {
      lines.push("");
      lines.push("### 📡 Team Signals");
      for (const item of xSignals) {
        const timeAgo = relativeTime(item.publishedAt);
        const truncated = item.text.slice(0, 200);
        lines.push(
          `- **@${item.author}** (${timeAgo}): "${truncated}${item.text.length > 200 ? "..." : ""}"`,
        );
        lines.push(`  [View →](${item.url})`);
      }
    }
  }

  lines.push("");
  lines.push("---");
  lines.push(
    `*Generated by [updagent](https://github.com/jyoung105/updagent). Next collection: +6h.*`,
  );

  return lines.join("\n");
}

export async function appendToNewsletter(
  items: FeedItem[],
  newslettersDir: string,
  credentialWarning: boolean,
): Promise<string | null> {
  if (!shouldGenerateNewsletter(items)) return null;

  const date = new Date().toISOString().split("T")[0]!;
  const collectedAt = new Date().toUTCString().split(" ").slice(1, 5).join(" ");

  if (!existsSync(newslettersDir)) {
    mkdirSync(newslettersDir, { recursive: true });
  }

  const filePath = join(newslettersDir, `${date}.md`);
  const content = generateNewsletterContent(
    items,
    date,
    collectedAt,
    credentialWarning,
  );

  if (existsSync(filePath)) {
    // Append separator + new content to existing day's file
    const existing = readFileSync(filePath, "utf-8");
    writeFileSync(filePath, `${existing}\n\n---\n\n${content}`, "utf-8");
  } else {
    writeFileSync(filePath, content, "utf-8");
  }

  return filePath;
}

function relativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 1) return "just now";
  if (hours === 1) return "1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

---

### 2.11 Sub-component: Main Orchestrator (`src/collect.ts`)

```typescript
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getEnabledAgents,
  type AccountHealth,
  type CollectionHealth,
  type FeedItem,
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
import { appendToNewsletter } from "./newsletter.js";
import type {
  ClassificationInput,
  SignalDetectionMode,
} from "@updagent/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../../..");
const FEED_PATH = resolve(REPO_ROOT, "data/feed.json");
const HEALTH_PATH = resolve(REPO_ROOT, "data/health.json");
const NEWSLETTERS_DIR = resolve(REPO_ROOT, "newsletters");

const RATE_LIMIT_DELAY_MS = 2000; // 2s between X account queries
const SINCE_HOURS = 6; // matches cron cadence

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const startedAt = new Date();
  console.log(`[updagent] Collection started at ${startedAt.toISOString()}`);

  // ── Environment check ────────────────────────────────────────────────────
  const mode = (process.env["SIGNAL_DETECTION_MODE"] ??
    "centralized") as SignalDetectionMode;
  if (mode === "centralized" && !process.env["OPENROUTER_API_KEY"]) {
    console.warn(
      "[updagent] OPENROUTER_API_KEY not set — signal detection will default to CONTEXT for ambiguous posts",
    );
  }
  if (!process.env["AUTH_TOKEN"] || !process.env["CT0"]) {
    console.warn(
      "[updagent] AUTH_TOKEN / CT0 not set — X Tier 1 will fail, cascading to Tier 2/3",
    );
  }

  // ── Load existing state ───────────────────────────────────────────────────
  const existingItems = readFeedJson(FEED_PATH);
  const previousHealth = readHealthJson(HEALTH_PATH);

  // Build account health map from previous run (for consecutive failure tracking)
  const accountHealthMap = new Map<string, AccountHealth>(
    previousHealth?.accounts.map((a) => [a.account, a]) ?? [],
  );

  const agents = getEnabledAgents();
  console.log(
    `[updagent] Collecting for ${agents.length} agent(s): ${agents.map((a) => a.id).join(", ")}`,
  );

  const allNewRaw: FeedItem[] = [];
  let tier1FailureCount = 0;
  let tier2FailureCount = 0;
  const allTierFailureAccounts: string[] = [];

  // ── Per-agent collection ─────────────────────────────────────────────────
  for (const agent of agents) {
    console.log(`[updagent] --- Agent: ${agent.name} ---`);

    // GitHub releases
    try {
      const rawReleases = await fetchGitHubReleases(
        agent.github.owner,
        agent.github.repo,
        5,
      );
      for (const raw of rawReleases) {
        if (!raw.isDraft && !raw.isPrerelease) {
          const item = normalizeGitHubRelease(raw, agent.id);
          allNewRaw.push(item);
        }
      }
      console.log(
        `[updagent] GitHub: ${rawReleases.length} releases for ${agent.name}`,
      );
    } catch (err) {
      console.error(
        `[updagent] GitHub fetch failed for ${agent.name}: ${String(err)}`,
      );
    }

    // X.com accounts
    for (const handle of agent.xAccounts) {
      const result = await fetchXPostsForAccount({
        handle,
        sinceHours: SINCE_HOURS,
        rateLimitDelayMs: RATE_LIMIT_DELAY_MS,
      });

      // Update health tracking
      const prevHealth = accountHealthMap.get(handle);
      const isTier1Failure = result.failures.some((f) => f.tier === 1);
      const isTier2Failure = result.failures.some((f) => f.tier === 2);
      const isAllFailed = result.tierUsed === null;

      if (isTier1Failure) tier1FailureCount++;
      if (isTier2Failure) tier2FailureCount++;
      if (isAllFailed) allTierFailureAccounts.push(handle);

      const consecutiveTier1Failures = isTier1Failure
        ? (prevHealth?.consecutiveTier1Failures ?? 0) + 1
        : 0;

      accountHealthMap.set(handle, {
        account: handle,
        consecutiveTier1Failures,
        lastSuccessfulTier: result.tierUsed,
        lastSuccessAt:
          result.tierUsed !== null
            ? new Date().toISOString()
            : (prevHealth?.lastSuccessAt ?? null),
        lastCheckedAt: new Date().toISOString(),
      });

      // Normalize raw posts
      if (result.posts.length > 0) {
        // We need classification to normalize — gather inputs first
        const classInputs: ClassificationInput[] = result.posts.map((post) => ({
          text: post.text,
          author: post.author,
          agentId: agent.id,
          agentName: agent.name,
          isReply: post.isReply,
          parentTweetSummary: post.parentTweetText?.slice(0, 120),
          signalKeywords: agent.signalKeywords,
          source: "x",
        }));

        // Pass 1: fast-path
        const fastPathResults = classInputs.map((input) => fastPath(input));
        const candidates = classInputs.filter(
          (_, i) => fastPathResults[i]?.result === "CANDIDATE",
        );
        const candidateIndexes = classInputs
          .map((_, i) => i)
          .filter((i) => fastPathResults[i]?.result === "CANDIDATE");

        // Pass 2: LLM for candidates
        const llmResults = await classifyBatch(candidates, mode);

        // Merge results
        let llmIdx = 0;
        for (let i = 0; i < result.posts.length; i++) {
          const fp = fastPathResults[i]!;
          let classification;

          if (fp.result === "CANDIDATE") {
            classification = llmResults[llmIdx++]!;
          } else {
            classification = {
              classification: fp.result,
              reason: fp.reason,
              classifiedBy: "fast-path" as const,
            };
          }

          const item = normalizeXPost(
            result.posts[i]!,
            agent.id,
            classification,
          );
          allNewRaw.push(item);
        }
      }

      // Rate limit delay between accounts
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  // ── Dedup + merge ────────────────────────────────────────────────────────
  const deduplicatedNew = dedup(dedupWithin(allNewRaw), existingItems);
  const signalAndContext = deduplicatedNew.filter(
    (i) => i.classification === "SIGNAL" || i.classification === "CONTEXT",
  );
  const noiseCount = deduplicatedNew.length - signalAndContext.length;
  const mergedItems = [...signalAndContext, ...existingItems];

  // ── Write storage ────────────────────────────────────────────────────────
  writeFeedJson(FEED_PATH, mergedItems);
  console.log(
    `[updagent] feed.json written — ${signalAndContext.length} new items (${noiseCount} NOISE discarded)`,
  );

  const accounts = Array.from(accountHealthMap.values());
  const credentialWarning = accounts.some(
    (a) => a.consecutiveTier1Failures >= 3,
  );
  const health: CollectionHealth = {
    lastRunAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    newItemCount: signalAndContext.length,
    totalItemCount: mergedItems.filter(
      (i) => i.classification === "SIGNAL" || i.classification === "CONTEXT",
    ).length,
    tier1FailureCount,
    tier2FailureCount,
    allTierFailureAccounts,
    credentialWarning,
    accounts,
  };
  writeHealthJson(HEALTH_PATH, health);

  // Optional Redis
  await writeToRedis(signalAndContext);

  // ── Newsletter ───────────────────────────────────────────────────────────
  const newSignalItems = signalAndContext.filter(
    (i) => i.classification === "SIGNAL",
  );
  const newsletterPath = await appendToNewsletter(
    newSignalItems,
    NEWSLETTERS_DIR,
    credentialWarning,
  );
  if (newsletterPath) {
    console.log(`[updagent] Newsletter written: ${newsletterPath}`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(
    `[updagent] Done in ${health.durationMs}ms — ` +
      `${newSignalItems.length} SIGNAL, ` +
      `${signalAndContext.length - newSignalItems.length} CONTEXT, ` +
      `${noiseCount} NOISE`,
  );

  if (credentialWarning) {
    console.warn(
      `[updagent] ⚠️  Credential warning: Tier 1 failures >= 3 for: ` +
        accounts
          .filter((a) => a.consecutiveTier1Failures >= 3)
          .map((a) => `@${a.account}`)
          .join(", "),
    );
  }

  if (allTierFailureAccounts.length > 0) {
    console.warn(
      `[updagent] ⚠️  All tiers failed for: ${allTierFailureAccounts.map((a) => `@${a}`).join(", ")}`,
    );
  }

  // Always exit 0 — partial data is better than no commit
  process.exit(0);
}

main().catch((err) => {
  console.error(`[updagent] Fatal error: ${String(err)}`);
  process.exit(0); // Still exit 0 — don't block GitHub Actions
});
```

---

### 2.12 Sub-component: Tests (`src/__tests__/`)

#### 2.12.1 `signal-fixtures.ts` — ≥25 labeled examples

```typescript
import type { SignalClassification } from "@updagent/shared";

export interface Fixture {
  text: string;
  author: string; // without @
  agentId: string;
  isReply: boolean;
  parentTweetSummary?: string;
  source?: "x" | "github";
  expected: SignalClassification;
  fastPathDeterministic: boolean; // true = fast-path should catch without LLM
  rationale: string;
}

export const fixtures: Fixture[] = [
  // ── High-signal replies (MUST be CANDIDATE from fast-path, then SIGNAL from LLM)
  {
    text: "This was fixed in yesterday's release. `claude update` to make sure you're on the latest",
    author: "bcherny",
    agentId: "claude-code",
    isReply: true,
    parentTweetSummary: "user reporting statusline bug",
    expected: "SIGNAL",
    fastPathDeterministic: false,
    rationale:
      "Team lead confirms bug fix in reply — highest-value signal type",
  },
  {
    text: "Windows coming soon. No announcement/eta yet.",
    author: "bcherny",
    agentId: "claude-code",
    isReply: true,
    parentTweetSummary: "user asking about Windows support",
    expected: "SIGNAL",
    fastPathDeterministic: false,
    rationale: "Roadmap signal in reply — must not be filtered as noise",
  },
  {
    text: "Reliability for cloud has improved significantly",
    author: "bcherny",
    agentId: "claude-code",
    isReply: true,
    expected: "SIGNAL",
    fastPathDeterministic: false,
    rationale: "Performance improvement announcement in reply",
  },
  // ── Semver signals (fast-path SIGNAL)
  {
    text: "Claude Code v1.9.4 ships — statusline fix on Windows + --no-permission-prompts flag",
    author: "felixrieseberg",
    agentId: "claude-code",
    isReply: false,
    expected: "SIGNAL",
    fastPathDeterministic: true,
    rationale: "Contains semver v1.9.4 → fast-path SIGNAL",
  },
  {
    text: "Codex CLI 0.3 is here: parallel file editing, better error recovery",
    author: "openaidevs",
    agentId: "codex",
    isReply: false,
    expected: "SIGNAL",
    fastPathDeterministic: true,
    rationale: "Contains semver 0.3 → fast-path SIGNAL",
  },
  {
    text: "just pushed codex 0.3.1 with the memory leak fix",
    author: "thsottiaux",
    agentId: "codex",
    isReply: false,
    expected: "SIGNAL",
    fastPathDeterministic: true,
    rationale: "semver 0.3.1 → fast-path SIGNAL",
  },
  // ── Explicit announcements (LLM SIGNAL)
  {
    text: "Just shipped `--no-permission-prompts` flag 🎉 Deploy hook users: this unblocks you",
    author: "felixrieseberg",
    agentId: "claude-code",
    isReply: false,
    expected: "SIGNAL",
    fastPathDeterministic: false,
    rationale: "Feature launch announcement",
  },
  {
    text: "claude update will now prompt you if there's a breaking change before applying",
    author: "trq212",
    agentId: "claude-code",
    isReply: false,
    expected: "SIGNAL",
    fastPathDeterministic: false,
    rationale: "Product behavior change announcement",
  },
  {
    text: "MCP server support is now stable in Claude Code. Docs: [link]",
    author: "noahzweben",
    agentId: "claude-code",
    isReply: false,
    expected: "SIGNAL",
    fastPathDeterministic: false,
    rationale: "Feature stability announcement",
  },
  {
    text: "We fixed the --dangerously-skip-permissions flag crash on macOS Sequoia",
    author: "amorriscode",
    agentId: "claude-code",
    isReply: false,
    expected: "SIGNAL",
    fastPathDeterministic: false,
    rationale: "Bug fix announcement with specific platform",
  },
  {
    text: "codex now supports project-level memory files. add .codex/memory.md to your repo",
    author: "romainhuet",
    agentId: "codex",
    isReply: false,
    expected: "SIGNAL",
    fastPathDeterministic: false,
    rationale: "New feature announcement",
  },
  // ── GitHub releases (always SIGNAL via fast-path)
  {
    text: "v1.9.4\n\n## What's New\n- Fix statusline rendering on Windows\n- Add --no-permission-prompts",
    author: "anthropics/claude-code",
    agentId: "claude-code",
    isReply: false,
    source: "github",
    expected: "SIGNAL",
    fastPathDeterministic: true,
    rationale: "GitHub release → always SIGNAL",
  },
  {
    text: "v0.3.0\n\n## Changes\n- Parallel file editing\n- Better error recovery",
    author: "openai/codex",
    agentId: "codex",
    isReply: false,
    source: "github",
    expected: "SIGNAL",
    fastPathDeterministic: true,
    rationale: "GitHub release → always SIGNAL",
  },
  // ── Context (LLM CONTEXT)
  {
    text: "Claude Code vs Copilot: a detailed comparison of permission models. Thread 🧵",
    author: "amorriscode",
    agentId: "claude-code",
    isReply: false,
    expected: "CONTEXT",
    fastPathDeterministic: false,
    rationale:
      "Industry comparison — adds understanding but not a product update",
  },
  {
    text: "I've been using Codex for 3 months — here's my honest review vs Claude Code",
    author: "reach_vb",
    agentId: "codex",
    isReply: false,
    expected: "CONTEXT",
    fastPathDeterministic: false,
    rationale: "User review / comparison piece",
  },
  {
    text: "The new permission model in Claude Code is a masterclass in UX for agentic systems",
    author: "lydiahallie",
    agentId: "claude-code",
    isReply: false,
    expected: "CONTEXT",
    fastPathDeterministic: false,
    rationale: "Analysis/opinion about a feature — not an update",
  },
  // ── Noise (fast-path or LLM NOISE)
  {
    text: "best team",
    author: "bcherny",
    agentId: "claude-code",
    isReply: false,
    expected: "NOISE",
    fastPathDeterministic: true,
    rationale: "Short social phrase < 15 chars — fast-path NOISE",
  },
  {
    text: "lol",
    author: "noahzweben",
    agentId: "claude-code",
    isReply: true,
    expected: "NOISE",
    fastPathDeterministic: true,
    rationale: "Social filler — fast-path NOISE",
  },
  {
    text: "👍",
    author: "trq212",
    agentId: "claude-code",
    isReply: true,
    expected: "NOISE",
    fastPathDeterministic: true,
    rationale: "Emoji reaction — fast-path NOISE",
  },
  {
    text: "happy birthday! 🎂",
    author: "felixrieseberg",
    agentId: "claude-code",
    isReply: true,
    expected: "NOISE",
    fastPathDeterministic: false,
    rationale: "Personal social post — LLM NOISE",
  },
  {
    text: "We just raised our Series C — $200M to accelerate our mission",
    author: "claudeai",
    agentId: "claude-code",
    isReply: false,
    expected: "NOISE",
    fastPathDeterministic: false,
    rationale: "Company news unrelated to Claude Code product",
  },
  {
    text: "Claude is now available in Japanese, Korean, and 15 other languages",
    author: "claudeai",
    agentId: "claude-code",
    isReply: false,
    expected: "NOISE",
    fastPathDeterministic: false,
    rationale: "Claude product news, not Claude Code specifically",
  },
  {
    text: "agree with this take",
    author: "rohanvarma",
    agentId: "codex",
    isReply: true,
    expected: "NOISE",
    fastPathDeterministic: false,
    rationale: "Short agreement reply — no product content",
  },
  {
    text: "come join us! we're hiring senior engineers https://openai.com/careers",
    author: "openaidevs",
    agentId: "codex",
    isReply: false,
    expected: "NOISE",
    fastPathDeterministic: false,
    rationale: "Job posting — not a product update",
  },
  {
    text: "watching the game tonight anyone else?",
    author: "reach_vb",
    agentId: "codex",
    isReply: false,
    expected: "NOISE",
    fastPathDeterministic: false,
    rationale: "Personal post",
  },
];

export const fastPathFixtures = fixtures.filter((f) => f.fastPathDeterministic);
export const llmFixtures = fixtures.filter((f) => !f.fastPathDeterministic);
```

---

## Component 3: `packages/skills`

### 3.1 `claude-code/updagent.md`

```markdown
---
name: updagent
description: "Show latest updates for Claude Code, Codex CLI, and other AI coding agents from X.com and GitHub releases. Supports alarming (compact) and educating (detailed) modes."
triggers:
  - "updagent"
  - "what's new in claude code"
  - "codex updates"
  - "latest release"
  - "any agent updates"
  - "claude code update"
  - "did anything ship"
---

## What updagent does

Aggregates product signals for Claude Code, Codex CLI, and other AI coding agents from:

- X.com posts by tracked team accounts (filtered for product signals only)
- GitHub release notes (always authoritative)

## Commands

| Command                 | Mode      | Shows                | Window   |
| ----------------------- | --------- | -------------------- | -------- |
| `/updagent`             | Alarming  | SIGNAL items only    | last 6h  |
| `/updagent --since 24h` | Alarming  | SIGNAL items only    | last 24h |
| `/updagent --educate`   | Educating | SIGNAL + CONTEXT     | last 24h |
| `/updagent claude-code` | Alarming  | Claude Code only     | last 6h  |
| `/updagent codex`       | Alarming  | Codex CLI only       | last 6h  |
| `/updagent releases`    | Alarming  | GitHub releases only | last 7d  |

## Data sources (in order of preference)

1. **Network**: `https://updagent.vercel.app/api/feed?tool={tool}&mode={alarm|educate}&since={6h|24h|7d}`
2. **Offline fallback**: Read `~/updagent/data/feed.json` (committed every 6h by GitHub Actions)

Always use the offline fallback when the network request fails or times out (>5s).

## Display format

### Alarming mode (default — `/updagent`)
```

=== updagent: N new updates ===

[GH] owner/repo · vX.X.X · Xh ago
First line of release notes (120 chars max)
→ URL

[X] @handle · AgentName · Xh ago
"Tweet text (120 chars max)"
♥ N 🔁 N
→ URL

```

Rules:
- Show GitHub releases before X posts
- Sort by publishedAt DESC within each group
- Show max 10 items total
- Truncate text at 120 characters

### Educating mode (`/updagent --educate`)

```

=== updagent: AgentName — Deep Dive (last 24h) ===

## 🚀 Releases

### vX.X.X (Xh ago)

Full release notes text
→ URL

## 📡 Team Signals

@handle (Xh ago, [reply to @user if applicable])
"Full tweet text"
♥ N 🔁 N 👁 N
→ URL

## 📰 Community Context

@handle (Xh ago)
"Full tweet text"
♥ N 🔁 N
→ URL

## 🔥 Trending (top 3 by engagement score = likes + retweets×3)

1. @handle "text..." — score N
2. ...

```

## Signal detection (distributed mode)

If `SIGNAL_DETECTION_MODE=distributed` is set:

Before displaying X posts from the offline fallback, re-classify them using:
```

claude -p "<buildDistributedPrompt(post)>"

```

Parse the JSON response and filter/display based on classification.

## Health warning

If `~/updagent/data/health.json` exists and `credentialWarning === true`, display at top:
```

⚠️ X data may be incomplete — Tier 1 auth degraded for some accounts.
Check AUTH_TOKEN + CT0 in your environment.

````

## Installation

```bash
cp packages/skills/claude-code/updagent.md ~/.claude/skills/updagent.md
# or
bash packages/skills/install.sh
````

````

### 3.2 `install.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing updagent skills..."

# Claude Code
mkdir -p ~/.claude/skills
cp "$SCRIPT_DIR/claude-code/updagent.md" ~/.claude/skills/updagent.md
echo "  ✓ Claude Code: ~/.claude/skills/updagent.md"

# Codex CLI
mkdir -p ~/.codex/agents
cp "$SCRIPT_DIR/codex/updagent.md" ~/.codex/agents/updagent.md
echo "  ✓ Codex CLI:   ~/.codex/agents/updagent.md"

echo ""
echo "Done. Use /updagent in Claude Code or Codex to see AI agent updates."
echo "  /updagent           — alarming mode (last 6h signals)"
echo "  /updagent --educate — educating mode (full 24h breakdown)"
````

---

## Component 4: `.github/workflows/collect.yml`

```yaml
name: Collect updagent feed

on:
  schedule:
    - cron: "0 */6 * * *" # 00:00, 06:00, 12:00, 18:00 UTC — 4 runs/day
  workflow_dispatch: # Manual trigger from GitHub Actions UI

permissions:
  contents: write # Required to commit data/ and newsletters/

jobs:
  collect:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Run collector
        env:
          AUTH_TOKEN: ${{ secrets.AUTH_TOKEN }}
          CT0: ${{ secrets.CT0 }}
          SCRAPECREATORS_API_KEY: ${{ secrets.SCRAPECREATORS_API_KEY }}
          XAI_API_KEY: ${{ secrets.XAI_API_KEY }}
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
          UPSTASH_REDIS_REST_URL: ${{ secrets.UPSTASH_REDIS_REST_URL }}
          UPSTASH_REDIS_REST_TOKEN: ${{ secrets.UPSTASH_REDIS_REST_TOKEN }}
          SIGNAL_DETECTION_MODE: centralized
        run: npm run collect --workspace=packages/collector

      - name: Commit data if changed
        run: |
          git config user.name "updagent[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data/feed.json data/health.json newsletters/ 2>/dev/null || true
          if git diff --staged --quiet; then
            echo "No changes to commit"
          else
            ITEM_COUNT=$(node -e "
              try {
                const f = JSON.parse(require('fs').readFileSync('data/feed.json', 'utf8'));
                console.log(f.itemCount ?? f.items?.length ?? 0);
              } catch { console.log(0); }
            ")
            git commit -m "chore(data): update feed [skip ci] — ${ITEM_COUNT} items"
            git push
          fi
```

---

## Component 5: Data Files

### 5.1 `data/feed.json` — Schema

```json
{
  "version": "1",
  "updatedAt": "2026-04-07T12:00:05Z",
  "itemCount": 42,
  "items": [
    {
      "id": "https://x.com/bcherny/status/1234567890",
      "source": "x",
      "agentId": "claude-code",
      "author": "bcherny",
      "text": "This was fixed in yesterday's release. `claude update` to make sure you're on the latest",
      "url": "https://x.com/bcherny/status/1234567890",
      "publishedAt": "2026-04-07T08:23:00Z",
      "collectedAt": "2026-04-07T12:00:03Z",
      "classification": "SIGNAL",
      "classificationReason": "team member confirms bug fix",
      "classifiedBy": "llm",
      "classificationModel": "google/gemini-flash-1.5",
      "isRelease": false,
      "engagementScore": 113,
      "likes": 77,
      "retweets": 12,
      "views": 34000,
      "isReply": true,
      "parentTweetSummary": "user reporting statusline bug"
    },
    {
      "id": "anthropics/claude-code@v1.9.4",
      "source": "github",
      "agentId": "claude-code",
      "author": "anthropics/claude-code",
      "text": "v1.9.4\n\n## What's New\n- Fix statusline rendering on Windows\n- Add --no-permission-prompts flag",
      "url": "https://github.com/anthropics/claude-code/releases/tag/v1.9.4",
      "publishedAt": "2026-04-07T10:00:00Z",
      "collectedAt": "2026-04-07T12:00:01Z",
      "classification": "SIGNAL",
      "classificationReason": "GitHub official release",
      "classifiedBy": "fast-path",
      "isRelease": true,
      "version": "1.9.4",
      "engagementScore": 0,
      "isReply": false
    }
  ]
}
```

**Retention policy**: Items older than 30 days from `publishedAt` are pruned on each write.  
**Sort**: `publishedAt` DESC (newest first).  
**Committed**: only when content changes (`git diff --staged --quiet` guard).

### 5.2 `data/health.json` — Schema

```json
{
  "lastRunAt": "2026-04-07T12:00:00Z",
  "durationMs": 45320,
  "newItemCount": 3,
  "totalItemCount": 42,
  "tier1FailureCount": 0,
  "tier2FailureCount": 0,
  "allTierFailureAccounts": [],
  "credentialWarning": false,
  "accounts": [
    {
      "account": "bcherny",
      "consecutiveTier1Failures": 0,
      "lastSuccessfulTier": 1,
      "lastSuccessAt": "2026-04-07T12:00:00Z",
      "lastCheckedAt": "2026-04-07T12:00:00Z"
    }
  ]
}
```

---

## Environment Variables — Complete Reference

| Variable                   | Used by                    | Purpose                                      | v1 Required?        | Default       |
| -------------------------- | -------------------------- | -------------------------------------------- | ------------------- | ------------- |
| `AUTH_TOKEN`               | collector/x-bird           | X bird-search session auth token             | ✅ For X Tier 1     | —             |
| `CT0`                      | collector/x-bird           | X bird-search CSRF token                     | ✅ For X Tier 1     | —             |
| `SCRAPECREATORS_API_KEY`   | collector/x-scrapecreators | X Tier 2 fallback REST API key               | Optional            | —             |
| `XAI_API_KEY`              | collector/x-xai            | X Tier 3 fallback (xAI Grok)                 | Optional            | —             |
| `OPENROUTER_API_KEY`       | collector/classifier       | LLM signal classification (centralized mode) | ✅ centralized mode | —             |
| `SIGNAL_DETECTION_MODE`    | collector + skills         | `centralized` or `distributed`               | Optional            | `centralized` |
| `UPDAGENT_LOCAL_AGENT`     | collector/classifier       | Force `claude` or `codex` for distributed    | Optional            | auto-detect   |
| `GH_TOKEN`                 | collector/github-releases  | GitHub API rate limit avoidance              | Recommended         | —             |
| `GITHUB_WEBHOOK_SECRET`    | future web webhook         | Webhook HMAC verification                    | Deferred v2         | —             |
| `UPSTASH_REDIS_REST_URL`   | collector/storage          | Redis hot cache URL                          | Optional v1         | —             |
| `UPSTASH_REDIS_REST_TOKEN` | collector/storage          | Redis auth token                             | Optional v1         | —             |

**Minimum viable v1 (centralized)**: `AUTH_TOKEN`, `CT0`, `OPENROUTER_API_KEY`, `GH_TOKEN`  
**Minimum viable v1 (distributed, no OpenRouter)**: `AUTH_TOKEN`, `CT0`, `GH_TOKEN`, `SIGNAL_DETECTION_MODE=distributed`

---

## Cost Model — Detailed

| Component                            | Quantity per run                        | Runs/day                            | Daily total                    | Monthly                       |
| ------------------------------------ | --------------------------------------- | ----------------------------------- | ------------------------------ | ----------------------------- |
| GitHub Actions (ubuntu-latest)       | ~2 min/run                              | 4                                   | 8 min                          | 240 min (free tier: 2000 min) |
| X bird-search Tier 1                 | 12 accounts                             | 4                                   | 48 subprocess calls            | Free (session cookies)        |
| X Tier 2 (ScrapeCreators)            | Only if Tier 1 fails                    | ~0                                  | ~0                             | $0 typical                    |
| X Tier 3 (xAI Grok)                  | Only if Tier 1+2 fail                   | ~0                                  | ~0                             | $0 typical                    |
| OpenRouter Gemini Flash (free)       | ~48 LLM calls @ 10/batch = ~5 API calls | 4                                   | 20 API calls                   | **$0.00**                     |
| OpenRouter Claude Haiku (fallback)   | Only if Gemini quota exhausted          | 4                                   | ~48 calls @ 150 tok = 7200 tok | ~$0.007                       |
| GitHub repo storage (feed.json)      | ~50KB per commit                        | ~2 commits/day (content-hash guard) | —                              | Free                          |
| Upstash Redis                        | 0 items/day in v1                       | —                                   | —                              | Deferred                      |
| **Total (free models)**              |                                         |                                     |                                | **$0.00/month**               |
| **Total (paid fallback worst case)** |                                         |                                     |                                | **~$0.21/month**              |
