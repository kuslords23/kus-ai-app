/**
 * Flagship cost-gating gateway.
 *
 * Separates zero-cost pooled requests from paid premium operations. If a user
 * or agent explicitly requests a flagship heavy model (top-tier Claude, GPT-4
 * class, high-end reasoning), the request is gated: it must either use the
 * user's own BYOK key or have active credits. Free-pool-eligible requests route
 * through the aggregator at $0 cost.
 */

import { runFreePool, isPoolEligible } from "@/server/ai/pool";
import { routeAi } from "@/server/ai/router";
import { isFlagshipModel, meterAiCall, currentCredits } from "@/server/ai/metering";

export interface GatewayRequest {
  provider: string;
  prompt: string;
  model?: string;
  system?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  userId?: string;
  ip?: string;
  temperature?: number;
  maxTokens?: number;
  /** Explicitly treat the request as paid (bypasses free pool). */
  forcePaid?: boolean;
}

export interface GatewayDecision {
  route: "pool" | "byok" | "credits" | "blocked";
  content: string;
  model: string;
  provider: string;
  usedUserKey: boolean;
  retried: boolean;
  cost: number;
  creditsAfter?: number;
  error?: string;
  notice?: { level: "info" | "warn"; message: string };
}

/** Builds the OpenAI-compatible message list from a GatewayRequest. */
function buildMessages(req: GatewayRequest): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  for (const turn of req.history ?? []) {
    if (turn.role !== "user" && turn.role !== "assistant") continue;
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: "user", content: req.prompt });
  return messages;
}

async function hasPersonalByok(userId: string | undefined, provider: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const { getByokKey } = await import("@/server/auth/byok");
    return Boolean(await getByokKey(userId.slice(0, 128), provider as never));
  } catch {
    return false;
  }
}

function estimateTokens(prompt: string): { input: number; output: number } {
  return { input: Math.max(1, Math.floor(prompt.length / 3.8)), output: 64 };
}

/**
 * Routes a generation request:
 *   1. Flagship paid requests → billing gate (BYOK or credits).
 *   2. Everything else → free pool first ($0), then platform-default routes
 *      with credit metering.
 */
export async function gatewayExecute(req: GatewayRequest): Promise<GatewayDecision> {
  const model = req.model || "openrouter/free";
  const wantsFlagship = isFlagshipModel(model) || req.forcePaid === true;
  const poolEligible = !wantsFlagship && isPoolEligible(model);

  // Zero-cost path for standard / background tasks.
  if (poolEligible) {
    const pool = await runFreePool({
      messages: buildMessages(req),
      system: req.system,
      userId: req.userId,
      temperature: req.temperature,
      maxTokens: req.maxTokens,
    });
    if (!pool.error) {
      return { route: "pool", content: pool.content, model: pool.model, provider: pool.provider, usedUserKey: false, retried: pool.retried ?? false, cost: 0 };
    }
    // Pool exhausted → fall through to the provider router (still metered).
  }

  // Flagship path: require money or a personal key.
  if (wantsFlagship && req.userId) {
    const [balance, byok] = await Promise.all([currentCredits(req.userId), hasPersonalByok(req.userId, req.provider)]);
    if (balance <= 0 && !byok) {
      return {
        route: "blocked",
        content: "",
        model,
        provider: req.provider,
        usedUserKey: false,
        retried: false,
        cost: 0,
        error: "This model requires credits — top up in Billing or add your own API key in Settings.",
        notice: { level: "warn", message: "Flagship model — add credits or a BYOK key to continue." },
      };
    }
  } else if (model !== "openrouter/free" && req.userId) {
    // Non-free, non-flagship paid model: also require credits/BYOK.
    const [balance, byok] = await Promise.all([currentCredits(req.userId), hasPersonalByok(req.userId, req.provider)]);
    if (balance <= 0 && !byok) {
      return { route: "blocked", content: "", model, provider: req.provider, usedUserKey: false, retried: false, cost: 0, error: "Insufficient credits. Top up in Billing or add your own key in Settings." };
    }
  }

  // Dispatch to the multi-provider router (BYOK first, else platform keys).
  // `meter: false` — the gateway meters the call itself below (steps 5+) so
  // router-level metering doesn't double-deduct.
  const r = await routeAi({
    provider: req.provider,
    model,
    prompt: req.prompt,
    system: req.system,
    history: req.history,
    userId: req.userId,
    ip: req.ip,
    temperature: req.temperature,
    maxTokens: req.maxTokens,
    meter: false,
  });

  if (r.usedUserKey) {
    return { route: "byok", content: r.content, model: r.model, provider: r.provider, usedUserKey: true, retried: r.retried, error: r.error, cost: 0 };
  }

  if (!r.content && r.error) {
    return { route: "blocked", content: "", model: r.model, provider: r.provider, usedUserKey: false, retried: r.retried, cost: 0, error: r.error, notice: r.notice };
  }

  // Credits metered when the platform default key served the call.
  const tokens = estimateTokens(req.prompt);
  const call = {
    provider: r.provider,
    model: r.model,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    usingUserKey: false,
    userId: req.userId,
  };
  const metered = req.userId ? await meterAiCall(call) : { ok: true, balance: Number.MAX_SAFE_INTEGER, cost: 0, locked: false };
  return {
    route: "credits",
    content: r.content,
    model: r.model,
    provider: r.provider,
    usedUserKey: false,
    retried: r.retried,
    cost: metered.cost,
    creditsAfter: Number.isSafeInteger(metered.balance) ? metered.balance : undefined,
    error: r.error,
    notice: metered.locked ? { level: "warn", message: "Credit balance is now zero — top up or switch to BYOK." } : undefined,
  };
}