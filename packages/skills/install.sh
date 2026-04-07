#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing updagent skills..."

mkdir -p ~/.claude/skills ~/.codex/agents

cp "$SCRIPT_DIR/claude-code/updagent.md" ~/.claude/skills/updagent.md
echo "  ✓ Claude Code: ~/.claude/skills/updagent.md"

cp "$SCRIPT_DIR/codex/updagent.md" ~/.codex/agents/updagent.md
echo "  ✓ Codex CLI:   ~/.codex/agents/updagent.md"

echo ""
echo "Done. Use /updagent in Claude Code or Codex to see AI agent updates."
echo "  /updagent           — alarming mode (last 6h signals)"
echo "  /updagent --educate — educating mode (full 24h breakdown)"
