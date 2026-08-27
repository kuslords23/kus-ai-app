import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type DevOpsBody = { action?: unknown; repository?: unknown; message?: unknown };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as DevOpsBody | null;
  const action = typeof body?.action === "string" ? body.action : "";
  if (!['commit-push', 'deploy', 'query'].includes(action)) {
    return NextResponse.json({ error: "Unsupported Jyinx DevOps action." }, { status: 400 });
  }

  if (action === "query") {
    return NextResponse.json({ error: "Database query execution is not configured for this workspace." }, { status: 501 });
  }
  if (action === "deploy") {
    if (!process.env.VERCEL_DEPLOY_HOOK_URL) return NextResponse.json({ error: "Set VERCEL_DEPLOY_HOOK_URL to enable deployments." }, { status: 503 });
    const response = await fetch(process.env.VERCEL_DEPLOY_HOOK_URL, { method: "POST", cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: "Vercel deploy hook rejected the request." }, { status: 502 });
    return NextResponse.json({ success: true, message: "Vercel deployment triggered." });
  }

  return NextResponse.json({ error: "Direct server-side git push is disabled. Use the repository pull-request workflow from the Jyinx IDE." }, { status: 501 });
}
