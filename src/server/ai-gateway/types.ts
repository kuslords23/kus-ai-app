/**
 * Universal AI Gateway — shared types.
 *
 * All providers and router platforms are accessed through a single
 * OpenAI-compatible request/response contract (the de-facto standard that
 * OpenRouter, LiteLLM, Portkey, Braintrust, Vercel/Cloudflare AI Gateways and
 * direct OpenAI-shaped APIs all speak). This keeps callers agnostic: switching
 * `AI_GATEWAY_PROVIDER` never changes business logic.
 */

export type GatewayProviderId =
  | "openrouter"
  | "vercel"
  | "litellm"
  | "portkey"
  | "braintrust"
  | "direct";

export type ChatRole = "system" | "user" | "assistant" | "tool";

/** OpenAI-compatible chat message. */
export interface ChatMessage {
  role: ChatRole;
  content: string | Array<Record<string, unknown>>;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

/** OpenAI-compatible chat completion request. */
export interface ChatCompletionsRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  stream?: boolean;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  seed?: number;
  response_format?: Record<string, unknown>;
  tools?: unknown[];
  tool_choice?: unknown;
  user?: string;
  [key: string]: unknown;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** OpenAI-compatible non-streaming completion. */
export interface ChatCompletionData {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices: Array<{
    index?: number;
    message?: { role?: string; content?: string | null; tool_calls?: unknown[] };
    finish_reason?: string | null;
  }>;
  usage?: Usage | null;
}

/** OpenAI-compatible streaming chunk. */
export interface ChatCompletionChunk {
  id?: string;
  model?: string;
  choices: Array<{
    index?: number;
    delta?: { role?: string; content?: string | null; tool_calls?: unknown[] };
    finish_reason?: string | null;
  }>;
  usage?: Usage | null;
}

/** Normalized result returned by the gateway `chat.completions.create`. */
export interface ChatCompletionResult {
  ok: boolean;
  /** Concatenated text (non-streaming always sets it). */
  content: string;
  /** Actual responding model id (may differ from requested after fallback). */
  model: string;
  /** Model the caller asked for. */
  requestedModel: string;
  /** Provider / platform that served the request (e.g. "openrouter", "litellm"). */
  provider: string;
  /** The gateway id from `AI_GATEWAY_PROVIDER`. */
  gateway: GatewayProviderId;
  usage?: Usage;
  /** Calculated USD estimate. */
  cost: number;
  /** Total wall-clock latency in ms. */
  latencyMs: number;
  /** Time-to-first-token in ms (streaming only). */
  ttftMs?: number;
  retries: number;
  fallbackUsed: boolean;
  error?: string;
}

/** Telemetry record persisted to `ai_usage_requests`. */
export interface UsageTelemetry {
  userId?: string;
  ip?: string;
  gateway: GatewayProviderId;
  provider: string;
  model: string;
  requestedModel: string;
  status: "ok" | "error" | "fallback";
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  latencyMs: number;
  ttftMs?: number;
  retries: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

/** Options for a single `create()` call. */
export interface GatewayCallOptions {
  /** Fair-use / billing subject id (the user's Supabase id or an IP). */
  userId?: string;
  ip?: string;
  /** Bypass auto-fallback (strictly the requested model). */
  noFallback?: boolean;
  /** Override request timeout (ms). */
  timeoutMs?: number;
  /** Optional trace id / metadata attached to telemetry. */
  metadata?: Record<string, unknown>;
  /** Attach a virtual/sub-key instead of the platform default key. */
  virtualKey?: string;
}
