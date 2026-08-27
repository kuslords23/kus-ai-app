import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/legal/report
 *
 * Submit a content flag or report an AI response for review.
 * Complies with Apple Guideline 1.2 (UGC) and Google Play UGC policies.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { messageId, chatId, reason, details, flaggedContent, userId } = body as {
      messageId?: string;
      chatId?: string;
      reason?: string;
      details?: string;
      flaggedContent?: string;
      userId?: string;
    };

    if (!reason || !flaggedContent) {
      return NextResponse.json({ error: "Reason and flagged content are required" }, { status: 400 });
    }

    const VALID_REASONS = [
      "harmful_content",
      "hate_speech",
      "harassment",
      "spam",
      "misinformation",
      "violence",
      "sexual_content",
      "self_harm",
      "illegal",
      "copyright",
      "other",
    ];

    if (!VALID_REASONS.includes(reason)) {
      return NextResponse.json({ error: `Invalid reason. Must be one of: ${VALID_REASONS.join(", ")}` }, { status: 400 });
    }

    const report = {
      id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      messageId: messageId ?? null,
      chatId: chatId ?? null,
      userId: userId ?? null,
      reason,
      details: details ?? "",
      flaggedContent: flaggedContent.slice(0, 2000),
      status: "pending_review",
      createdAt: new Date().toISOString(),
    };

    console.log("[report] New content report:", report);

    // In production: insert into Supabase `content_reports` table
    // await supabase.from("content_reports").insert(report);

    return NextResponse.json({ ok: true, reportId: report.id, status: "pending_review" });
  } catch (err) {
    console.error("[report] Error handling report:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
