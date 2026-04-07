import { spawnSync } from "node:child_process";
import type {
  ClassificationInput,
  ClassificationResult,
  SignalDetectionMode,
} from "@updagent/shared";
import { buildClassificationPrompt, buildDistributedPrompt } from "./prompts.js";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS = [
  "google/gemini-flash-1.5",
  "meta-llama/llama-3.1-8b-instruct:free",
  "anthropic/claude-haiku-4-5",
] as const;

type ParsedResponse = Array<{
  classification: "SIGNAL" | "CONTEXT" | "NOISE";
  reason: string;
}>;

type LocalAgent = "claude" | "codex" | null;

export async function classifyBatch(
  inputs: ClassificationInput[],
  mode: SignalDetectionMode = "centralized",
): Promise<ClassificationResult[]> {
  if (inputs.length === 0) return [];
  if (mode === "distributed") {
    return classifyDistributed(inputs);
  }
  return classifyCentralized(inputs);
}

async function classifyCentralized(
  inputs: ClassificationInput[],
): Promise<ClassificationResult[]> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) {
    console.warn("[updagent] OPENROUTER_API_KEY not set — defaulting all to CONTEXT");
    return inputs.map(() => ({
      classification: "CONTEXT",
      reason: "OpenRouter API key not configured",
      classifiedBy: "llm",
    }));
  }

  const results: ClassificationResult[] = [];
  for (let i = 0; i < inputs.length; i += 10) {
    const batch = inputs.slice(i, i + 10);
    const batchResults = await classifyBatchCentralized(batch, apiKey);
    results.push(...batchResults);
  }
  return results;
}

async function classifyBatchCentralized(
  batch: ClassificationInput[],
  apiKey: string,
): Promise<ClassificationResult[]> {
  const prompt = buildClassificationPrompt(batch);

  for (const model of OPENROUTER_MODELS) {
    try {
      const response = await fetch(OPENROUTER_BASE, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/jyoung105/updagent",
          "X-Title": "updagent",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 1000,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        console.warn(`[updagent] OpenRouter ${model} HTTP ${response.status} — trying next model`);
        continue;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content ?? "";
      const parsed = parseClassificationResponse(content, batch.length);
      if (!parsed) {
        continue;
      }

      return parsed.map((item) => ({
        classification: item.classification,
        reason: item.reason,
        classifiedBy: "llm",
        model,
      }));
    } catch (error) {
      console.warn(`[updagent] OpenRouter ${model} error: ${String(error)}`);
    }
  }

  console.error("[updagent] All OpenRouter models failed — defaulting to CONTEXT");
  return batch.map(() => ({
    classification: "CONTEXT",
    reason: "LLM classifier unavailable — defaulting to CONTEXT",
    classifiedBy: "llm",
  }));
}

function parseClassificationResponse(
  content: string,
  expectedCount: number,
): ParsedResponse | null {
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      index?: number;
      classification?: string;
      reason?: string;
    }>;

    if (!Array.isArray(parsed) || parsed.length !== expectedCount) {
      return null;
    }

    const valid: ParsedResponse = [];
    for (const item of parsed) {
      const classification = item.classification?.toUpperCase();
      if (
        classification !== "SIGNAL" &&
        classification !== "CONTEXT" &&
        classification !== "NOISE"
      ) {
        return null;
      }
      valid.push({
        classification,
        reason: String(item.reason ?? ""),
      });
    }
    return valid;
  } catch {
    return null;
  }
}

function classifyDistributed(inputs: ClassificationInput[]): ClassificationResult[] {
  return inputs.map((input) => {
    try {
      return classifyWithLocalAgent(input);
    } catch {
      return {
        classification: "CONTEXT",
        reason: "Local agent unavailable — defaulting to CONTEXT",
        classifiedBy: "llm",
      };
    }
  });
}

function detectLocalAgent(): LocalAgent {
  const configured = process.env["UPDAGENT_LOCAL_AGENT"];
  if (configured === "claude" || configured === "codex") return configured;

  const claudeCheck = spawnSync("claude", ["--version"], { encoding: "utf-8" });
  if (claudeCheck.status === 0) return "claude";

  const codexCheck = spawnSync("codex", ["--version"], { encoding: "utf-8" });
  if (codexCheck.status === 0) return "codex";

  return null;
}

function classifyWithLocalAgent(input: ClassificationInput): ClassificationResult {
  const agent = detectLocalAgent();
  if (!agent) {
    return {
      classification: "CONTEXT",
      reason: "No local agent (claude/codex) found in PATH",
      classifiedBy: "llm",
    };
  }

  const prompt = buildDistributedPrompt(input);
  const args = agent === "claude" ? ["-p", prompt] : ["run", prompt];

  const result = spawnSync(agent, args, {
    encoding: "utf-8",
    timeout: 30_000,
  });

  if (result.status !== 0 || !result.stdout) {
    throw new Error(`${agent} exited ${result.status}`);
  }

  const content = result.stdout.trim();
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON in response");
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    classification?: string;
    reason?: string;
  };

  const classification = parsed.classification?.toUpperCase();
  if (
    classification !== "SIGNAL" &&
    classification !== "CONTEXT" &&
    classification !== "NOISE"
  ) {
    throw new Error(`Invalid classification: ${classification}`);
  }

  return {
    classification,
    reason: String(parsed.reason ?? ""),
    classifiedBy: "llm",
    model: agent,
  };
}
