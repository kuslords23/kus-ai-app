import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  formatKingdomContext,
  queryKingdomKnowledge,
} from "@/lib/kingdom/knowledge";

/**
 * Fetch answers from the Kingdom sub-agent swarm memory layer.
 * Separate from user-facing Royal agents — powers faster domain-specific answers.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body?.query || typeof body.query !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing query" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const result = await queryKingdomKnowledge({
      query: body.query,
      departments: body.departments,
      limit: body.limit ?? 8,
      userId: user?.id ?? null,
    });

    return NextResponse.json({
      ...result,
      context: formatKingdomContext(result),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
