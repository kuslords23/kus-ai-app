"use strict";

/**
 * Hubtel Payment Service.
 *
 * Integration with Hubtel's Mobile Money API (common in East / West Africa).
 * Uses HTTP Basic Auth with HUBTEL_CLIENT_ID / HUBTEL_CLIENT_SECRET.
 */

import { creditUser } from "@/server/payments";

const HUBTEL_CLIENT_ID = process.env.HUBTEL_CLIENT_ID ?? "";
const HUBTEL_CLIENT_SECRET = process.env.HUBTEL_CLIENT_SECRET ?? "";
const HUBTEL_API_URL = "https://api.hubtel.com/v1";

/** Credit bundles priced for Hubtel mobile-money checkout (local currency, cents). */
export const HUBTEL_BUNDLES = [
  { id: "starter", label: "Starter", credits: 500, amountCents: 4500, description: "~500 flagship calls" },
  { id: "pro", label: "Pro", credits: 2000, amountCents: 13500, description: "~2,000 flagship calls" },
  { id: "power", label: "Power", credits: 6000, amountCents: 36000, description: "~6,000 flagship calls" },
] as const;

export interface HubtelBundle {
  id: string;
  label: string;
  credits: number;
  /** Amount in the smallest local currency unit (cents). */
  amountCents: number;
  description: string;
}

interface HubtelCheckoutParams {
  userId: string;
  bundleId: string;
  returnUrl?: string;
  metadata?: Record<string, unknown>;
}

interface HubtelCheckoutResult {
  ok: boolean;
  url?: string;
  error?: string;
}

/** Builds the HTTP Basic Auth header for Hubtel requests. */
function authHeader(): string | null {
  if (!HUBTEL_CLIENT_ID || !HUBTEL_CLIENT_SECRET) return null;
  const credentials = btoa(`${HUBTEL_CLIENT_ID}:${HUBTEL_CLIENT_SECRET}`);
  return `Basic ${credentials}`;
}

/**
 * Initiates a Hubtel Online Checkout / Mobile Money request.
 * Returns a redirect URL the frontend navigates to.
 */
export async function createHubtelCheckout(params: HubtelCheckoutParams): Promise<HubtelCheckoutResult> {
  const auth = authHeader();
  if (!auth) {
    return { ok: false, error: "Hubtel credentials (HUBTEL_CLIENT_ID/SECRET) not configured." };
  }

  const bundle = HUBTEL_BUNDLES.find((b) => b.id === params.bundleId);
  if (!bundle) return { ok: false, error: `Unknown bundle: ${params.bundleId}` };

  const payload = {
    amount: bundle.amountCents,
    description: `${bundle.label} — ${bundle.credits.toLocaleString()} credits`,
    currency: "GHS", // adjust per market; configurable via env in production
    callbackUrl: `${params.returnUrl ?? ""}api/billing/hubtel-webhook`,
    cancelUrl: params.returnUrl ?? "",
    returnUrl: params.returnUrl ?? "",
    clientRef: `hubtel-${params.userId}-${Date.now()}`,
  };

  try {
    const response = await fetch(`${HUBTEL_API_URL}/checkout`, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const data = (await response.json().catch(() => null)) as {
      url?: string;
      data?: { checkoutUrl?: string };
      error?: string;
      message?: string;
    };

    if (!response.ok) {
      const message = data?.error ?? data?.message ?? `HTTP ${response.status}`;
      return { ok: false, error: `Hubtel checkout failed: ${message}` };
    }

    const url = data?.url ?? data?.data?.checkoutUrl;
    return { ok: true, url };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: `Hubtel request failed: ${message}` };
  }
}

/**
 * Webhook handler for Hubtel's payment confirmation callback.
 *
 * Creds the user's wallet when a payment clears successfully. Hubtel sends
 * `status` (e.g. "success"), the payer's reference, and the amount.
 */
export async function handleHubtelWebhook(rawBody: string): Promise<{ ok: boolean; error?: string }> {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { ok: false, error: "Invalid JSON payload." };
  }

  const status = String(payload.status ?? "");
  if (status !== "success" && status !== "completed" && payload.paymentStatus !== "success") {
    // Non-success callbacks are ignored (payment pending / failed).
    return { ok: true, error: `Ignored non-success webhook (status=${status}).` };
  }

  const amount = Number(payload.amount ?? payload.paidAmount ?? 0);
  const rawRef = payload.clientRef;
  const clientRef = rawRef instanceof Object ? String((rawRef as Record<string, unknown>).toString?.() ?? "") : String(rawRef ?? "");
  const metadata = (payload.metadata instanceof Object ? payload.metadata : {}) as Record<string, unknown>;
  const userId = String(clientRef.split("-")[2] ?? metadata?.userId ?? "");

  if (!userId || amount <= 0) {
    return { ok: false, error: "Missing user or amount in Hubtel webhook." };
  }

  const dataObj = (payload.data instanceof Object ? payload.data : {}) as Record<string, unknown>;
  const hubtelTxId = String(payload.transactionId ?? dataObj?.transactionId ?? "");

  await creditUser(userId, amount, "hubtel-webhook", {
    hubtelTxId,
    bundleId: clientRef,
  });

  return { ok: true };
}
