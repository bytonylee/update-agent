import type { ClassificationInput } from "@updagent/shared";

export interface PromptPost {
  index: number;
  author: string;
  agentName: string;
  text: string;
  isReply: boolean;
  parentTweetSummary?: string;
}

export function buildClassificationPrompt(inputs: ClassificationInput[]): string {
  const posts: PromptPost[] = inputs.map((input, index) => ({
    index,
    author: `@${input.author}`,
    agentName: input.agentName,
    text: input.text,
    isReply: input.isReply,
    ...(input.parentTweetSummary
      ? { parentTweetSummary: input.parentTweetSummary }
      : {}),
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
  }
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
