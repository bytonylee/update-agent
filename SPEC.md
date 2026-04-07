> ⚠️ **Deprecated**: This file is the original v0.1 spec and has been superseded.
> See [GOAL.md](GOAL.md), [COMPONENTS.md](COMPONENTS.md), and [TASKS.md](TASKS.md) for the current implementation spec.
> The content below is preserved for historical reference only.

---

# updagent — Spec v0.1

> **What this is**: A real-time update tracker for Codex CLI and Claude Code.
> Collects X.com posts from key team/community accounts + GitHub release notes,
> exposes the feed as a website and as a CLI skill for both tools.

---

## 0. Answered Ambiguities

Before the spec, here are every unclear decision resolved:

| Question | Decision | Reason |
|---|---|---|
| opencli vs last30days for X scraping? | **Both, different roles** — opencli for local CLI skill (user has Chrome), last30days bird-search for server-side collection (no browser needed in CI) | opencli needs Chrome running; server cron can't do that |
| Which ~10 accounts per tool? | See §2 — hand-curated lists of team members + high-signal community voices | These post first-hand release info, not secondhand noise |
| Event trigger vs 1-hour polling? | **Both** — GitHub webhook triggers on new release tag, hourly cron for X post sweep | Releases need instant notification; X posts trickle in continuously |
| Website deployment? | **Vercel** (Next.js App Router) | Free tier covers this; edge caching; built-in cron via Vercel Cron |
| Storage? | **Upstash Redis** (KV) for hot data + **GitHub repo JSON** as cold archive | Redis for sub-100ms website reads; JSON archive for CLI skill offline mode |
| Skill format? | Claude Code → `~/.claude/skills/updagent.md`; Codex → `~/.codex/agents/updagent.md` | Matches each tool's native skill discovery convention |
| Who runs collection? | **GitHub Actions** (hourly cron) + **Vercel serverless** (webhook receiver) | No always-on server cost; both free-tier eligible |
| X auth credentials? | `AUTH_TOKEN` + `CT0` env vars (bird-search / last30days Tier 1) with `SCRAPECREATORS_API_KEY` as fallback | Same 3-tier cascade as last30days — most resilient for headless CI |
| Language / runtime? | **TypeScript + Node 20** (collector scripts), **Next.js 15** (website), **Python** only if reusing last30days scripts as-is | Keep the stack unified; opencli is already TS |
| Monorepo or separate repos? | **Monorepo** at `updagent/` with `packages/` workspaces | Shared types between collector, API, and skill templates |

---

## 1. Problem

When Codex CLI or Claude Code ships an update, developers learn about it from:
1. X.com posts (team announces on X **first**, docs later — confirmed pattern)
2. GitHub release notes (official, complete, delayed)

There is no unified place that shows both streams together, normalized, with the newest information first.

---

## 2. Tracked Sources

### 2a. X Accounts

**Claude Code (~10 accounts)**

| Handle | Role |
|---|---|
| @bcherny | Boris Cherny — Claude Code lead (ships features, posts release notes on X first) |
| @alexjcampbell | Alex Campbell — Claude Code engineer (statusline, hooks, MCP) |
| @anthropicai | Anthropic official account |
| @darioamodei | Dario Amodei — CEO, announces major milestones |
| @danielgross | Daniel Gross — investor & power user, early signal on Claude Code updates |
| @GergelyOrosz | Gergely Orosz (The Pragmatic Engineer) — writes up every major AI coding update |
| @simonw | Simon Willison — detailed writeups, tracks changelog closely |
| @swyx | swyx — AI community signal amplifier |
| @levelsio | Pieter Levels — heavy Claude Code user, real-world usage reports |
| @paulg | Paul Graham — uses Claude Code, occasional high-signal posts |

**Codex CLI (~10 accounts)**

