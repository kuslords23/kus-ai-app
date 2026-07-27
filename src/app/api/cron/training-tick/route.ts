import { NextRequest, NextResponse } from "next/server";
import { runTrainingTick } from "@/lib/training-plane/orchestrator";

/**
 * Training Plane tick. Phone:
 *   https://kus-ai-app.vercel.app/api/cron/training-tick?secret=YOUR_CRON_SECRET
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return request.nextUrl.searchParams.get("secret") === secret;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
      { status: 503 }
    );
  }

  const result = await runTrainingTick();
  const wantsHtml = request.nextUrl.searchParams.get("format") !== "json";
  if (!wantsHtml) return NextResponse.json({ ok: true, ...result });

  return new NextResponse(
    `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Training tick</title>
<style>body{font-family:system-ui;background:#0b1220;color:#e8eefc;padding:24px;line-height:1.5}.ok{color:#4ade80}</style>
</head><body>
<p class="ok">✓ Training tick finished</p>
<pre style="white-space:pre-wrap;background:#111827;padding:12px;border-radius:8px">${JSON.stringify(result, null, 2)}</pre>
</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
