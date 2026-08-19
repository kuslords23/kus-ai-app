import { NextRequest, NextResponse } from "next/server";
import { handleStripeWebhook } from "@/server/payments";

export const runtime = "nodejs";

/** Stripe webhook: verify signature, then credit the user's balance. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  const result = await handleStripeWebhook(rawBody, signature);
  return result.ok
    ? NextResponse.json({ received: true })
    : NextResponse.json({ error: result.error }, { status: 400 });
}