| Handle | Role |
|---|---|
| @openai | OpenAI official — primary announcement channel |
| @sama | Sam Altman — announces major Codex milestones |
| @gregbrockman | Greg Brockman — engineering depth posts |
| @karpathy | Andrej Karpathy — deep technical Codex/OpenAI analysis |
| @amasad | Amjad Masad (Replit) — tracks competing coding tools obsessively |
| @jaredpalmer | Jared Palmer — Codex CLI contributor-adjacent, tooling posts |
| @thesephist | Linus Lee — thoughtful analysis of coding AI tools |
| @yoheinakajima | Yohei Nakajima — agent workflows, Codex integrations |
| @GergelyOrosz | (same as above — covers both tools) |
| @swyx | (same as above) |

### 2b. GitHub Repositories

| Tool | Repo | Watch |
|---|---|---|
| Claude Code | `anthropics/claude-code` | releases, tags |
| Codex CLI | `openai/codex` | releases, tags |

---

## 3. Data Collection Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Collection Layer                             │
│                                                                  │
│  ┌────────────────────┐      ┌──────────────────────────┐       │
│  │  GitHub Actions    │      │  Vercel Webhook Endpoint  │       │
│  │  (hourly cron)     │      │  /api/webhook/github      │       │
│  │                    │      │                           │       │
│  │  - X post sweep    │      │  Triggers on:             │       │
│  │    (last30days     │      │  - anthropics/claude-code │       │
│  │     bird-search    │      │    new release tag        │       │
│  │     per account)   │      │  - openai/codex           │       │
│  │  - GitHub releases │      │    new release tag        │       │
│  │    poll (REST API) │      │                           │       │
│  └────────┬───────────┘      └────────────┬─────────────┘       │
│           │                               │                      │
│           └───────────────┬───────────────┘                      │
│                           ▼                                      │
│              ┌────────────────────────┐                          │
│              │  Normalizer + Deduper  │                          │
│              │  packages/collector    │                          │
│              │                        │                          │
│              │  - Canonical schema    │                          │
│              │  - source: x | github  │                          │
│              │  - tool: claude-code   │                          │
│              │         | codex        │                          │
│              │  - engagement score    │                          │
│              │  - dedup by url/id     │                          │
│              └────────────┬───────────┘                          │
│                           ▼                                      │
│              ┌────────────────────────┐                          │
│              │  Storage               │                          │
│              │                        │                          │
│              │  Upstash Redis (KV)    │◄── website reads         │
│              │  - hot: last 48h       │    (< 100ms)             │
│              │  - TTL: 48h per entry  │                          │
│              │                        │                          │
│              │  GitHub repo JSON      │◄── CLI skill reads       │
│              │  data/feed.json        │    (offline capable)     │
│              │  (committed by Action) │                          │
│              └────────────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

### 3a. X Collection (server-side, headless)

Uses the same 3-tier cascade as last30days — **no browser required**:

```
Tier 1: bird-search (vendored Node.js)
  Query: "from:<handle>" --since <24h ago> --count 20 --json
  Auth:  AUTH_TOKEN + CT0 env vars

Tier 2: ScrapeCreators REST API
  Auth:  SCRAPECREATORS_API_KEY env var

Tier 3: xAI Responses API (Grok x_search tool)
  Auth:  XAI_API_KEY env var
```

Each account is queried independently. Results are merged + deduped by tweet ID.

### 3b. GitHub Release Collection

Uses GitHub REST API v3 (no auth required for public repos, add `GH_TOKEN` to avoid rate limits):

```
GET /repos/anthropics/claude-code/releases?per_page=5
GET /repos/openai/codex/releases?per_page=5
```

Releases are normalized into the same canonical schema as X posts.

### 3c. Canonical Item Schema

```typescript
interface FeedItem {
  id: string;               // tweet URL or github release tag
  source: "x" | "github";
  tool: "claude-code" | "codex";
  author: string;           // @handle or "anthropics/claude-code"
  text: string;             // tweet text or release body (markdown)
  url: string;
  publishedAt: string;      // ISO 8601
  engagementScore: number;  // likes*1 + retweets*3 + 0 for github
  isRelease: boolean;       // true if github release or tweet mentions version
  version?: string;         // extracted semver if detectable (e.g. "1.9.3")
  likes?: number;
  retweets?: number;
  views?: number;
}
```

