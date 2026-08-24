/**
 * Multi-provider LLM registry.
 *
 * A single modular schema describing each supported AI provider: base URL,
 * auth header shape, default model lists, and free-tier/fallback endpoints.
 * Used by the BYOK vault, the settings hub, and the dynamic proxy router so
 * every provider resolves to the same shape and can be invoked interchangeably.
 */

export type ProviderKind =
  | "openai"           // /chat/completions OpenAI-shaped API
  | "anthropic"        // /v1/messages message-shaped API
  | "google";          // Generative Language API (models/:model:generateContent)

export interface AIConfig {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  /** Auth header key (e.g. "Authorization", "x-goog-api-key"). */
  headerName: string;
  /** Prefix for the auth header value (e.g. "Bearer "). */
  headerPrefix: string;
  /** Models user can choose from, in display order. */
  models: string[];
  /** Where to send requests. "chat" → chat/completions, "generate" → generateContent. */
  endpoint: "chat" | "generate" | "messages";
  /** Official docs URL for the "Get a key" flow. */
  docsUrl: string;
  /** A reliable zero/cheap-capable fallback model id used when a chosen model errors. */
  fallbackModel: string;
}

export const AI_PROVIDERS: Record<string, AIConfig> = {
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    headerName: "Authorization",
    headerPrefix: "Bearer ",
    models: [
      "openrouter/free",
      "openrouter/auto",
      "stealth/ox-alpha:free",
      "stealth/ox-alpha",
      "openai/gpt-4o-mini",
      "anthropic/claude-3.5-haiku",
      "meta-llama/llama-3.1-8b-instruct:free",
      "google/gemini-2.5-flash",
    ],
    endpoint: "chat",
    docsUrl: "https://openrouter.ai/settings/keys",
    fallbackModel: "openrouter/free",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    headerName: "Authorization",
    headerPrefix: "Bearer ",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-3.5-turbo"],
    endpoint: "chat",
    docsUrl: "https://platform.openai.com/api-keys",
    fallbackModel: "gpt-4o-mini",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    headerName: "x-api-key",
    headerPrefix: "",
    models: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-haiku-20240307"],
    endpoint: "messages",
    docsUrl: "https://console.anthropic.com/settings/keys",
    fallbackModel: "claude-3-haiku-20240307",
  },
  groq: {
    id: "groq",
    label: "Groq",
    kind: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    headerName: "Authorization",
    headerPrefix: "Bearer ",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
    endpoint: "chat",
    docsUrl: "https://console.groq.com/keys",
    fallbackModel: "llama-3.1-8b-instant",
  },
  together: {
    id: "together",
    label: "Together AI",
    kind: "openai",
    baseUrl: "https://api.together.xyz/v1",
    headerName: "Authorization",
    headerPrefix: "Bearer ",
    models: ["meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo", "mistralai/Mixtral-8x7B-Instruct-v0.1"],
    endpoint: "chat",
    docsUrl: "https://api.together.xyz/settings/api-keys",
    fallbackModel: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    headerName: "Authorization",
    headerPrefix: "Bearer ",
    models: ["deepseek-chat", "deepseek-reasoner"],
    endpoint: "chat",
    docsUrl: "https://platform.deepseek.com/api_keys",
    fallbackModel: "deepseek-chat",
  },
  mistral: {
    id: "mistral",
    label: "Mistral AI",
    kind: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    headerName: "Authorization",
    headerPrefix: "Bearer ",
    models: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"],
    endpoint: "chat",
    docsUrl: "https://console.mistral.ai/api-keys",
    fallbackModel: "mistral-small-latest",
  },
  cohere: {
    id: "cohere",
    label: "Cohere",
    kind: "openai",
    baseUrl: "https://api.cohere.com/v1",
    headerName: "Authorization",
    headerPrefix: "Bearer ",
    models: ["command-r-plus", "command-r", "command-nightly"],
    endpoint: "chat",
    docsUrl: "https://dashboard.cohere.com/api-keys",
    fallbackModel: "command-r",
  },
  perplexity: {
    id: "perplexity",
    label: "Perplexity",
    kind: "openai",
    baseUrl: "https://api.perplexity.ai",
    headerName: "Authorization",
    headerPrefix: "Bearer ",
    models: ["sonar-pro", "sonar", "sonar-small"],
    endpoint: "chat",
    docsUrl: "https://www.perplexity.ai/settings/api",
    fallbackModel: "sonar-small",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    kind: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    headerName: "x-goog-api-key",
    headerPrefix: "",
    models: [
      "gemini-3.7-flash",
      "gemini-3.6-flash",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash",
    ],
    endpoint: "generate",
    docsUrl: "https://aistudio.google.com/app/apikey",
    fallbackModel: "gemini-2.5-flash",
  },
};

/** Ordered list for the provider picker UI. */
export const AI_PROVIDER_LIST: AIConfig[] = [
  AI_PROVIDERS.openrouter,
  AI_PROVIDERS.gemini,
  AI_PROVIDERS.openai,
  AI_PROVIDERS.anthropic,
  AI_PROVIDERS.groq,
  AI_PROVIDERS.together,
  AI_PROVIDERS.deepseek,
  AI_PROVIDERS.mistral,
  AI_PROVIDERS.cohere,
  AI_PROVIDERS.perplexity,
];

export function getProvider(id: string | null | undefined): AIConfig | null {
  return AI_PROVIDERS[id ?? ""] ?? null;
}

/** Prioritized fallback chain when the platform (non-BYOK) route is used. */
export const FREE_FALLBACK_ORDER: string[] = [
  "openrouter/free",
  "google/gemini-2.5-flash:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "openrouter/auto",
];