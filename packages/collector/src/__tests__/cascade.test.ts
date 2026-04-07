import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RawXPost } from "@updagent/shared";

vi.mock("../sources/x-bird.js", () => ({
  fetchFromBirdSearch: vi.fn(),
  BirdSearchAuthError: class BirdSearchAuthError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "BirdSearchAuthError";
    }
  },
  BirdSearchParseError: class BirdSearchParseError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "BirdSearchParseError";
    }
  },
}));

vi.mock("../sources/x-scrapecreators.js", () => ({
  fetchFromScrapeCreators: vi.fn(),
  ScrapeCreatorsError: class ScrapeCreatorsError extends Error {
    constructor(
      message: string,
      public statusCode: number,
    ) {
      super(message);
      this.name = "ScrapeCreatorsError";
    }
  },
}));

vi.mock("../sources/x-xai.js", () => ({
  fetchFromXAI: vi.fn(),
  XAIError: class XAIError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "XAIError";
    }
  },
}));

const { fetchXPostsForAccount } = await import("../sources/x-cascade.js");
const { fetchFromBirdSearch, BirdSearchAuthError } = await import("../sources/x-bird.js");
const {
  fetchFromScrapeCreators,
  ScrapeCreatorsError,
} = await import("../sources/x-scrapecreators.js");
const { fetchFromXAI, XAIError } = await import("../sources/x-xai.js");

const mockBird = vi.mocked(fetchFromBirdSearch);
const mockScrape = vi.mocked(fetchFromScrapeCreators);
const mockXAI = vi.mocked(fetchFromXAI);

const SAMPLE_POST: RawXPost = {
  id: "123",
  url: "https://x.com/bcherny/status/123",
  text: "Claude Code v1.9.4 ships!",
  author: "bcherny",
  publishedAt: new Date().toISOString(),
  likes: 77,
  retweets: 12,
  views: 34000,
  isReply: false,
  tier: 1,
};

describe("fetchXPostsForAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns tier 1 results when tier 1 succeeds", async () => {
    mockBird.mockReturnValueOnce([SAMPLE_POST]);

    const result = await fetchXPostsForAccount({ handle: "bcherny", sinceHours: 6 });

    expect(result.tierUsed).toBe(1);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]?.text).toBe("Claude Code v1.9.4 ships!");
    expect(result.failures).toHaveLength(0);
    expect(mockScrape).not.toHaveBeenCalled();
    expect(mockXAI).not.toHaveBeenCalled();
  });

  it("returns empty posts with tierUsed=1 when tier 1 returns empty (account quiet)", async () => {
    mockBird.mockReturnValueOnce([]);

    const result = await fetchXPostsForAccount({ handle: "bcherny", sinceHours: 6 });

    expect(result.tierUsed).toBe(1);
    expect(result.posts).toHaveLength(0);
    expect(result.failures).toHaveLength(0);
    expect(mockScrape).not.toHaveBeenCalled();
  });

  it("falls to tier 2 when tier 1 throws BirdSearchAuthError", async () => {
    mockBird.mockImplementationOnce(() => {
      throw new BirdSearchAuthError("AUTH_TOKEN expired");
    });
    mockScrape.mockResolvedValueOnce([{ ...SAMPLE_POST, tier: 2 as const }]);

    const result = await fetchXPostsForAccount({ handle: "bcherny", sinceHours: 6 });

    expect(result.tierUsed).toBe(2);
    expect(result.posts).toHaveLength(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.tier).toBe(1);
    expect(result.failures[0]?.errorType).toBe("auth");
  });

  it("falls to tier 3 when tier 1 and tier 2 both fail", async () => {
    mockBird.mockImplementationOnce(() => {
      throw new BirdSearchAuthError("auth failed");
    });
    mockScrape.mockRejectedValueOnce(new ScrapeCreatorsError("API key invalid", 401));
    mockXAI.mockResolvedValueOnce([{ ...SAMPLE_POST, tier: 3 as const }]);

    const result = await fetchXPostsForAccount({ handle: "bcherny", sinceHours: 6 });

    expect(result.tierUsed).toBe(3);
    expect(result.posts).toHaveLength(1);
    expect(result.failures).toHaveLength(2);
  });

  it("returns tierUsed=null with empty posts when ALL tiers fail", async () => {
    mockBird.mockImplementationOnce(() => {
      throw new BirdSearchAuthError("auth failed");
    });
    mockScrape.mockRejectedValueOnce(new ScrapeCreatorsError("rate limited", 429));
    mockXAI.mockRejectedValueOnce(new XAIError("API key not set"));

    const result = await fetchXPostsForAccount({ handle: "bcherny", sinceHours: 6 });

    expect(result.tierUsed).toBeNull();
    expect(result.posts).toHaveLength(0);
    expect(result.failures).toHaveLength(3);
  });

  it("records failure details including errorType for each tier", async () => {
    mockBird.mockImplementationOnce(() => {
      throw new BirdSearchAuthError("auth failed");
    });
    mockScrape.mockRejectedValueOnce(new ScrapeCreatorsError("rate limited", 429));
    mockXAI.mockRejectedValueOnce(new XAIError("xai key not set"));

    const result = await fetchXPostsForAccount({ handle: "bcherny", sinceHours: 6 });

    const t1 = result.failures.find((failure) => failure.tier === 1);
    const t2 = result.failures.find((failure) => failure.tier === 2);
    const t3 = result.failures.find((failure) => failure.tier === 3);

    expect(t1?.errorType).toBe("auth");
    expect(t2?.errorType).toBe("rate-limit");
    expect(t3?.errorType).toBe("auth");
  });

  it("never throws — always returns CascadeResult", async () => {
    mockBird.mockImplementationOnce(() => {
      throw new Error("Unexpected ENOENT");
    });
    mockScrape.mockRejectedValueOnce(new Error("Network timeout"));
    mockXAI.mockRejectedValueOnce(new Error("DNS resolution failed"));

    await expect(
      fetchXPostsForAccount({ handle: "bcherny", sinceHours: 6 }),
    ).resolves.toBeDefined();
  });
});
