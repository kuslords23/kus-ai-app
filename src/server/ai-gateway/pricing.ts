/**
 * Cost estimation for gateway completions.
 *
 * Ballpark list prices (USD per 1M tokens) keyed by provider/gateway and by
 * model-family prefix. Env overrides (AI_PRICE_INPUT_PER_1M /
 * AI_PRICE_OUTPUT_PER_1M) apply a flat rate when set — useful for a LiteLLM /
 * Portkey / Braintrust unified billing rate.
 */

const PRICE_PER_MILLION: Record<string, { input: number; output: number }> = {
  openrouter: { input: 0, output: 0 },
  litellm: { input: 1, output: 3 },
  portkey: { input: 1, output: 3 },
  braintrust: { input: 1, output: 3 },
  openai: { input: 2.5, output: 10 },
  anthropic: { input: 3, output: 15 },
  deepseek: { input: 0.27, output: 1.1 },
  groq: { input: 0.15, output: 0.6 },
  mistral: { input: 0.25, output: 0.25 },
  cohere: { input: 0.5, output: 1.5 },
  perplexity: { input: 0.15, output: 0.6 },
  together: { input: 0.5, output: 1 },
  gemini: { input: 1.25, output: 5 },
};

/** Overrides usable for any gateway: a flat per-1M rate. */
function flatRate(): { input: number; output: number } | null {
  const i = Number(process.env.AI_PRICE_INPUT_PER_1M);
  const o = Number(process.env.AI_PRICE_OUTPUT_PER_1M);
  if (Number.isFinite(i) && Number.isFinite(o)) return { input: i, output: o };
  return null;
}

/** Pick the closest pricing bucket for a model id ("vendor/model" or bare). */
function bucketFor(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("claude")) return "anthropic";
  if (m.includes("gemini")) return "gemini";
  if (m.includes("deepseek")) return "deepseek";
  if (m.includes("llama") || m.includes("mixtral") || m.includes("qwen")) return "together";
  if (m.includes("gpt") || m.includes("o1") || m.includes("o3")) return "openai";
  if (m.startsWith("openrouter/") || m.includes(":free")) return "openrouter";
  return "openai";
}

/** Calculates a USD estimate for a completion. Cached-token aware not required. */
export function estimateUsd(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const flat = flatRate();
  if (flat) {
    return (inputTokens / 1_000_000) * flat.input + (outputTokens / 1_000_000) * flat.output;
  }
  const price = PRICE_PER_MILLION[provider] ?? PRICE_PER_MILLION[bucketFor(model)] ?? { input: 1, output: 3 };
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}
