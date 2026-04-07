import { describe, it, expect } from "vitest";
import { normalizeXPost, normalizeGitHubRelease } from "../normalize.js";
import type {
  RawXPost,
  RawGitHubRelease,
  ClassificationResult,
} from "@updagent/shared";

const SIGNAL_RESULT: ClassificationResult = {
  classification: "SIGNAL",
  reason: "release announcement",
  classifiedBy: "fast-path",
};

const NOISE_RESULT: ClassificationResult = {
  classification: "NOISE",
  reason: "personal post",
  classifiedBy: "fast-path",
};

const RAW_POST: RawXPost = {
  id: "1234567890",
  url: "https://x.com/bcherny/status/1234567890",
  text: "Claude Code v1.9.4 ships today!",
  author: "bcherny",
  publishedAt: "2026-04-07T12:00:00Z",
  likes: 77,
  retweets: 12,
  views: 34000,
  isReply: false,
  tier: 1,
};

const RAW_RELEASE: RawGitHubRelease = {
  tagName: "v1.9.4",
  name: "Claude Code v1.9.4",
  body: "## What's New\n- Fix statusline on Windows",
  publishedAt: "2026-04-07T10:00:00Z",
  url: "https://github.com/anthropics/claude-code/releases/tag/v1.9.4",
  owner: "anthropics",
  repo: "claude-code",
  isDraft: false,
  isPrerelease: false,
};

describe("normalizeXPost", () => {
  it("produces a FeedItem with correct id (full URL)", () => {
    const item = normalizeXPost(RAW_POST, "claude-code", SIGNAL_RESULT);
    expect(item.id).toBe("https://x.com/bcherny/status/1234567890");
  });

  it("calculates engagementScore as likes*1 + retweets*3", () => {
    const item = normalizeXPost(RAW_POST, "claude-code", SIGNAL_RESULT);
    expect(item.engagementScore).toBe(77 * 1 + 12 * 3);
  });

  it("extracts version from semver in text", () => {
    const item = normalizeXPost(RAW_POST, "claude-code", SIGNAL_RESULT);
    expect(item.version).toBe("1.9.4");
  });

  it("strips leading v from extracted version", () => {
    const post: RawXPost = { ...RAW_POST, text: "ships v2.0.0 today" };
    const item = normalizeXPost(post, "claude-code", SIGNAL_RESULT);
    expect(item.version).toBe("2.0.0");
  });

  it("sets isRelease=true when SIGNAL + version detected", () => {
    const item = normalizeXPost(RAW_POST, "claude-code", SIGNAL_RESULT);
    expect(item.isRelease).toBe(true);
  });

  it("sets isRelease=false for NOISE items even with semver in text", () => {
    const item = normalizeXPost(RAW_POST, "claude-code", NOISE_RESULT);
    expect(item.isRelease).toBe(false);
  });

  it("preserves source=x and agentId", () => {
    const item = normalizeXPost(RAW_POST, "claude-code", SIGNAL_RESULT);
    expect(item.source).toBe("x");
    expect(item.agentId).toBe("claude-code");
  });

  it("propagates classification and classifiedBy", () => {
    const llmResult: ClassificationResult = {
      classification: "CONTEXT",
      reason: "comparison post",
      classifiedBy: "llm",
      model: "google/gemini-flash-1.5",
    };
    const item = normalizeXPost(RAW_POST, "claude-code", llmResult);
    expect(item.classification).toBe("CONTEXT");
    expect(item.classifiedBy).toBe("llm");
    expect(item.classificationModel).toBe("google/gemini-flash-1.5");
  });
});

describe("normalizeGitHubRelease", () => {
  it("produces id as owner/repo@tagName", () => {
    const item = normalizeGitHubRelease(RAW_RELEASE, "claude-code");
    expect(item.id).toBe("anthropics/claude-code@v1.9.4");
  });

  it("always produces classification=SIGNAL", () => {
    const item = normalizeGitHubRelease(RAW_RELEASE, "claude-code");
    expect(item.classification).toBe("SIGNAL");
  });

  it("always produces isRelease=true", () => {
    const item = normalizeGitHubRelease(RAW_RELEASE, "claude-code");
    expect(item.isRelease).toBe(true);
  });

  it("extracts version without leading v", () => {
    const item = normalizeGitHubRelease(RAW_RELEASE, "claude-code");
    expect(item.version).toBe("1.9.4");
  });

  it("sets engagementScore=0", () => {
    const item = normalizeGitHubRelease(RAW_RELEASE, "claude-code");
    expect(item.engagementScore).toBe(0);
  });

  it("sets source=github", () => {
    const item = normalizeGitHubRelease(RAW_RELEASE, "claude-code");
    expect(item.source).toBe("github");
  });

  it("sets author to owner/repo", () => {
    const item = normalizeGitHubRelease(RAW_RELEASE, "claude-code");
    expect(item.author).toBe("anthropics/claude-code");
  });
});

describe("dedup", () => {
  it("removes items whose IDs already exist in existing set", async () => {
    const { dedup } = await import("../dedup.js");
    const existing = [normalizeGitHubRelease(RAW_RELEASE, "claude-code")];
    const newItems = [
      normalizeGitHubRelease(RAW_RELEASE, "claude-code"),
      normalizeXPost(RAW_POST, "claude-code", SIGNAL_RESULT),
    ];

    const result = dedup(newItems, existing);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(RAW_POST.url);
  });

  it("returns all items when no duplicates", async () => {
    const { dedup } = await import("../dedup.js");
    const result = dedup([normalizeXPost(RAW_POST, "claude-code", SIGNAL_RESULT)], []);
    expect(result).toHaveLength(1);
  });

  it("returns empty array when all items are duplicates", async () => {
    const { dedup } = await import("../dedup.js");
    const item = normalizeGitHubRelease(RAW_RELEASE, "claude-code");
    const result = dedup([item], [item]);
    expect(result).toHaveLength(0);
  });
});
