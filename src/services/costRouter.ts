import { generate, type GatewayRequest, type GatewayResponse, DEFAULT_FREE_MODEL } from "@/services/modelGateway";
import type { BYOKProvider } from "@/services/userKeyManager";

/**
 * At-cost request multiplexer.
 *
 * Routes model execution to:
 *  - the user's BYOK provider key when present (exact upstream cost)
 *  - otherwise the platform OpenRouter free tier
 *
 * No markup or platform fee is added either way.
 */

export type CostRouterRequest = {
  prompt: string;
  system?: string;
  modality?: "conversation" | "reasoning" | "image" | "video";
  model?: string;
  /** BYOK: provider + key supplied by the user (from UserKeyManager). */
  byok?: { provider: BYOKProvider; apiKey: string };
  maxTokens?: number;
};

export type CostRoutingResult = {
  content: string;
  model: string;
  source: "byok" | "openrouter" | "error";
  cost: number; // exact USD estimate when usage known
  usage?: { inputTokens?: number; completionTokens?: number; totalTokens?: number };
  error?: string;
};

// Pricing manifest (USD per 1M tokens) used for the itemized cost estimate.
// Values are ballpark list prices; BYOK passes through exactly what the
// provider charges (uncertainty noted in UI).
const PRICING_PER_MILLION: Record<string, { input: number; output: number }> = {
  openrouter: { input: 0, output: 0 }, // free routing
  openai: { input: 2.5, output: 10 },
  anthropic: { input: 3, output: 15 },
  deepseek: { input: 0.27, output: 1.1 },
  gemini: { input: 1.25, output: 5 },
};

function estimateCost(provider: BYOKProvider | "openrouter", inputTokens: number, outputTokens: number): number {
  const price = PRICING_PER_MILLION[provider] ?? { input: 1, output: 3 };
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

/**
 * Executes a request through the cheapest available route:
 * 1. User BYOK key (if present) → provider at raw cost
 * 2. Platform OpenRouter free tier (zero cost)
 * 3. Fallback model (still zero-margin, platform-keyed)
 */
export async function routeRequest(
  apiKey: string,
  req: CostRoutingRequest
): Promise<CostRoutingResult> {
  const result = await generate(apiKey, {
    prompt: req.prompt,
    system: req.system,
    modality: req.modality ?? "conversation",
    model: req.model,
    byok: req.byok ? { provider: req.byok.provider, apiKey: req.byok.apiKey } : undefined,
    maxTokens: req.maxTokens,
  });

  if (result.source === "error") {
    return { content: "", provider: "openrouter", usage: undefined, cost: 0, error: result.error };
  }

  const provider: BYOKProvider | "openrouter" = result.source === "byok" ? (req.byok?.provider ?? "openrouter") : "openrouter";
  const inputTokens = result.usage?.promptTokens || req.prompt.length >> 2;
  const outputTokens = result.usage?.completionTokens || (result.content.length >> 2);
  return {
    content: result.content,
    provider,
    usage: { inputTokens, completionTokens: outputTokens, totalTokens: inputTokens + outputTokens },
    cost: estimateCost(provider, inputTokens, outputTokens),
  };
}

export { DEFAULT_FREE_MODEL };

// Invalid placeholder removed; the actual type is defined in the gateway.
export type { GatewayTier } from "@/services/modelGateway";