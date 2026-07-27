import { NextRequest, NextResponse } from "next/server";
import { runSwarmTick } from "@/lib/training-plane/swarm";

/**
 * Cron: dispatch + process scrape tasks for ~10k sub-agents.
 * Schedule: every 15 minutes (see vercel.json)
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
      { status: 503 }
    );
  }

  const result = await runSwarmTick();
  return NextResponse.json({ ok: true, ...result });
}

export const dynamic = "force-dynamic";
export const maxDuration = 120;
