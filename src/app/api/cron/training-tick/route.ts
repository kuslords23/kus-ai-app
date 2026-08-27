import { NextRequest, NextResponse } from "next/server";
import { runTrainingTick } from "@/lib/training-plane/orchestrator";

/**
 * Cron endpoint for the Training Plane orchestrator.
 * Vercel Cron: set CRON_SECRET and call with Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error: "SUPABASE_SERVICE_ROLE_KEY not configured",
      },
      { status: 503 }
    );
  }

  const result = await runTrainingTick();
  return NextResponse.json({ ok: true, ...result });
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
