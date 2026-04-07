# updagent — Component Specification

**Version**: 1.0  
**Date**: 2026-04-07  
**Status**: Approved

---

## Monorepo Structure

```
updagent/
├── packages/
│   ├── shared/              # Shared types, agent registry, config
│   ├── collector/           # Data collection, signal detection, storage, newsletter
│   └── skills/              # CLI skill templates per agent
├── data/
│   ├── feed.json            # Cold archive (committed by GH Actions)
│   └── health.json          # Collection health / tier failure tracking
├── newsletters/
│   └── YYYY-MM-DD.md        # Auto-generated newsletters
├── .github/
│   └── workflows/
│       └── collect.yml      # Hourly-ish cron (every 6h)
├── package.json             # Workspace root
├── tsconfig.json            # Base TypeScript config
├── GOAL.md                  # This project's goal spec
├── COMPONENTS.md            # This file
├── TASKS.md                 # Implementation tasks
├── SPEC.md                  # Original spec (superseded, retained for reference)
└── opencli/                 # Submodule — reference only, not used in production
```

---

## Component 1: `packages/shared`

### Purpose

Single source of truth for all shared types, the agent registry, and configuration schema. All other packages depend on this. Nothing else defines types.

### Package identity

```json
{
  "name": "@updagent/shared",
  "version": "0.1.0",
  "type": "module"
}
```

### Files

#### `src/types.ts`

All TypeScript interfaces used across the monorepo.

```typescript
// ── Feed item (canonical output schema) ────────────────────────────────────

export type SignalClassification = "SIGNAL" | "CONTEXT" | "NOISE";
export type SourceType = "x" | "github";

export interface FeedItem {
  id: string; // tweet URL (full) or github release tag (e.g. "v1.9.4")
  source: SourceType;
  agentId: string; // matches AgentConfig.id (e.g. "claude-code", "codex")
  author: string; // @handle or "owner/repo"
  text: string; // tweet text or release body (markdown for github)
  url: string; // canonical link to original source
  publishedAt: string; // ISO 8601 UTC
  classification: SignalClassification;
  classificationReason: string; // one-line explanation from classifier
  isRelease: boolean; // true if github release OR tweet explicitly announces a version
  version?: string; // extracted semver if detectable (e.g. "1.9.4")
  engagementScore: number; // likes*1 + retweets*3 (0 for github releases)
  likes?: number;
  retweets?: number;
  views?: number;
  isReply: boolean; // whether the tweet is a reply to another tweet
  parentTweetSummary?: string; // brief summary of parent tweet if isReply=true
  collectedAt: string; // ISO 8601 UTC — when updagent first saw this item
}

// ── Raw X post (before normalization) ──────────────────────────────────────

export interface RawXPost {
  id: string; // tweet ID
  url: string;
  text: string;
  author: string; // handle without @
  publishedAt: string;
  likes: number;
  retweets: number;
  views: number;
  isReply: boolean;
  parentTweetId?: string;
  parentTweetText?: string;
  tier: 1 | 2 | 3; // which cascade tier produced this
}

// ── Raw GitHub release (before normalization) ───────────────────────────────

export interface RawGitHubRelease {
  tagName: string; // e.g. "v1.9.4"
  name: string; // release title
  body: string; // markdown release notes
  publishedAt: string;
  url: string; // HTML URL to release page
  owner: string;
  repo: string;
}

// ── Agent configuration ─────────────────────────────────────────────────────

export interface AgentConfig {
  id: string; // kebab-case, unique (e.g. "claude-code", "codex")
  name: string; // display name (e.g. "Claude Code")
  priority: 1 | 2 | 3; // 1=launch, 2=next, 3=future
  enabled: boolean; // false = skip entirely in collection
  github: {
    owner: string; // e.g. "anthropics"
    repo: string; // e.g. "claude-code"
  };
  xAccounts: string[]; // handles without @ (e.g. ["bcherny", "trq212"])
  signalKeywords: string[]; // keyword fast-path hints (e.g. ["claude code", "claude update"])
}

// ── Health / monitoring ─────────────────────────────────────────────────────

export interface TierHealth {
  account: string; // @handle
  consecutiveTier1Failures: number;
  lastSuccessfulTier: 1 | 2 | 3 | null;
  lastChecked: string; // ISO 8601
}

export interface CollectionHealth {
  lastRun: string; // ISO 8601
  durationMs: number;
  newItemCount: number;
  tier1Failures: number; // accounts where tier 1 failed this run
  tier2Failures: number;
  allTierFailures: string[]; // account handles where all tiers failed
  accounts: TierHealth[];
  credentialWarning: boolean; // true if any account has consecutiveTier1Failures >= 3
}

// ── Signal detection ────────────────────────────────────────────────────────

export interface ClassificationInput {
  text: string;
  author: string;
  agentId: string;
  agentName: string;
  isReply: boolean;
  parentTweetSummary?: string;
  signalKeywords: string[];
}

export interface ClassificationResult {
  classification: SignalClassification;
  reason: string;
  passedBy: "fast-path" | "llm";
  model?: string; // which LLM was used if passedBy="llm"
}
```

