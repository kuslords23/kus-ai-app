/**
 * DYNAMIC MULTI-PROVIDER PROXY ROUTER.
 *
 * Central routing for Jyinx agents and Royal chat. Resolution order:
 *   1. User's personal BYOK key for the selected provider (default route —
 *      billed to their own quota at raw upstream cost).
 *   2. New-user free-tier buffer, then the platform hard daily cap.
 *   3. Automatic model fallback across free-capable variants (OpenRouter's
 *      universal `openrouter/free` router; Gemini's Flash lineup) whenever a
 *      requested model returns 404 / 429 / resource-exhausted / deprecated.
 *   4. Platform default keys strictly as a buffer for brand-new users.
 */

import {
  FREE_FALLBACK_ORDER,
  getProvider,
  type AIConfig,
} from "@/server/ai/providers";
import { openRouterChat, type ChatMessage } from "@/server/ai/openrouter";
import {
  geminiGenerate,
  FLASH_FALLBACK_MODELS,
} from "@/server/ai/gemini";
import { evaluateQuota, recordConsumption, type QuotaSubject } from "@/server/ai/quotas";
import { getByokKey } from "@/server/auth/byok";

export interface RouterRequest {
  provider: string;
  model?: string;
  prompt: string;
  system?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  userId?: string;
  ip?: string;
  temperature?: number;
  maxTokens?: number;
  /** When true, skip BYOK so platform buffer is used (new-user onboarding). */
  forcePlatformKey?: boolean;
}

export interface RouterResult {
  content: string;
  model: string;
  provider: string;
  usedUserKey: boolean;
  retried: boolean;
  error?: string;
  exceeded?: boolean;
  notice?: { level: "info" | "warn"; message: string };
}

const PLATFORM_KEYS: Record<string, string | undefined> = {
  openrouter: process.env.OPENROUTER_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  groq: process.env.GROQ_API_KEY,
  together: process.env.TOGETHER_API_KEY,
  deepseek: process.env.DEEPSEEK_API_KEY,
  mistral: process.env.MISTRAL_API_KEY,
  cohere: process.env.COHERE_API_KEY,
  perplexity: process.env.PERPLEXITY_API_KEY,
};

const FLASH_MODELS = FLASH_FALLBACK_MODELS;

function buildMessages(req: RouterRequest): ChatMessage[] {
  const core: ChatMessage[] = [];
  if (req.system) core.push({ role: "system", content: req.system });
  for (const turn of req.history ?? []) {
    if (turn.role !== "user" && turn.role !== "assistant") continue;
    core.push({ role: turn.role, content: turn.content });
  }
  core.push({ role: "user", content: req.prompt });
  return core;
}

function safeText(content: string | Array<Record<string, unknown>>): string {
  return typeof content === "string" ? content : "…";
}

function subjectFor(req: RouterRequest, usedUserKey: boolean): QuotaSubject {
  const hasUser = Boolean(req.userId);
  return {
    scope: hasUser ? "user" : "ip",
    subject: (req.userId ?? req.ip ?? "anon").slice(0, 128),
    usingUserKey: usedUserKey,
    isNewUser: !usedUserKey && !hasUser, // anonymous free-buffer traffic
  };
}

type ProviderOutcome = { content: string; model: string; retried: boolean; error?: string };

async function openAiCompatibleCall(
  apiKey: string,
  config: AIConfig,
  candidate: string,
  messages: ChatMessage[],
  req: RouterRequest
): Promise<{ content: string; error?: string }> {
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.headerName === "Authorization"
          ? { Authorization: `${config.headerPrefix}${apiKey}` }
          : { [config.headerName]: `${config.headerPrefix}${apiKey}` }),
      },
      body: JSON.stringify({
        model: candidate,
        messages,
        temperature: req.temperature,
        max_tokens: req.maxTokens,
      }),
      cache: "no-store",
    });
    const data = (await response.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
      error?: { message?: string };
    } | null;
    if (!response.ok) return { content: "", error: data?.error?.message || `HTTP ${response.status}` };
    const raw = data?.choices?.[0]?.message?.content;
    const content = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((p) => p.text ?? "").join("") : "";
    return { content };
  } catch (cause) {
    return { content: "", error: cause instanceof Error ? cause.message : "HTTP error" };
  }
}

