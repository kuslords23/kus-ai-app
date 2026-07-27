import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LEARNING_SOURCE, type LearningEventType } from "@/lib/learning/types";

const ALLOWED_TYPES: LearningEventType[] = [
  "retrieval_miss",
  "rag_error",
  "correction",
  "style_sample",
  "memory_export",
  "harvest_request",
  "helpful",
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body?.eventType || !ALLOWED_TYPES.includes(body.eventType)) {
      return NextResponse.json(
        { ok: false, error: "Invalid eventType" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const payload = body.payload ?? {};
    const sessionId = body.sessionId ?? null;

    const { data: event, error: eventError } = await supabase
      .from("learning_events")
      .insert({
        source: LEARNING_SOURCE,
        event_type: body.eventType,
        user_id: user?.id ?? null,
        session_id: sessionId,
        payload,
      })
      .select("id")
      .single();

    if (eventError) {
      return NextResponse.json(
        { ok: false, error: eventError.message },
        { status: 500 }
      );
    }

    if (body.eventType === "correction" && user?.id) {
      const p = payload as {
        userQuery?: string;
        assistantReply?: string;
        note?: string;
      };
      await supabase.from("correction_events").insert({
        learning_event_id: event.id,
        user_id: user.id,
        session_id: sessionId,
        user_query: p.userQuery ?? null,
        assistant_reply: p.assistantReply ?? "",
        correction_note: p.note ?? "User marked not helpful",
        source: LEARNING_SOURCE,
      });
    }

    return NextResponse.json({ ok: true, id: event.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