#### `src/agents-config.json`

The agent registry. **This is the only place to add, enable, or modify tracked agents.**

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
        "claude cli",
        "anthropic cli",
        "claude --version"
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
      "signalKeywords": ["opencode", "opencode cli"]
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

#### `src/registry.ts`

Typed loader for `agents-config.json`.

```typescript
import config from "./agents-config.json" assert { type: "json" };
import type { AgentConfig } from "./types.js";

export function getEnabledAgents(): AgentConfig[] {
  return config.agents.filter((a) => a.enabled);
}

export function getAllAgents(): AgentConfig[] {
  return config.agents as AgentConfig[];
}

export function getAgentById(id: string): AgentConfig | undefined {
  return config.agents.find((a) => a.id === id) as AgentConfig | undefined;
}
```

### Exports (`src/index.ts`)

Re-exports everything: all types + registry functions.

---

## Component 2: `packages/collector`

### Purpose

The heart of updagent. Runs in GitHub Actions on a 6-hour cron. Fetches X posts and GitHub releases for all enabled agents, normalizes them, runs signal detection, stores results, generates newsletters.

### Package identity

```json
{
  "name": "@updagent/collector",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "collect": "tsx src/collect.ts",
    "test": "vitest run"
  }
}
```

### Dependencies

- `@updagent/shared` — types + registry
- `@anthropic-ai/sdk` or `openai` — via OpenRouter for signal classification
- `node-fetch` or native `fetch` (Node 20+) — for GitHub REST API + ScrapeCreators
- `vitest` — testing

---

### Sub-component 2a: X.com Collection (`src/sources/`)

#### `src/sources/x-bird.ts` — Tier 1

Wraps the vendored `bird-search` Node.js script. This is the same approach used in `last30days-skill_example.md`.

**Interface**:

```typescript
export async function fetchFromBirdSearch(
  handle: string,
  sinceHours: number, // 6 for cron runs
  count: number, // 20 default
): Promise<RawXPost[]>;
```

**Implementation notes**:

- Spawns `node scripts/lib/vendor/bird-search/bird-search.mjs "from:<handle>" --since <sinceHours>h --count <count> --json`
- Requires `AUTH_TOKEN` and `CT0` env vars
- Parses JSON stdout into `RawXPost[]`
- Throws `BirdSearchError` on non-zero exit or JSON parse failure
- Sets `tier: 1` on all returned posts

**Error handling**:

- Non-zero exit code → throw `BirdSearchAuthError` (indicates cookie expiry)
- Zero results → return `[]` (not an error — account may have been quiet)
- JSON parse error → throw `BirdSearchParseError`

#### `src/sources/x-scrapecreators.ts` — Tier 2

REST API fallback. Called only when Tier 1 fails.

**Interface**:

```typescript
export async function fetchFromScrapeCreators(
  handle: string,
  sinceHours: number,
  count: number,
): Promise<RawXPost[]>;
```

**Implementation notes**:

- `GET https://api.scrapecreators.com/v1/twitter/user/tweets?handle=<handle>&limit=<count>`
- Auth: `Authorization: Bearer ${SCRAPECREATORS_API_KEY}`
- Filter results client-side to `sinceHours` window
- Normalize ScrapeCreators response schema → `RawXPost`
- Sets `tier: 2`

#### `src/sources/x-xai.ts` — Tier 3

xAI Grok `x_search` tool. Called only when Tier 1 + 2 both fail. Non-deterministic — results may vary between calls.

**Interface**:

```typescript
export async function fetchFromXAI(
  handle: string,
  sinceHours: number,
  count: number,
): Promise<RawXPost[]>;
```

