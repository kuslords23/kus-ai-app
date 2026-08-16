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

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_CHAT_URL = `${OPENROUTER_BASE_URL}/chat/completions`;

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

/** Per-modality model pipelines in failover order. */
export const MODALITY_MODELS: Record<GenerationModality, string[]> = {
  conversation: [DEFAULT_FREE_MODEL, "openai/gpt-4.1-mini", "google/gemini-2.5-flash"],
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
    "HTTP-Referer": "https://kus-ai-app.vercel.app",
    "X-Title": "Kus AI Jyinx Gateway",
  };
}

function buildMessages(req: GatewayRequest): { role: "system" | "user"; content: unknown }[] {
  const messages: { role: "system" | "user"; content: unknown }[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  if (req.images?.length) {
    const parts: unknown[] = [{ type: "text", text: req.prompt }];
    for (const img of req.images) {
      parts.push({ type: "image_url", image_url: { url: img } });
    }
    messages.push({ role: "user", content: parts });
  } else {
    messages.push({ role: "user", content: req.prompt });
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
  return { content, usage: data?.usage, media: data?.data };
}

/**
 * Routes a generation request:
 * - default free-tier routing with failover across candidates
 * - reasoning / image / video modality adapters
 * - BYOK attaches a user-supplied provider key at exact upstream cost
 */
export async function generate(apiKey: string, req: GatewayRequest): Promise<GatewayResponse> {
  const modality = req.modality ?? "conversation";
  const fromRaw = (source: "openrouter" | "byok", raw: NonNullable<RawResponse>, model: string, media?: string[]): GatewayResponse => ({
    content: raw.content ?? "",
    model,
    modality,
    usage: toUsage(raw.usage),
    source,
    media,
  });

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
      return fromRaw("byok", raw, req.model ?? "openrouter/auto");
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
      return fromRaw("openrouter", raw, model, media);
    } catch (cause) {
      lastError = cause instanceof Error ? cause.message : "Gateway call failed.";
    }
  }
  return { content: "", model: candidates[0], modality, source: "error", error: lastError || "All candidate models failed." };
}