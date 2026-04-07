import type { ClassificationInput, FastPathResult } from "@updagent/shared";

const SEMVER_RE = /v?\d+\.\d+(?:\.\d+)?/i;
const SOCIAL_FILLER_RE =
  /^(lol|haha|😂|👍|❤️|🔥|same|yep|yes|no|ok|thanks|ty|thx|🙏|🎉)\s*[!.?]?\s*$/i;
const ACTION_WORDS_RE =
  /\b(release[sd]?|ship[ps]?|shipped|fix(ed)?|bug|patch|update[sd]?|launch(ed)?|feature|changelog|breaking|deprecat\w*|migrat\w*|v\d+\.\d+)\b/i;

export function fastPath(input: ClassificationInput): FastPathResult {
  const { text, source, isReply, signalKeywords } = input;
  const trimmed = text.trim();
  const lowerText = text.toLowerCase();
  const normalizedText = lowerText.replace(/[_-]+/g, " ");

  if (source === "github") {
    return { result: "SIGNAL", reason: "GitHub official release" };
  }

  if (SEMVER_RE.test(text)) {
    return { result: "SIGNAL", reason: "contains version number" };
  }

  if (SOCIAL_FILLER_RE.test(trimmed)) {
    return { result: "NOISE", reason: "social filler" };
  }

  if (isReply) {
    return { result: "CANDIDATE" };
  }

  if (trimmed.length < 15) {
    return {
      result: "NOISE",
      reason: "text too short to contain product signal",
    };
  }

  const hasKeyword = signalKeywords.some((kw) =>
    normalizedText.includes(kw.toLowerCase()),
  );
  if (hasKeyword && ACTION_WORDS_RE.test(text)) {
    return { result: "SIGNAL", reason: "signal keyword + action word match" };
  }

  if (hasKeyword) {
    return { result: "CANDIDATE" };
  }

  if (ACTION_WORDS_RE.test(text)) {
    return { result: "CANDIDATE" };
  }

  return { result: "CANDIDATE" };
}
