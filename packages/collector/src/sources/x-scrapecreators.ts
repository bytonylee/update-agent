import type { RawXPost } from "@updagent/shared";
import { ScrapeCreatorsError } from "./errors.js";

export { ScrapeCreatorsError };

const BASE_URL = "https://api.scrapecreators.com/v1/twitter/user/tweets";

export interface ScrapeCreatorsOptions {
  handle: string;
  sinceHours: number;
  count?: number;
}

export async function fetchFromScrapeCreators(
  opts: ScrapeCreatorsOptions,
): Promise<RawXPost[]> {
  const { handle, sinceHours, count = 20 } = opts;

  const apiKey = process.env["SCRAPECREATORS_API_KEY"];
  if (!apiKey) {
    throw new ScrapeCreatorsError("SCRAPECREATORS_API_KEY not set", 0);
  }

  const url = new URL(BASE_URL);
  url.searchParams.set("handle", handle);
  url.searchParams.set("limit", String(count));

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (response.status === 401 || response.status === 403) {
    throw new ScrapeCreatorsError(
      `ScrapeCreators auth failure for @${handle}: ${response.status}`,
      response.status,
    );
  }

  if (response.status === 429) {
    throw new ScrapeCreatorsError(
      `ScrapeCreators rate limit for @${handle}`,
      429,
    );
  }

  if (!response.ok) {
    throw new ScrapeCreatorsError(
      `ScrapeCreators HTTP ${response.status} for @${handle}`,
      response.status,
    );
  }

  const data = (await response.json()) as { tweets?: unknown[] } | unknown[];
  const tweets = Array.isArray(data) ? data : ((data as { tweets?: unknown[] }).tweets ?? []);
  const cutoff = Date.now() - sinceHours * 60 * 60 * 1000;

  return tweets
    .map((tweet) => normalizeScrapeCreatorsTweet(tweet as Record<string, unknown>, handle))
    .filter((post) => new Date(post.publishedAt).getTime() >= cutoff);
}

function normalizeScrapeCreatorsTweet(
  tweet: Record<string, unknown>,
  handle: string,
): RawXPost {
  const id = String(tweet["id"] ?? "");
  const metrics = tweet["public_metrics"] as Record<string, unknown> | undefined;
  const author = String(tweet["author_id"] ?? tweet["username"] ?? handle);
  const isReply = Boolean(tweet["in_reply_to_user_id"]);

  return {
    id,
    url: `https://x.com/${author}/status/${id}`,
    text: String(tweet["text"] ?? ""),
    author,
    publishedAt: String(tweet["created_at"] ?? new Date().toISOString()),
    likes: Number(metrics?.["like_count"] ?? 0),
    retweets: Number(metrics?.["retweet_count"] ?? 0),
    views: Number(metrics?.["impression_count"] ?? 0),
    isReply,
    tier: 2,
  };
}
