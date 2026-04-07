import type { CascadeResult, TierFailure } from "@updagent/shared";
import {
  fetchFromBirdSearch,
  BirdSearchAuthError,
  BirdSearchParseError,
} from "./x-bird.js";
import {
  fetchFromScrapeCreators,
  ScrapeCreatorsError,
} from "./x-scrapecreators.js";
import { fetchFromXAI, XAIError } from "./x-xai.js";

export interface CascadeOptions {
  handle: string;
  sinceHours: number;
  count?: number;
  rateLimitDelayMs?: number;
}

export async function fetchXPostsForAccount(
  opts: CascadeOptions,
): Promise<CascadeResult> {
  const { handle, sinceHours, count = 20 } = opts;
  const failures: TierFailure[] = [];

  try {
    console.log(`[updagent] Tier 1: @${handle} (bird-search)`);
    const posts = fetchFromBirdSearch({ handle, sinceHours, count });
    console.log(`[updagent] Tier 1 OK: @${handle} — ${posts.length} posts`);
    return { posts, tierUsed: 1, failures };
  } catch (err) {
    const isAuth = err instanceof BirdSearchAuthError;
    const isParse = err instanceof BirdSearchParseError;

    if (isAuth || isParse) {
      const errorType = isAuth ? "auth" : "parse";
      console.warn(`[updagent] Tier 1 FAIL (${errorType}): @${handle} — ${String(err)}`);
      failures.push({
        tier: 1,
        error: String(err),
        errorType,
      });
    } else {
      console.warn(`[updagent] Tier 1 FAIL (unknown): @${handle} — ${String(err)}`);
      failures.push({ tier: 1, error: String(err), errorType: "unknown" });
    }
  }

  try {
    console.log(`[updagent] Tier 2: @${handle} (ScrapeCreators)`);
    const posts = await fetchFromScrapeCreators({ handle, sinceHours, count });
    console.log(`[updagent] Tier 2 OK: @${handle} — ${posts.length} posts`);
    return { posts, tierUsed: 2, failures };
  } catch (err) {
    const errorType =
      err instanceof ScrapeCreatorsError
        ? err.statusCode === 429
          ? "rate-limit"
          : "auth"
        : "unknown";
    console.warn(`[updagent] Tier 2 FAIL (${errorType}): @${handle} — ${String(err)}`);
    failures.push({ tier: 2, error: String(err), errorType });
  }

  try {
    console.log(`[updagent] Tier 3: @${handle} (xAI Grok)`);
    const posts = await fetchFromXAI({ handle, sinceHours, count });
    console.log(`[updagent] Tier 3 OK: @${handle} — ${posts.length} posts (best-effort)`);
    return { posts, tierUsed: 3, failures };
  } catch (err) {
    const errorType = err instanceof XAIError ? "auth" : "unknown";
    console.warn(`[updagent] Tier 3 FAIL (${errorType}): @${handle} — ${String(err)}`);
    failures.push({ tier: 3, error: String(err), errorType });
  }

  console.error(`[updagent] ALL TIERS FAILED for @${handle}`);
  return { posts: [], tierUsed: null, failures };
}
