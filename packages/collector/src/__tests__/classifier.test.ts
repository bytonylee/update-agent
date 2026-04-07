import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ClassificationInput } from "@updagent/shared";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const spawnSyncMock = vi.fn();
vi.mock("node:child_process", () => ({
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}));

const { classifyBatch } = await import("../signal/classifier.js");

const CC_KEYWORDS = ["claude code", "claude update", "mcp server"];

function makeInput(text: string, isReply = false): ClassificationInput {
  return {
    text,
    author: "bcherny",
    agentId: "claude-code",
    agentName: "Claude Code",
    isReply,
    signalKeywords: CC_KEYWORDS,
    source: "x",
  };
}

function mockOpenRouterSuccess(
  results: Array<{ index: number; classification: string; reason: string }>,
) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify(results),
          },
        },
      ],
    }),
  } as Response);
}

function mockOpenRouterFailure(status = 500) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({ error: "Internal server error" }),
  } as Response);
}

describe("classifyBatch — centralized mode", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env["OPENROUTER_API_KEY"] = "test-key";
    delete process.env["SIGNAL_DETECTION_MODE"];
  });

  it("classifies a batch using OpenRouter response", async () => {
    const inputs = [
      makeInput("This was fixed in yesterday's release. claude update to get latest", true),
      makeInput("Just landed in Tokyo! Coffee recommendations?"),
    ];

    mockOpenRouterSuccess([
      { index: 0, classification: "SIGNAL", reason: "fix confirmation reply" },
      { index: 1, classification: "NOISE", reason: "personal travel post" },
    ]);

    const results = await classifyBatch(inputs, "centralized");

    expect(results).toHaveLength(2);
    expect(results[0]?.classification).toBe("SIGNAL");
    expect(results[1]?.classification).toBe("NOISE");
    expect(results[0]?.classifiedBy).toBe("llm");
  });

  it("returns CONTEXT for all when OpenRouter API key is missing", async () => {
    delete process.env["OPENROUTER_API_KEY"];
    const inputs = [makeInput("Some post text here"), makeInput("Another post")];

    const results = await classifyBatch(inputs, "centralized");

    expect(results).toHaveLength(2);
    results.forEach((result) => {
      expect(result.classification).toBe("CONTEXT");
      expect(result.classifiedBy).toBe("llm");
    });
  });

  it("falls back to CONTEXT for all when all 3 models fail", async () => {
    mockOpenRouterFailure(500);
    mockOpenRouterFailure(500);
    mockOpenRouterFailure(500);

    const results = await classifyBatch([makeInput("Some content")], "centralized");
    expect(results[0]?.classification).toBe("CONTEXT");
  });

  it("handles malformed JSON response gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "I cannot classify this content" } }],
      }),
    } as Response);
    mockOpenRouterSuccess([
      { index: 0, classification: "NOISE", reason: "personal post" },
    ]);

    const results = await classifyBatch([makeInput("Random content")], "centralized");
    expect(results[0]?.classification).toMatch(/SIGNAL|CONTEXT|NOISE/);
  });

  it("handles empty input array", async () => {
    const results = await classifyBatch([], "centralized");
    expect(results).toHaveLength(0);
  });

  it("batches inputs in groups of 10", async () => {
    const inputs = Array.from({ length: 12 }, (_, index) =>
      makeInput(`Post number ${index} with some content about claude code`),
    );

    mockOpenRouterSuccess(
      Array.from({ length: 10 }, (_, index) => ({
        index,
        classification: "NOISE",
        reason: "test",
      })),
    );
    mockOpenRouterSuccess([
      { index: 0, classification: "NOISE", reason: "test" },
      { index: 1, classification: "NOISE", reason: "test" },
    ]);

    const results = await classifyBatch(inputs, "centralized");
    expect(results).toHaveLength(12);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("classifyBatch — distributed mode", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env["OPENROUTER_API_KEY"];
  });

  afterEach(() => {
    delete process.env["UPDAGENT_LOCAL_AGENT"];
  });

  it("uses claude -p when claude is selected", async () => {
    process.env["UPDAGENT_LOCAL_AGENT"] = "claude";
    spawnSyncMock.mockReturnValueOnce({
      status: 0,
      stdout: '{"classification":"SIGNAL","reason":"official fix"}',
    });

    const [result] = await classifyBatch([makeInput("Fixed in latest release")], "distributed");
    expect(result?.classification).toBe("SIGNAL");
    expect(spawnSyncMock).toHaveBeenCalledWith(
      "claude",
      ["-p", expect.stringContaining("Classify this social media post")],
      expect.objectContaining({ encoding: "utf-8", timeout: 30000 }),
    );
  });

  it("uses codex run when codex is selected", async () => {
    process.env["UPDAGENT_LOCAL_AGENT"] = "codex";
    spawnSyncMock.mockReturnValueOnce({
      status: 0,
      stdout: '{"classification":"CONTEXT","reason":"analysis"}',
    });

    const [result] = await classifyBatch([makeInput("Roadmap thoughts")], "distributed");
    expect(result?.classification).toBe("CONTEXT");
    expect(spawnSyncMock).toHaveBeenCalledWith(
      "codex",
      ["run", expect.stringContaining("Classify this social media post")],
      expect.objectContaining({ encoding: "utf-8", timeout: 30000 }),
    );
  });
});

describe("classifyBatch — fixture accuracy gate", () => {
  it("combined fast-path + mock LLM classifies ≥80% of all fixtures correctly", async () => {
    const { fixtures } = await import("./signal-fixtures.js");
    const { fastPath } = await import("../signal/rules.js");

    let fetchCallIndex = 0;
    const llmFixtures = fixtures.filter((fixture) => !fixture.fastPathDeterministic);

    mockFetch.mockImplementation(async () => {
      const fixture = llmFixtures[fetchCallIndex];
      fetchCallIndex++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(
                  fixture
                    ? [
                        {
                          index: 0,
                          classification: fixture.expected,
                          reason: `expected for test fixture ${fixture.id}`,
                        },
                      ]
                    : [],
                ),
              },
            },
          ],
        }),
      } as Response;
    });

    process.env["OPENROUTER_API_KEY"] = "test-key";

    let correct = 0;
    let total = 0;

    for (const fixture of fixtures) {
      const fpResult = fastPath(fixture.input);
      if (fpResult.result === "SIGNAL" || fpResult.result === "NOISE") {
        if (fpResult.result === fixture.expected) correct++;
        total++;
      } else {
        const [result] = await classifyBatch([fixture.input], "centralized");
        if (result?.classification === fixture.expected) correct++;
        total++;
      }
    }

    expect(correct / total).toBeGreaterThanOrEqual(0.8);
  });
});
