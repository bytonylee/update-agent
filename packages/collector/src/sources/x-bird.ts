import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RawXPost } from "@updagent/shared";
import { BirdSearchAuthError, BirdSearchParseError } from "./errors.js";

export { BirdSearchAuthError, BirdSearchParseError };

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIRD_SEARCH_PATH = resolve(
  __dirname,
  "../../scripts/lib/vendor/bird-search/bird-search.mjs",
);

export interface BirdSearchOptions {
  handle: string;
  sinceHours: number;
  count?: number;
}

export function fetchFromBirdSearch(opts: BirdSearchOptions): RawXPost[] {
  const { handle, sinceHours, count = 20 } = opts;

  const authToken = process.env["AUTH_TOKEN"];
  const ct0 = process.env["CT0"];

  if (!authToken || !ct0) {
    throw new BirdSearchAuthError(
      "AUTH_TOKEN and CT0 environment variables are required for bird-search (Tier 1)",
    );
  }

  const query = `from:${handle}`;
  const sinceArg = `${sinceHours}h`;

  const result = spawnSync(
    "node",
    [
      BIRD_SEARCH_PATH,
      query,
      "--since",
      sinceArg,
      "--count",
      String(count),
      "--json",
    ],
    {
      env: {
        ...process.env,
        AUTH_TOKEN: authToken,
        CT0: ct0,
      },
      encoding: "utf-8",
      timeout: 30_000,
    },
  );

  if (result.status !== 0) {
    const stderr = result.stderr ?? "";
    if (
      stderr.includes("auth") ||
      stderr.includes("401") ||
      stderr.includes("403") ||
      stderr.includes("cookie")
    ) {
      throw new BirdSearchAuthError(
        `bird-search auth failure for @${handle}: ${stderr.slice(0, 200)}`,
      );
    }
    throw new BirdSearchAuthError(
      `bird-search exited ${result.status} for @${handle}: ${stderr.slice(0, 200)}`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(result.stdout);
  } catch {
    throw new BirdSearchParseError(
      `bird-search returned non-JSON for @${handle}: ${result.stdout.slice(0, 200)}`,
    );
  }

  if (!Array.isArray(raw)) {
    if (raw === null || (typeof raw === "object" && Object.keys(raw as object).length === 0)) {
      return [];
    }
    throw new BirdSearchParseError(
      `bird-search returned unexpected shape for @${handle}`,
    );
  }

  return raw.map((tweet) => normalizeBirdSearchTweet(tweet as Record<string, unknown>, handle));
}

function normalizeBirdSearchTweet(
  tweet: Record<string, unknown>,
  handle: string,
): RawXPost {
  const id = String(tweet["id"] ?? tweet["id_str"] ?? "");
  const text = String(tweet["full_text"] ?? tweet["text"] ?? "");
  const user = tweet["user"] as Record<string, unknown> | undefined;
  const author = String(user?.["screen_name"] ?? handle);
  const quotedStatus = tweet["quoted_status"] as Record<string, unknown> | undefined;
  const publishedAt = String(tweet["created_at"] ?? new Date().toISOString());
  const likes = Number(tweet["favorite_count"] ?? tweet["likes"] ?? 0);
  const retweets = Number(tweet["retweet_count"] ?? tweet["retweets"] ?? 0);
  const viewsRecord = tweet["views"] as Record<string, unknown> | undefined;
  const views = Number(viewsRecord?.["count"] ?? tweet["view_count"] ?? 0);
  const isReply =
    tweet["in_reply_to_status_id"] != null ||
    tweet["in_reply_to_status_id_str"] != null;
  const parentTweetId = tweet["in_reply_to_status_id_str"]
    ? String(tweet["in_reply_to_status_id_str"])
    : undefined;
  const parentTweetText = quotedStatus?.["full_text"]
    ? String(quotedStatus["full_text"])
    : undefined;

  return {
    id,
    url: `https://x.com/${author}/status/${id}`,
    text,
    author,
    publishedAt,
    likes,
    retweets,
    views,
    isReply,
    ...(parentTweetId ? { parentTweetId } : {}),
    ...(parentTweetText ? { parentTweetText } : {}),
    tier: 1,
  };
}
