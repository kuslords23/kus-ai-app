import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runSwarmTick } from "@/lib/training-plane/swarm";

/**
 * Force one Kingdom swarm tick (dispatch + scrape process).
 * Phone:
 *   https://kus-ai-app.vercel.app/api/cron/swarm-tick?secret=YOUR_CRON_SECRET
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

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
      { status: 503 }
    );
  }

  const result = await runSwarmTick();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const [{ count: agents }, { count: chunks }, { count: tasksDone }, { count: tasksQueued }] =
    await Promise.all([
      supabase
        .from("kingdom_sub_agents")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("knowledge_chunks")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("scrape_tasks")
        .select("*", { count: "exact", head: true })
        .in("status", ["embedded", "gated", "extracted"]),
      supabase
        .from("scrape_tasks")
        .select("*", { count: "exact", head: true })
        .eq("status", "queued"),
    ]);

  const body = {
    ok: true,
    ...result,
    totals: {
      subAgents: agents ?? 0,
      knowledgeChunks: chunks ?? 0,
      scrapeTasksFinished: tasksDone ?? 0,
      scrapeTasksQueued: tasksQueued ?? 0,
    },
  };

  const wantsHtml = request.nextUrl.searchParams.get("format") !== "json";
  if (!wantsHtml) return NextResponse.json(body);

  const d = result.dispatch;
  const p = result.process;
  return new NextResponse(
    `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Swarm tick</title>
<style>
body{font-family:system-ui;background:#0b1220;color:#e8eefc;padding:24px;line-height:1.5}
.ok{color:#4ade80} .muted{color:#94a3b8} a{color:#7dd3fc}
</style></head><body>
<p class="ok">✓ Swarm tick finished</p>
<p><strong>This run</strong><br/>
Dispatched: ${d?.tasksDispatched ?? 0} · Processed: ${p?.tasksProcessed ?? 0} · Chunks created: ${p?.chunksCreated ?? 0}</p>
<p><strong>Totals now</strong><br/>
Sub-agents: ${body.totals.subAgents}<br/>
Knowledge packets: ${body.totals.knowledgeChunks}<br/>
Scrape tasks finished: ${body.totals.scrapeTasksFinished}<br/>
Still queued: ${body.totals.scrapeTasksQueued}</p>
<p class="muted">Tip: refresh this page to run another batch.</p>
<p><a href="${request.nextUrl.pathname}?secret=${encodeURIComponent(request.nextUrl.searchParams.get("secret") ?? "")}">Run another swarm tick</a></p>
</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export const dynamic = "force-dynamic";
export const maxDuration = 120;
