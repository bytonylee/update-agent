# updagent — Goal Specification

**Version**: 1.0  
**Date**: 2026-04-07  
**Status**: Approved

---

## 1. Vision

updagent is a **terminal-first alarming and educating system** that keeps developers using AI coding agents (Codex, Claude Code, and others) informed of product updates, releases, and meaningful signals — automatically, without noise, with zero manual effort.

The core insight: AI coding agent teams announce updates on X.com **before** anywhere else. GitHub releases are the official record, but X posts are the early signal. Neither source alone is sufficient. Together, filtered intelligently, they form a high-SNR update feed.

---

## 2. Problem Statement

### 2a. The gap

When Codex CLI or Claude Code ships a new version, a bug fix, or a breaking change, developers learn about it through:

1. **X.com** — team members post first-hand announcements, workarounds, and roadmap hints, often in replies to user bug reports
2. **GitHub Releases** — official, complete, delayed by days or weeks

There is no unified place that aggregates both streams, filters noise, and delivers actionable signals to the developer's terminal.

### 2b. The noise problem

X.com accounts tracked by updagent are human accounts. They post:

| Post type              | Example                                                                          | Should surface?                                  |
| ---------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ |
| Product update         | "@bcherny: This was fixed in yesterday's release. `claude update` to get latest" | ✅ SIGNAL                                        |
| Roadmap hint           | "@bcherny: Windows coming soon. No announcement/eta yet."                        | ✅ SIGNAL                                        |
| Release announcement   | "@openaidevs: Codex CLI 0.3 is here: parallel file editing"                      | ✅ SIGNAL                                        |
| Industry context       | "@amorriscode: Claude Code vs Copilot thread"                                    | ⚠️ CONTEXT (educating mode only)                 |
| Personal / social      | "@bcherny: best team"                                                            | ❌ NOISE                                         |
| Audience chat          | "@bcherny: lol" (reply to joke)                                                  | ❌ NOISE                                         |
| Unrelated company news | "@claudeai: Claude is now available in 20 languages"                             | ❌ NOISE (unless about Claude Code specifically) |

Without signal detection, the feed is unusable. With it, it becomes a precision instrument.

### 2c. The multi-agent problem

As AI coding agents multiply (Codex, Claude Code, gemini-cli, opencode, Openclaw, Hermes-agent), tracking each one separately — different repos, different Twitter accounts, different release cadences — is manually unsustainable. updagent must scale to new agents via configuration, not code.

---

## 3. Target Users

### Primary user

A developer who:

- Uses one or more AI coding agents (Codex CLI, Claude Code) daily
- Works in the terminal
- Wants to know when their tool ships updates, fixes bugs, or changes behavior
- Does not want to monitor X.com manually or subscribe to newsletters

### Secondary user

A developer who:

- Maintains or contributes to AI coding agent tooling
- Needs situational awareness of the AI coding agent ecosystem
- Uses Claude Code or Codex as their primary AI assistant

### Deployment modes

| Mode                  | User type            | Infrastructure                                                |
| --------------------- | -------------------- | ------------------------------------------------------------- |
| Centralized (default) | Team / org / public  | GitHub Actions cron + OpenRouter API                          |
| Distributed           | Individual developer | Local CLI skill, uses own `claude`/`codex` for classification |

---

## 4. Supported Agents

### Tier 1 — Fully supported (launch)

| Agent           | GitHub Repo              | X Accounts Tracked                                                                     |
| --------------- | ------------------------ | -------------------------------------------------------------------------------------- |
| **Codex CLI**   | `openai/codex`           | @openaidevs, @thsottiaux, @romainhuet, @reach_vb, @rohanvarma                          |
| **Claude Code** | `anthropics/claude-code` | @bcherny, @trq212, @noahzweben, @felixrieseberg, @lydiahallie, @amorriscode, @claudeai |

### Tier 2 — Architecturally prepared, not yet enabled

| Agent            | Status           | Notes                                        |
| ---------------- | ---------------- | -------------------------------------------- |
| **gemini-cli**   | `enabled: false` | Awaiting stable GitHub repo + X account list |
| **opencode**     | `enabled: false` | Awaiting stable GitHub repo + X account list |
| **Openclaw**     | `enabled: false` | Awaiting stable GitHub repo + X account list |
| **Hermes-agent** | `enabled: false` | Awaiting stable GitHub repo + X account list |

Adding a Tier 2 agent to active tracking requires only editing `agents-config.json` — no code changes.

---

## 5. Output Surfaces

### 5a. Terminal — Alarming Mode (default)

- Invoked: `/updagent` inside Claude Code or Codex
- Shows: SIGNAL items only (releases + high-confidence product update posts)
- Window: last 6 hours (matches collection cadence)
- Format: compact, scannable list with source, author, timestamp, one-line summary, URL
- Purpose: "Did anything important happen since I last checked?"

### 5b. Terminal — Educating Mode

- Invoked: `/updagent --educate`
- Shows: SIGNAL + CONTEXT items, grouped by agent and category (Releases / Team Signals / Community Context / Trending)
- Window: last 24 hours
- Format: detailed breakdown with engagement scores, full text excerpts
- Purpose: "Give me the full picture of what's happening in the AI coding agent space"

### 5c. Newsletter — Markdown files in repo

