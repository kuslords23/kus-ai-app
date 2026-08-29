/**
 * Global billing interceptor over AI & tool calls.
 *
 * Centralized middleware applied to every provider generation and agent tool
 * call when platform default keys are in play:
 *  - Pre-flight: block requests with a graceful, actionable payload when the
 *    user's credit balance is zero (soft-lock → prompt top-up / BYOK).
 *  - Post-flight: meter token usage and tool action costs, deducting credits
 *    from the user's balance in real time.
 *
 * BYOK calls are skipped entirely (the user is billed upstream).
 */

import { currentCredits, meterAiCall } from "@/server/ai/metering";

export interface ProxyCallContext {
  userId?: string;
  inputTokens?: number;
  outputTokens?: number;
  provider: string;
  model: string;
  /** True when the user's own BYOK key served the call (never billable). */
  usingUserKey?: boolean;
}

export interface CreditGate {
  allowed: boolean;
  balance: number;
  payload?: {
    code: "insufficient_credits";
    message: string;
    action: "top_up";
  };
}

/** Pre-flight gate for a billable call. */
export async function assertCredits(ctx: ProxyCallContext): Promise<CreditGate> {
  if (ctx.usingUserKey || !ctx.userId) {
    return { allowed: true, balance: ctx.usingUserKey ? Number.MAX_SAFE_INTEGER : 0 };
  }
  const balance = await currentCredits(ctx.userId);
  if (balance <= 0) {
    return {
      allowed: false,
      balance,
      payload: {
        code: "insufficient_credits",
        message: "Your credit balance is empty. Top up in Billing or add your own API key to continue.",
        action: "top_up",
      },
    };
  }
  return { allowed: true, balance };
}

/** Meters a completed platform-default call/tool action. */
export async function meterProxyCtx(ctx: ProxyCallContext): Promise<{ cost: number; balance: number; locked: boolean }> {
  if (ctx.usingUserKey || !ctx.userId) return { cost: 0, balance: Number.MAX_SAFE_INTEGER, locked: false };
  return meterAiCall({
    provider: ctx.provider,
    model: ctx.model,
    inputTokens: ctx.inputTokens ?? 0,
    outputTokens: ctx.outputTokens ?? 0,
    usingUserKey: false,
    userId: ctx.userId,
  });
}

/**
 * Wraps a platform-default provider/tool call with billing pre/post gates.
 * Returns the execute() result on success, or a blocked payload when the user
 * has no credits.
 */
export async function billableCall<T>(
  execute: () => Promise<T>,
  ctx: ProxyCallContext
): Promise<T | { ok: false; blocked: true; error: string; code: "insufficient_credits"; message: string; action: "top_up" }> {
  const gate = await assertCredits(ctx);
  if (!gate.allowed) {
    const action: "top_up" = gate.payload?.action ?? "top_up";
    return {
      ok: false,
      blocked: true,
      error: gate.payload?.message ?? "Insufficient credits.",
      code: "insufficient_credits",
      message: gate.payload?.message ?? "",
      action,
    };
  }

  const result = await execute();
  if (!ctx.usingUserKey) await meterProxyCtx(ctx);
  return result;
}
