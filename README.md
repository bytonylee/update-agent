# updagent

Terminal-first alarming and educating system for AI coding tool updates.

Tracks **Claude Code** and **Codex CLI** (and soon gemini-cli, opencode) by collecting from X.com team accounts and GitHub releases, filtering noise with a 2-pass signal detection pipeline, and delivering high-precision updates to your terminal and a Markdown newsletter.

---

## Quick Start

### 1. Install CLI skills

```bash
bash packages/skills/install.sh
```

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

```text
/updagent              — show latest signals (alarming mode)
/updagent --educate    — full context (educating mode)
/updagent releases     — GitHub releases only
```

---

## Tracked Agents

| Agent | Priority | GitHub | X Accounts |
| --- | --- | --- | --- |
| Claude Code | 1 | anthropics/claude-code | @bcherny, @trq212, @noahzweben, @felixrieseberg, @lydiahallie, @amorriscode, @claudeai |
| Codex CLI | 1 | openai/codex | @openaidevs, @thsottiaux, @romainhuet, @reach_vb, @rohanvarma |
| Gemini CLI | 2 (future) | google/gemini-cli | — |
| opencode | 2 (future) | sst/opencode | — |

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

| Variable | Purpose |
| --- | --- |
| `AUTH_TOKEN` + `CT0` | X.com Tier 1 (browser cookies) |
| `GH_TOKEN` | GitHub releases (avoids rate limits) |
| `OPENROUTER_API_KEY` | Signal classification (free tier available) |
