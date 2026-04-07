# updagent — Goal Specification

**Version**: 2.0  
**Date**: 2026-04-07  
**Status**: Approved (supersedes v1.0)

---

## 1. Vision

updagent is a **terminal-first alarming and educating system** that keeps developers using AI coding agents — Codex CLI, Claude Code, and others — automatically informed of product updates, releases, bug fixes, and breaking changes. It collects raw signals from X.com team accounts and GitHub release notes, filters noise using a 2-pass signal detection pipeline, and delivers a high-precision feed to the developer's terminal and to a Markdown newsletter committed to this repository.

The system operates at two levels:

- **Alarming (default)**: interrupt-driven, compact, "did anything break or ship since I last checked?"
- **Educating**: deep-dive, contextual, "give me the full picture of what changed and why it matters"

The core insight is that AI coding agent teams post first-hand product signals on X.com — in replies to user bug reports, in casual announcements, in technical threads — before any official documentation exists. GitHub releases are the authoritative record, but they come later. Combining both sources, filtered aggressively, produces a feed that no single source can match.

---

## 2. Problem Statement

### 2a. The information gap

When Codex CLI or Claude Code ships an update, a developer using that tool needs to know:

1. Is there a new version? (`claude update` / `codex update`)
2. Does anything I depend on change behavior?
3. Was a bug I hit fixed?
4. Are there new features I should adopt?

Today, a developer must manually:

- Check X.com timelines for 5–12 team accounts
- Check GitHub releases pages for 2+ repos
- Filter out noise (personal posts, company news, audience replies)
- Synthesize what's relevant to their workflow

This takes 10–20 minutes and is often skipped, leading to: using outdated versions, hitting known bugs that were already fixed, missing features that would improve workflow.

### 2b. The noise problem on X.com

X.com accounts tracked by updagent belong to real people. The same account that posts a Claude Code release announcement also posts personal opinions, replies to audience jokes, discusses unrelated company news, and shares life updates.

**Signal distribution estimate** (based on analysis of `last30days-skill_example.md` data):

| Post type                                       | % of posts | Should surface?             |
| ----------------------------------------------- | ---------- | --------------------------- |
| Product update (release, fix, feature, roadmap) | ~15%       | ✅ SIGNAL                   |
| Industry context (comparisons, analysis)        | ~20%       | ⚠️ CONTEXT (educating only) |
| Personal / social / audience chat               | ~65%       | ❌ NOISE                    |

Without signal detection, the feed has 65% noise. With it, the alarming mode shows only the 15% that matters. This filtering is the entire value proposition.

**Critical edge case — high-signal replies**: The most valuable posts from tool leads are often replies. Example from real data:

```
@bcherny (reply to user bug report):
"This was fixed in yesterday's release. `claude update` to make sure you're on the latest"
→ 77 likes, 12 RTs — clearly SIGNAL
```

A naive "filter out replies" rule would discard exactly this. The signal detection pipeline must handle replies from tracked accounts with special care (see COMPONENTS.md §Signal Detection).

### 2c. The multi-agent fragmentation problem

The AI coding agent ecosystem is expanding rapidly:

- **Now**: Codex CLI, Claude Code
- **Near future**: gemini-cli, opencode
- **Later**: Openclaw, Hermes-agent, and others not yet named

Each agent has its own GitHub repo, its own team accounts, its own release cadence. Tracking all of them manually — or building a separate system per agent — is unsustainable. updagent must be configured, not coded, to add a new agent.

### 2d. The credential fragility problem

X.com access is the most fragile dependency in the system:

- `AUTH_TOKEN` + `CT0` are browser session cookies, not OAuth tokens
- They expire unpredictably (days to weeks)
- They cannot be refreshed programmatically without a browser
- When they expire, X collection silently returns 0 results

The system must detect credential degradation early (via `health.json`) and surface warnings to the operator before the feed goes stale.

---

## 3. Target Users

### 3a. Primary user: daily AI coding agent developer

**Profile**:

- Uses Codex CLI or Claude Code as primary development tool, multiple hours per day
- Works in the terminal — not a web app user by default
- Relies on the tool behaving consistently; surprised by breaking changes
- Does not follow X.com actively; would not notice a team post without a system alerting them
- Wants to stay on the latest version but only knows to update when something breaks

**Pain**: Hit a bug, search for it, find that @bcherny tweeted a fix 3 days ago. If only they'd known sooner.

