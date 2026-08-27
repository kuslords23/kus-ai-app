"use strict";

/**
 * Payment Router — unified handler for Stripe and Hubtel checkout.
 *
 * Supports two gateways:
 *   - "stripe": hosted Stripe Checkout Session.
 *   - "hubtel": Hubtel Online Checkout / Mobile Money request.
 *
 * External dependencies are optional (graceful fallback when missing).
 */

import { createStripeSession } from "@/server/billing/stripe"; // already exists in your project
import { createHubtelCheckout } from "@/server/billing/hubtel"; // will implement now

export type Gateway = "stripe" | "hubtel";

export interface CheckoutRequest {
  userId: string;
  bundleId: string;
  gateway: Gateway;
  returnUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface CheckoutResult {
  ok: boolean;
  gateway: Gateway;
  url?: string;
  error?: string;
}

/** Unified checkout entry point. Delegates to the selected provider. */
export async function routeCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
  switch (req.gateway) {
    case "stripe": {
      const res = await createStripeSession(req);
      return { ...res, gateway: "stripe" };
    }
    case "hubtel": {
      const res = await createHubtelCheckout(req);
      return { ...res, gateway: "hubtel" };
    }
    default:
      return { ok: false, gateway: req.gateway, error: "Unsupported gateway" };
  }
}