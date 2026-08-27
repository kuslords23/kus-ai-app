/**
 * Credit-based token metering.
 *
 * Middleware that computes the credit cost of an AI call (input + output
 * tokens across OpenRouter / Gemini / multi-provider adapters when platform
 * default keys are used) and debits the user's credit balance in real time.
 * BYOK calls are never deducted — they're billed upstream to the user's own key.
 *
 * Credit tariff is configurable via env; flagship models carry a multiplier.
 */

import { debitUser, getBalance } from "@/server/payments";

/** Credits per 1K input tokens. */
const INPUT_CREDITS_PER_K = Number(process.env.AI_INPUT_CREDITS_PER_1K) || 0.02;
/** Credits per 1K output tokens. */
const OUTPUT_CREDITS_PER_K = Number(process.env.AI_OUTPUT_CREDITS_PER_1K) || 0.08;
/** Flagship models charge this × the standard tariff. */
const FLAGSHIP_MULTIPLIER = Number(process.env.AI_FLAGSHIP_MULTIPLIER) || 4;

export const FLAGSHIP_MODELS: string[] = [
  "gpt-4",
  "gpt-4o",
  "claude-3.5-sonnet",
  "claude-3-opus",
  "claude-opus",
  "sonnet",
  "gemini-2.5-pro",
  "deepseek-reasoner",
];

export function isFlagshipModel(model: string): boolean {
  const m = model.toLowerCase();
  return FLAGSHIP_MODELS.some((f) => m.includes(f));
}

export interface MeteredCall {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** True when the call was served on platform default keys (billable). */
  usingUserKey: boolean;
  userId?: string;
}

/** Computes the credit cost for a metered call. */
export function creditCost(call: Pick<MeteredCall, "model" | "inputTokens" | "outputTokens">): number {
  const flagship = isFlagshipModel(call.model) ? FLAGSHIP_MULTIPLIER : 1;
  const input = (call.inputTokens / 1000) * INPUT_CREDITS_PER_K * flagship;
  const output = (call.outputTokens / 1000) * OUTPUT_CREDITS_PER_K * flagship;
  return Math.max(input + output, 0.001); // floor per call
}

/** Current credit balance. */
export async function currentCredits(userId: string): Promise<number> {
  return getBalance(userId);
}

/**
 * Meters a completed AI call: debits credits when platform default keys were
 * used (never for BYOK). Returns the new balance and whether the account is now
 * soft-locked (balance ≤ 0).
 */
export async function meterAiCall(call: MeteredCall): Promise<{ ok: boolean; balance: number; cost: number; locked: boolean }> {
  if (call.usingUserKey || !call.userId) {
    return { ok: true, balance: Number.MAX_SAFE_INTEGER, cost: 0, locked: false };
  }

  const cost = creditCost(call);
  const result = await debitUser(call.userId, cost, "ai-call", {
    route: "ai_generation",
    model: call.model,
    provider: call.provider,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
  });
  return { ok: result.ok, balance: result.balance, cost, locked: !result.ok };
}