async function runProvider(
  apiKey: string,
  config: AIConfig,
  requestedModel: string,
  messages: ChatMessage[],
  req: RouterRequest
): Promise<ProviderOutcome> {
  // Gemini — dedicated Generative Language API client with Flash fallback.
  if (config.endpoint === "generate") {
    const result = await geminiGenerate(apiKey, {
      model: requestedModel,
      apiKey,
      systemPrompt: messages.find((m) => m.role === "system") ? safeText(messages.find((m) => m.role === "system")!.content) : undefined,
      messages: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: safeText(m.content) }] })),
      temperature: req.temperature,
      maxTokens: req.maxTokens,
    });
    return { content: result.content, model: result.model, retried: result.retried ?? false, error: result.error };
  }

  // Anthropic-shaped Messages API.
  if (config.endpoint === "messages") {
    const system = messages.find((m) => m.role === "system");
    const turns: Array<{ role: "user" | "assistant"; content: string }> = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: safeText(m.content),
      }));
    for (const candidate of [requestedModel, config.fallbackModel]) {
      const out = await anthropicCall(apiKey, candidate, turns, system, req);
      if (!out.error) return { content: out.content, model: candidate, retried: candidate !== requestedModel };
    }
    return { content: "", model: requestedModel, retried: false, error: "All Anthropic models failed." };
  }

  // OpenRouter (with automatic free-tier auto-routing).
  if (config.id === "openrouter") {
    const res = await openRouterChat(apiKey, { model: requestedModel, messages, temperature: req.temperature, maxTokens: req.maxTokens });
    return { content: res.content, model: res.model, error: res.error, retried: res.retried ?? false };
  }

  // Other OpenAI-compatible providers with a single fallback attempt.
  for (const candidate of [requestedModel, config.fallbackModel]) {
    const out = await openAiCompatibleCall(apiKey, config, candidate, messages, req);
    if (!out.error) return { content: out.content, model: candidate, retried: candidate !== requestedModel };
  }
  return { content: "", model: requestedModel, retried: false, error: `All ${config.label} models failed.` };
}

async function anthropicCall(
  apiKey: string,
  model: string,
  turns: Array<{ role: "user" | "assistant"; content: string }>,
  system: ChatMessage | undefined,
  req: RouterRequest
): Promise<{ content: string; error?: string }> {
  try {
    const body: Record<string, unknown> = { model, max_tokens: req.maxTokens ?? 1024, messages: turns };
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (system) body.system = safeText(system.content);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await response.json().catch(() => null)) as {
      content?: Array<{ text?: string }>;
      error?: { message?: string };
    } | null;
    if (!response.ok) return { content: "", error: data?.error?.message || `HTTP ${response.status}` };
    const content = (data?.content ?? []).map((p) => p.text ?? "").join("");
    return { content };
  } catch (cause) {
    return { content: "", error: cause instanceof Error ? cause.message : "HTTP error" };
  }
}

export interface RouteRequest extends RouterRequest {}

export interface RouteOutcome extends ProviderOutcome {}

/**
 * Executes a request across any integrated provider with BYOK-first,
 * free-buffer, and model-fallback resolution.
 */
export async function routeAi(req: RouterRequest): Promise<RouterResult> {
  const config = getProvider(req.provider);
  if (!config) {
    return { content: "", model: req.model ?? "", provider: req.provider, usedUserKey: false, retried: false, error: `Unknown provider: ${req.provider}` };
  }

  // 1. Resolve key (BYOK first, else platform buffer).
  let apiKey = "";
  let usedUserKey = false;
  if (req.userId && !req.forcePlatformKey) {
    const personal = await getByokKey(String(req.userId).slice(0, 128), config.id as never);
    if (personal) {
      apiKey = personal;
      usedUserKey = true;
    }
  }
  if (!apiKey) apiKey = PLATFORM_KEYS[config.id] ?? "";
  if (!apiKey) {
    return { content: "", model: req.model ?? "", provider: config.id, usedUserKey: false, retried: false, error: `${config.label} is not configured. Add a key in Settings.` };
  }

  // 2. Quota gates (skip for BYOK).
  const subject = subjectFor(req, usedUserKey);
  if (!usedUserKey) {
    const quota = await evaluateQuota(subject);
    if (!quota.allowed) {
      return {
        content: "",
        model: req.model ?? "",
        provider: config.id,
        usedUserKey: false,
        retried: false,
        error: quota.notice?.message ?? "Quota reached.",
        exceeded: true,
        notice: quota.notice,
      };
    }
  }

  // 3. Execute with provider-level fallback.
  const requestedModel = req.model || config.fallbackModel;
  const messages = buildMessages(req);
  const outcome = await runProvider(apiKey, config, requestedModel, messages, req);

  if (!usedUserKey) await recordConsumption(subject);

  return {
    content: outcome.content,
    model: outcome.model,
    provider: config.id,
    usedUserKey,
    retried: outcome.retried,
    error: outcome.error,
  };
}

/** Default fallback lists for UI/agent hints. */
export function preferredFallbackModels(config: AIConfig): string[] {
  if (config.id === "openrouter") return FREE_FALLBACK_ORDER;
  if (config.kind === "google") return FLASH_MODELS;
  return [config.fallbackModel];
}

/** Re-export so callers can normalize Gemini ids. */
export { FLASH_MODELS };