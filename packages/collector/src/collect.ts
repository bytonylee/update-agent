import { pathToFileURL } from "node:url";
import { isAbsolute, resolve } from "node:path";
import { getEnabledAgents } from "@updagent/shared";
import type {
  FeedItem,
  AccountHealth,
  CollectionHealth,
  ClassificationResult,
  ClassificationInput,
} from "@updagent/shared";
import { fetchXPostsForAccount } from "./sources/x-cascade.js";
import { fetchGitHubReleases } from "./sources/github-releases.js";
import { normalizeXPost, normalizeGitHubRelease } from "./normalize.js";
import { dedup, dedupWithin } from "./dedup.js";
import { fastPath } from "./signal/rules.js";
import { classifyBatch } from "./signal/classifier.js";
import {
  readFeedJson,
  writeFeedJson,
  readHealthJson,
  writeHealthJson,
  writeToRedis,
} from "./storage.js";
import { shouldGenerateNewsletter, appendToNewsletter } from "./newsletter.js";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

function resolveRepoPath(
  configuredPath: string | undefined,
  defaultRelativePath: string,
): string {
  const target = configuredPath ?? defaultRelativePath;
  return isAbsolute(target) ? target : resolve(REPO_ROOT, target);
}

const FEED_PATH = resolveRepoPath(process.env["FEED_JSON_PATH"], "data/feed.json");
const HEALTH_PATH = resolveRepoPath(
  process.env["HEALTH_JSON_PATH"],
  "data/health.json",
);
const NEWSLETTERS_DIR = resolveRepoPath(
  process.env["NEWSLETTERS_DIR"],
  "newsletters",
);
const SINCE_HOURS = parseInt(process.env["SINCE_HOURS"] ?? "6", 10);
const RATE_LIMIT_DELAY_MS = parseInt(process.env["RATE_LIMIT_DELAY_MS"] ?? "2000", 10);
const SIGNAL_DETECTION_MODE = (process.env["SIGNAL_DETECTION_MODE"] ??
  "centralized") as "centralized" | "distributed";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeClassificationInput(params: {
  text: string;
  author: string;
  agentId: string;
  agentName: string;
  isReply: boolean;
  parentTweetSummary?: string;
  signalKeywords: string[];
}): ClassificationInput {
  return {
    text: params.text,
    author: params.author,
    agentId: params.agentId,
    agentName: params.agentName,
    isReply: params.isReply,
    signalKeywords: params.signalKeywords,
    source: "x",
    ...(params.parentTweetSummary
      ? { parentTweetSummary: params.parentTweetSummary }
      : {}),
  };
}

