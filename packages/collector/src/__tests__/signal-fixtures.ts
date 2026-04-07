import type { ClassificationInput } from "@updagent/shared";

export interface Fixture {
  id: string;
  input: ClassificationInput;
  expected: "SIGNAL" | "CONTEXT" | "NOISE";
  fastPathDeterministic: boolean;
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
  {
    id: "gh-release-cc",
    input: {
      ...cc({ text: "## What's New\n- Fix statusline on Windows\n- Add --no-permission-prompts flag" }),
      source: "github",
    },
    expected: "SIGNAL",
    fastPathDeterministic: true,
    note: "GitHub source is always SIGNAL regardless of content",
  },
  {
    id: "gh-release-codex",
    input: {
      ...codex({ text: "codex v0.1.2\n\nBug fixes and performance improvements" }),
      source: "github",
    },
    expected: "SIGNAL",
    fastPathDeterministic: true,
  },
  {
    id: "semver-cc-1",
    input: cc({ text: "Claude Code v1.9.4 is out — major hook improvements and MCP fixes" }),
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
    input: cc({ text: "lol", isReply: true }),
    expected: "NOISE",
    fastPathDeterministic: true,
    note: "Too short (3 chars) = NOISE",
  },
  {
    id: "noise-filler",
    input: cc({ text: "😂" }),
    expected: "NOISE",
    fastPathDeterministic: true,
    note: "Emoji-only social filler",
  },
  {
    id: "noise-thanks",
    input: cc({ text: "Thanks! 🙏" }),
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
  {
    id: "edge-reply-non-tracked",
    input: {
      ...cc({ text: "Claude Code hooks are amazing, just tried them!" }),
      author: "randomUser123",
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

export const fastPathFixtures = fixtures.filter((fixture) => fixture.fastPathDeterministic);
export const llmFixtures = fixtures.filter((fixture) => !fixture.fastPathDeterministic);
