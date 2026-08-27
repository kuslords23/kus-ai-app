/**
 * Google Gemini free-tier model resolution.
 *
 * Maps requests to current valid free-capable identifiers and gracefully
 * pivots to the latest Flash variant on model-not-found or resource-exhaustion
 * (429) errors, using the user's Google AI Studio key (BYOK) so their own
 * quota is used. The platform default key is only a buffer for brand-new users.
 */

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface GeminiContent {
  role?: "user" | "model";
  parts: Array<GeminiPart | { text: string }>;
}

export interface GeminiGenerateOptions {
  model: string;
  apiKey: string;
  systemPrompt?: string;
  messages?: GeminiContent[];
  temperature?: number;
  maxTokens?: number;
}

export interface GeminiResult {
  content: string;
  model: string;
  error?: string;
  retried?: boolean;
}

const GENERATIVE_URL = "https://generativelanguage.googleapis.com/v1beta";

/** Ordered free-capable Flash candidates used when a requested model fails. */
const FLASH_FALLBACK_ORDER = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

/** Public alias so the router/UI can reference the free-capable Flash lineup. */
export const FLASH_FALLBACK_MODELS = FLASH_FALLBACK_ORDER;
export const FLASH_MODELS = FLASH_FALLBACK_ORDER;

/** Free-capable model map used to normalize lax ids (e.g. "gemini-flash"). */
const FREE_FLASH_ALIASES: Record<string, string> = {
  "gemini-3.7-flash": "gemini-3.7-flash",
  "gemini-3.6-flash": "gemini-3.6-flash",
  "gemini-2.5-flash": "gemini-2.5-flash",
  "gemini-2.5-flash-lite": "gemini-2.5-flash",
  "gemini-2.0-flash": "gemini-2.0-flash",
  "gemini-flash": "gemini-2.5-flash",
  "gemini-2-5-flash": "gemini-2.5-flash",
  "gemini-flash-latest": "gemini-3.7-flash",
};

/**
 * Normalize a requested Gemini model string to a valid free-capable id.
 * Strips `:free`/`:paid`/`models/` suffixes/prefixes and maps aliases.
 */
export function resolveFreeGeminiModel(requested: string): string {
  let cleaned = (requested ?? "").trim().toLowerCase();
  cleaned = cleaned.replace(/^models\//, "").replace(/:(free|paid)$/i, "");
  return FREE_FLASH_ALIASES[cleaned] ?? FLASH_FALLBACK_ORDER[2];
}

type GenerateAttempt =
  | { ok: true; content: string; model: string }
  | { ok: false; status: number; body: string };

async function runGenerate(
  apiKey: string,
  model: string,
  opts: Omit<GeminiGenerateOptions, "model" | "apiKey">
): Promise<GenerateAttempt> {
  try {
    const url = `${GENERATIVE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const payload: Record<string, unknown> = {
      contents: opts.messages ?? [],
      generationConfig: {
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts.maxTokens !== undefined ? { maxOutputTokens: opts.maxTokens } : {}),
      },
    };
    if (opts.systemPrompt) {
      payload.systemInstruction = { parts: [{ text: opts.systemPrompt }] };
    }
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const body = await response.text();
    if (!response.ok) return { ok: false, status: response.status, body };
    let data: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } | null = null;
    try {
      data = JSON.parse(body);
    } catch {
      /* fall through */
    }
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return { ok: true, content: text, model };
  } catch (cause) {
    return { ok: false, status: 500, body: cause instanceof Error ? cause.message : "Network error" };
  }
}

function isRetryable(status: number, body: string): boolean {
  return (
    status === 429 ||
    status === 404 ||
    status === 400 ||
    body.toLowerCase().includes("resource exhausted") ||
    body.toLowerCase().includes("quota") ||
    body.toLowerCase().includes("429") ||
    body.toLowerCase().includes("model not found") ||
    body.toLowerCase().includes("not exist")
  );
}

/**
 * Generates content with automatic fallback across free-capable Flash models.
 * Uses the provided key (user BYOK when present, platform buffer otherwise).
 */
export async function geminiGenerate(apiKey: string, opts: GeminiGenerateOptions): Promise<GeminiResult> {
  const requestedModel = opts.model?.trim() || FLASH_FALLBACK_ORDER[2];
  const primary = resolveFreeGeminiModel(requestedModel);
  const candidates = [primary, ...FLASH_FALLBACK_ORDER.filter((m) => m !== primary)];

  let last: { status: number; body: string } | null = null;
  for (const model of candidates.slice(0, 4)) {
    const attempt = await runGenerate(apiKey, model, opts);
    if (attempt.ok) {
      return { content: attempt.content, model: attempt.model, retried: model !== primary };
    }
    last = { status: attempt.status, body: attempt.body };
    if (!isRetryable(attempt.status, attempt.body)) break;
  }

  return {
    content: "",
    model: primary,
    error: last ? `Gemini failed (${last.status}): ${last.body.slice(0, 400)}` : "Gemini request failed.",
  };
}