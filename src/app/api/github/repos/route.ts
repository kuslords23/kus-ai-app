import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const GITHUB_REPOS_URL = "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member";

type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  updated_at: string;
  html_url: string;
  owner: { login: string };
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Connect GitHub to view repositories." }, { status: 401 });
  }

  try {
    const response = await fetch(GITHUB_REPOS_URL, {
      headers: {
        Authorization: authorization,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: response.status === 401 ? "GitHub connection expired. Reconnect GitHub." : "GitHub could not load your repositories." },
        { status: response.status }
      );
    }

    const repositories = (await response.json()) as GitHubRepository[];
    return NextResponse.json({
      repositories: repositories.map((repository) => ({
        id: repository.id,
        name: repository.name,
        fullName: repository.full_name,
        isPrivate: repository.private,
        defaultBranch: repository.default_branch,
        updatedAt: repository.updated_at,
        url: repository.html_url,
        owner: repository.owner.login,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Unable to reach GitHub." }, { status: 502 });
  }
}