---

## 4. Update Mechanism

### 4a. Hourly Cron (GitHub Actions)

```yaml
# .github/workflows/collect.yml
on:
  schedule:
    - cron: "0 * * * *"   # every hour
  workflow_dispatch:        # manual trigger
```

Runs `packages/collector/src/collect.ts`, writes `data/feed.json`, commits + pushes to main.
Also writes to Upstash Redis.

### 4b. GitHub Webhook (instant on release)

Anthropic and OpenAI repos emit `release` events. A Vercel serverless function receives them:

```
POST /api/webhook/github
Headers: X-Hub-Signature-256 (verified with GITHUB_WEBHOOK_SECRET)
Body: { action: "published", release: { tag_name, body, ... } }
```

On receipt:
1. Parse release notes
2. Write to Redis immediately (no wait for hourly cron)
3. Trigger ISR revalidation on website (`revalidateTag("feed")`)

### 4c. Staleness Display

Website shows "last updated X minutes ago" badge. If Redis data is > 2h old, show warning banner.

---

## 5. Website

### Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS v4 |
| Deployment | Vercel |
| Data fetching | Server Components + `unstable_cache` with `revalidateTag("feed")` |
| KV store | Upstash Redis (`@upstash/redis`) |
| UI components | shadcn/ui |

### Pages

```
/                   — unified feed (both tools, sorted by publishedAt DESC)
/claude-code        — Claude Code only feed
/codex              — Codex CLI only feed
/releases           — GitHub releases only (both tools)
/api/webhook/github — webhook receiver (POST)
/api/feed           — JSON API endpoint (for CLI skill consumption)
```

### Feed Display

Each item renders as a card:

```
┌─────────────────────────────────────────────────────┐
│ [X] @bcherny  •  Claude Code  •  2 hours ago    [🔥] │
│                                                       │
│  "This was fixed in yesterday's release.              │
│   `claude update` to make sure you're on latest"     │
│                                                       │
│  ♥ 77  🔁 12  👁 34K          [view on X →]          │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ [GH] anthropics/claude-code  •  v1.9.3  •  1hr ago  │
│                                                       │
│  ## What's New                                        │
│  - Fix statusline rendering on Windows               │
│  - Add `--no-permission-prompts` flag                │
│                          [view on GitHub →]           │
└─────────────────────────────────────────────────────┘
```

Filtering: tool selector (All / Claude Code / Codex), source toggle (X / GitHub / Both), date range.

---

## 6. CLI Skills

### 6a. Claude Code Skill

**Install path**: `~/.claude/skills/updagent.md`

**Collection method (local)**: Uses `opencli` (browser-based, CDP) since the user has Chrome running:
```bash
opencli twitter search "from:bcherny OR from:alexjcampbell" --limit 20 -f json
```
Falls back to hitting the `/api/feed` JSON endpoint if Chrome unavailable.

**Skill behavior**:
```
/updagent                     — show last 10 updates across both tools
/updagent codex               — Codex CLI updates only
/updagent claude-code         — Claude Code updates only
/updagent releases            — GitHub releases only
/updagent --since 24h         — last 24 hours only
```

**Skill file template** (`~/.claude/skills/updagent.md`):
```markdown
---
name: updagent
description: "Show latest updates for Claude Code and Codex CLI from X.com and GitHub releases"
triggers: ["updagent", "what's new in claude code", "codex updates", "latest release"]
---

Fetch https://updagent.vercel.app/api/feed?tool={tool}&limit=10
and format as a concise changelog digest. Group by tool, show releases
first then X posts, include engagement scores to surface most-viral items.
If offline, read ~/updagent/data/feed.json as fallback.
```

### 6b. Codex CLI Skill

**Install path**: `~/.codex/agents/updagent.md`

Same API endpoint, same fallback to `data/feed.json`.

```markdown
---
name: updagent
description: Track latest updates for Codex CLI and Claude Code
---
...
```

