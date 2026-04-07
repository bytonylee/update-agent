import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { fetchGitHubReleases } = await import("../sources/github-releases.js");
const { GitHubRateLimitError } = await import("../sources/errors.js");

function mockGitHubResponse(
  releases: Array<Record<string, unknown>>,
  status = 200,
) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => releases,
  } as Response);
}

describe("fetchGitHubReleases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["GH_TOKEN"];
  });

  it("returns releases for a valid repo", async () => {
    mockGitHubResponse([
      {
        tag_name: "v1.9.4",
        name: "Claude Code v1.9.4",
        body: "## What's New\n- Fix statusline on Windows",
        published_at: "2026-04-01T12:00:00Z",
        html_url: "https://github.com/anthropics/claude-code/releases/tag/v1.9.4",
        draft: false,
        prerelease: false,
      },
    ]);

    const releases = await fetchGitHubReleases("anthropics", "claude-code");

    expect(releases).toHaveLength(1);
    expect(releases[0]?.tagName).toBe("v1.9.4");
    expect(releases[0]?.owner).toBe("anthropics");
    expect(releases[0]?.repo).toBe("claude-code");
    expect(releases[0]?.isDraft).toBe(false);
  });

  it("returns empty array on 404 (repo not found or no releases)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: "Not Found" }),
    } as Response);

    const releases = await fetchGitHubReleases("nonexistent", "repo");
    expect(releases).toHaveLength(0);
  });

  it("throws GitHubRateLimitError on 403", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ message: "rate limit exceeded" }),
    } as Response);

    await expect(fetchGitHubReleases("anthropics", "claude-code")).rejects.toThrow(
      GitHubRateLimitError,
    );
  });

  it("GitHubRateLimitError message mentions GH_TOKEN", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({}),
    } as Response);

    await expect(fetchGitHubReleases("anthropics", "claude-code")).rejects.toThrow(/GH_TOKEN/);
  });

  it("filters out draft releases", async () => {
    mockGitHubResponse([
      {
        tag_name: "v1.9.5-draft",
        name: "Draft release",
        body: "",
        published_at: "2026-04-07T00:00:00Z",
        html_url: "",
        draft: true,
        prerelease: false,
      },
      {
        tag_name: "v1.9.4",
        name: "Real release",
        body: "Changelog",
        published_at: "2026-04-01T00:00:00Z",
        html_url: "https://github.com/anthropics/claude-code/releases/tag/v1.9.4",
        draft: false,
        prerelease: false,
      },
    ]);

    const releases = await fetchGitHubReleases("anthropics", "claude-code");
    expect(releases).toHaveLength(1);
    expect(releases[0]?.tagName).toBe("v1.9.4");
  });

  it("sends Authorization header when GH_TOKEN is set", async () => {
    process.env["GH_TOKEN"] = "my-test-token";
    mockGitHubResponse([]);

    await fetchGitHubReleases("anthropics", "claude-code");

    const callArgs = mockFetch.mock.calls[0];
    const options = callArgs?.[1] as RequestInit;
    const headers = options?.headers as Record<string, string>;
    expect(headers?.["Authorization"]).toBe("Bearer my-test-token");
  });

  it("works without GH_TOKEN (no Authorization header sent)", async () => {
    delete process.env["GH_TOKEN"];
    mockGitHubResponse([]);

    await fetchGitHubReleases("anthropics", "claude-code");

    const callArgs = mockFetch.mock.calls[0];
    const options = callArgs?.[1] as RequestInit;
    const headers = options?.headers as Record<string, string>;
    expect(headers?.["Authorization"]).toBeUndefined();
  });

  it("returns empty array for repo with no releases (empty array response)", async () => {
    mockGitHubResponse([]);
    const releases = await fetchGitHubReleases("someorg", "new-repo");
    expect(releases).toHaveLength(0);
  });
});
