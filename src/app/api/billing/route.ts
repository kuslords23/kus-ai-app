import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutSession, getBalance, loadTransactionHistory, CREDIT_BUNDLES } from "@/server/payments";

export const runtime = "nodejs";

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

/** POST /api/billing — create a checkout session for a credit bundle. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { bundleId?: string; origin?: string } | null;
  if (!body?.bundleId) return NextResponse.json({ error: "bundleId is required." }, { status: 400 });

  const origin =
    request.headers.get("origin") ?? body.origin ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await createCheckoutSession({ userId, bundleId: body.bundleId, returnUrl: `${origin}/jyinx/billing` });
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: 400 });
  return NextResponse.json({ ok: true, url: session.url });
}