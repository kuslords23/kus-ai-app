/**
 * OpenRouter free-tier auto-routing.
 *
 * Wraps the OpenAI-compatible chat/completions call and catches
 * model-not-found (404) / rate-limit (429) / permission (403) failures thrown
 * when a specific free model slug expires or changes. On failure it re-issues
 * the exact request against OpenRouter's universal free router
 * (`openrouter/free`), which dynamically routes to a currently-active
 * zero-cost model.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

export interface ChatCompletion {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface OpenRouterResult {
  content: string;
  model: string;
  error?: string;
  retried?: boolean;
}

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const FREE_ROUTER = "openrouter/free";

const RETRYABLE_STATUS = new Set([400, 401, 403, 404, 429]);

function isRetryable(body: string, status: number): boolean {
  if (!RETRYABLE_STATUS.has(status)) return false;
  const lower = body.toLowerCase();
  return (
    lower.includes("model not found") ||
    lower.includes("does not exist") ||
    lower.includes("not found") ||
    lower.includes("rate limit") ||
    lower.includes("resource exhausted") ||
    lower.includes("deprecated") ||
    lower.includes("429") ||
    lower.includes("free") ||
    lower.includes("model")
  );
}

type Attempt =
  | { ok: true; content: string; model: string }
  | { ok: false; status: number; body: string };

async function attempt(
  apiKey: string,
  opts: ChatCompletion,
  httpReferer: string,
  xTitle: string
): Promise<Attempt> {
  try {
    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": httpReferer,
        "X-Title": xTitle,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
      }),
      cache: "no-store",
    });
    const body = await response.text();
    if (!response.ok) return { ok: false, status: response.status, body };
    let data: { choices?: Array<{ message?: { content?: string } }> } | null = null;
    try {
      data = JSON.parse(body);
    } catch {
      /* fall through */
    }
    const content = data?.choices?.[0]?.message?.content ?? "";
    return { ok: true, content, model: opts.model };
  } catch (cause) {
    return { ok: false, status: 500, body: cause instanceof Error ? cause.message : "Network error" };
  }
}

/**
 * Executes a chat completion with automatic fallback to the OpenRouter free
 * router when the requested model fails (404 / 429 / 403 / deprecated slug).
 */
export async function openRouterChat(apiKey: string, opts: ChatCompletion): Promise<OpenRouterResult> {
  const referer = process.env.NEXT_PUBLIC_APP_URL || "https://kus-ai-app.vercel.app";
  const title = process.env.NEXT_PUBLIC_APP_NAME || "Kus-Lords / Kus AI";

  const first = await attempt(apiKey, opts, referer, title);
  if (first.ok) return { content: first.content, model: first.model };

  if (!isRetryable(first.body, first.status)) {
    return { content: "", model: opts.model, error: `OpenRouter error ${first.status}: ${first.body.slice(0, 400)}` };
  }

  const retry = await attempt(
    apiKey,
    { model: FREE_ROUTER, messages: opts.messages, temperature: opts.temperature, maxTokens: opts.maxTokens },
    referer,
    title
  );
  if (retry.ok) {
    return { content: retry.content, model: retry.model, retried: true };
  }
  return {
    content: "",
    model: opts.model,
    error: `OpenRouter failed (${first.status}); free-router also failed (${retry.status || "network"}).`,
  };
}

/** Exposed so the retry decision is transparent to the router/UI. */
export function shouldRetryWithFreeRouter(status: number, body: string): boolean {
  return isRetryable(body, status);
}

/** The universal free router slug. */
export const OPENROUTER_FREE_ROUTER = FREE_ROUTER;