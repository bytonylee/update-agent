# updagent — Task Specification

**Version**: 1.0  
**Date**: 2026-04-07  
**Status**: Ready for implementation

---

## How to read this document

Each task has:

- **ID**: `T-XX` — reference in commits and PRs
- **Depends on**: tasks that must be complete first
- **Files**: exact paths to create or modify
- **Acceptance criteria**: specific, testable conditions
- **Estimated complexity**: S / M / L

Tasks are ordered for sequential execution but independent tasks within a step may be parallelized.

---

## T-01 — Monorepo Root Setup

**Depends on**: nothing  
**Complexity**: S

### What

Initialize the npm workspace root with TypeScript config. No code yet — just project scaffolding.

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
    "build": "npm run build --workspaces --if-present"
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

**`/.gitignore`** (add if not present, or append)

```
node_modules/
dist/
*.js.map
.env
.env.local
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
  "lastRun": "",
  "durationMs": 0,
  "newItemCount": 0,
  "tier1Failures": 0,
  "tier2Failures": 0,
  "allTierFailures": [],
  "credentialWarning": false,
  "accounts": []
}
```

**`/newsletters/.gitkeep`** (empty file to track directory)

### Acceptance criteria

- `npm install` succeeds from repo root
- `node --version` confirms Node 20+
- `npx tsc --version` confirms TypeScript available
- `data/feed.json` and `data/health.json` exist and are valid JSON
- `newsletters/` directory exists

---

## T-02 — `packages/shared`: Types and Agent Registry

**Depends on**: T-01  
**Complexity**: M

### What

Create the shared package with all TypeScript types and the config-driven agent registry.

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
Full content as specified in `COMPONENTS.md` — all interfaces: `FeedItem`, `RawXPost`, `RawGitHubRelease`, `AgentConfig`, `TierHealth`, `CollectionHealth`, `ClassificationInput`, `ClassificationResult`, `SignalClassification`, `SourceType`.

**`/packages/shared/src/agents-config.json`**  
Full content as specified in `COMPONENTS.md` — all 6 agents (claude-code, codex enabled; gemini-cli, opencode, openclaw, hermes-agent disabled).

**`/packages/shared/src/registry.ts`**  
`getEnabledAgents()`, `getAllAgents()`, `getAgentById()` — content as specified in `COMPONENTS.md`.

**`/packages/shared/src/index.ts`**

```typescript
export * from "./types.js";
export * from "./registry.js";
```

### Acceptance criteria

- `npm run build --workspace=packages/shared` succeeds with no TypeScript errors
- `import { getEnabledAgents } from "@updagent/shared"` resolves correctly from collector package
- `getEnabledAgents()` returns exactly 2 agents (claude-code, codex)
- `getAllAgents()` returns exactly 6 agents
- `getAgentById("claude-code")` returns the claude-code config with 7 X accounts
- `getAgentById("codex")` returns codex config with 5 X accounts
- Adding a new agent to `agents-config.json` and setting `enabled: true` makes it appear in `getEnabledAgents()` — no code change needed

---

## T-03 — `packages/collector`: Project Scaffolding

**Depends on**: T-02  
**Complexity**: S

### What