**Goal**: "Alert me when my tool ships something important."

### 3b. Secondary user: AI tooling maintainer / enthusiast

**Profile**:

- Builds tooling on top of Codex CLI or Claude Code (extensions, wrappers, integrations)
- Needs to track breaking changes and new APIs across multiple agents
- Follows multiple X.com accounts manually today
- Wants to reduce that to a single command

**Goal**: "Give me the full picture of the AI coding agent space so I can maintain my integrations."

### 3c. Deployment modes

| Mode                      | Who runs it                   | Infrastructure                       | Signal detection                                       |
| ------------------------- | ----------------------------- | ------------------------------------ | ------------------------------------------------------ |
| **Centralized** (default) | Team, org, or shared instance | GitHub Actions cron + OpenRouter API | OpenRouter (Gemini Flash free / Claude Haiku fallback) |
| **Distributed**           | Individual developer          | Local skill only                     | User's own `claude -p` or `codex` CLI                  |

---

## 4. Tracked Agents

### 4a. Tier 1 — Fully supported at launch

#### Codex CLI

| Field           | Value                                                         |
| --------------- | ------------------------------------------------------------- |
| Agent ID        | `codex`                                                       |
| GitHub repo     | `openai/codex`                                                |
| Release webhook | poll-only (hourly cron)                                       |
| X accounts (5)  | @openaidevs, @thsottiaux, @romainhuet, @reach_vb, @rohanvarma |
| Signal keywords | codex, codex cli, openai codex, codex update                  |

#### Claude Code

| Field           | Value                                                                                  |
| --------------- | -------------------------------------------------------------------------------------- |
| Agent ID        | `claude-code`                                                                          |
| GitHub repo     | `anthropics/claude-code`                                                               |
| Release webhook | poll-only (hourly cron)                                                                |
| X accounts (7)  | @bcherny, @trq212, @noahzweben, @felixrieseberg, @lydiahallie, @amorriscode, @claudeai |
| Signal keywords | claude code, claude update, anthropic cli, claude cli, claude --version                |

### 4b. Tier 2 — Architecturally prepared, not yet enabled

| Agent        | Agent ID       | Status           | Blocker                                    |
| ------------ | -------------- | ---------------- | ------------------------------------------ |
| Gemini CLI   | `gemini-cli`   | `enabled: false` | GitHub repo not yet stable; X accounts TBD |
| opencode     | `opencode`     | `enabled: false` | X accounts TBD                             |
| Openclaw     | `openclaw`     | `enabled: false` | GitHub repo TBD; X accounts TBD            |
| Hermes-agent | `hermes-agent` | `enabled: false` | GitHub repo TBD; X accounts TBD            |

**To activate a Tier 2 agent**: edit `packages/shared/src/agents-config.json`, set `enabled: true`, fill in `github.owner`, `github.repo`, and `xAccounts`. No code changes.

---

## 5. Data Sources

### 5a. X.com posts

**Collection method**: last30days bird-search cascade (3 tiers, headless, no browser)

- Tier 1: `bird-search` vendored Node.js client (AUTH_TOKEN + CT0 session cookies)
- Tier 2: ScrapeCreators REST API (SCRAPECREATORS_API_KEY)
- Tier 3: xAI Grok x_search tool (XAI_API_KEY)

**Query pattern**: `from:<handle> --since 6h --count 20 --json` per account per run

**Why last30days over opencli**: opencli requires Chrome + an extension running locally. The server-side cron (GitHub Actions) is headless — no browser available. last30days bird-search runs as a Node.js subprocess with env var auth. opencli is retained in the repo as a research reference but is not used in any production path.

**Noise characteristics**:

