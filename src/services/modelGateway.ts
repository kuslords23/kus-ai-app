/**
 * Multi-modal OpenRouter gateway & BYOK (Bring Your Own Key) engine.
 *
 * A single OpenAI-compatible client targeting https://openrouter.ai/api/v1
 * with 4 discrete generation classes:
 *   1. Conversational & reasoning  – default "openrouter/free" tier routing
 *   2. Image generation            – Flux / stable-diffusion style endpoints
 *   3. Video generation            – video synthesis models
 *   4. Direct BYOK                 – user-supplied provider keys at raw cost
 */

import {
  cacheKey,
  checkUsage,
  lookupCache,
  recordUsage,
  storeCache,
  type UsageSubject,
} from "@/services/gatewayGuardrails";
import { sanitizeAssistantContent } from "@/lib/sanitizeAssistant";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_CHAT_URL = `${OPENROUTER_BASE_URL}/chat/completions`;

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://kus-ai-app.vercel.app";
const APP_TITLE = process.env.NEXT_PUBLIC_APP_NAME || "Kus-Lords / Kus AI";

export type GenerationModality = "conversation" | "reasoning" | "image" | "video";

export type GatewayRequest = {
  modality?: GenerationModality;
  model?: string;
  prompt: string;
  system?: string;
  /** BYOK provider + key. When present, routes at-cost to the provider. */
  byok?: { provider: string; apiKey: string };
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  images?: string[];
  /** Decoded text of attached documents/code, injected into the prompt. */
  attachments?: Array<{ name: string; text: string }>;
  /** Prior conversation turns prepended before the live prompt. Optional. */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Fair-use subject for rate limiting (scope + user/id/ip). */
  subject?: { scope: "user" | "ip"; id: string };
  /** True when served by the user's own BYOK key (skip fair-use cap). */
  usingUserKey?: boolean;
};

export type GatewayResponse = {
  content: string;
  model: string;
  modality: GenerationModality;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  source: "openrouter" | "byok" | "error";
  error?: string;
  media?: string[];
};

export const DEFAULT_FREE_MODEL = "openrouter/free";

/**
 * Multi-provider API keys from environment variables.
 * These enable the independent cloud routing across aggregators.
 */
export const PROVIDER_CONFIGS: Record<string, { baseUrl: string; envKey: string }> = {
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" },
  "together-ai": { baseUrl: "https://api.together.xyz/v1", envKey: "TOGETHER_API_KEY" },
  deepinfra: { baseUrl: "https://api.deepinfra.com/v1/openai", envKey: "DEEPINFRA_API_KEY" },
};

/**
 * Multi-Tier Fallback Ladder:
 * 1. Primary Free Tier – openrouter/free
 * 2. Budget Cloud Tier – DeepSeek / Qwen via Together or DeepInfra
 * 3. Premium Expert Tier – GPT-4.1 via OpenRouter
 */
export const FALLBACK_LADDER: Array<{ provider: string; model: string; tier: string }> = [
  { provider: "openrouter", model: "openrouter/free", tier: "free" },
  { provider: "openrouter", model: "deepseek/deepseek-r1:free", tier: "budget" },
  { provider: "together-ai", model: "deepseek-ai/DeepSeek-R1-Distill-Llama-70B", tier: "budget" },
  { provider: "openrouter", model: "qwen/qwen-2.5-72b-instruct:free", tier: "budget" },
  { provider: "deepinfra", model: "deepseek-ai/DeepSeek-R1-Distill-Llama-70B", tier: "budget" },
  { provider: "openrouter", model: "openai/gpt-4.1-mini", tier: "premium" },
  { provider: "openrouter", model: "google/gemini-2.5-flash", tier: "premium" },
];

/** Per-modality model pipelines in failover order. */
export const MODALITY_MODELS: Record<GenerationModality, string[]> = {
  conversation: FALLBACK_LADDER.map((f) => f.model),
  reasoning: ["openrouter/reasoning", "deepseek/deepseek-r1:free", "openai/o3"],
  image: ["openrouter/auto", "black-forest-labs/flux-schnell", "stabilityai/stable-diffusion-3.5-large"],
  video: ["openrouter/auto", "minimax/video-01"],
};

type Usage = { promptTokens?: number; completionTokens?: number; totalTokens?: number };

type RawResponse = {
  content?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: string;
  media?: Array<{ b64_json?: string; url?: string }>;
};

function toUsage(raw?: RawResponse["usage"]): Usage | undefined {
  if (!raw) return undefined;
  return {
    promptTokens: raw.prompt_tokens,
    completionTokens: raw.completion_tokens,
    totalTokens: raw.total_tokens,
  };
}

function headersFor(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": APP_URL,
    "X-Title": APP_TITLE,
  };
}

