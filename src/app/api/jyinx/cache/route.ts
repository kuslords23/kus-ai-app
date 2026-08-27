import { NextRequest, NextResponse } from "next/server";
import { purgeRefusals, purgeRefusalResponses, clearAllCache } from "@/services/semanticCache";

export const runtime = "nodejs";

/**
 * Manual maintenance endpoint for the Supabase semantic cache.
 *
 *   POST /api/jyinx/cache  body { action: "refusals" | "all" }
 *
 * - "refusals" deletes only rows whose prompt/response still contains stale
 *   "cannot modify / cannot commit" language, so old refusals are never served.
 * - "all" wipes the entire cache (manual "clear cache" control in Settings).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as { action?: string } | null;
  const action = body?.action === "all" ? "all" : body?.action === "refusals" ? "refusals" : "refusals";

  try {
    if (action === "all") {
      const removed = await clearAllCache();
      return NextResponse.json({ ok: true, action, removed });
    }
    const byPrompt = await purgeRefusals();
    const byResponse = await purgeRefusalResponses();
    return NextResponse.json({ ok: true, action, removed: byPrompt + byResponse, byPrompt, byResponse });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Cache cleanup failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}