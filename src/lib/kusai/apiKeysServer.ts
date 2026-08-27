/**
 * Server-side API-key resolver.
 *
 * Resolves which key to use for an upstream LLM request:
 *   1. A user-supplied (BYOK) key passed in the `x-custom-api-key` header
 *      (Kingdom-wide gateway convention) — used at exact upstream cost.
 *   2. Otherwise the platform's default `OPENROUTER_API_KEY` env var.
 *
 * This lets Royal and Jyinx's model runners check for a custom user-provided
 * key before falling back to the default environment variable.
 */

export function resolveApiKey(
  headers: Headers,
  envVar = process.env.OPENROUTER_API_KEY
): { key: string | null; source: "user" | "env" | "none"; missing: boolean } {
  // 1. Custom-key header (could be OpenRouter, OpenAI, Gemini, etc.)
  const custom = headers.get("x-custom-api-key")?.trim() || "";
  if (custom) return { key: custom, source: "user", missing: false };

  // 2. Standard `Authorization: Bearer <key>` header
  const auth = headers.get("authorization");
  if (auth?.trim().toLowerCase().startsWith("bearer ")) {
    const bearer = auth.slice("bearer ".length).trim();
    if (bearer) return { key: bearer, source: "user", missing: false };
  }

  // 3. Platform default env var
  if (envVar) return { key: envVar, source: "env", missing: false };

  return { key: null, source: "none", missing: true };
}

/** Extract the base URL for the requested OpenRouter endpoint. */
export function openRouterUrl(override?: string): string {
  return (
    override?.trim() ||
    process.env.OPENROUTER_BASE_URL ||
    "https://openrouter.ai/api/v1/chat/completions"
  );
}

export type ResolvedKey = ReturnType<typeof resolveApiKey>;