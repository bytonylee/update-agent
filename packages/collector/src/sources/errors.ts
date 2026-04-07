export class BirdSearchAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BirdSearchAuthError";
  }
}

export class BirdSearchParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BirdSearchParseError";
  }
}

export class ScrapeCreatorsError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ScrapeCreatorsError";
  }
}

export class XAIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XAIError";
  }
}

export class GitHubRateLimitError extends Error {
  constructor() {
    super(
      "GitHub API rate limit exceeded. Set GH_TOKEN environment variable to increase limits.",
    );
    this.name = "GitHubRateLimitError";
  }
}
