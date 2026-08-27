import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutSession, getBalance, loadTransactionHistory, CREDIT_BUNDLES } from "@/server/payments";
import { createHubtelCheckout, HubtelBundle, HUBTEL_BUNDLES } from "@/server/billing/hubtel";

export const runtime = "nodejs";

type Gateway = "stripe" | "hubtel";

async function requireUserId(): Promise<string | null> {
  try {
    const client = await createClient();
    const { data } = await client.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** GET /api/billing — balance + transaction history. */
export async function GET(): Promise<NextResponse> {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const [balance, transactions] = await Promise.all([getBalance(userId), loadTransactionHistory(userId)]);
  return NextResponse.json({ balance, transactions, bundles: CREDIT_BUNDLES });
}

/** POST /api/billing — create a checkout session for Stripe or Hubtel. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    bundleId?: string;
    gateway?: Gateway;
    origin?: string;
  } | null;
  if (!body?.bundleId) return NextResponse.json({ error: "bundleId is required." }, { status: 400 });

  const origin = body.origin ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (body.gateway === "hubtel") {
    const hubtelBundle = HUBTEL_BUNDLES.find((b) => b.id === body.bundleId);
    if (!hubtelBundle) return NextResponse.json({ error: "Unknown bundle." }, { status: 400 });

    // Hubtel charges in local currency (NGN/EUR/etc.) - price stored in cents
    const result = await createHubtelCheckout({
      userId,
      bundleId: hubtelBundle.id,
      returnUrl: `${origin}/jyinx/billing`,
    });
    if (!result.ok) return NextResponse.json({ error: result.error ?? "Hubtel checkout failed." }, { status: 400 });
    return NextResponse.json({ ok: true, gateway: "hubtel", url: result.url });
  }

  // Default: Stripe checkout
  const session = await createCheckoutSession({ userId, bundleId: body.bundleId, returnUrl: `${origin}/jyinx/billing` });
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: 400 });
  return NextResponse.json({ ok: true, url: session.url });
}