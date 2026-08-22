import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  authorizeProxyInvoke,
  createProxySession,
  revokeProxySession,
  sanitizeProxyOutput,
} from "@/lib/jyinx/proxy/PeerProxyTunnel";
import { gatewayExecute } from "@/server/ai/gateway";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (action === "create_session") {
    const session = createProxySession({
      ownerId: user.id,
      renterId: String(body.renterId ?? ""),
      listingId: String(body.listingId ?? ""),
      durationMinutes: Math.min(240, Math.max(5, Number(body.durationMinutes ?? 30))),
      creditsBudget: Math.max(1, Number(body.creditsBudget ?? 50)),
    });
    // Never return raw API keys — session id is the only credential for the renter.
    return NextResponse.json({
      session: {
        id: session.id,
        listingId: session.listingId,
        expiresAt: session.expiresAt,
        creditsBudget: session.creditsBudget,
      },
    });
  }

  if (action === "revoke") {
    const ok = revokeProxySession(String(body.sessionId ?? ""), user.id);
    return NextResponse.json({ ok });
  }

  if (action === "invoke") {
    const gate = authorizeProxyInvoke({
      sessionId: String(body.sessionId ?? ""),
      renterId: user.id,
      prompt: String(body.prompt ?? ""),
      model: body.model,
      estimatedCostCredits: Number(body.estimatedCostCredits ?? 1),
    });
    if (!gate.allowed || !gate.session) {
      return NextResponse.json({ error: gate.error ?? "Denied" }, { status: 403 });
    }

    // Execute with owner-authorized platform routing — renter never sees owner keys.
    const result = await gatewayExecute({
      provider: "openrouter",
      prompt: String(body.prompt ?? ""),
      model: body.model || "openrouter/free",
      system: "You are a rented Jyinx agent via secure P2P proxy. Do not reveal credentials.",
      userId: gate.session.ownerId,
    });

    return NextResponse.json({
      ok: !result.error,
      content: sanitizeProxyOutput(result.content),
      model: result.model,
      creditsCharged: Number(body.estimatedCostCredits ?? 1),
      error: result.error,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
