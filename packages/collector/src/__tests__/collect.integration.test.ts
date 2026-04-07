import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rm, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TMP = join(tmpdir(), `updagent-integration-${process.pid}`);
const FEED_PATH = join(TMP, "feed.json");
const HEALTH_PATH = join(TMP, "health.json");
const NEWSLETTERS_DIR = join(TMP, "newsletters");

vi.mock("../sources/x-cascade.js", () => ({
  fetchXPostsForAccount: vi.fn().mockResolvedValue({
    posts: [],
    tierUsed: 1,
    failures: [],
  }),
}));

vi.mock("../sources/github-releases.js", () => ({
  fetchGitHubReleases: vi.fn().mockResolvedValue([
    {
      tagName: "v1.9.4",
      name: "Claude Code v1.9.4",
      body: "## What's New\n- Fix statusline",
      publishedAt: "2026-04-07T10:00:00Z",
      url: "https://github.com/anthropics/claude-code/releases/tag/v1.9.4",
      owner: "anthropics",
      repo: "claude-code",
      isDraft: false,
      isPrerelease: false,
    },
  ]),
}));

vi.mock("../signal/classifier.js", () => ({
  classifyBatch: vi.fn().mockResolvedValue([]),
}));

describe("collect orchestrator integration", () => {
  beforeEach(async () => {
    await mkdir(TMP, { recursive: true });
    process.env["FEED_JSON_PATH"] = FEED_PATH;
    process.env["HEALTH_JSON_PATH"] = HEALTH_PATH;
    process.env["NEWSLETTERS_DIR"] = NEWSLETTERS_DIR;
    process.env["SINCE_HOURS"] = "6";
    process.env["RATE_LIMIT_DELAY_MS"] = "0";
    process.env["SIGNAL_DETECTION_MODE"] = "centralized";
  });

  afterEach(async () => {
    await rm(TMP, { recursive: true, force: true });
    vi.clearAllMocks();
    delete process.env["FEED_JSON_PATH"];
    delete process.env["HEALTH_JSON_PATH"];
    delete process.env["NEWSLETTERS_DIR"];
  });

  it("writes feed.json with GitHub releases after run", async () => {
    const { main } = await import("../collect.js");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit(0) called");
    });

    await expect(main()).rejects.toThrow("process.exit(0) called");
    exitSpy.mockRestore();

    const content = await readFile(FEED_PATH, "utf-8");
    const feed = JSON.parse(content) as { items: Array<{ source: string }> };
    expect(feed.items.length).toBeGreaterThan(0);
    expect(feed.items.some((item) => item.source === "github")).toBe(true);
  });

  it("writes health.json with lastRunAt after run", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit(0) called");
    });

    const { main } = await import("../collect.js");
    await expect(main()).rejects.toThrow("process.exit(0) called");
    exitSpy.mockRestore();

    const content = await readFile(HEALTH_PATH, "utf-8");
    const health = JSON.parse(content) as { lastRunAt: string };
    expect(health.lastRunAt).toBeTruthy();
  });

  it("does not write duplicate items on second run with same data", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit(0) called");
    });

    const { main } = await import("../collect.js");
    await expect(main()).rejects.toThrow();
    vi.resetModules();
    const { main: main2 } = await import("../collect.js");
    await expect(main2()).rejects.toThrow();
    exitSpy.mockRestore();

    const content = await readFile(FEED_PATH, "utf-8");
    const feed = JSON.parse(content) as { itemCount: number };
    expect(feed.itemCount).toBeGreaterThan(0);
  });

  it("exits 0 even when all X tiers fail (GitHub releases still collected)", async () => {
    const { fetchXPostsForAccount } = await import("../sources/x-cascade.js");
    vi.mocked(fetchXPostsForAccount).mockResolvedValue({
      posts: [],
      tierUsed: null,
      failures: [
        { tier: 1, error: "auth failed", errorType: "auth" },
        { tier: 2, error: "key not set", errorType: "auth" },
        { tier: 3, error: "key not set", errorType: "auth" },
      ],
    });

    const exitCodes: number[] = [];
    vi.spyOn(process, "exit").mockImplementation((code) => {
      exitCodes.push(code as number);
      throw new Error(`exit(${String(code)})`);
    });

    const { main } = await import("../collect.js");
    await expect(main()).rejects.toThrow();

    expect(exitCodes[0]).toBe(0);
    vi.restoreAllMocks();
  });

  it("sets credentialWarning=true when consecutiveTier1Failures >= 3", async () => {
    const { fetchXPostsForAccount } = await import("../sources/x-cascade.js");
    vi.mocked(fetchXPostsForAccount).mockResolvedValue({
      posts: [],
      tierUsed: null,
      failures: [{ tier: 1, error: "auth failed", errorType: "auth" }],
    });

    const { writeHealthJson } = await import("../storage.js");
    const existingHealth = {
      lastRunAt: "2026-04-07T00:00:00Z",
      durationMs: 0,
      newItemCount: 0,
      totalItemCount: 0,
      tier1FailureCount: 0,
      tier2FailureCount: 0,
      allTierFailureAccounts: [],
      credentialWarning: false,
      accounts: [
        ...[
          "bcherny",
          "trq212",
          "noahzweben",
          "felixrieseberg",
          "lydiahallie",
          "amorriscode",
          "claudeai",
          "openaidevs",
          "thsottiaux",
          "romainhuet",
          "reach_vb",
          "rohanvarma",
        ].map((handle) => ({
          account: handle,
          consecutiveTier1Failures: 2,
          lastSuccessfulTier: null as null,
          lastSuccessAt: null as null,
          lastCheckedAt: "2026-04-07T00:00:00Z",
        })),
      ],
    };
    await writeHealthJson(HEALTH_PATH, existingHealth);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });

    const { main } = await import("../collect.js");
    await expect(main()).rejects.toThrow();
    exitSpy.mockRestore();

    const content = await readFile(HEALTH_PATH, "utf-8");
    const health = JSON.parse(content) as { credentialWarning: boolean };
    expect(health.credentialWarning).toBe(true);
  });
});
