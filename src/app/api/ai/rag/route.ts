import { NextRequest } from "next/server";

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL || "https://sport-clan-nexus.vercel.app";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const authHeader = request.headers.get("authorization");

  const hubRes = await fetch(`${HUB_URL}/api/ai/rag`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!hubRes.ok) {
    return new Response(
      JSON.stringify({ error: "Hub request failed", status: hubRes.status }),
      { status: hubRes.status, headers: { "Content-Type": "application/json" } }
    );
  }

  if (body.stream && hubRes.body) {
    return new Response(hubRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const data = await hubRes.json();
  return Response.json(data);
}
