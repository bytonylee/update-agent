import type { RawGitHubRelease } from "@updagent/shared";
import { GitHubRateLimitError } from "./errors.js";

const GH_API = "https://api.github.com";

export async function fetchGitHubReleases(
  owner: string,
  repo: string,
  perPage = 5,
): Promise<RawGitHubRelease[]> {
  const url = `${GH_API}/repos/${owner}/${repo}/releases?per_page=${perPage}`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "updagent/1.0",
  };

  const token = process.env["GH_TOKEN"];
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status === 404) {
    console.warn(`[updagent] GitHub 404: ${owner}/${repo} — no releases or repo not found`);
    return [];
  }

  if (response.status === 403) {
    throw new GitHubRateLimitError();
  }

  if (!response.ok) {
    console.warn(`[updagent] GitHub HTTP ${response.status} for ${owner}/${repo}`);
    return [];
  }

  const data = (await response.json()) as Array<Record<string, unknown>>;

  return data
    .filter((release) => !release["draft"])
    .map((release) => ({
      tagName: String(release["tag_name"] ?? ""),
      name: String(release["name"] ?? release["tag_name"] ?? ""),
      body: String(release["body"] ?? ""),
      publishedAt: String(
        release["published_at"] ?? release["created_at"] ?? new Date().toISOString(),
      ),
      url: String(release["html_url"] ?? ""),
      owner,
      repo,
      isDraft: Boolean(release["draft"]),
      isPrerelease: Boolean(release["prerelease"]),
    }));
}