Set up the collector package structure, dependencies, and vitest config. No logic yet.

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
    "test:watch": "vitest"
  },
  "dependencies": {
    "@updagent/shared": "*"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^6.0.0",
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0"
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
      reporter: ["text", "json"],
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**", "src/collect.ts"],
    },
  },
});
```

**Stub files** (empty implementations, filled in subsequent tasks):

- `src/sources/x-bird.ts`
- `src/sources/x-scrapecreators.ts`
- `src/sources/x-xai.ts`
- `src/sources/x-cascade.ts`
- `src/sources/github-releases.ts`
- `src/normalize.ts`
- `src/dedup.ts`
- `src/signal/rules.ts`
- `src/signal/prompts.ts`
- `src/signal/classifier.ts`
- `src/storage.ts`
- `src/newsletter.ts`
- `src/collect.ts`

### Acceptance criteria

- `npm install` from root resolves `@updagent/shared` workspace reference
- `npm test --workspace=packages/collector` runs (0 tests, 0 failures — stubs have no tests yet)
- All stub files exist (can be empty `export {}`)

---

## T-04 — Signal Detection: Test Fixtures and Fast-Path Rules

**Depends on**: T-03  
**Complexity**: M

### What

Write the signal detection test fixtures and the keyword fast-path (rules.ts) **before** implementing the LLM classifier. Tests drive the implementation.

### Files to create/fill

**`/packages/collector/src/__tests__/signal-fixtures.ts`**  
≥25 labeled fixtures as specified in `COMPONENTS.md`. Must include:

- At least 5 high-signal replies from tracked accounts (must be SIGNAL, not NOISE)
- At least 3 NOISE examples (social filler, short text)
- At least 2 CONTEXT examples (industry commentary)
- At least 2 GitHub release examples (always SIGNAL)
- At least 3 examples with semver in text (always SIGNAL)

**`/packages/collector/src/signal/rules.ts`**  
Full fast-path implementation as specified in `COMPONENTS.md`. All 9 rules in order.

**`/packages/collector/src/__tests__/rules.test.ts`**  
Unit tests for all 9 rules. Key test cases:

```typescript
describe("fast-path rules", () => {
  it("GitHub releases are always SIGNAL", ...)
  it("posts with semver are SIGNAL", ...)
  it("replies from tracked accounts are CANDIDATE not NOISE", ...)  // critical
  it("replies from non-tracked accounts are NOISE", ...)
  it("short text is NOISE", ...)
  it("social filler is NOISE", ...)
  it("keyword match without release action is CANDIDATE", ...)
  it("unknown posts default to CANDIDATE", ...)
  // Run all fast-path deterministic fixtures
  fixtures.filter(f => f.passedBy === "fast-path").forEach(f => {
    it(`fixture: "${f.text.slice(0,40)}..."`, ...)
  })
})
```

### Acceptance criteria

- `npm test --workspace=packages/collector` passes with 0 failures
- All fast-path fixtures achieve expected classification
- Reply-from-tracked-account test explicitly asserts `result === "CANDIDATE"` (not NOISE)
- Tests run in < 2 seconds (no network calls)
- No `any` types in rules.ts

---

## T-05 — Signal Detection: LLM Classifier

**Depends on**: T-04  
**Complexity**: M

### What

Implement the LLM classifier (Pass 2) using OpenRouter for centralized mode and local agent CLI for distributed mode.

### Files to fill

**`/packages/collector/src/signal/prompts.ts`**  
`buildClassificationPrompt(posts: ClassificationInput[]): string` — batched prompt as specified in `COMPONENTS.md`.

**`/packages/collector/src/signal/classifier.ts`**  
Full implementation with both modes:

- Centralized: OpenRouter API (Gemini Flash free tier → Claude Haiku fallback)
- Distributed: spawn `claude -p` or `codex` CLI subprocess
- API-down fallback: return CONTEXT for all inputs
- Parse response JSON array
- `classifyBatch(inputs, mode): Promise<ClassificationResult[]>`

**`/packages/collector/src/__tests__/classifier.test.ts`**  
Tests using recorded (snapshot) API responses — no live network calls:

```typescript
describe("classifier", () => {
  it("classifies batch via mock OpenRouter response", ...)
  it("falls back to CONTEXT when API is unavailable", ...)
  it("handles malformed LLM response gracefully", ...)
  it("combines fast-path + LLM to classify all fixtures", ...) // accuracy gate
})

it("fixture accuracy >= 80%", () => {
  // Run all 25+ fixtures through full 2-pass pipeline (mocked LLM)
  const results = runClassifier(fixtures, mockedLLMResponses);
  const correct = results.filter((r, i) => r.classification === fixtures[i].expected);
  expect(correct.length / fixtures.length).toBeGreaterThanOrEqual(0.8);
});
```

### Acceptance criteria

- `npm test` passes with 0 failures
- Fixture accuracy test passes (≥80% of fixtures correctly classified)
- API-down fallback test: when OpenRouter returns 500, all outputs are `CONTEXT` (not undefined, not NOISE)
- No live API calls in tests (all mocked via `vi.mock`)
- `OPENROUTER_API_KEY` not required to run tests

---

## T-06 — X.com Collection: 3-Tier Cascade

**Depends on**: T-03  
**Complexity**: L

### What

Implement the three X.com collection tiers and the cascade orchestrator, following the last30days bird-search pattern exactly.

### Files to fill

**`/packages/collector/src/sources/x-bird.ts`**

- Spawn `node bird-search.mjs "from:<handle>" --since <N>h --count <N> --json`
- Parse JSON stdout → `RawXPost[]` with `tier: 1`
- Throw typed errors: `BirdSearchAuthError`, `BirdSearchParseError`
- Requires `AUTH_TOKEN` and `CT0` env vars (read at call time, not module load)

**`/packages/collector/src/sources/x-scrapecreators.ts`**

- `GET https://api.scrapecreators.com/v1/twitter/user/tweets`
- Filter to `sinceHours` window client-side
- Normalize to `RawXPost[]` with `tier: 2`
- Handle 401/403 (invalid key) vs 429 (rate limited) differently in error messages