- Personal posts (weekend plans, jokes, opinions on non-product topics)
- Audience replies (replies to followers' questions unrelated to the product)
- Company news (Claude being added to a new country, OpenAI raising funding)
- Cross-product mentions (team members posting about tools other than the tracked agent)

### 5b. GitHub releases

**Collection method**: GitHub REST API v3

- `GET /repos/{owner}/{repo}/releases?per_page=5`
- Public repos: no auth required; `GH_TOKEN` recommended for rate limit headroom
- Always succeeds (no auth fragility) — the reliable backbone of the feed

**Why releases not issues/PRs**: Issues and PRs are too noisy (hundreds/day). Releases are intentional signals — the team explicitly cut a release. Release notes contain the full changelog.

---

## 6. Output Surfaces

### 6a. Terminal — Alarming Mode (default)

**Invocation**: `/updagent` inside Claude Code or Codex  
**Filter**: SIGNAL items only  
**Time window**: last 6 hours (matches collection cadence)  
**Sort**: publishedAt DESC (newest first), releases before X signals  
**Max items**: 10 (configurable)

**Display format**:

```
=== updagent: 3 new updates ===

[GH] anthropics/claude-code · v1.9.4 · 2h ago
  Fix statusline rendering on Windows; add --no-permission-prompts flag
  → https://github.com/anthropics/claude-code/releases/tag/v1.9.4

[X] @bcherny · Claude Code · 4h ago
  "This was fixed in yesterday's release. `claude update` to make sure you're on the latest"
  ♥ 77  🔁 12
  → https://x.com/bcherny/status/...

[X] @openaidevs · Codex CLI · 5h ago
  "Codex CLI 0.3 is here: parallel file editing, better error recovery"
  ♥ 234  🔁 67
  → https://x.com/openaidevs/status/...

───────────────────────────
No updates in last 6h? Run `/updagent --since 24h` to extend window.
```

**Health warning** (shown at top when `health.json.credentialWarning === true`):

```
⚠️  X data may be incomplete — Tier 1 auth degraded for: bcherny, trq212
    Check AUTH_TOKEN + CT0 in your environment / repo secrets.
```

### 6b. Terminal — Educating Mode

**Invocation**: `/updagent --educate`  
**Filter**: SIGNAL + CONTEXT items  
**Time window**: last 24 hours  
**Sort**: releases first, then X signals by agent, then CONTEXT items

**Display format**:

```
=== updagent: Claude Code — Deep Dive (last 24h) ===

## 🚀 Releases

### v1.9.4  (2h ago)
  Fix statusline rendering on Windows
  Add --no-permission-prompts flag
  → https://github.com/anthropics/claude-code/releases/tag/v1.9.4

## 📡 Team Signals

@bcherny  (4h ago, reply to @user123)
  "This was fixed in yesterday's release. `claude update` to make sure you're on the latest"
  ♥ 77  🔁 12  👁 34K
  → https://x.com/bcherny/status/...

@felixrieseberg  (8h ago)
  "Windows coming soon. No announcement/eta yet."
  ♥ 43  🔁 8
  → https://x.com/felixrieseberg/status/...

## 📰 Community Context

@amorriscode  (12h ago)
  "Claude Code vs Copilot — a detailed comparison of permission models thread..."
  ♥ 156  🔁 44
  → https://x.com/amorriscode/status/...

## 🔥 Trending (by engagement)
  1. @bcherny "This was fixed..." — score 113  (77 + 12×3)
  2. @openaidevs "Codex 0.3 is here..." — score 435  (234 + 67×3)

=== updagent: Codex CLI — Deep Dive (last 24h) ===
...
```

### 6c. Newsletter — Markdown files

**Location**: `newsletters/YYYY-MM-DD.md`  
**Trigger**: generated after any collection run that produces ≥1 new SIGNAL item  
**Cadence**: up to 4 newsletters/day (one per 6h cron window), appended to same daily file  
**Filter**: SIGNAL only (no CONTEXT, no NOISE)  
**Committed by**: GitHub Actions (alongside `data/feed.json`)

**Example: `newsletters/2026-04-07.md`**:

```markdown
# updagent Newsletter — 2026-04-07

> Auto-generated · 3 new signals · Collected at 12:00 UTC
> [Full feed](../data/feed.json) · [All newsletters](.)

## Claude Code

### 🚀 Releases

- **v1.9.4** (2h ago) — Fix statusline rendering on Windows; add --no-permission-prompts
  [Release notes →](https://github.com/anthropics/claude-code/releases/tag/v1.9.4)

### 📡 Team Signals

- **@bcherny** (4h ago): "This was fixed in yesterday's release. `claude update` to get latest"
  [View →](https://x.com/bcherny/status/...)

## Codex CLI

### 🚀 Releases

- **v0.3.0** (6h ago) — Parallel file editing, better error recovery
  [Release notes →](https://github.com/openai/codex/releases/tag/v0.3.0)

---

_Next collection: 18:00 UTC_
```

### 6d. JSON feed file (offline / programmatic)

**Location**: `data/feed.json`  
**Updated by**: GitHub Actions every 6h (when content changes)  
**Used by**: CLI skills as offline fallback  
**Retention**: last 30 days of items

---

## 7. Signal Classification

### 7a. Classification taxonomy

| Class     | Meaning                                                                                                        | Shown in alarming? | Shown in educating? | In newsletter? |
| --------- | -------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------- | -------------- |
| `SIGNAL`  | Direct product update — release, feature, bug fix, breaking change, roadmap announcement, confirmed workaround | ✅ Yes             | ✅ Yes              | ✅ Yes         |
| `CONTEXT` | Industry context — comparisons, analysis, commentary that adds understanding but isn't actionable              | ❌ No              | ✅ Yes              | ❌ No          |
| `NOISE`   | Personal, social, unrelated — jokes, reactions, audience chat, other products/companies                        | ❌ No              | ❌ No               | ❌ No          |

### 7b. Classification examples

| Post                                                                               | Classification | Reason                                             |
| ---------------------------------------------------------------------------------- | -------------- | -------------------------------------------------- |
| "@bcherny: This was fixed in yesterday's release. `claude update`"                 | SIGNAL         | Team member confirms fix, instructs action         |
| "@bcherny: Windows coming soon. No ETA."                                           | SIGNAL         | Roadmap signal from team lead                      |
| "@openaidevs: Codex CLI 0.3 — parallel file editing"                               | SIGNAL         | Official release announcement                      |
| "@felixrieseberg: Just shipped `--no-permission-prompts` 🎉"                       | SIGNAL         | Team member announces feature                      |
| "v1.9.4 release notes" (GitHub)                                                    | SIGNAL         | Always — GitHub releases are definitionally SIGNAL |
| "@amorriscode: Claude Code vs Copilot thread"                                      | CONTEXT        | Analysis, not a product update                     |
| "@bcherny: best team"                                                              | NOISE          | Social, no product content                         |
| "@noahzweben: lol" (reply to joke)                                                 | NOISE          | Social filler                                      |
| "@claudeai: Claude now supports 20 languages" (not about Claude Code specifically) | NOISE          | Different product                                  |

### 7c. Classification pipeline

**Pass 1 — keyword fast-path** (free, deterministic, ~1ms per post):

- GitHub releases → always SIGNAL
- Semver pattern in text → SIGNAL
- Reply from tracked account → CANDIDATE (never NOISE — see §2b above)
- Short text / social filler → NOISE
- Signal keywords + action words → CANDIDATE or SIGNAL

**Pass 2 — LLM classifier** (for CANDIDATE posts only):

- Centralized mode: OpenRouter API (Gemini Flash free → Claude Haiku fallback)
- Distributed mode: local `claude -p` or `codex` CLI call
- Batch up to 10 posts per LLM call (centralized only)
- API unavailable → default to CONTEXT (never discard)

---

## 8. Success Metrics

### 8a. Quality metrics

| Metric                       | Target                                                                | Measurement method                                                            |
| ---------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Signal precision             | ≥80% of SIGNAL items are true product updates                         | Manual review of 50-item sample from labeled fixture set                      |
| Signal recall                | ≥90% of true product updates classified as SIGNAL                     | Run against known release events (at least 5 confirmed releases)              |
| Alarming false positive rate | ≤10% of alarming-mode items are noise                                 | Manual audit of 20 consecutive collection runs                                |
| Reply signal recall          | 100% of "@bcherny: This was fixed..." style replies classified SIGNAL | Fixture test — zero tolerance for misclassifying high-signal replies as NOISE |

### 8b. Reliability metrics

| Metric                           | Target                                                                       | Measurement method                                                |
| -------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| GitHub release detection latency | ≤6 hours from publish                                                        | Compare release `published_at` vs first appearance in `feed.json` |
| X post detection latency         | ≤6 hours from post                                                           | Compare tweet `created_at` vs first appearance in `feed.json`     |
| Collector uptime                 | ≥95% of scheduled runs succeed                                               | GitHub Actions run history                                        |
| Silent failure detection         | Credential degradation surfaced within 3 failed runs                         | `health.json.consecutiveTier1Failures` threshold test             |
| Offline skill functionality      | 100% of `/updagent` invocations return results when `data/feed.json` present | Test with network off                                             |

### 8c. Cost metrics

| Metric                                    | Target                                                |
| ----------------------------------------- | ----------------------------------------------------- |
| Monthly infrastructure cost (centralized) | ≤$0.21/month (free models via OpenRouter)             |
| GitHub Actions minutes used               | ≤120 min/month (well within free tier 2000 min limit) |
| X API calls per day                       | ≤12 accounts × 4 runs = 48 bird-search calls/day      |

---

## 9. User Journeys

### Journey 1: Developer hits a bug, checks for fix

```
1. Developer hits statusline rendering bug on Windows while using Claude Code
2. Invokes: /updagent  (alarming mode, default)
3. updagent shows:
   [GH] anthropics/claude-code · v1.9.4 · 2h ago
     Fix statusline rendering on Windows
   [X] @bcherny · "This was fixed in yesterday's release. claude update"
4. Developer runs: claude update
5. Bug resolved. Total time: 30 seconds.
```

### Journey 2: Developer starts work, checks for overnight changes

```
1. Developer opens terminal Monday morning
2. Invokes: /updagent --since 24h
3. updagent shows nothing new (quiet weekend)
4. Developer proceeds with confidence that nothing changed
```

### Journey 3: Developer wants full context on a release

```
1. Developer sees "v1.9.4" in alarming mode output
2. Invokes: /updagent --educate
3. updagent shows:
   - Release notes
   - Team Signal: @bcherny confirming the fix
   - Team Signal: @felixrieseberg hinting at Windows roadmap
   - Context: @amorriscode comparing to Copilot
   - Trending: which posts got most engagement
4. Developer has complete picture in 60 seconds
```

### Journey 4: Credential expiry detected

```
1. GitHub Actions cron runs at 06:00 UTC
2. AUTH_TOKEN has expired — bird-search returns auth error
3. Tier 2 (ScrapeCreators) used as fallback — partial data collected
4. health.json updated: consecutiveTier1Failures: 1
5. At 12:00 UTC: same failure. consecutiveTier1Failures: 2
6. At 18:00 UTC: same failure. consecutiveTier1Failures: 3 → credentialWarning: true
7. Next newsletter includes: "⚠️ X data may be incomplete — Tier 1 credentials degraded"
8. Developer sees warning in /updagent output
9. Developer refreshes AUTH_TOKEN + CT0 from browser cookies
10. Problem resolved before feed goes more than 24h stale
```

### Journey 5: New agent added (gemini-cli ships)

```
1. Google announces gemini-cli stable release
2. User edits packages/shared/src/agents-config.json:
   - Sets enabled: true for "gemini-cli"
   - Fills in github.owner: "google", github.repo: "gemini-cli"
   - Fills in xAccounts: ["googledevelopers", "..."]
   - Fills in signalKeywords: ["gemini cli", "gemini code"]
3. No code changes anywhere
4. Next cron run: gemini-cli releases + X posts appear in feed
5. /updagent now shows all three agents
```

---

## 10. Non-Goals (v1)

| Non-goal                                             | Rationale                                                                  | Deferred to |
| ---------------------------------------------------- | -------------------------------------------------------------------------- | ----------- |
| Web dashboard / website                              | Adds Next.js + hosting complexity; skills + newsletter cover v1 needs      | v2          |
| Push notifications (email, Slack, Discord, Telegram) | Out of scope; can be added via `oh-my-claudecode:configure-notifications`  | v2          |
| Real-time streaming (WebSocket feed)                 | Not needed at 6h collection cadence                                        | v2          |
| Sentiment analysis or opinion scoring                | Requires training data; signal detection is sufficient                     | Future      |
| Full-text search of historical feed                  | GitHub raw URL access covers the offline use case                          | Future      |
| Authentication on API endpoint                       | Feed is public information; no sensitive data                              | v2          |
| Automated X.com cookie rotation                      | Requires browser automation (opencli); health.json covers manual detection | Future      |
| User accounts or personalization                     | Single-tenant by design; no user model needed                              | Future      |
| Mobile app                                           | Terminal-first product; mobile adds no value                               | Never       |
| Tracking GitHub Issues or PRs                        | Too high volume; only releases are the right signal level                  | Never       |
| Tracking Discord / Slack channels                    | Auth complexity; most signals appear on X first anyway                     | Future      |
| Collecting media (images, videos) from X posts       | Text is sufficient for product signal detection                            | Future      |

---

## 11. Technical Constraints

### 11a. Hard constraints (cannot be violated)

1. **No browser dependency in any production path** — entire collection pipeline runs headless. opencli (Chrome CDP) is retained as a repo reference only.
2. **No always-on server** — GitHub Actions (cron) runs 4×/day, sleeps in between. No EC2, no VPS, no container.
3. **Offline-capable skills** — `/updagent` must return results when network is unavailable, using `data/feed.json` as fallback.
4. **Agent-agnostic** — adding a new agent requires editing `agents-config.json` only. Zero code changes.
5. **Never crash on partial failure** — collector always exits 0. Partial data > no data.
6. **No hardcoded agent names/accounts/keywords in source code** — all in `agents-config.json`.

### 11b. Soft constraints (strong preferences)

1. **Free or near-free** — target $0.00–$0.21/month total infrastructure cost.
2. **TypeScript strict mode** — no `any` types, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
3. **Tests before implementation** — signal detection fixtures and rules tests (T-04) written before LLM classifier (T-05).
4. **No duplicate data** — deduplication by item ID on every write.

---

## 12. Architecture Decisions

| #    | Decision                            | Choice                                  | Rationale                                                                                                | Trade-off                                                           |
| ---- | ----------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| AD-1 | Collection model                    | Centralized                             | Shared signal detection, single rate-limit budget, config-driven multi-agent                             | Single point of failure (mitigated by 3-tier cascade)               |
| AD-2 | X.com crawl method                  | last30days bird-search cascade          | Headless, battle-tested, no browser required, same approach as documented in last30days-skill_example.md | Session cookies require manual rotation on expiry                   |
| AD-3 | Signal classification (centralized) | OpenRouter API (Gemini Flash free tier) | Near-zero cost, model-agnostic, free tier sufficient for 4 runs/day                                      | OpenRouter as external dependency                                   |
| AD-4 | Signal classification (distributed) | User's local `claude -p` or `codex` CLI | Zero extra cost, reuses existing agent, no API key needed                                                | Classification quality varies by user's model                       |
| AD-5 | Primary storage                     | `data/feed.json` committed to repo      | Zero infrastructure, offline-capable, version-controlled                                                 | 30-day retention only                                               |
| AD-6 | Hot storage                         | Upstash Redis (optional v1)             | Sub-100ms reads for future web app                                                                       | Not needed until web app ships                                      |
| AD-7 | Collection cadence                  | Every 6 hours (4×/day)                  | Balances freshness vs API cost; `--since 6h` window matches cron exactly (no gaps, no double-counts)     | 6h latency for X posts (acceptable; releases are the urgent signal) |
| AD-8 | Newsletter format                   | Markdown committed to repo              | Zero infrastructure, readable on GitHub, version-controlled history                                      | Static (no personalization)                                         |
| AD-9 | Skill format                        | `.md` files in standard skill dirs      | Matches each tool's native skill discovery convention                                                    | Requires user to copy files to correct path                         |

---

## 13. Relationship to Existing Repository Files

| File                               | Role post-implementation                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `SPEC.md`                          | Original v0.1 spec — superseded, retained with deprecation notice              |
| `GOAL.md`                          | This file — current authoritative goal specification                           |
| `COMPONENTS.md`                    | Current authoritative component specification                                  |
| `TASKS.md`                         | Current authoritative implementation task list                                 |
| `logic_and_comparison.md`          | Research reference — decision made (last30days only), file kept                |
| `opencli_example.md`               | Research reference — opencli not used in production, file kept                 |
| `last30days-skill_example.md`      | **Primary implementation reference** for X collection (Tier 1 command pattern) |
| `opencli/` submodule               | Reference only — zero imports from `packages/`                                 |
| `architecture.excalidraw`          | Visual architecture diagram — kept updated as system evolves                   |
| `.omc/plans/updagent-expansion.md` | Implementation plan with RALPLAN-DR — superseded by these spec files           |

---

## 14. Version Roadmap

### v1 (this spec)

- Centralized collector (GitHub Actions, 6h cron)
- Codex + Claude Code support
- Terminal skills (alarming + educating)
- Newsletter (Markdown, daily)
- Signal detection (2-pass: rules + OpenRouter/local agent)
- Offline fallback (data/feed.json)

### v2 (future)

- Web dashboard (Next.js on Vercel)
- Upstash Redis (hot cache for web)
- JSON API endpoint
- Push notifications (Discord/Slack webhook)
- Gemini-cli + opencode support (once X accounts confirmed)

### v3 (future)

- Automated cookie rotation (browser automation)
- User personalization (filter to specific agents)
- Historical trend analysis
- Openclaw + Hermes-agent support
