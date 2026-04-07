import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { FeedItem, FeedFile, CollectionHealth } from "@updagent/shared";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function readFeedJson(filePath: string): Promise<FeedItem[]> {
  try {
    const content = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(content) as FeedFile;
    return parsed.items ?? [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function writeFeedJson(
  filePath: string,
  items: FeedItem[],
): Promise<void> {
  const cutoff = Date.now() - THIRTY_DAYS_MS;

  const pruned = items
    .filter((item) => new Date(item.publishedAt).getTime() >= cutoff)
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );

  const feedFile: FeedFile = {
    version: "1",
    updatedAt: new Date().toISOString(),
    itemCount: pruned.length,
    items: pruned,
  };

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(feedFile, null, 2) + "\n", "utf-8");
}

export async function readHealthJson(
  filePath: string,
): Promise<CollectionHealth | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as CollectionHealth;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeHealthJson(
  filePath: string,
  health: CollectionHealth,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(health, null, 2) + "\n", "utf-8");
}

export function isRedisConfigured(): boolean {
  return Boolean(
    process.env["UPSTASH_REDIS_REST_URL"] &&
      process.env["UPSTASH_REDIS_REST_TOKEN"],
  );
}

export async function writeToRedis(items: FeedItem[]): Promise<void> {
  if (!isRedisConfigured()) {
    return;
  }

  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];

  if (!url || !token) {
    return;
  }

  try {
    const { Redis } = await import("@upstash/redis");
    const redis =
      typeof Redis.fromEnv === "function"
        ? Redis.fromEnv()
        : new Redis({ url, token });

    for (const item of items) {
      const key = `feed:${item.agentId}:${encodeURIComponent(item.id)}`;
      await redis.set(key, JSON.stringify(item), { ex: 48 * 60 * 60 });
    }

    const signalItems = items.filter((item) => item.classification === "SIGNAL");
    if (signalItems.length > 0) {
      await redis.set("feed:lastUpdated", new Date().toISOString(), {
        ex: 48 * 60 * 60,
      });
    }

    console.log(`[updagent] Redis: wrote ${items.length} items`);
  } catch (error) {
    console.warn(`[updagent] Redis write failed (non-fatal): ${String(error)}`);
  }
}
