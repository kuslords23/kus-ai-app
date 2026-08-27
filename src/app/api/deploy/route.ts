import { NextRequest, NextResponse } from "next/server";
import { listDeployments, pushToHost } from "@/server/deploy/pushHost";

export const runtime = "nodejs";

/**
 * Push-to-host API.
 *
 *   POST /api/deploy  { repository, branch, commitSha?, commitMessage?, owner? }
 *     → pushes the already-committed repo/branch to the configured dedicated
 *       host platform(s) and records the deployment.
 *   GET  /api/deploy?owner=…&repository=…
 *     → lists tracked deployments (for the IDE status / deploy log).
 */
export async function GET(request: NextRequest) {
  const owner = request.nextUrl.searchParams.get("owner") ?? undefined;
  const repository = request.nextUrl.searchParams.get("repository") ?? undefined;
  const deployments = await listDeployments({ owner, repository });
  return NextResponse.json({ deployments });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    repository?: unknown;
    branch?: unknown;
    commitSha?: unknown;
    commitMessage?: unknown;
    owner?: unknown;
  } | null;

  const repository = typeof body?.repository === "string" && /^[\w.-]+\/[\w.-]+$/.test(body.repository) ? body.repository : "";
  const branch = typeof body?.branch === "string" && body.branch ? body.branch : "";
  if (!repository || !branch) {
    return NextResponse.json({ error: "repository and branch are required to push." }, { status: 400 });
  }

  try {
    const result = await pushToHost({
      repository,
      branch,
      commitSha: typeof body?.commitSha === "string" ? body.commitSha : undefined,
      commitMessage: typeof body?.commitMessage === "string" ? body.commitMessage : undefined,
      owner: typeof body?.owner === "string" ? body.owner : undefined,
      origin: request.nextUrl.origin,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, href: result.href }, { status: 502 });
    }
    return NextResponse.json({ ok: true, deployment: result.deployment, href: result.href });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Push to host failed." },
      { status: 500 }
    );
  }
}