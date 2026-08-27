/**
 * Gateway configuration layer.
 *
 * Resolves which router platform / provider to talk to from environment
 * variables alone — switching `AI_GATEWAY_PROVIDER` (and friends) is enough to
 * move between OpenRouter, Vercel/Cloudflare AI Gateway, LiteLLM, Portkey,
 * Braintrust, or a direct OpenAI-compatible provider without touching callers.
 */
import { getProvider, type AIConfig } from "@/server/ai/providers";
import type { GatewayProviderId } from "./types";

export interface GatewayConfig {
  provider: GatewayProviderId;
  /** Resolved base URL (no trailing slash). */
  baseUrl: string;
  /** Platform API key (a virtual/sub-key can override per-call). */
  apiKey: string | null;
  /** Auth header name (e.g. "Authorization", "x-api-key"). */
  headerName: string;
  /** Auth value prefix (e.g. "Bearer "). */
  headerPrefix: string;
  /** Extra headers to send (e.g. OpenRouter referer/title). */
  extraHeaders?: Record<string, string>;
  /** Primary model used when a request omits `model`. */
  primaryModel: string;
  /** Ordered fallback models for failover when the primary fails. */
  fallbackModels: string[];
  maxRetries: number;
  requestTimeoutMs: number;
  telemetryEnabled: boolean;
  /** When provider === "direct", the direct provider id (openai, groq, …). */
  directProvider?: string;
  /** Resolved direct-provider config (for header shape reuse). */
  directConfig?: AIConfig | null;
}

const PROVIDER_KEYS: Record<string, string | undefined> = {
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  groq: process.env.GROQ_API_KEY,
  together: process.env.TOGETHER_API_KEY,
  deepseek: process.env.DEEPSEEK_API_KEY,
  mistral: process.env.MISTRAL_API_KEY,
  cohere: process.env.COHERE_API_KEY,
  perplexity: process.env.PERPLEXITY_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
};

function baseUrlFor(provider: GatewayProviderId, direct?: AIConfig | null): string {
  switch (provider) {
    case "openrouter":
      return "https://openrouter.ai/api/v1";
    case "litellm":
      return "https://litellm.example.com/v1";
    case "portkey":
      return "https://api.portkey.ai/v1";
    case "braintrust":
      return "https://api.braintrust.dev/v1";
    case "vercel":
      return "https://ai-gateway.vercel.sh/v1";
    case "direct":
      return direct?.baseUrl ?? "https://api.openai.com/v1";
  }
}

function apiKeyFor(provider: GatewayProviderId, direct?: AIConfig | null): string | null {
  switch (provider) {
    case "openrouter":
      return process.env.OPENROUTER_API_KEY ?? process.env.AI_GATEWAY_API_KEY ?? null;
    case "vercel":
    case "litellm":
    case "portkey":
    case "braintrust":
      return process.env.AI_GATEWAY_API_KEY ?? null;
    case "direct":
      return (
        process.env.AI_GATEWAY_API_KEY ??
        (direct ? (PROVIDER_KEYS[direct.id] ?? null) : process.env.OPENAI_API_KEY) ??
        null
      );
  }
}

/**
 * Reads the environment and produces the active gateway config. Safe to call
 * repeatedly (no caching) so env changes are picked up between invocations.
 */
export function resolveGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const raw = (env.AI_GATEWAY_PROVIDER ?? "openrouter").trim().toLowerCase();
  const provider: GatewayProviderId =
    raw === "vercel" || raw === "litellm" || raw === "portkey" || raw === "braintrust" || raw === "direct"
      ? raw
      : "openrouter";

  const directId = (env.AI_DIRECT_PROVIDER ?? "openai").trim().toLowerCase();
  const directConfig = provider === "direct" ? getProvider(directId) : null;

  const baseUrl =
    (env.AI_GATEWAY_BASE_URL ?? "").trim().replace(/\/+$/, "") || baseUrlFor(provider, directConfig);
  const apiKey = apiKeyFor(provider, directConfig);

  const extraHeaders: Record<string, string> = {};
  if (provider === "openrouter") {
    extraHeaders["HTTP-Referer"] =
      env.NEXT_PUBLIC_APP_URL ?? env.NEXT_PUBLIC_SITE_URL ?? "https://kus-ai-app.vercel.app";
    extraHeaders["X-Title"] = env.NEXT_PUBLIC_APP_NAME ?? "Kus-Lords / Kus AI";
  }

  const fallbackRaw = (env.AI_FALLBACK_MODELS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const fallbackModels =
    fallbackRaw.length > 0
      ? fallbackRaw
      : [
          "openrouter/free",
          "google/gemini-2.5-flash",
          "openai/gpt-4o-mini",
        ];

  return {
    provider,
    baseUrl,
    apiKey,
    headerName: provider === "direct" ? (directConfig?.headerName ?? "Authorization") : "Authorization",
    headerPrefix: provider === "direct" ? (directConfig?.headerPrefix ?? "Bearer ") : "Bearer ",
    extraHeaders,
    primaryModel: (env.AI_PRIMARY_MODEL ?? "").trim() || "openrouter/free",
    fallbackModels,
    maxRetries: clampInt(env.AI_MAX_RETRIES, 3, 0, 6),
    requestTimeoutMs: clampInt(env.AI_REQUEST_TIMEOUT_MS, 60_000, 1_000, 300_000),
    telemetryEnabled: env.AI_TELEMETRY_ENABLED !== "false",
    directProvider: provider === "direct" ? directConfig?.id : undefined,
    directConfig,
  };
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** All supported gateway ids (for Settings UI / docs). */
export const GATEWAY_PROVIDERS: ReadonlyArray<{ id: GatewayProviderId; label: string }> = [
  { id: "openrouter", label: "OpenRouter" },
  { id: "vercel", label: "Vercel AI Gateway" },
  { id: "litellm", label: "LiteLLM" },
  { id: "portkey", label: "Portkey" },
  { id: "braintrust", label: "Braintrust" },
  { id: "direct", label: "Direct provider" },
];