**`/packages/collector/src/sources/x-xai.ts`**

- xAI Responses API with `x_search` tool
- Query: `"from:${handle} since:${sinceHoursAgo}"`
- Best-effort: mark posts with note about xAI mediation
- Normalize to `RawXPost[]` with `tier: 3`

**`/packages/collector/src/sources/x-cascade.ts`**

- `fetchXPostsForAccount(handle, sinceHours, rateLimitDelayMs): Promise<CascadeResult>`
- Flow: Tier 1 → on auth error: Tier 2 → on failure: Tier 3 → on failure: `{ tierUsed: null }`
- Empty result from Tier 1 (account quiet) ≠ failure — do NOT fall to Tier 2
- Log each tier attempt and outcome at `console.log` level

**`/packages/collector/src/__tests__/cascade.test.ts`**
All scenarios mocked (no live X.com calls):

```typescript
it("returns tier 1 results when tier 1 succeeds", ...)
it("falls to tier 2 when tier 1 throws BirdSearchAuthError", ...)
it("falls to tier 3 when tier 1 and tier 2 both fail", ...)
it("returns empty with tierUsed=null when all tiers fail", ...)
it("does NOT fall to tier 2 when tier 1 returns empty (account quiet)", ...)
it("records all failure details in CascadeResult.failures", ...)
```

### Acceptance criteria

- All cascade tests pass
- `fetchXPostsForAccount` never throws — always returns `CascadeResult`
- `BirdSearchAuthError` is specifically named and exported (for health tracking to distinguish auth failures from other failures)
- Rate limit delay is applied between sequential account calls (tested with fake timers)
- `AUTH_TOKEN` and `CT0` absence does not crash module import — only throws at call time

---

## T-07 — GitHub Release Collection

**Depends on**: T-03  
**Complexity**: S

### What

Implement GitHub REST API v3 release fetching for all configured repos.

### Files to fill

**`/packages/collector/src/sources/github-releases.ts`**

```typescript
export async function fetchGitHubReleases(
  owner: string,
  repo: string,
  perPage?: number,
): Promise<RawGitHubRelease[]>;
```

- `GET https://api.github.com/repos/${owner}/${repo}/releases?per_page=${perPage ?? 5}`
- Auth: add `Authorization: Bearer ${GH_TOKEN}` header if `GH_TOKEN` env var is set
- 404 → return `[]` (repo not found or no releases — not an error)
- 403 → throw `GitHubRateLimitError` with message suggesting `GH_TOKEN`
- Parse response array → `RawGitHubRelease[]`

### Acceptance criteria

- Returns `RawGitHubRelease[]` for a valid owner/repo
- Returns `[]` for a non-existent repo (404)
- Throws `GitHubRateLimitError` on 403 with actionable message
- Works without `GH_TOKEN` (public repos only)
- Unit test with mocked `fetch` covers: success, 404, 403, empty releases list

---

## T-08 — Normalization and Deduplication

**Depends on**: T-02, T-06, T-07  
**Complexity**: M

### What

Implement normalization (raw → FeedItem) and deduplication logic.

### Files to fill

**`/packages/collector/src/normalize.ts`**

`normalizeXPost(raw: RawXPost, agentId: string, classification: ClassificationResult): FeedItem`

- `id`: full tweet URL
- `isRelease`: true if text matches semver OR contains "release" + version keywords
- `version`: extract first semver match from text (`v?\d+\.\d+(\.\d+)?`)
- `engagementScore`: `likes * 1 + retweets * 3`
- `collectedAt`: `new Date().toISOString()`

