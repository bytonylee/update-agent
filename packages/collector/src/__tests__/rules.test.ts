import { describe, it, expect } from "vitest";
import { fastPath } from "../signal/rules.js";
import { fixtures, fastPathFixtures } from "./signal-fixtures.js";
import type { ClassificationInput } from "@updagent/shared";

const CC_KEYWORDS = [
  "claude code",
  "claude update",
  "anthropic cli",
  "claude cli",
  "claude --version",
  "mcp server",
  "claude hooks",
];

function makeInput(
  overrides: Partial<ClassificationInput> & { text: string },
): ClassificationInput {
  return {
    author: "bcherny",
    agentId: "claude-code",
    agentName: "Claude Code",
    isReply: false,
    signalKeywords: CC_KEYWORDS,
    source: "x",
    ...overrides,
  };
}

describe("fastPath — Rule 1: GitHub releases", () => {
  it("returns SIGNAL for github source regardless of text", () => {
    const result = fastPath(makeInput({ text: "lol", source: "github" }));
    expect(result.result).toBe("SIGNAL");
    expect("reason" in result && result.reason).toContain("GitHub");
  });

  it("returns SIGNAL for github source even with empty text", () => {
    const result = fastPath(makeInput({ text: "", source: "github" }));
    expect(result.result).toBe("SIGNAL");
  });
});

describe("fastPath — Rule 2: semver in text", () => {
  it("returns SIGNAL when text contains vX.Y.Z", () => {
    const result = fastPath(makeInput({ text: "Claude Code v1.9.4 is out!" }));
    expect(result.result).toBe("SIGNAL");
  });

  it("returns SIGNAL when text contains X.Y.Z without v prefix", () => {
    const result = fastPath(makeInput({ text: "codex 0.1.5 ships today" }));
    expect(result.result).toBe("SIGNAL");
  });

  it("returns SIGNAL for semver in a reply", () => {
    const result = fastPath(
      makeInput({
        text: "Fixed in v1.9.3. Run claude update.",
        isReply: true,
      }),
    );
    expect(result.result).toBe("SIGNAL");
  });
});

describe("fastPath — Rule 3: replies from tracked accounts", () => {
  it("returns CANDIDATE (not NOISE) for replies", () => {
    const result = fastPath(
      makeInput({
        text: "This was fixed in yesterday's release. `claude update` to get latest",
        isReply: true,
      }),
    );
    expect(result.result).not.toBe("NOISE");
    expect(result.result).toBe("CANDIDATE");
  });

  it("returns CANDIDATE for reply with no keywords", () => {
    const result = fastPath(
      makeInput({
        text: "Yes, that's by design — the behavior is intentional",
        isReply: true,
      }),
    );
    expect(result.result).toBe("CANDIDATE");
  });
});

describe("fastPath — Rule 4: too short", () => {
  it("returns NOISE for text < 15 characters", () => {
    const result = fastPath(makeInput({ text: "lol" }));
    expect(result.result).toBe("NOISE");
  });

  it("returns NOISE for single emoji", () => {
    const result = fastPath(makeInput({ text: "😂" }));
    expect(result.result).toBe("NOISE");
  });

  it("does NOT return NOISE for text exactly 15 chars", () => {
    const result = fastPath(makeInput({ text: "123456789012345" }));
    expect(result.result).not.toBe("NOISE");
  });
});

describe("fastPath — Rule 5: social filler", () => {
  it("returns NOISE for 'thanks'", () => {
    const result = fastPath(makeInput({ text: "Thanks! 🙏" }));
    expect(result.result).toBe("NOISE");
  });

  it("returns NOISE for 'lol' with punctuation", () => {
    const result = fastPath(makeInput({ text: "lol!" }));
    expect(result.result).toBe("NOISE");
  });
});

describe("fastPath — Rule 6: keyword + action word", () => {
  it("returns SIGNAL for 'claude code ships'", () => {
    const result = fastPath(makeInput({ text: "Claude Code ships hooks today!" }));
    expect(result.result).toBe("SIGNAL");
    expect("reason" in result && result.reason).toContain("action word");
  });

  it("returns SIGNAL for keyword + 'fixed'", () => {
    const result = fastPath(makeInput({ text: "claude code fixed the permissions bug" }));
    expect(result.result).toBe("SIGNAL");
  });

  it("returns SIGNAL for keyword + 'breaking'", () => {
    const result = fastPath(makeInput({ text: "breaking change in claude hooks — action required" }));
    expect(result.result).toBe("SIGNAL");
  });
});

describe("fastPath — Rule 7: keyword alone", () => {
  it("returns CANDIDATE when keyword present but no action word", () => {
    const result = fastPath(
      makeInput({ text: "Really enjoying claude code lately, it's so smooth" }),
    );
    expect(result.result).toBe("CANDIDATE");
  });
});

describe("fastPath — Rule 8: action word without keyword", () => {
  it("returns CANDIDATE for action word without keyword", () => {
    const result = fastPath(
      makeInput({ text: "Just shipped something really exciting, can't wait to share" }),
    );
    expect(result.result).toBe("CANDIDATE");
  });
});

describe("fastPath — Rule 9: default", () => {
  it("returns CANDIDATE for unknown content (no keyword, no action)", () => {
    const result = fastPath(
      makeInput({ text: "The weather in SF is surprisingly nice this April" }),
    );
    expect(result.result).toBe("CANDIDATE");
  });
});

describe("fastPath — fixture coverage", () => {
  it("correctly classifies all fast-path-deterministic fixtures", () => {
    const failures: string[] = [];

    for (const fixture of fastPathFixtures) {
      const result = fastPath(fixture.input);
      if (result.result !== fixture.expected) {
        failures.push(
          `[${fixture.id}] expected ${fixture.expected}, got ${result.result}` +
            (fixture.note ? ` (${fixture.note})` : ""),
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(`Fast-path fixture failures:\n${failures.join("\n")}`);
    }
  });

  it("has at least 10 fast-path-deterministic fixtures", () => {
    expect(fastPathFixtures.length).toBeGreaterThanOrEqual(10);
  });

  it("total fixture count >= 25", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(25);
  });
});
