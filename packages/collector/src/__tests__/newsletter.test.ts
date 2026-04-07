import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  generateNewsletterContent,
  shouldGenerateNewsletter,
  appendToNewsletter,
} from "../newsletter.js";
import type { FeedItem } from "@updagent/shared";

const TMP = join(tmpdir(), `updagent-newsletter-test-${process.pid}`);

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: `https://x.com/bcherny/status/${Math.random()}`,
    source: "x",
    agentId: "claude-code",
    author: "bcherny",
    text: "Claude Code ships new hooks feature",
    url: "https://x.com/bcherny/status/123",
    publishedAt: "2026-04-07T12:00:00Z",
    collectedAt: new Date().toISOString(),
    classification: "SIGNAL",
    classificationReason: "release announcement",
    classifiedBy: "fast-path",
    isRelease: false,
    engagementScore: 100,
    likes: 77,
    retweets: 12,
    isReply: false,
    ...overrides,
  };
}

describe("generateNewsletterContent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T15:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("includes agent section headers for agents with signals", () => {
    const content = generateNewsletterContent(
      [makeItem({ agentId: "claude-code" })],
      "2026-04-07",
      "07 Apr 2026 15:00",
      false,
    );
    expect(content).toContain("## Claude Code");
  });

  it("uses configured agent names instead of deriving them from ids", () => {
    const content = generateNewsletterContent(
      [makeItem({ agentId: "codex" })],
      "2026-04-07",
      "07 Apr 2026 15:00",
      false,
    );
    expect(content).toContain("## Codex CLI");
    expect(content).not.toContain("## Codex\n");
  });

  it("orders agent sections using registry order", () => {
    const content = generateNewsletterContent(
      [
        makeItem({ agentId: "codex", author: "openaidevs" }),
        makeItem({ agentId: "claude-code", author: "bcherny" }),
      ],
      "2026-04-07",
      "07 Apr 2026 15:00",
      false,
    );
    expect(content.indexOf("## Claude Code")).toBeLessThan(
      content.indexOf("## Codex CLI"),
    );
  });

  it("lists GitHub releases before X posts within an agent section", () => {
    const xPost = makeItem({ source: "x", publishedAt: "2026-04-07T14:00:00Z" });
    const ghRelease = makeItem({ source: "github", publishedAt: "2026-04-07T10:00:00Z" });
    const content = generateNewsletterContent(
      [xPost, ghRelease],
      "2026-04-07",
      "07 Apr 2026 15:00",
      false,
    );
    const ghPos = content.indexOf("### 🚀 Releases");
    const xPos = content.indexOf("### 📡 Team Signals");
    expect(ghPos).toBeLessThan(xPos);
  });

  it("excludes NOISE and CONTEXT items", () => {
    const noise = makeItem({ classification: "NOISE", text: "Personal travel post" });
    const context = makeItem({ classification: "CONTEXT", text: "Industry analysis" });
    const signal = makeItem({ classification: "SIGNAL", text: "Ships new feature!" });
    const content = generateNewsletterContent(
      [noise, context, signal],
      "2026-04-07",
      "07 Apr 2026 15:00",
      false,
    );
    expect(content).not.toContain("Personal travel post");
    expect(content).not.toContain("Industry analysis");
    expect(content).toContain("Ships new feature!");
  });

  it("shows 'No new signals' when all items are NOISE", () => {
    const content = generateNewsletterContent(
      [makeItem({ classification: "NOISE" })],
      "2026-04-07",
      "07 Apr 2026 15:00",
      false,
    );
    expect(content).not.toContain("## Claude Code");
    expect(content).toContain("0 new signals");
  });

  it("shows credential warning when health.credentialWarning is true", () => {
    const content = generateNewsletterContent(
      [makeItem()],
      "2026-04-07",
      "07 Apr 2026 15:00",
      true,
    );
    expect(content).toContain("X data may be incomplete");
  });

  it("includes relative-time summaries for releases and team signals", () => {
    const xPost = makeItem({ publishedAt: "2026-04-07T14:00:00Z" });
    const ghRelease = makeItem({
      source: "github",
      publishedAt: "2026-04-07T12:00:00Z",
      version: "1.9.4",
      author: "anthropics/claude-code",
    });
    const content = generateNewsletterContent(
      [xPost, ghRelease],
      "2026-04-07",
      "07 Apr 2026 15:00",
      false,
    );
    expect(content).toContain("1h ago");
    expect(content).toContain("3h ago");
  });
});

describe("shouldGenerateNewsletter", () => {
  it("returns true when at least one SIGNAL item", () => {
    expect(shouldGenerateNewsletter([makeItem({ classification: "SIGNAL" })])).toBe(true);
  });

  it("returns false when only NOISE items", () => {
    expect(shouldGenerateNewsletter([makeItem({ classification: "NOISE" })])).toBe(false);
  });

  it("returns false when only CONTEXT items", () => {
    expect(shouldGenerateNewsletter([makeItem({ classification: "CONTEXT" })])).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(shouldGenerateNewsletter([])).toBe(false);
  });
});

describe("appendToNewsletter", () => {
  beforeEach(() => mkdir(TMP, { recursive: true }));
  afterEach(() => rm(TMP, { recursive: true, force: true }));

  it("creates a new file when it does not exist", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T15:00:00Z"));
    const path = await appendToNewsletter([makeItem()], TMP, null);
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(path, "utf-8");
    expect(content).toContain("updagent Newsletter — 2026-04-07");
    vi.useRealTimers();
  });

  it("appends with separator when file already exists", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T15:00:00Z"));
    await appendToNewsletter([makeItem()], TMP, null);
    await appendToNewsletter([makeItem()], TMP, null);

    const { readFile } = await import("node:fs/promises");
    const content = await readFile(join(TMP, "2026-04-07.md"), "utf-8");
    const occurrences = content.split("updagent Newsletter").length - 1;
    expect(occurrences).toBe(2);
    expect(content).toContain("---");
    vi.useRealTimers();
  });

  it("returns the file path that was written", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T15:00:00Z"));
    const path = await appendToNewsletter([makeItem()], TMP, null);
    expect(path).toContain("2026-04-07.md");
    vi.useRealTimers();
  });
});
