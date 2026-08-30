"use client";

/**
 * Minimal GitHub token storage.
 *
 * Stores the PAT in localStorage under a single key.
 * No Supabase, no DB, no OAuth, no complexity.
 */

const KEY = "jyinx_github_pat";

/** Save a GitHub PAT to localStorage. */
export function saveToken(token: string): void {
  try { localStorage.setItem(KEY, token); } catch { /* storage full */ }
}

/** Get the stored GitHub PAT, or null if none. */
export function getToken(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

/** Remove the stored GitHub PAT. */
export function clearToken(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Check if a token is stored. */
export function hasToken(): boolean {
  const t = getToken();
  return t !== null && t.length > 20;
}