---

## 7. Monorepo Structure

```
updagent/
├── packages/
│   ├── collector/          # TypeScript — data collection
│   │   ├── src/
│   │   │   ├── collect.ts        # main entrypoint (runs in GitHub Actions)
│   │   │   ├── sources/
│   │   │   │   ├── x-bird.ts     # Tier 1: bird-search subprocess wrapper
│   │   │   │   ├── x-scrapecreators.ts  # Tier 2
│   │   │   │   ├── x-xai.ts      # Tier 3
│   │   │   │   └── github-releases.ts   # GitHub REST API
│   │   │   ├── normalize.ts      # → FeedItem schema
│   │   │   ├── dedup.ts
│   │   │   └── storage.ts        # Redis + JSON file write
│   │   └── package.json
│   │
│   ├── web/                # Next.js 15 app
│   │   ├── app/
│   │   │   ├── page.tsx          # unified feed
│   │   │   ├── claude-code/page.tsx
│   │   │   ├── codex/page.tsx
│   │   │   ├── releases/page.tsx
│   │   │   └── api/
│   │   │       ├── feed/route.ts      # GET /api/feed
│   │   │       └── webhook/github/route.ts  # POST
│   │   └── package.json
│   │
│   └── skills/             # CLI skill templates
│       ├── claude-code/updagent.md
│       └── codex/updagent.md
│
├── data/
│   └── feed.json           # committed by GitHub Actions, CLI offline fallback
│
├── .github/
│   └── workflows/
│       └── collect.yml     # hourly cron + manual dispatch
│
├── package.json            # workspace root
└── SPEC.md                 # this file
```

---

## 8. Environment Variables

| Variable | Used by | Purpose |
|---|---|---|
| `AUTH_TOKEN` | collector | X bird-search Tier 1 |
| `CT0` | collector | X bird-search Tier 1 CSRF token |
| `SCRAPECREATORS_API_KEY` | collector | X Tier 2 fallback |
| `XAI_API_KEY` | collector | X Tier 3 fallback |
| `GH_TOKEN` | collector | GitHub API rate limit avoidance |
| `GITHUB_WEBHOOK_SECRET` | web/webhook | Verify release webhook signatures |
| `UPSTASH_REDIS_REST_URL` | collector + web | Redis writes + reads |
| `UPSTASH_REDIS_REST_TOKEN` | collector + web | Redis auth |

All set in:
- GitHub Actions → repo Settings → Secrets
- Vercel → project Settings → Environment Variables

---

## 9. Deployment Steps

1. **Fork/clone** this repo, enable GitHub Actions
2. **Set secrets** in GitHub repo + Vercel project (see §8)
3. **Deploy web** to Vercel: `vercel --prod` from `packages/web/`
4. **Register webhooks** on GitHub:
   - `https://github.com/anthropics/claude-code/settings/hooks` → point to `https://updagent.vercel.app/api/webhook/github`
   - Same for `openai/codex`
   - (Requires admin access to those repos — alternatively, poll-only is fine since releases are caught by hourly cron anyway)
5. **Install CLI skills**:
   ```bash
   cp packages/skills/claude-code/updagent.md ~/.claude/skills/updagent.md
   cp packages/skills/codex/updagent.md ~/.codex/agents/updagent.md
   ```
6. **Run first collect** manually: `gh workflow run collect.yml`

---

## 10. Open Questions (not blocking spec)

| Question | Options | Recommendation |
|---|---|---|
| Admin access to anthropics/claude-code for webhooks? | Webhook (instant) vs poll-only (hourly) | Start with poll-only; add webhook when possible |
| opencli browser bridge for local skill? | Requires Chrome + extension | Fallback to `/api/feed` HTTP makes it work without Chrome too |
| Should the website require auth? | Public vs login-gated | Start public — no sensitive data |
| Notification on new release? | Email / Telegram / Discord webhook | Out of scope for v1, easy to add via `oh-my-claudecode:configure-notifications` |
