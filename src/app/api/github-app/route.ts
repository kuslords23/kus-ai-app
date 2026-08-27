/**
 * GitHUB App installation webhook handler.
 *
 * POST /api/github-app/install  — Client-side: create installation record
 * GET  /api/github-app          — List installations, resolve tokens, get install URL
 */
import { NextRequest, NextResponse } from "next/server";
import {
  exchangeInstallationToken,
  recordInstallation,
  listInstallations,
  getInstallUrl,
  resolveTokenForRepo,
  buildAuthGitUrl,
} from "@/server/github-app/service";

export const runtime = "nodejs";

/**
 * POST /api/github-app/install — called by the client after the user
 * completes the GitHub App OAuth/installation flow. The client passes the
 * installation_id from the redirect URL.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    installationId?: unknown;
    accountLogin?: unknown;
    accountType?: unknown;
    repoIds?: unknown;
    repoNames?: unknown;
    userId?: unknown;
  } | null;

  const installationId = typeof body?.installationId === "number" ? body.installationId : 0;
  const accountLogin = typeof body?.accountLogin === "string" ? body.accountLogin : "";
  const userId = typeof body?.userId === "string" ? body.userId : "";

  if (!installationId || !accountLogin || !userId) {
    return NextResponse.json({ error: "installationId, accountLogin, and userId are required." }, { status: 400 });
  }

  try {
    // Exchange the installation ID for an access token
    const { token, expiresAt } = await exchangeInstallationToken(installationId);

    const repoIds: number[] = Array.isArray(body?.repoIds) ? (body.repoIds as number[]) : [];
    const repoNames: string[] = Array.isArray(body?.repoNames) ? (body.repoNames as string[]) : [];
    const accountType = typeof body?.accountType === "string" ? body.accountType : "user";

    const installation = await recordInstallation({
      userId,
      installationId,
      accountLogin,
      accountType,
      repoIds,
      repoNames,
      token,
      expiresAt,
    });

    if (!installation) {
      return NextResponse.json({ error: "Could not store the installation." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, installation });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Installation failed." },
      { status: 502 }
    );
  }
}

/**
 * GET /api/github-app/install — list installations for the current user.
 */
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId") ?? "";
  const action = request.nextUrl.searchParams.get("action") ?? "";

  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  if (action === "install-url") {
    const state = request.nextUrl.searchParams.get("state") ?? undefined;
    return NextResponse.json({ url: getInstallUrl(state) });
  }

  if (action === "resolve-token") {
    const repo = request.nextUrl.searchParams.get("repo") ?? "";
    if (!repo) return NextResponse.json({ error: "repo is required." }, { status: 400 });
    const token = await resolveTokenForRepo(userId, repo);
    if (!token) return NextResponse.json({ error: "No token available for this repository." }, { status: 404 });
    return NextResponse.json({ token, gitUrl: buildAuthGitUrl(repo, token) });
  }

  const installations = await listInstallations(userId);
  return NextResponse.json({ installations });
}