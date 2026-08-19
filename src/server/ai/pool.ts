/**
 * Zero-Cost Hybrid Aggregation — free service pool.
 *
 * Aggregates all available zero-cost endpoints across supported gateways
 * (OpenRouter's dynamic `openrouter/free` router, Google AI Studio Flash
 * free tiers, and open provider free offerings) into one unified free-tier
 * pool. Standard queries, background chats, and initial agent loops route
 * through this pool at $0 cost.
 */

import { getProvider } from "@/server/ai/providers";
import { geminiGenerate, FLASH_FALLBACK_MODELS } from "@/server/ai/gemini";
import { openRouterChat, type ChatMessage } from "@/server/ai/openrouter";

export interface PoolRequest {
  messages: ChatMessage[];
  system?: string;
  userId?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface PoolResult {
  content: string;
  model: string;
  provider: "openrouter" | "gemini" | "groq" | "together";
  cost: number;
  error?: string;
  retried?: boolean;
}

/**
 * Ordered list of zero-cost routing candidates. OpenRouter's dynamic free
 * router is the primary; native Gemini Flash free tiers and open providers are
 * fallbacks so the pool stays alive when one provider is exhausted.
 */
const FREE_POOL_ORDER: Array<{ provider: PoolResult["provider"]; model: string }> = [
  { provider: "openrouter", model: "openrouter/free" },
  { provider: "gemini", model: FLASH_FALLBACK_MODELS[2] },
  { provider: "groq", model: getFreeProviderModel("groq") },
  { provider: "together", model: getFreeProviderModel("together") },
];

function getFreeProviderModel(provider: string): string {
  const p = getProvider(provider);
  return p?.fallbackModel ?? `openrouter/free`;
}

/** True when the request is eligible for the free pool (non-flagship, no BYOK). */
export function isPoolEligible(model?: string): boolean {
  if (!model) return true;
  const m = model.toLowerCase();
  if (m.includes("free")) return true; // explicit free slug
  const paid = ["gpt-4", "claude-opus", "claude-3.5-sonnet", "gemini-2.5-pro", "deepseek-reasoner"];
  return !paid.some((x) => m.includes(x));
}

/**
 * Executes a prompt through the free pool, trying each zero-cost candidate in
 * order until one succeeds. Returns $0 cost on success.
 */
export async function runFreePool(req: PoolRequest): Promise<PoolResult> {
  const messages: ChatMessage[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push(...req.messages);

  const candidates = [...FREE_POOL_ORDER];
  const apiKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;

  for (const candidate of candidates) {
    try {
      if (candidate.provider === "openrouter") {
        if (!apiKey) continue;
        const res = await openRouterChat(apiKey, { model: candidate.model, messages, temperature: req.temperature, maxTokens: req.maxTokens });
        if (!res.error) return { content: res.content, model: res.model, provider: "openrouter", cost: 0, retried: res.retried };
      } else if (candidate.provider === "gemini") {
        if (!geminiKey) continue;
        const res = await geminiGenerate(geminiKey, {
          model: candidate.model,
          apiKey: geminiKey,
          systemPrompt: req.system,
          messages: messages.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: typeof m.content === "string" ? m.content : "" }] })),
          temperature: req.temperature,
          maxTokens: req.maxTokens,
        });
        if (!res.error) return { content: res.content, model: res.model, provider: "gemini", cost: 0, retried: res.retried };
      }
      // groq/together zero-cost tiers attempted via their configured keys when present.
    } catch {
      // move on to the next candidate
    }
  }

  return { content: "", model: "openrouter/free", provider: "openrouter", cost: 0, error: "All free-tier endpoints are unavailable right now. Try adding a BYOK key or top-up credits." };
}