`normalizeGitHubRelease(raw: RawGitHubRelease, agentId: string): FeedItem`

- `id`: `${owner}/${repo}@${tagName}`
- `classification`: always `"SIGNAL"`
- `classificationReason`: `"GitHub official release"`
- `isRelease`: always `true`
- `version`: `tagName` stripped of leading `v`
- `engagementScore`: 0

**`/packages/collector/src/dedup.ts`**

`dedup(newItems: FeedItem[], existingItems: FeedItem[]): FeedItem[]`

- Key: `FeedItem.id`
- Returns only items whose ID is not in existing set
- Preserves order of `newItems`

### Acceptance criteria

- `normalizeXPost` produces valid `FeedItem` with all required fields
- `normalizeGitHubRelease` always produces `classification: "SIGNAL"`
- Version extraction works: `"claude update v1.9.4 ships"` → `version: "1.9.4"`
- `dedup` with identical items returns `[]`
- `dedup` with all-new items returns all items
- No `any` types

---

## T-09 — Storage Layer

**Depends on**: T-02, T-08  
**Complexity**: M

### What

Implement read/write for `feed.json`, `health.json`, and optional Redis.

### Files to fill

**`/packages/collector/src/storage.ts`**

Functions:

- `readFeedJson(path: string): Promise<FeedItem[]>` — returns `[]` if file doesn't exist
- `writeFeedJson(path: string, items: FeedItem[]): Promise<void>` — writes JSON with metadata header, sorts by `publishedAt` DESC, prunes items older than 30 days
- `readHealthJson(path: string): Promise<CollectionHealth | null>`
- `writeHealthJson(path: string, health: CollectionHealth): Promise<void>`
- `isRedisConfigured(): boolean` — returns true if `UPSTASH_REDIS_REST_URL` is set
- `writeToRedis(items: FeedItem[]): Promise<void>` — no-op if Redis not configured; uses `@upstash/redis` client if available

**Feed.json write rules**:

- Sort items by `publishedAt` DESC before writing
- Prune items where `publishedAt` is older than 30 days from current date
- Update `updatedAt` and `itemCount` metadata on every write

### Acceptance criteria

- `readFeedJson` on non-existent file returns `[]` (does not throw)
- `writeFeedJson` → `readFeedJson` round-trip preserves all fields
- After writing 50 items with various dates, items older than 30 days are absent
- `writeToRedis` does not throw when `UPSTASH_REDIS_REST_URL` is unset
- Unit tests cover: read missing file, write+read roundtrip, date pruning, Redis skip

---

## T-10 — Newsletter Generator

**Depends on**: T-02, T-08  
**Complexity**: M

### What

Implement the markdown newsletter generator and the logic to determine when to generate.

### Files to fill

**`/packages/collector/src/newsletter.ts`**

```typescript
export function generateNewsletter(items: FeedItem[], date: string): string;
export function shouldGenerateNewsletter(
  newItems: FeedItem[],
  newslettersDir: string,
): boolean;
export async function appendToNewsletter(
  items: FeedItem[],
  newslettersDir: string,
  date: string,
): Promise<string>; // returns path written to
```

**`generateNewsletter` rules**:

- Include only `classification === "SIGNAL"` items
- Group by `agentId`, then by `source` (releases first, then X signals)
- Sort within groups by `publishedAt` DESC
- Agents with no new signals get `*No new signals this period.*`
- Include health warning if any items in collection had credential issues
- Footer: collection timestamp + next run time

**`shouldGenerateNewsletter` rules**:

- Returns `true` if `newItems` contains at least 1 SIGNAL item
- Returns `false` if no new SIGNAL items

**`appendToNewsletter` rules**:

- If `newsletters/YYYY-MM-DD.md` already exists: append a `---` separator + new content
- If not: create new file

### Acceptance criteria

- Newsletter markdown is valid (renders on GitHub)
- NOISE and CONTEXT items are absent from newsletter
- GitHub releases appear before X posts within each agent section
- `shouldGenerateNewsletter` returns false when only NOISE items exist
- Appending to existing file preserves prior content
- Unit test with fixture data verifies output markdown contains expected handles and versions