**Implementation notes**:

- Uses xAI Responses API with the `x_search` built-in tool
- Query: `"from:${handle} since:${sinceHoursAgo}"`
- Parse LLM response: extract tweet references, normalize to `RawXPost`
- Mark `tier: 3` and add `note: "xAI-mediated, may be incomplete"`
- Results should be treated as best-effort, not authoritative

#### `src/sources/x-cascade.ts` — Orchestrator

```typescript
export interface CascadeResult {
  posts: RawXPost[];
  tierUsed: 1 | 2 | 3 | null; // null = all tiers failed
  failures: Array<{ tier: 1 | 2 | 3; error: string }>;
}

export async function fetchXPostsForAccount(
  handle: string,
  sinceHours: number,
  rateLimitDelayMs: number, // default 2000
): Promise<CascadeResult>;
```

**Flow**:

```
try Tier 1 (bird-search)
  → success: return { posts, tierUsed: 1 }
  → BirdSearchAuthError OR empty + auth suspect: try Tier 2
    → success: return { posts, tierUsed: 2 }
    → failure: try Tier 3
      → success: return { posts, tierUsed: 3 }
      → failure: return { posts: [], tierUsed: null, failures: [...] }
```

**Rate limiting**: waits `rateLimitDelayMs` between per-account calls (caller's responsibility to sequence).

---

### Sub-component 2b: GitHub Release Collection (`src/sources/github-releases.ts`)

```typescript
export async function fetchGitHubReleases(
  owner: string,
  repo: string,
  perPage: number, // default 5
): Promise<RawGitHubRelease[]>;
```

**Implementation notes**:

- `GET https://api.github.com/repos/${owner}/${repo}/releases?per_page=${perPage}`
- Auth header: `Authorization: Bearer ${GH_TOKEN}` if env var present (optional — public repos work without it)
- Returns empty array on 404 (repo not found or no releases)
- Throws on 403 (rate limited without token) with helpful error message

---

### Sub-component 2c: Normalization (`src/normalize.ts`)

```typescript
export function normalizeXPost(
  raw: RawXPost,
  agentId: string,
  classification: ClassificationResult,
): FeedItem;

export function normalizeGitHubRelease(
  raw: RawGitHubRelease,
  agentId: string,
): FeedItem;
```

**Normalization rules**:

- GitHub releases: always `source: "github"`, `isRelease: true`, `classification: "SIGNAL"`, `engagementScore: 0`
- X posts: `source: "x"`, `isRelease` = true if text matches semver pattern OR contains "release" keyword
- `version` extraction: regex `v?\d+\.\d+(\.\d+)?` on text, first match wins
- `id` for X posts: full tweet URL (not just tweet ID — URLs are stable across re-collections)
- `id` for GitHub releases: `${owner}/${repo}@${tagName}` (e.g. `anthropics/claude-code@v1.9.4`)
- `engagementScore = likes * 1 + retweets * 3` (retweets weighted higher as amplification signal)
- `collectedAt`: set to current UTC timestamp at normalization time

---

### Sub-component 2d: Deduplication (`src/dedup.ts`)

```typescript
export function dedup(
  newItems: FeedItem[],
  existingItems: FeedItem[],
): FeedItem[]; // returns only items not already in existingItems
```

**Dedup key**: `FeedItem.id` (tweet URL or `owner/repo@tagName`).

**Logic**: Build a `Set<string>` from existing item IDs, filter new items against it.

---

### Sub-component 2e: Signal Detection (`src/signal/`)

#### `src/signal/rules.ts` — Pass 1 (keyword fast-path)

```typescript
export type FastPathResult =
  | { result: "SIGNAL" | "NOISE"; reason: string }
  | { result: "CANDIDATE" }; // pass to LLM
```

```typescript
export function fastPath(input: ClassificationInput): FastPathResult;
```

**Rules (evaluated in order)**:

| Rule | Condition                                                                                        | Result                                                   |
| ---- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | --- | --- | --- | ---- | --- | --- | --- | --- | --------- | ------------------------- |
| 1    | `source === "github"`                                                                            | `SIGNAL` — "GitHub release"                              |
| 2    | Text matches semver pattern (`v?\d+\.\d+(\.\d+)?`)                                               | `SIGNAL` — "contains version number"                     |
| 3    | Text matches any `signalKeywords` (case-insensitive) AND mentions release/fix/update/feature/bug | `SIGNAL` — "keyword + action match"                      |
| 4    | `isReply === true` AND `author` is in tracked accounts                                           | `CANDIDATE` — "reply from tracked account — pass to LLM" |
| 5    | `isReply === true` AND `author` is NOT in tracked accounts                                       | `NOISE` — "reply from non-tracked account"               |
| 6    | Text length < 15 characters                                                                      | `NOISE` — "too short to be informative"                  |
| 7    | Text matches purely social patterns (`^(lol                                                      | haha                                                     | 👍  | ❤️  | 🔥  | same | yep | yes | no  | ok  | thanks)`) | `NOISE` — "social filler" |
| 8    | Text matches any `signalKeywords` (case-insensitive)                                             | `CANDIDATE` — "keyword match"                            |
| 9    | Otherwise                                                                                        | `CANDIDATE` — "default to LLM"                           |

> **Key design**: replies from tracked accounts default to CANDIDATE (not NOISE). Evidence from real data shows that team leads' most valuable posts are replies to user bug reports (e.g., "@bcherny: This was fixed in yesterday's release" is a reply). Blanket reply filtering would discard these.

#### `src/signal/prompts.ts` — Prompt templates

```typescript
export function buildClassificationPrompt(posts: ClassificationInput[]): string;
```

Prompt structure (batched, up to 10 posts):

```
You are classifying social media posts for a developer update feed.
For each post below, decide if it is about a product update for the specified AI coding tool.

Classifications:
- SIGNAL: Direct product update — new feature, release, bug fix, breaking change, roadmap announcement, workaround for known issue
- CONTEXT: Industry context — comparisons, analysis, commentary about the tool or AI coding space. Worth knowing but not actionable
- NOISE: Personal, social, unrelated — jokes, reactions, audience chat, news about other products/companies

Important: Replies from team members confirming bug fixes or announcing features ARE SIGNAL even if they are replies.

Posts to classify (JSON array):
[
  {
    "index": 0,
    "author": "@bcherny",
    "agentName": "Claude Code",
    "text": "This was fixed in yesterday's release. `claude update` to make sure you're on the latest",
    "isReply": true,
    "parentTweetSummary": "user reporting statusline bug"
  },
  ...
]

Respond with a JSON array matching the input order:
[
  { "index": 0, "classification": "SIGNAL", "reason": "team member confirms bug fix, instructs update" },
  ...
]
```

#### `src/signal/classifier.ts` — Main classification engine

```typescript
export async function classifyBatch(
  inputs: ClassificationInput[],
  mode: "centralized" | "distributed",
): Promise<ClassificationResult[]>;
```

**Centralized mode** (OpenRouter):

- Provider: OpenRouter API (`https://openrouter.ai/api/v1`)
- Primary model: `google/gemini-flash-1.5` (free tier)
- Fallback model: `anthropic/claude-haiku-4-5` (paid, ~$0.007/day at 4 runs/day)
- Batch size: up to 10 posts per request
- Auth: `Authorization: Bearer ${OPENROUTER_API_KEY}`
- Parse response JSON array → `ClassificationResult[]`
- **API down fallback**: return `{ classification: "CONTEXT", reason: "LLM unavailable — defaulting to CONTEXT", passedBy: "llm" }` for each input (never discard)

**Distributed mode** (local agent CLI):

- Detect which agent is running: check `SIGNAL_DETECTION_MODE` + `UPDAGENT_LOCAL_AGENT` env vars
- Claude Code: spawn `claude -p "<prompt>"` with post text, parse JSON response
- Codex: spawn `codex "<prompt>"`, parse JSON response
- Process one post at a time (no batching — CLI calls are slower, but this runs on-demand not in bulk)
- Fallback: if CLI unavailable, fall back to fast-path result or CONTEXT

---

### Sub-component 2f: Storage (`src/storage.ts`)

```typescript
export async function readFeedJson(path: string): Promise<FeedItem[]>;
export async function writeFeedJson(
  path: string,
  items: FeedItem[],
): Promise<void>;
export async function readHealthJson(
  path: string,
): Promise<CollectionHealth | null>;
export async function writeHealthJson(
  path: string,
  health: CollectionHealth,
): Promise<void>;

// Redis (optional — only called if UPSTASH_REDIS_REST_URL is set)
export async function writeToRedis(items: FeedItem[]): Promise<void>;
export async function isRedisConfigured(): boolean;
```

**feed.json format**:

```json
{
  "version": "1",
  "updatedAt": "2026-04-07T12:00:00Z",
  "items": [
    /* FeedItem[] sorted by publishedAt DESC */
  ]
}
```

**feed.json retention**: keep last 30 days of items. Items older than 30 days are pruned on each write.

**health.json format**: `CollectionHealth` object (see types.ts).

---

### Sub-component 2g: Newsletter Generator (`src/newsletter.ts`)

```typescript
export function generateNewsletter(
  items: FeedItem[],
  date: string, // YYYY-MM-DD
): string; // markdown string
```

**Template**:

```markdown
# updagent — YYYY-MM-DD

> Auto-generated by updagent. Sources: X.com team accounts + GitHub releases.
> [View full feed](https://github.com/jyoung105/updagent/blob/main/data/feed.json)

## Claude Code

### 🚀 Releases

- **vX.X.X** (N hours ago) — [release notes](URL)
  > Key change 1; Key change 2

### 📡 Team Signals

- **@handle** (N hours ago): "post text" — [link](URL)

## Codex CLI

### 🚀 Releases

...

### 📡 Team Signals

...

---

_N new items since last newsletter. Collection ran at HH:MM UTC._
_⚠️ Warning: Tier 1 auth may be degraded for N accounts._ (only if health.json shows issues)
```

**Generation trigger**: only generates if at least 1 new SIGNAL item exists since the last newsletter file in `newsletters/`.

**File naming**: `newsletters/YYYY-MM-DD.md` — one file per calendar day. If a day already has a file and new items arrive in a later 6h window, **append** to the existing day's file rather than create a duplicate.

---

### Sub-component 2h: Main Orchestrator (`src/collect.ts`)

Entry point for GitHub Actions. Coordinates all sub-components.

```typescript
async function main(): Promise<void>;
```

**Execution flow**:

```
1. Load environment variables (check required vars, warn on missing optional)
2. Load enabled agents from @updagent/shared registry
3. Load existing feed.json (or start empty if not exists)
4. Initialize health tracking

5. For each enabled agent (sequential):
   a. Fetch GitHub releases (last 5)
   b. For each X account (sequential, 2s delay between accounts):
      - Run 3-tier cascade (bird-search → ScrapeCreators → xAI)
      - Track tier health
   c. Normalize all raw items → FeedItem[]
   d. Deduplicate against existing feed

6. Run signal detection pipeline on new items:
   a. Fast-path all items (rules.ts)
   b. Batch CANDIDATE items → LLM classifier
   c. Assign classification to each FeedItem

7. Merge new SIGNAL + CONTEXT items into existing feed
8. Prune feed to last 30 days

9. Write feed.json
10. Write health.json
11. Write to Redis if UPSTASH_REDIS_REST_URL is set

12. Generate newsletter if new SIGNAL items exist
    - Append to today's file or create new

13. Log summary: N new items (X SIGNAL, Y CONTEXT, Z NOISE discarded)
    - Warn if any accounts had all-tier failures
    - Warn if credential degradation detected (consecutiveTier1Failures >= 3)

14. Exit 0 (always — never exit 1 on partial failures)
```

**Non-crash guarantee**: The collector MUST exit 0 even if all X tiers fail for all accounts. GitHub releases are always collected. Partial data is better than no commit.

---

### Sub-component 2i: Tests (`src/__tests__/`)

#### `src/__tests__/signal-fixtures.ts`

Labeled dataset of ≥25 real-world tweet examples with expected classifications.

```typescript
export interface Fixture {
  text: string;
  author: string;
  agentId: string;
  isReply: boolean;
  parentTweetSummary?: string;
  expected: SignalClassification;
  rationale: string;
}

export const fixtures: Fixture[] = [
  // HIGH-SIGNAL REPLIES (must NOT be filtered by reply detection)
  {
    text: "This was fixed in yesterday's release. `claude update` to make sure you're on the latest",
    author: "bcherny",
    agentId: "claude-code",
    isReply: true,
    parentTweetSummary: "user reporting statusline bug",
    expected: "SIGNAL",
    rationale: "team member confirms bug fix, instructs users to update",
  },
  {
    text: "Windows coming soon. No announcement/eta yet.",
    author: "bcherny",
    agentId: "claude-code",
    isReply: true,
    parentTweetSummary: "user asking about Windows support",
    expected: "SIGNAL",
    rationale: "roadmap hint from team lead",
  },
  {
    text: "Reliability for cloud has improved significantly",
    author: "bcherny",
    agentId: "claude-code",
    isReply: true,
    expected: "SIGNAL",
    rationale: "performance update announcement from team lead",
  },
  // CLEAN SIGNALS
  {
    text: "Codex CLI 0.3 is here: parallel file editing, better error recovery",
    author: "openaidevs",
    agentId: "codex",
    isReply: false,
    expected: "SIGNAL",
    rationale: "official release announcement",
  },
  {
    text: "claude update to v1.9.4 — fixes the statusline issue on Windows",
    author: "felixrieseberg",
    agentId: "claude-code",
    isReply: false,
    expected: "SIGNAL",
    rationale: "contains version number + fix description",
  },
  // CONTEXT
  {
    text: "Claude Code vs Copilot: a detailed comparison of permission models",
    author: "amorriscode",
    agentId: "claude-code",
    isReply: false,
    expected: "CONTEXT",
    rationale: "industry comparison, not a product update",
  },
  // NOISE
  {
    text: "best team",
    author: "bcherny",
    agentId: "claude-code",
    isReply: false,
    expected: "NOISE",
    rationale: "purely social, no product content",
  },
  {
    text: "lol",
    author: "noahzweben",
    agentId: "claude-code",
    isReply: true,
    expected: "NOISE",
    rationale: "social filler",
  },
  // Always SIGNAL (github releases - tested separately in classifier.test.ts)
];
```

#### `src/__tests__/rules.test.ts`

Unit tests for the fast-path rules — deterministic, no network, runs in < 1s.

Tests cover:

- GitHub release → always SIGNAL
- Semver in text → SIGNAL
- Reply from tracked account → CANDIDATE (not NOISE)
- Reply from non-tracked account → NOISE
- Short text (< 15 chars) → NOISE
- Social filler → NOISE
- Keyword match → CANDIDATE
- All fixtures that are fast-path deterministic

#### `src/__tests__/cascade.test.ts`

Tests for 3-tier cascade fallback logic with mocked tier implementations.

Scenarios:

- All tiers succeed → returns Tier 1 result
- Tier 1 fails (BirdSearchAuthError) → Tier 2 called, returns Tier 2 result
- Tier 1 + 2 fail → Tier 3 called, returns Tier 3 result
- All tiers fail → returns `{ posts: [], tierUsed: null, failures: [3 entries] }`
- Tier 1 returns empty (account quiet) → returns empty, no fallback (empty ≠ failure)

#### `src/__tests__/collect.integration.test.ts`

Integration test for the full `main()` orchestrator with all external calls mocked.

- Mock: bird-search subprocess, ScrapeCreators API, xAI API, GitHub REST API, OpenRouter API
- Verify: feed.json shape matches schema, item count correct, NOISE items absent, health.json written
- Verify: deduplication works (running twice with same data doesn't double-count)
- Verify: exit 0 even when all X tiers fail (GitHub releases still collected)

#### `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: { provider: "v8" },
  },
});
```

---

## Component 3: `packages/skills`

### Purpose

Markdown skill files installed into each AI coding agent's skill directory. These are the user-facing interface — how developers invoke updagent from within their AI coding agent.

### Files

#### `claude-code/updagent.md`

Installed to `~/.claude/skills/updagent.md`

```markdown
---
name: updagent
description: "Show latest updates for Claude Code, Codex CLI, and other AI coding agents from X.com and GitHub releases"
triggers:
  - "updagent"
  - "what's new in claude code"
  - "codex updates"
  - "latest release"
  - "any updates"
