import type { RawXPost } from "@updagent/shared";
import { XAIError } from "./errors.js";

export { XAIError };

const XAI_BASE_URL = "https://api.x.ai/v1/responses";

export interface XAIOptions {
  handle: string;
  sinceHours: number;
  count?: number;
}

export async function fetchFromXAI(opts: XAIOptions): Promise<RawXPost[]> {
  const { handle, sinceHours, count = 20 } = opts;

  const apiKey = process.env["XAI_API_KEY"];
  if (!apiKey) {
    throw new XAIError("XAI_API_KEY not set");
  }

  const sinceDate = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const sinceStr = sinceDate.toISOString().split("T")[0] ?? sinceDate.toISOString();

  const prompt = `Search X.com for recent tweets from @${handle} posted after ${sinceStr}.
Return the ${count} most recent tweets as a JSON array with fields:
id, url, text, author, published_at (ISO 8601), likes, retweets, views, is_reply.
Only include tweets from @${handle}. Output ONLY valid JSON, no explanation.`;

  const response = await fetch(XAI_BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-2-latest",
      tools: [{ type: "x_search" }],
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new XAIError(`xAI API HTTP ${response.status} for @${handle}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };

  const content =
    data.choices?.[0]?.message?.content ??
    data.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("\n") ??
    "";

  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn(`[updagent] xAI Tier 3: no JSON array in response for @${handle}`);
    return [];
  }

  let tweets: unknown[];
  try {
    tweets = JSON.parse(jsonMatch[0]) as unknown[];
  } catch {
    console.warn(`[updagent] xAI Tier 3: JSON parse failed for @${handle}`);
    return [];
  }

  return tweets.map((tweet) => normalizeXAITweet(tweet as Record<string, unknown>, handle));
}

function normalizeXAITweet(tweet: Record<string, unknown>, handle: string): RawXPost {
  const id = String(tweet["id"] ?? "");
  const author = String(tweet["author"] ?? handle);

  return {
    id,
    url: String(tweet["url"] ?? `https://x.com/${author}/status/${id}`),
    text: String(tweet["text"] ?? ""),
    author,
    publishedAt: String(tweet["published_at"] ?? tweet["created_at"] ?? new Date().toISOString()),
    likes: Number(tweet["likes"] ?? 0),
    retweets: Number(tweet["retweets"] ?? 0),
    views: Number(tweet["views"] ?? 0),
    isReply: Boolean(tweet["is_reply"]),
    tier: 3,
  };
}
