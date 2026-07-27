import { NextRequest } from "next/server";

const HUB_URL =
  process.env.NEXT_PUBLIC_HUB_URL || "https://sport-clan-nexus.vercel.app";

/**
 * Proxy to hub `/api/ai/rag` — same request body as hub client.
 * Required fields: `{ query: string, stream?, userContext?, history?, ... }`
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.query !== "string" || !body.query.trim()) {
    return Response.json(
      { ok: false, error: "Missing query" },
      { status: 400 }
    );
  }

  const authHeader = request.headers.get("authorization");

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
}