---

## Usage

- `/updagent` — alarming mode: SIGNAL items only from last 6h (default)
- `/updagent --educate` — educating mode: SIGNAL + CONTEXT from last 24h
- `/updagent codex` — Codex CLI updates only
- `/updagent claude-code` — Claude Code updates only
- `/updagent releases` — GitHub releases only (both tools)
- `/updagent --since 24h` — extend window to last 24h

## Data source priority

1. Fetch `https://updagent.vercel.app/api/feed?tool={tool}&mode={alarm|educate}&since={window}` (when network available)
2. Read `~/updagent/data/feed.json` (offline fallback — committed every 6h by GitHub Actions)

## Display format

### Alarming mode (default)

Show SIGNAL items only. Format each as:
```

[SOURCE] @author · AgentName · Xh ago
"post text (truncated to 120 chars)"
→ URL

```
Group: Releases first, then X signals. Sort by publishedAt DESC within each group.

### Educating mode (--educate)
Show SIGNAL + CONTEXT items. Format as sections:
- ## Releases (by agent)
- ## Team Signals (SIGNAL X posts, by agent)
- ## Community Context (CONTEXT items)
- ## Trending (top 3 by engagementScore)

Include full text, engagement scores (♥ N  🔁 N), and URL.

## Signal detection (distributed mode)

