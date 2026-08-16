import { NextResponse } from "next/server";
import { getQueueStats } from "@/app/api/jyinx/queue/route";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const stats = await getQueueStats();
    return NextResponse.json({
      all: stats.total,
      working: stats.processing,
      attention: stats.pending + stats.failed,
      review: stats.completed,
      queue: stats,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Unable to load Jyinx metrics." }, { status: 503 });
  }
}
