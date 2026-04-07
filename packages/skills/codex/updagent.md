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

```bash
codex run "<buildDistributedPrompt(post)>"
```

Parse the JSON response and filter/display based on classification.

## Health Warning

If `~/updagent/data/health.json` exists and `credentialWarning === true`, display at top:

```
⚠️ X data may be incomplete — Tier 1 auth degraded for some accounts.
Check AUTH_TOKEN + CT0 in your environment.
```

## Installation

```bash
cp packages/skills/codex/updagent.md ~/.codex/agents/updagent.md
# or
bash packages/skills/install.sh
```