If `SIGNAL_DETECTION_MODE=distributed` is set in environment:
- Before displaying, classify fetched posts using: `claude -p "<classification prompt>"`
- Use `src/signal/prompts.ts` prompt format
- Filter to SIGNAL/CONTEXT based on response before displaying

## Health warning

If `data/health.json` exists and `credentialWarning: true`:
Display at top: "⚠️ X data may be incomplete — Tier 1 credentials degraded. Check AUTH_TOKEN + CT0."
```

#### `codex/updagent.md`

Installed to `~/.codex/agents/updagent.md`

Same structure as claude-code skill, with:

- Local agent call: `codex "<classification prompt>"` instead of `claude -p`
- Same API endpoint and fallback path

#### `shared/display.md`

Shared display format reference (not installed; referenced by both skill files during authoring).

---

## Component 4: `.github/workflows/collect.yml`

### Purpose

Automates data collection on a 6-hour cadence. The only piece of infrastructure that runs continuously.

### Full spec

```yaml
name: Collect feed

on:
  schedule:
    - cron: "0 */6 * * *" # 00:00, 06:00, 12:00, 18:00 UTC
  workflow_dispatch: # manual trigger from GitHub Actions UI

permissions:
  contents: write # needed to commit data/feed.json and newsletters/

jobs:
  collect:
    runs-on: ubuntu-latest
    timeout-minutes: 10 # fail fast if something hangs

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
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
          git config user.email "updagent@users.noreply.github.com"
          git add data/feed.json data/health.json newsletters/ || true
          git diff --staged --quiet || git commit -m \
            "chore(data): update feed [skip ci] — $(node -e "const f=JSON.parse(require('fs').readFileSync('data/feed.json','utf8')); console.log(f.items.length + ' items')")"
          git push
