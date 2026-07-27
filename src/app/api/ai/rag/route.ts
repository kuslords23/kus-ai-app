import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const HUB_URL =
  process.env.NEXT_PUBLIC_HUB_URL || "https://sport-clan-nexus.vercel.app";

/**
 * Proxy to hub `/api/ai/rag` — same request body as hub client.
 * Forwards Supabase session from cookies when the client omits Authorization.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || typeof body.query !== "string" || !body.query.trim()) {
      return Response.json(
        { ok: false, error: "Missing query" },
        { status: 400 }
      );
    }

    let authHeader = request.headers.get("authorization");
    if (!authHeader) {
      try {
        const supabase = await createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.access_token) {
          authHeader = `Bearer ${session.access_token}`;
        }
      } catch {
        // continue without auth
      }
    }

    const hubRes = await fetch(`${HUB_URL}/api/ai/rag`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: body.stream ? "text/event-stream" : "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    });

    if (body.stream && hubRes.body) {
      return new Response(hubRes.body, {
        status: hubRes.status,
        headers: {
          "Content-Type":
            hubRes.headers.get("content-type") || "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const data = await hubRes.json().catch(() => ({
      ok: false,
      error: "Invalid hub response",
    }));
    return Response.json(data, { status: hubRes.status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Hub request failed";
    return Response.json(
      {
        ok: false,
        error: message,
        answer:
          "Couldn't reach the kingdom hub — check your connection and try again.",
      },
      { status: 502 }
    );
  }
}
