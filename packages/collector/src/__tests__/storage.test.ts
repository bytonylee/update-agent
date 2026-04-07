import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rm, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readFeedJson,
  writeFeedJson,
  readHealthJson,
  writeHealthJson,
  isRedisConfigured,
  writeToRedis,
} from "../storage.js";
import type { FeedItem, CollectionHealth } from "@updagent/shared";

const TMP = join(tmpdir(), `updagent-test-${process.pid}`);

function makeFeedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: `https://x.com/bcherny/status/${Math.random()}`,
    source: "x",
    agentId: "claude-code",
    author: "bcherny",
    text: "Test item",
    url: `https://x.com/bcherny/status/${Math.random()}`,
    publishedAt: new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    classification: "SIGNAL",
    classificationReason: "test",
    classifiedBy: "fast-path",
    isRelease: false,
    engagementScore: 0,
    isReply: false,
    ...overrides,
  };
}

function makeHealth(): CollectionHealth {
  return {
    lastRunAt: new Date().toISOString(),
    durationMs: 1234,
    newItemCount: 5,
    totalItemCount: 100,
    tier1FailureCount: 0,
    tier2FailureCount: 0,
    allTierFailureAccounts: [],
    credentialWarning: false,
    accounts: [],
  };
}

describe("feed.json storage", () => {
  beforeEach(() => mkdir(TMP, { recursive: true }));
  afterEach(() => rm(TMP, { recursive: true, force: true }));

  it("readFeedJson returns [] for non-existent file", async () => {
    const items = await readFeedJson(join(TMP, "nonexistent.json"));
    expect(items).toEqual([]);
  });

  it("writeFeedJson + readFeedJson round-trip preserves all fields", async () => {
    const item = makeFeedItem({ text: "Hello world", version: "1.9.4" });
    const path = join(TMP, "feed.json");

    await writeFeedJson(path, [item]);
    const restored = await readFeedJson(path);

    expect(restored).toHaveLength(1);
    expect(restored[0]?.id).toBe(item.id);
    expect(restored[0]?.text).toBe("Hello world");
    expect(restored[0]?.version).toBe("1.9.4");
  });

  it("writeFeedJson sorts items by publishedAt DESC", async () => {
    const old = makeFeedItem({ publishedAt: "2026-04-01T00:00:00Z" });
    const newer = makeFeedItem({ publishedAt: "2026-04-07T00:00:00Z" });
    const path = join(TMP, "feed.json");

    await writeFeedJson(path, [old, newer]);
    const items = await readFeedJson(path);

    expect(items[0]?.publishedAt).toBe("2026-04-07T00:00:00Z");
    expect(items[1]?.publishedAt).toBe("2026-04-01T00:00:00Z");
  });

  it("writeFeedJson prunes items older than 30 days", async () => {
    const now = Date.now();
    const fresh = makeFeedItem({ publishedAt: new Date(now).toISOString() });
    const old = makeFeedItem({
      publishedAt: new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const path = join(TMP, "feed.json");

    await writeFeedJson(path, [fresh, old]);
    const items = await readFeedJson(path);

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(fresh.id);
  });

  it("written file includes version, updatedAt, itemCount metadata", async () => {
    const item = makeFeedItem();
    const path = join(TMP, "feed.json");
    await writeFeedJson(path, [item]);

    const raw = JSON.parse(await readFile(path, "utf-8")) as {
      version: string;
      updatedAt: string;
      itemCount: number;
    };

    expect(raw.version).toBe("1");
    expect(raw.updatedAt).toBeTruthy();
    expect(raw.itemCount).toBe(1);
  });
});

describe("health.json storage", () => {
  beforeEach(() => mkdir(TMP, { recursive: true }));
  afterEach(() => rm(TMP, { recursive: true, force: true }));

  it("readHealthJson returns null for non-existent file", async () => {
    const health = await readHealthJson(join(TMP, "nonexistent.json"));
    expect(health).toBeNull();
  });

  it("writeHealthJson + readHealthJson round-trip preserves all fields", async () => {
    const health = makeHealth();
    const path = join(TMP, "health.json");

    await writeHealthJson(path, health);
    const restored = await readHealthJson(path);

    expect(restored?.lastRunAt).toBe(health.lastRunAt);
    expect(restored?.durationMs).toBe(1234);
    expect(restored?.credentialWarning).toBe(false);
  });
});

describe("isRedisConfigured", () => {
  afterEach(() => {
    delete process.env["UPSTASH_REDIS_REST_URL"];
    delete process.env["UPSTASH_REDIS_REST_TOKEN"];
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns false when redis env vars are not set", () => {
    delete process.env["UPSTASH_REDIS_REST_URL"];
    delete process.env["UPSTASH_REDIS_REST_TOKEN"];
    expect(isRedisConfigured()).toBe(false);
  });

  it("returns false when only URL is set", () => {
    process.env["UPSTASH_REDIS_REST_URL"] = "https://example.upstash.io";
    expect(isRedisConfigured()).toBe(false);
  });

  it("returns true when both URL and token are set", () => {
    process.env["UPSTASH_REDIS_REST_URL"] = "https://example.upstash.io";
    process.env["UPSTASH_REDIS_REST_TOKEN"] = "token";
    expect(isRedisConfigured()).toBe(true);
  });

  it("writeToRedis does not throw when Redis is unconfigured", async () => {
    delete process.env["UPSTASH_REDIS_REST_URL"];
    delete process.env["UPSTASH_REDIS_REST_TOKEN"];
    await expect(writeToRedis([makeFeedItem()])).resolves.toBeUndefined();
  });

  it("writeToRedis writes per-item keys and lastUpdated when configured", async () => {
    process.env["UPSTASH_REDIS_REST_URL"] = "https://example.upstash.io";
    process.env["UPSTASH_REDIS_REST_TOKEN"] = "token";

    const set = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@upstash/redis", () => ({
      Redis: {
        fromEnv: () => ({ set }),
      },
    }));

    const signal = makeFeedItem({
      id: "https://x.com/bcherny/status/123",
      classification: "SIGNAL",
    });
    const context = makeFeedItem({
      id: "https://x.com/bcherny/status/456",
      classification: "CONTEXT",
    });

    await writeToRedis([signal, context]);

    expect(set).toHaveBeenCalledWith(
      "feed:claude-code:https%3A%2F%2Fx.com%2Fbcherny%2Fstatus%2F123",
      JSON.stringify(signal),
      { ex: 48 * 60 * 60 },
    );
    expect(set).toHaveBeenCalledWith(
      "feed:claude-code:https%3A%2F%2Fx.com%2Fbcherny%2Fstatus%2F456",
      JSON.stringify(context),
      { ex: 48 * 60 * 60 },
    );
    expect(set).toHaveBeenCalledWith(
      "feed:lastUpdated",
      expect.any(String),
      { ex: 48 * 60 * 60 },
    );
  });
});