```

### Secret requirements

Must be set in GitHub repo → Settings → Secrets and variables → Actions:

| Secret                     | Required?   | Notes                         |
| -------------------------- | ----------- | ----------------------------- |
| `AUTH_TOKEN`               | ✅          | X session auth token          |
| `CT0`                      | ✅          | X CSRF token                  |
| `OPENROUTER_API_KEY`       | ✅          | Signal classification         |
| `GH_TOKEN`                 | Recommended | Avoids GitHub API rate limits |
| `SCRAPECREATORS_API_KEY`   | Optional    | Tier 2 fallback               |
| `XAI_API_KEY`              | Optional    | Tier 3 fallback               |
| `UPSTASH_REDIS_REST_URL`   | Optional v1 | For future web app            |
| `UPSTASH_REDIS_REST_TOKEN` | Optional v1 | For future web app            |

---

## Component 5: `data/` Directory

### `data/feed.json`

Committed by GitHub Actions after each collection run (when content changes).

Schema:

```json
{
  "version": "1",
  "updatedAt": "2026-04-07T12:00:00Z",
  "itemCount": 42,
  "items": [
    {
      "id": "https://x.com/bcherny/status/...",
      "source": "x",
      "agentId": "claude-code",
      "author": "bcherny",
      "text": "This was fixed in yesterday's release...",
      "url": "https://x.com/bcherny/status/...",
      "publishedAt": "2026-04-07T09:23:00Z",
      "classification": "SIGNAL",
      "classificationReason": "team member confirms bug fix",
      "isRelease": false,
      "engagementScore": 113,
      "likes": 77,
      "retweets": 12,
      "views": 34000,
      "isReply": true,
      "collectedAt": "2026-04-07T12:00:05Z"
    }
  ]
}
```

**Retention**: last 30 days. Items pruned automatically on each write.
**Sort**: `publishedAt` DESC (newest first).

### `data/health.json`

Committed alongside `feed.json`. Surfaces credential health to skills and newsletter generator.

```json
{
  "lastRun": "2026-04-07T12:00:00Z",
  "durationMs": 45320,
  "newItemCount": 3,
  "tier1Failures": 0,
  "tier2Failures": 0,
  "allTierFailures": [],
  "credentialWarning": false,
  "accounts": [
    {
      "account": "bcherny",
      "consecutiveTier1Failures": 0,
      "lastSuccessfulTier": 1,
      "lastChecked": "2026-04-07T12:00:00Z"
    }
  ]
}
```

---

## Component 6: `newsletters/` Directory

Auto-generated markdown files. One file per calendar day. Appended if multiple runs occur on same day.

### Naming

`newsletters/YYYY-MM-DD.md`

### Example: `newsletters/2026-04-07.md`

```markdown
# updagent Newsletter — 2026-04-07