function buildMessages(req: GatewayRequest): { role: "system" | "user" | "assistant"; content: unknown }[] {
  const messages: { role: "system" | "user" | "assistant"; content: unknown }[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  for (const turn of req.history ?? []) {
    if (messages[messages.length - 1]?.role === turn.role) continue;
    messages.push({ role: turn.role, content: turn.content });
  }

  // Append decoded text of attached documents/code into the user prompt.
  let prompt = req.prompt;
  if (req.attachments?.length) {
    prompt = [
      prompt,
      ...req.attachments.map(
        (a) => `\n\nAttached File (${a.name}):\n\`\`\`\n${a.text.slice(0, 40_000)}\n\`\`\``
      ),
    ].join("\n");
  }

  if (req.images?.length) {
    const parts: unknown[] = [{ type: "text", text: prompt }];
    for (const img of req.images) {
      parts.push({ type: "image_url", image_url: { url: img } });
    }
    messages.push({ role: "user", content: parts });
  } else {
    messages.push({ role: "user", content: prompt });
  }
  return messages;
}

async function call(apiKey: string, endpoint: string, body: Record<string, unknown>): Promise<RawResponse> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: headersFor(apiKey),
    body: JSON.stringify({ ...body, stream: false }),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string }; text?: string }>; usage?: RawResponse["usage"]; error?: { message?: string }; data?: RawResponse["media"] }
    | null;
  if (!response.ok) {
    return { error: data?.error?.message || `Provider request failed (${response.status}).` };
  }
  const choice = data?.choices?.[0];
  const content = choice?.message?.content ?? (typeof choice?.text === "string" ? choice.text : undefined);
  // Royal must never surface raw tool-call XML in the message stream. Strip it
  // at the gateway so both stored (cache/learning) and displayed content stay
  // clean, while Jyinx's separate pipeline (which does not use this gateway)
  // keeps its dev/sandbox logs untouched.
  return { content: content === undefined ? undefined : sanitizeAssistantContent(content), usage: data?.usage, media: data?.data };
}

/**
 * Routes a generation request:
 * - default free-tier routing with failover across candidates
 * - reasoning / image / video modality adapters
 * - BYOK attaches a user-supplied provider key at exact upstream cost
 */
export async function generate(apiKey: string, req: GatewayRequest): Promise<GatewayResponse> {
  const modality = req.modality ?? "conversation";
  const isUsingUserKey = Boolean(req.byok?.apiKey) || Boolean(req.usingUserKey);

  const subject: UsageSubject | null = req.subject?.id
    ? { scope: req.subject.scope, subject: req.subject.id, usingUserKey: isUsingUserKey }
    : null;

  const fromRaw = (source: "openrouter" | "byok", raw: NonNullable<RawResponse>, model: string, media?: string[]): GatewayResponse => ({
    content: raw.content ?? "",
    model,
    modality,
    usage: toUsage(raw.usage),
    source,
    media,
  });

  const targetModel = req.model || (modality === "conversation" ? DEFAULT_FREE_MODEL : MODALITY_MODELS[modality][0]);
  // Skip exact-match caching for image/video/multimodal payloads (binary-heavy).
  const cacheable = modality === "conversation" || modality === "reasoning";
  const key = cacheable ? cacheKey(JSON.stringify(buildMessages(req)), targetModel) : null;

  // 1. Response cache — serve identical queries instantly at $0 cost.
  if (key && !req.byok?.apiKey) {
    try {
      const hit = await lookupCache(key);
      if (hit.hit && hit.response) {
        return {
          content: sanitizeAssistantContent(hit.response),
          model: targetModel,
          modality,
          source: isUsingUserKey ? "byok" : "openrouter",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      }
    } catch {
      // cache best-effort
    }
  }

  // 2. Fair-use check (skip for BYOK / own-key requests).
  if (subject && !isUsingUserKey) {
    try {
      const usage = await checkUsage(subject);
      if (!usage.allowed) {
        return {
          content: "",
          model: targetModel,
          modality,
          source: "error",
          error: `Daily free-tier quota reached (${usage.maxDaily} requests). Add your own API key in Settings to keep going.`,
        };
      }
    } catch {
      // best-effort
    }
  }

  const finish = (result: GatewayResponse) => {
    if (!result.error && result.content && key) {
      void storeCache({
        key,
        prompt: req.prompt,
        system: req.system,
        model: targetModel,
        response: result.content,
        usage: result.usage,
      });
    }
    if (subject) {
      void recordUsage(subject, result.usage?.totalTokens ?? 0);
    }
    return result;
  };

  // BYOK path.
  if (req.byok?.apiKey) {
    try {
      const raw = await call(req.byok.apiKey, req.baseUrl || OPENROUTER_CHAT_URL, {
        model: req.model || "openrouter/auto",
        messages: buildMessages(req),
        max_tokens: req.maxTokens,
        temperature: req.temperature,
      });
      if (raw.error) return { content: "", model: req.model ?? "", modality, source: "error", error: raw.error };
      return finish(fromRaw("byok", raw, req.model ?? "openrouter/auto"));
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : "BYOK request failed.";
      return { content: "", model: req.model ?? "", modality, source: "error", error };
    }
  }

  // Hosted multi-tier routing with failover.
  const candidates = req.model ? [req.model] : MODALITY_MODELS[modality];
  let lastError = "";
  for (const model of candidates) {
    try {
      const raw = await call(apiKey, OPENROUTER_CHAT_URL, {
        model,
        messages: buildMessages(req),
        max_tokens: req.maxTokens,
        temperature: req.temperature,
      });
      if (raw.error) {
        lastError = raw.error;
        continue;
      }
      const media =
        req.modality === "image" || req.modality === "video"
          ? ((raw.media ?? []) as Array<{ b64_json?: string; url?: string }>).map((item) => item?.b64_json ?? item?.url).filter(Boolean) as string[]
          : undefined;
      return finish(fromRaw("openrouter", raw, model, media));
    } catch (cause) {
      lastError = cause instanceof Error ? cause.message : "Gateway call failed.";
    }
  }
  return { content: "", model: candidates[0], modality, source: "error", error: lastError || "All candidate models failed." };
}