/**
 * Payment gateway integration — Stripe checkout + webhook + credit ledger.
 *
 * Uses Supabase as the credit/transaction store and communicates with Stripe
 * via raw fetch (no SDK dependency). `createCheckoutSession` builds a hosted
 * Stripe Checkout URL for credit bundles or subscriptions; `handleWebhook`
 * verifies the signature and credits the user on `invoice.paid` /
 * `checkout.session.completed`.
 */

import { createClient } from "@/lib/supabase/server";

export const CREDITS_TABLE = "ai_credit_balances";
export const TRANSACTIONS_TABLE = "ai_credit_transactions";

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY ?? "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

/** Credit bundles offered on the billing dashboard. */
export const CREDIT_BUNDLES = [
  { id: "starter", label: "Starter", credits: 500, priceUsd: 5, description: "~500 flagship calls" },
  { id: "pro", label: "Pro", credits: 2000, priceUsd: 15, description: "~2,000 flagship calls" },
  { id: "power", label: "Power", credits: 6000, priceUsd: 40, description: "~6,000 flagship calls" },
] as const;

export interface Bundle {
  id: string;
  label: string;
  credits: number;
  priceUsd: number;
  description: string;
}

export async function createCheckoutSession(opts: { userId: string; bundleId: string; returnUrl: string }): Promise<{ ok: true; url?: string } | { ok: false; error: string }> {
  const bundle = CREDIT_BUNDLES.find((b) => b.id === opts.bundleId);
  if (!bundle) return { ok: false, error: "Unknown bundle." };
  if (!STRIPE_SECRET) return { ok: false, error: "Payments are not configured yet (missing STRIPE_SECRET_KEY)." };

  try {
    const params = new URLSearchParams({
      mode: "payment",
      success_url: `${opts.returnUrl}?checkout=success`,
      cancel_url: `${opts.returnUrl}`,
      client_reference_id: opts.userId,
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(bundle.priceUsd * 100), // Stripe: cents
      "line_items[0][price_data][product_data][name]": `${bundle.label} — ${bundle.credits} Jyinx credits`,
      "line_items[0][price_data][product_data][description]": bundle.description,
      "line_items[0][quantity]": "1",
      "metadata[bundle_id]": bundle.id,
      "metadata[credits]": String(bundle.credits),
    });
    const response = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      cache: "no-store",
    });
    const data = (await response.json().catch(() => null)) as { url?: string; error?: { message?: string } };
    if (!response.ok) return { ok: false, error: data?.error?.message || "Could not create checkout session." };
    return { ok: true, url: data.url };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Checkout failed." };
  }
}

/** Adds credits and records a transaction. */
export async function creditUser(userId: string, credits: number, source: string, meta?: Record<string, unknown>, txId?: string): Promise<void> {
  try {
    const client = await createClient();
    const existing = await client
      .from(CREDITS_TABLE)
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();
    const balance = (existing.data?.balance as number | undefined) ?? 0;
    const next = balance + credits;
    await client.from(CREDITS_TABLE).upsert(
      { user_id: userId, balance: next, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    await client.from(TRANSACTIONS_TABLE).insert({
      user_id: userId,
      amount: credits,
      kind: credits >= 0 ? "credit" : "debit",
      source,
      reference: txId ?? "manual",
      metadata: JSON.stringify(meta ?? {}),
      created_at: new Date().toISOString(),
    });
  } catch (cause) {
    console.error("[payments] creditUser failed:", cause);
  }
}

/** Debits credits; returns false when insufficient balance (soft-lock trigger). */
export async function debitUser(userId: string, credits: number, source: string, meta?: Record<string, unknown>): Promise<{ ok: boolean; balance: number }> {
  try {
    const client = await createClient();
    const existing = await client
      .from(CREDITS_TABLE)
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();
    const balance = (existing.data?.balance as number | undefined) ?? 0;
    if (balance < credits) return { ok: false, balance };

    const next = balance - credits;
    await client.from(CREDITS_TABLE).upsert(
      { user_id: userId, balance: next, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    await client.from(TRANSACTIONS_TABLE).insert({
      user_id: userId,
      amount: -credits,
      kind: "debit",
      source,
      reference: meta?.route ?? "ai_call",
      metadata: JSON.stringify(meta ?? {}),
      created_at: new Date().toISOString(),
    });
    return { ok: true, balance: next };
  } catch (cause) {
    console.error("[payments] debitUser failed:", cause);
    // Best-effort: allow the call to proceed if the ledger is unreachable.
    return { ok: true, balance: Number.MAX_SAFE_INTEGER };
  }
}

export async function getBalance(userId: string): Promise<number> {
  try {
    const client = await createClient();
    const { data } = await client.from(CREDITS_TABLE).select("balance").eq("user_id", userId).maybeSingle();
    return (data?.balance as number | undefined) ?? 0;
  } catch {
    return 0;
  }
}

export async function loadTransactionHistory(userId: string, limit = 25): Promise<Array<Record<string, unknown>>> {
  try {
    const client = await createClient();
    const { data } = await client
      .from(TRANSACTIONS_TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data ?? [];
  } catch {
    return [];
  }
}

/** Adapter for a Stripe `checkout.session.completed` / `invoice.paid` event. */
export async function handleStripeWebhook(rawBody: string, signature?: string | null): Promise<{ ok: boolean; error?: string }> {
  // Signature verification is skipped when no webhook secret is configured (dev).
  if (STRIPE_WEBHOOK_SECRET) {
    const verified = await verifyStripeSignature(rawBody, signature ?? "");
    if (!verified) return { ok: false, error: "Invalid webhook signature." };
  }

  type StripeWebhookEvent = { type?: string; data?: { object?: Record<string, unknown> } };

  let event: StripeWebhookEvent | null = null;
  try {
    event = JSON.parse(rawBody) as StripeWebhookEvent;
  } catch {
    return { ok: false, error: "Invalid JSON payload." };
  }
  const object = event?.data?.object ?? {};
  const metadata = (object.metadata ?? {}) as Record<string, unknown>;
  const userId = String(object.client_reference_id ?? metadata.userId ?? "");
  const credits = Number(metadata.credits ?? 0);
  const bundleId = String(metadata.bundle_id ?? "");

  if (!userId || !credits) return { ok: false, error: "Missing user or credits in payload." };
  const eventType = event?.type ?? "";
  if (eventType === "checkout.session.completed" || eventType === "invoice.paid" || eventType === "payment_intent.succeeded") {
    await creditUser(userId, credits, "stripe-checkout", { bundleId, amountPaidCents: object.amount_total ?? object.amount_paid ?? 0, sessionId: object.id });
    return { ok: true };
  }
  return { ok: false, error: `Unsupported event type: ${eventType}` };
}

/** Stripe-style HMAC signature verification: `t=<ts>,v1=<hex>`. */
async function verifyStripeSignature(payload: string, signature: string): Promise<boolean> {
  try {
    const tsPart = signature.split(",").find((p) => p.startsWith("t="))?.slice(2) ?? "";
    const sigPart = signature.split(",").find((p) => p.startsWith("v1="))?.slice(3) ?? "";
    if (!tsPart || !sigPart) return false;
    const signed = `${tsPart}.${payload}`;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
    const computed = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
    // constant-time-ish compare
    if (computed.length !== sigPart.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ sigPart.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}