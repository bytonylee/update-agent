export type SignalClassification = "SIGNAL" | "CONTEXT" | "NOISE";
export type SourceType = "x" | "github";
export type SignalDetectionMode = "centralized" | "distributed";
export type CascadeTier = 1 | 2 | 3;

export interface FeedItem {
  id: string;
  source: SourceType;
  agentId: string;
  author: string;
  text: string;
  url: string;
  publishedAt: string;
  collectedAt: string;
  classification: SignalClassification;
  classificationReason: string;
  classifiedBy: "fast-path" | "llm";
  classificationModel?: string;
  isRelease: boolean;
  version?: string;
  engagementScore: number;
  likes?: number;
  retweets?: number;
  views?: number;
  isReply: boolean;
  parentTweetSummary?: string;
}

export interface RawXPost {
  id: string;
  url: string;
  text: string;
  author: string;
  publishedAt: string;
  likes: number;
  retweets: number;
  views: number;
  isReply: boolean;
  parentTweetId?: string;
  parentTweetText?: string;
  tier: CascadeTier;
}

export interface RawGitHubRelease {
  tagName: string;
  name: string;
  body: string;
  publishedAt: string;
  url: string;
  owner: string;
  repo: string;
  isDraft: boolean;
  isPrerelease: boolean;
}

export interface AgentGitHubConfig {
  owner: string;
  repo: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  priority: 1 | 2 | 3;
  enabled: boolean;
  github: AgentGitHubConfig;
  xAccounts: string[];
  signalKeywords: string[];
}

export interface TierFailure {
  tier: CascadeTier;
  error: string;
  errorType: "auth" | "rate-limit" | "network" | "parse" | "unknown";
}

export interface CascadeResult {
  posts: RawXPost[];
  tierUsed: CascadeTier | null;
  failures: TierFailure[];
}

export interface AccountHealth {
  account: string;
  consecutiveTier1Failures: number;
  lastSuccessfulTier: CascadeTier | null;
  lastSuccessAt: string | null;
  lastCheckedAt: string;
}

export interface CollectionHealth {
  lastRunAt: string;
  durationMs: number;
  newItemCount: number;
  totalItemCount: number;
  tier1FailureCount: number;
  tier2FailureCount: number;
  allTierFailureAccounts: string[];
  credentialWarning: boolean;
  accounts: AccountHealth[];
}

export interface ClassificationInput {
  text: string;
  author: string;
  agentId: string;
  agentName: string;
  isReply: boolean;
  parentTweetSummary?: string;
  signalKeywords: string[];
  source: SourceType;
}

export interface ClassificationResult {
  classification: SignalClassification;
  reason: string;
  classifiedBy: "fast-path" | "llm";
  model?: string;
}

export type FastPathResult =
  | { result: "SIGNAL" | "NOISE"; reason: string }
  | { result: "CANDIDATE" };

export interface FeedFile {
  version: "1";
  updatedAt: string;
  itemCount: number;
  items: FeedItem[];
}