- Generated: automatically after each collection run when new SIGNAL items exist
- Location: `newsletters/YYYY-MM-DD.md` (daily cadence)
- Content: SIGNAL items only, grouped by agent, with links
- Committed and pushed by GitHub Actions
- Purpose: persistent record, shareable, readable on GitHub

### 5d. JSON API (future, when web ships)

- `GET /api/feed?tool={codex|claude-code}&mode={alarm|educate}&since={6h|24h|7d}`
- Returns normalized `FeedItem[]` for programmatic consumption
- Used by skills as primary source when network available

---

## 6. Success Metrics

| Metric                            | Target                                                               | How to measure                                             |
| --------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------- |
| Signal detection precision        | ≥80% SIGNAL posts are true product updates                           | Manual review of 50-post sample from labeled fixtures      |
| Signal detection recall           | ≥90% of real product update posts are classified SIGNAL (not missed) | Manual review against known release events                 |
| Release detection latency         | GitHub releases appear in feed within 6h of publication              | Compare release timestamp vs first appearance in feed.json |
| X post detection latency          | X posts from tracked accounts appear within 6h                       | Compare post timestamp vs first appearance in feed.json    |
| Alarming mode false positive rate | <10% of items shown are noise                                        | Manual review of 20 consecutive runs                       |
| Collection reliability            | <5% of hourly runs have all tiers fail for any account               | health.json consecutive failure tracking                   |
| Cold storage freshness            | `data/feed.json` committed within 6h of latest real content          | git log timestamps vs FeedItem.publishedAt                 |
| Offline skill functionality       | `/updagent` returns results when network is unavailable              | Test with network off, data/feed.json present              |

---

## 7. Non-Goals (v1)

The following are explicitly out of scope for v1:

| Non-goal                                   | Why deferred                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| Web dashboard / website                    | Added complexity; skills + newsletter satisfy v1 needs                   |
| Push notifications (email, Slack, Discord) | Can be added via `oh-my-claudecode:configure-notifications` in v2        |
| Sentiment analysis or opinion tracking     | Requires more labeled data; signal detection is sufficient               |
| Full-text search of historical feed        | GitHub raw file access covers the offline case                           |
| Authentication on API endpoint             | Feed is public information; no sensitive data                            |
| Automated X.com cookie rotation            | Too complex for v1; health.json surfaces the problem for manual rotation |
| User accounts or personalization           | Single-tenant system; no user model needed                               |
| Mobile app                                 | Terminal-first; mobile is out of scope                                   |
| Tracking GitHub Issues or PRs              | Too noisy; releases are the right signal level                           |

---

## 8. Constraints

### Technical constraints

- **No browser dependency** in any production path — entire system runs headless
- **No always-on server** — GitHub Actions (cron) + static JSON file
- **Offline capable** — skills must work with stale `data/feed.json` when network is unavailable
- **Agent-agnostic** — adding a new agent requires only `agents-config.json` change
- **Free or near-free** — target total cost $0.00–$0.21/month (GitHub Actions free tier + OpenRouter free models)

### Operational constraints

- X.com AUTH_TOKEN + CT0 are session cookies requiring manual rotation when expired
- health.json surfaces expiry early (3 consecutive failures = warning)
- Collection must never crash on partial failures — always commit what was collected

### Quality constraints

- All TypeScript — strict mode, no `any`
- Tests required for signal detection pipeline before implementation (Step 2.5)
- No hardcoded agent lists, account lists, or keyword lists in source code (all in config)

---

## 9. Architecture Decisions (Summary)

| Decision                                 | Choice                                                                | Rationale                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Collection model                         | Centralized                                                           | Shared signal detection, centralized rate limiting, config-driven multi-agent |
| X.com crawl method                       | last30days bird-search cascade (3 tiers)                              | Headless, battle-tested, no browser required                                  |
| Signal classification — centralized mode | OpenRouter API (Gemini Flash free / Claude Haiku fallback)            | Near-zero cost, model-agnostic via OpenRouter                                 |
| Signal classification — distributed mode | User's local `claude -p` or `codex` CLI                               | Zero extra cost, reuses existing agent                                        |
| Storage                                  | `data/feed.json` (primary) + Upstash Redis (optional, for future web) | Offline-capable, zero cost until web ships                                    |
| Collection cadence                       | Every 6 hours                                                         | Balances freshness vs API cost; matches `--since 6h` query window             |
| Newsletter format                        | Markdown committed to repo                                            | Zero infrastructure, readable on GitHub, version-controlled                   |
| Skill format                             | `.md` files in standard skill dirs                                    | Matches each tool's native skill discovery convention                         |

---

## 10. Relationship to Existing Files

| File                          | Role                           | Action                                                                    |
| ----------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| `SPEC.md`                     | Original v0.1 spec             | Superseded by `GOAL.md` + `COMPONENTS.md` + `TASKS.md` for implementation |
| `logic_and_comparison.md`     | OpenCLI vs last30days analysis | Reference only — decision made (last30days only)                          |
| `opencli_example.md`          | OpenCLI usage examples         | Reference only — opencli not used in production                           |
| `last30days-skill_example.md` | bird-search usage examples     | **Primary reference** for X collection implementation                     |
| `opencli/` submodule          | Browser-based Twitter CLI      | Retained as reference, not imported by any `packages/` code               |
| `architecture.excalidraw`     | Visual architecture diagram    | Keep updated as implementation progresses                                 |