---

## T-11 — Main Orchestrator (`collect.ts`)

**Depends on**: T-04, T-05, T-06, T-07, T-08, T-09, T-10  
**Complexity**: L

### What

Wire all sub-components into the main `collect.ts` entry point. This is what GitHub Actions runs.

### Files to fill

**`/packages/collector/src/collect.ts`**

Full implementation of the orchestrator flow specified in `COMPONENTS.md` Sub-component 2h.

Key requirements:

- `process.exit(0)` always — never exit 1 on partial failures
- Structured logging: `console.log("[updagent] ...")` prefix for all log lines
- Environment check at startup: warn (not throw) on missing optional vars; throw on missing required vars (`AUTH_TOKEN`, `CT0`, `OPENROUTER_API_KEY` when `SIGNAL_DETECTION_MODE=centralized`)
- Sequential processing per agent (not parallel) to respect rate limits
- 2-second delay between X account queries within an agent
- Health tracking: update `ConsecutiveTier1Failures` per account across runs (read from existing `health.json`, update, write back)

**`/packages/collector/src/__tests__/collect.integration.test.ts`**

```typescript
describe("collect orchestrator", () => {
  it("completes with exit 0 when all tiers succeed", ...)
  it("completes with exit 0 when all X tiers fail (GitHub releases still collected)", ...)
  it("does not duplicate items when run twice with same data", ...)
  it("writes feed.json with correct schema after run", ...)
  it("writes health.json after run", ...)
  it("increments consecutiveTier1Failures in health.json on repeated auth failures", ...)
  it("sets credentialWarning=true when consecutiveTier1Failures >= 3", ...)
  it("generates newsletter when new SIGNAL items found", ...)
  it("skips newsletter when only NOISE items found", ...)
})
```

### Acceptance criteria

- `npm run collect` succeeds end-to-end in a dry-run mode (with all external calls mocked)
- `data/feed.json` is written with correct schema
- `data/health.json` is written
- NOISE items are absent from `feed.json`
- Process always exits 0
- All integration tests pass

---

## T-12 — GitHub Actions Workflow

**Depends on**: T-11  
**Complexity**: S

### What

Create the GitHub Actions workflow file for 6-hour automated collection.

### Files to create

**`/.github/workflows/collect.yml`**  
Full content as specified in `COMPONENTS.md` Component 4.

Key points:

- `cron: "0 */6 * * *"` — 00:00, 06:00, 12:00, 18:00 UTC
- `permissions: contents: write`
- `timeout-minutes: 10`
- Content-hash commit guard: `git diff --staged --quiet || git commit`
- `[skip ci]` in commit message to prevent recursive triggers
- All 8 secret references (required + optional)

### Acceptance criteria

- Workflow YAML is valid (passes `actionlint` if available)
- `cron` expression evaluates to 4 runs/day
- All environment variables referenced in workflow match names in `COMPONENTS.md` environment variables table
- `git diff --staged --quiet || git commit` pattern prevents empty commits
- Manual trigger (`workflow_dispatch`) is present

---

## T-13 — CLI Skills

**Depends on**: T-09 (feed.json schema must be stable)  
**Complexity**: M

### What

Write the CLI skill markdown files for Claude Code and Codex.

### Files to create

**`/packages/skills/claude-code/updagent.md`**  
Full content as specified in `COMPONENTS.md` Component 3. Must include:

- YAML frontmatter: `name`, `description`, `triggers[]`
- Usage section with all subcommands (`--educate`, `codex`, `claude-code`, `releases`, `--since`)
- Data source priority (network first, `data/feed.json` fallback)
- Alarming mode display format (compact, SIGNAL only)
- Educating mode display format (SIGNAL + CONTEXT, grouped)
- Health warning display (when `data/health.json` shows `credentialWarning: true`)
- Distributed mode section (when `SIGNAL_DETECTION_MODE=distributed`)

**`/packages/skills/codex/updagent.md`**  
Same structure as Claude Code skill with:

- `codex` CLI invocation instead of `claude -p`
- Same API endpoint, same fallback path

**`/packages/skills/install.sh`**  
One-line installer script:

