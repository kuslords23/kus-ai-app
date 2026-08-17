"use client";

import { userKeyManager, type BYOKProvider } from "@/services/userKeyManager";

/**
 * Client-side API-key supplier.
 *
 * Returns the user's own API keys (BYOK) so the current tab can attach them
 * to requests. Reads fresh from localStorage every call (via UserKeyManager),
 * so a key saved in Settings is picked up by the active gateway immediately —
 * never a stale value cached at module load.
 */

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