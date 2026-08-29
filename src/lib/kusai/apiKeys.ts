"use client";

import { toast } from "sonner";
import { userKeyManager, type BYOKProvider } from "@/services/userKeyManager";

/**
 * Client-side API-key supplier.
 *
 * Returns the user's own API keys (BYOK) so the current tab can attach them
 * to requests. Reads fresh from localStorage every call (via UserKeyManager),
 * so a key saved in Settings is picked up by the active gateway immediately —
 * never a stale value cached at module load.
 */

const MISSING_AUTH_MARKERS = [
  "missing authentication",
  "unauthorized",
  "invalid api key",
  "authentication error",
];

/** Full set of BYOK keys, read live. */
export function getCustomKeys(): Record<BYOKProvider, string | null> {
  return userKeyManager.keysForRequest();
}

/** Preferred key across the given providers (returned as {provider,key}). */
export function getPreferredCustomKey(
  providers: BYOKProvider[] = ["openrouter", "openai", "gemini"]
): { provider: BYOKProvider | null; apiKey: string | null } {
  return userKeyManager.getPreferredKey(providers);
}

/**
 * Build an options-object for fetch with a `x-custom-api-key` header carrying
 * the user's preferred key (repo-wide gateway convention). Falls back quietly.
 */
export function buildApiKeyHeaders(): { "x-custom-api-key"?: string } {
  const { apiKey } = getPreferredCustomKey();
  if (!apiKey) return {};
  return { "x-custom-api-key": apiKey };
}

export { userKeyManager };
export type { BYOKProvider };

/**
 * Gateway-aware fetch wrapper.
 *
 * Injects the user's active API key (if present) as `x-custom-api-key` so the
 * backend can honor it. If the backend bounces the request with a missing/
 * invalid-auth error, we intercept it client-side and surface a clean toast
 * guiding the user to add their key in Settings — instead of a raw error.
 */
export async function gatewayFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const { apiKey } = getPreferredCustomKey();
  if (apiKey) {
    // Only attach the BYOK key for AI model auth, NEVER overwrite an existing
    // Authorization header (which may carry a GitHub PAT or other non-AI token).
    // Use the x-custom-api-key header for explicit BYOK signaling instead.
    if (!headers.has("authorization")) headers.set("Authorization", `Bearer ${apiKey}`);
    if (!headers.has("x-custom-api-key")) headers.set("x-custom-api-key", apiKey);
  }
  let response: Response;
  try {
    response = await fetch(input, { ...init, headers });
  } catch (cause) {
    // Network-level failure (offline, DNS, blocked): route to a friendly toast too.
    toast.error("Couldn't reach the AI gateway", {
      description:
        cause instanceof Error ? cause.message : "Check your connection and try again.",
    });
    throw cause;
  }

  const contentType = response.headers.get("content-type") || "";
  const isText = contentType.includes("json") || contentType.includes("text");
  if (!response.ok && isText) {
    const raw = await response.clone().text();
    const needle = `${response.status} ${raw}`.toLowerCase();
    if (response.status === 401 || response.status === 403 || MISSING_AUTH_MARKERS.some((m) => needle.includes(m))) {
      if (!init?.signal?.aborted) {
        toast.error("Add an API key in Settings", {
          description:
            "Your request needs an API key. Open Settings and paste your provider key to continue.",
        });
      }
    }
  }
  return response;
}