export async function main(): Promise<void> {
  const startTime = Date.now();
  console.log(`[updagent] Starting collection run at ${new Date().toISOString()}`);
  console.log(`[updagent] Mode: ${SIGNAL_DETECTION_MODE}, Since: ${SINCE_HOURS}h`);

  const agents = getEnabledAgents();
  console.log(`[updagent] Collecting for ${agents.length} enabled agents`);

  const existingItems = await readFeedJson(FEED_PATH);
  const existingHealth = await readHealthJson(HEALTH_PATH);
  const existingAccountHealth = new Map<string, AccountHealth>(
    (existingHealth?.accounts ?? []).map((account) => [account.account, account]),
  );

  const allNewItems: FeedItem[] = [];
  let globalTier1Failures = 0;
  let globalTier2Failures = 0;
  const allTierFailureAccounts: string[] = [];
  const updatedAccountHealth: AccountHealth[] = [];

  for (const agent of agents) {
    console.log(`[updagent] === Agent: ${agent.name} ===`);

    for (const handle of agent.xAccounts) {
      console.log(`[updagent] Fetching @${handle} for ${agent.name}`);

      const cascadeResult = await fetchXPostsForAccount({
        handle,
        sinceHours: SINCE_HOURS,
      });

      const prev = existingAccountHealth.get(handle);
      const tier1Failed =
        cascadeResult.tierUsed !== 1 && cascadeResult.failures.some((failure) => failure.tier === 1);
      const tier2Failed =
        cascadeResult.tierUsed !== 2 && cascadeResult.failures.some((failure) => failure.tier === 2);
      const allFailed = cascadeResult.tierUsed === null;

      if (tier1Failed) globalTier1Failures++;
      if (tier2Failed) globalTier2Failures++;
      if (allFailed) allTierFailureAccounts.push(handle);

      const consecutiveTier1Failures = tier1Failed
        ? (prev?.consecutiveTier1Failures ?? 0) + 1
        : 0;

      updatedAccountHealth.push({
        account: handle,
        consecutiveTier1Failures,
        lastSuccessfulTier: cascadeResult.tierUsed,
        lastSuccessAt:
          cascadeResult.tierUsed !== null
            ? new Date().toISOString()
            : (prev?.lastSuccessAt ?? null),
        lastCheckedAt: new Date().toISOString(),
      });

      if (cascadeResult.posts.length > 0) {
        const candidatePosts: typeof cascadeResult.posts = [];
        const resolvedResults: Array<{
          post: (typeof cascadeResult.posts)[number];
          classification: ClassificationResult;
        }> = [];

        for (const post of cascadeResult.posts) {
          const input = makeClassificationInput({
            text: post.text,
            author: post.author,
            agentId: agent.id,
            agentName: agent.name,
            isReply: post.isReply,
            ...(post.parentTweetText
              ? { parentTweetSummary: post.parentTweetText.slice(0, 120) }
              : {}),
            signalKeywords: agent.signalKeywords,
          });

          const fp = fastPath(input);
          if (fp.result === "SIGNAL" || fp.result === "NOISE") {
            resolvedResults.push({
              post,
              classification: {
                classification: fp.result,
                reason: fp.reason,
                classifiedBy: "fast-path",
              },
            });
          } else {
            candidatePosts.push(post);
          }
        }

        if (candidatePosts.length > 0) {
          const inputs = candidatePosts.map((post) =>
            makeClassificationInput({
              text: post.text,
              author: post.author,
              agentId: agent.id,
              agentName: agent.name,
              isReply: post.isReply,
              ...(post.parentTweetText
                ? { parentTweetSummary: post.parentTweetText.slice(0, 120) }
                : {}),
              signalKeywords: agent.signalKeywords,
            }),
          );

          const llmResults = await classifyBatch(inputs, SIGNAL_DETECTION_MODE);
          candidatePosts.forEach((post, index) => {
            const llm = llmResults[index];
            if (llm) {
              resolvedResults.push({ post, classification: llm });
            }
          });
        }

        for (const { post, classification } of resolvedResults) {
          if (classification.classification !== "NOISE") {
            allNewItems.push(normalizeXPost(post, agent.id, classification));
          }
        }
      }

      await sleep(RATE_LIMIT_DELAY_MS);
    }

    console.log(`[updagent] Fetching GitHub releases for ${agent.github.owner}/${agent.github.repo}`);
    try {
      const releases = await fetchGitHubReleases(agent.github.owner, agent.github.repo, 5);
      for (const release of releases) {
        allNewItems.push(normalizeGitHubRelease(release, agent.id));
      }
      console.log(`[updagent] GitHub: ${releases.length} releases for ${agent.name}`);
    } catch (error) {
      console.warn(`[updagent] GitHub collection failed for ${agent.name}: ${String(error)}`);
    }
  }

  const dedupedNew = dedupWithin(allNewItems);
  const trulyNew = dedup(dedupedNew, existingItems);
  console.log(
    `[updagent] New items after dedup: ${trulyNew.length} (${allNewItems.length} collected, ${dedupedNew.length} after internal dedup)`,
  );

  const merged = [...trulyNew, ...existingItems];
  await writeFeedJson(FEED_PATH, merged);
  await writeToRedis(merged);

  const credentialWarning = updatedAccountHealth.some(
    (account) => account.consecutiveTier1Failures >= 3,
  );

  const health: CollectionHealth = {
    lastRunAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    newItemCount: trulyNew.length,
    totalItemCount: merged.length,
    tier1FailureCount: globalTier1Failures,
    tier2FailureCount: globalTier2Failures,
    allTierFailureAccounts,
    credentialWarning,
    accounts: updatedAccountHealth,
  };

  await writeHealthJson(HEALTH_PATH, health);

  if (credentialWarning) {
    console.warn(
      "[updagent] ⚠️  CREDENTIAL WARNING: One or more accounts have had 3+ consecutive Tier 1 failures. Check X.com cookies (AUTH_TOKEN / CT0).",
    );
  }

  if (shouldGenerateNewsletter(trulyNew)) {
    const newsletterPath = await appendToNewsletter(trulyNew, NEWSLETTERS_DIR, health);
    console.log(`[updagent] Newsletter written: ${newsletterPath}`);
  } else {
    console.log("[updagent] No new SIGNAL items — skipping newsletter");
  }

  console.log(`[updagent] Done. ${trulyNew.length} new items, ${health.durationMs}ms`);
  process.exit(0);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath && import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error("[updagent] Fatal error:", error);
    process.exit(0);
  });
}