> Auto-generated · 3 new signals · [Full feed](../data/feed.json)

## Claude Code

### 🚀 Releases

- **v1.9.4** (2h ago) — Fix statusline rendering on Windows; add --no-permission-prompts  
  [Release notes →](https://github.com/anthropics/claude-code/releases/tag/v1.9.4)

### 📡 Team Signals

- **@bcherny** (4h ago): "This was fixed in yesterday's release. `claude update` to make sure you're on the latest"  
  [View →](https://x.com/bcherny/status/...)

- **@felixrieseberg** (6h ago): "Windows coming soon. No announcement/eta yet."  
  [View →](https://x.com/felixrieseberg/status/...)

## Codex CLI

_No new signals this period._

---

_Collected at 12:00 UTC. Next run: 18:00 UTC._
```

---

## Environment Variables Reference

| Variable                   | Component          | Purpose                                      | v1 Required?         |
| -------------------------- | ------------------ | -------------------------------------------- | -------------------- |
| `AUTH_TOKEN`               | collector          | X bird-search Tier 1 session token           | ✅ Yes               |
| `CT0`                      | collector          | X bird-search Tier 1 CSRF token              | ✅ Yes               |
| `OPENROUTER_API_KEY`       | collector          | LLM signal classification (centralized mode) | ✅ Yes (centralized) |
| `SIGNAL_DETECTION_MODE`    | collector + skills | `centralized` (default) or `distributed`     | Optional             |
| `GH_TOKEN`                 | collector          | GitHub API rate limiting avoidance           | Recommended          |
| `SCRAPECREATORS_API_KEY`   | collector          | X Tier 2 fallback                            | Optional             |
| `XAI_API_KEY`              | collector          | X Tier 3 fallback                            | Optional             |
| `GITHUB_WEBHOOK_SECRET`    | future web         | Release webhook verification                 | Deferred             |
| `UPSTASH_REDIS_REST_URL`   | future web         | Hot cache for web app                        | Deferred             |
| `UPSTASH_REDIS_REST_TOKEN` | future web         | Redis auth                                   | Deferred             |

---

## Inter-Component Dependencies

```
packages/shared
    └── packages/collector (imports types + registry)
    └── packages/skills (references types for display logic)

packages/collector
    └── data/feed.json (writes)
    └── data/health.json (writes)
    └── newsletters/ (writes)

.github/workflows/collect.yml
    └── packages/collector (runs npm run collect)
    └── data/ (commits changes)
    └── newsletters/ (commits changes)

packages/skills
    └── data/feed.json (reads for offline fallback)
    └── /api/feed endpoint (primary network source, future)
```

---

## Cost Summary

| Component                            | Monthly cost                                 |
| ------------------------------------ | -------------------------------------------- |
| GitHub Actions (public repo)         | Free (2000 min/month; ~120 min used)         |
| X collection Tier 1 (bird-search)    | Free (session cookies)                       |
| X collection Tier 2 (ScrapeCreators) | Paid only on Tier 1 failure — typically $0   |
| X collection Tier 3 (xAI Grok)       | Paid only on Tier 1+2 failure — typically $0 |
| OpenRouter (Gemini Flash free tier)  | **$0.00** while within free quota            |
| OpenRouter (Claude Haiku fallback)   | ~$0.21/month worst case                      |
| GitHub storage                       | Free                                         |
| Upstash Redis                        | Deferred (free tier when added)              |
| **Total**                            | **$0.00 – $0.21/month**                      |