```bash
#!/bin/bash
set -e
mkdir -p ~/.claude/skills ~/.codex/agents
cp "$(dirname "$0")/claude-code/updagent.md" ~/.claude/skills/updagent.md
cp "$(dirname "$0")/codex/updagent.md" ~/.codex/agents/updagent.md
echo "updagent skills installed."
echo "  Claude Code: /updagent"
echo "  Codex:       /updagent"
```

### Acceptance criteria

- YAML frontmatter in both skills is valid (parseable by `js-yaml`)
- Both skills reference the correct install paths
- `install.sh` is executable (`chmod +x`)
- Alarming mode format matches the mockup in `COMPONENTS.md`
- Educating mode format matches the mockup in `COMPONENTS.md`
- Both skills document the offline fallback (`data/feed.json` path)

---

## T-14 — Integration Smoke Test

**Depends on**: T-11, T-12, T-13  
**Complexity**: S

### What

Verify the full system works end-to-end in a controlled environment before first real run.

### Steps

1. Set env vars locally: `AUTH_TOKEN`, `CT0`, `GH_TOKEN` (minimum set, no OpenRouter yet)
2. Set `SIGNAL_DETECTION_MODE=distributed` to use local `claude` for classification
3. Run `npm run collect` from repo root
4. Verify `data/feed.json` contains items from `anthropics/claude-code` and `openai/codex` releases
5. Verify `data/health.json` exists and `lastRun` is populated
6. Verify at least 1 newsletter file in `newsletters/` (if any SIGNAL items found)
7. Run `npm test` — all tests pass

### Acceptance criteria

- `npm run collect` exits 0
- `data/feed.json` is non-empty (GitHub releases collected at minimum)
- `data/health.json` has accurate `lastRun` timestamp
- No TypeScript errors in `npm run build`
- `npm test` passes with 0 failures
- No `any` types in compiled output (TypeScript strict mode)

---

## T-15 — SPEC.md and README.md Update

**Depends on**: T-14  
**Complexity**: S

### What

Update the project's top-level documentation to reflect the implemented system.

### Files to modify/create

**`/README.md`** — replace stub (1 line) with:

- Project description (2-3 sentences)
- Quick start (install skills, set env vars, run)
- Tracked agents table (from `COMPONENTS.md`)
- Link to `GOAL.md`, `COMPONENTS.md`, `TASKS.md`
- Cost summary ($0.00–$0.21/month)
- Skill installation instructions

**`/SPEC.md`** — prepend deprecation notice:

```markdown
> ⚠️ This file is the original v0.1 spec and has been superseded.
> See GOAL.md, COMPONENTS.md, and TASKS.md for the current implementation spec.
```

### Acceptance criteria

- `README.md` has quick-start instructions a new user can follow from scratch
- `SPEC.md` has a deprecation notice pointing to the new spec files

---

## Task Dependency Graph

```
T-01 (root scaffolding)
  └── T-02 (shared package)
        └── T-03 (collector scaffolding)
              ├── T-04 (signal fixtures + rules)      ← tests drive implementation
              │     └── T-05 (LLM classifier)
              ├── T-06 (X cascade)
              ├── T-07 (GitHub releases)
              ├── T-08 (normalization + dedup)        ← depends on T-02, T-06, T-07
              ├── T-09 (storage)                      ← depends on T-02, T-08
              ├── T-10 (newsletter)                   ← depends on T-02, T-08
              └── T-11 (orchestrator)                 ← depends on T-04..T-10 all
                    ├── T-12 (GH Actions workflow)
                    ├── T-13 (CLI skills)
                    └── T-14 (smoke test)
                          └── T-15 (docs update)
```

## Parallelizable groups

After T-03 is complete, these tasks can run in parallel:

- **Group A**: T-04 → T-05 (signal detection)
- **Group B**: T-06 (X cascade)
- **Group C**: T-07 (GitHub releases)

After Group A, B, C complete:

- **Group D**: T-08 (normalization) can start
- T-09 and T-10 can start after T-08

---

## Definition of Done

A task is complete when:

1. All files listed in the task exist with non-stub content
2. All acceptance criteria pass
3. `npm test` passes with 0 failures across all packages
4. No TypeScript errors (`npm run build` succeeds)
5. No `any` types introduced
6. No hardcoded agent names, account handles, or keyword lists in source code (all via config)
