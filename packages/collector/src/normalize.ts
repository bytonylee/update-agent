import type {
  FeedItem,
  RawXPost,
  RawGitHubRelease,
  ClassificationResult,
} from "@updagent/shared";

const SEMVER_RE = /v?(\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?)/i;

export function normalizeXPost(
  raw: RawXPost,
  agentId: string,
  classification: ClassificationResult,
): FeedItem {
  const versionMatch = raw.text.match(SEMVER_RE);
  const version = versionMatch?.[1];
  const isRelease =
    classification.classification === "SIGNAL" &&
    (version !== undefined || /\brelease\b|\bships?\b|\blaunche[sd]\b/i.test(raw.text));

  return {
    id: raw.url,
    source: "x",
    agentId,
    author: raw.author,
    text: raw.text,
    url: raw.url,
    publishedAt: new Date(raw.publishedAt).toISOString(),
    collectedAt: new Date().toISOString(),
    classification: classification.classification,
    classificationReason: classification.reason,
    classifiedBy: classification.classifiedBy,
    ...(classification.model ? { classificationModel: classification.model } : {}),
    isRelease,
    ...(version ? { version } : {}),
    engagementScore: raw.likes * 1 + raw.retweets * 3,
    likes: raw.likes,
    retweets: raw.retweets,
    views: raw.views,
    isReply: raw.isReply,
    ...(raw.parentTweetText
      ? { parentTweetSummary: raw.parentTweetText.slice(0, 120) }
      : {}),
  };
}

export function normalizeGitHubRelease(
  raw: RawGitHubRelease,
  agentId: string,
): FeedItem {
  const versionMatch = raw.tagName.match(SEMVER_RE);
  const version = versionMatch?.[1] ?? raw.tagName.replace(/^v/, "");

  return {
    id: `${raw.owner}/${raw.repo}@${raw.tagName}`,
    source: "github",
    agentId,
    author: `${raw.owner}/${raw.repo}`,
    text: `${raw.name}\n\n${raw.body}`,
    url: raw.url,
    publishedAt: new Date(raw.publishedAt).toISOString(),
    collectedAt: new Date().toISOString(),
    classification: "SIGNAL",
    classificationReason: "GitHub official release",
    classifiedBy: "fast-path",
    isRelease: true,
    ...(version ? { version } : {}),
    engagementScore: 0,
    isReply: false,
  };
}
