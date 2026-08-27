"use strict";

/**
 * Stripe Checkout wrapper.
 *
 * Thin wrapper around the existing `createCheckoutSession` helper from
 * `src/server/payments/index.ts`, exposing a uniform interface that the
 * payment router can call without caring about the underlying provider.
 */

import { createCheckoutSession } from "@/server/payments";

export interface StripeCheckoutParams {
  userId: string;
  bundleId: string;
  /** URL Stripe redirects to after payment. */
  returnUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface StripeCheckoutResult {
  ok: boolean;
  url?: string;
  error?: string;
}

/** Creates a hosted Stripe Checkout Session for a credit bundle. */
export async function createStripeSession(params: StripeCheckoutParams): Promise<StripeCheckoutResult> {
  const result = await createCheckoutSession({
    userId: params.userId,
    bundleId: params.bundleId,
    returnUrl: params.returnUrl ?? "",
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, url: result.url };
}