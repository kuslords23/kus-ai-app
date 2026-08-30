"use client";

/**
 * GitHub token persistence — thin wrapper around the minimalist github-token module.
 *
 * Kept for backward compatibility with existing imports.
 * All new code should import from "@/lib/github-token" directly.
 */
import { saveToken, getToken as getSimpleToken, clearToken } from "@/lib/github-token";

export const GITHUB_CONNECT_PATH = "/auth/callback";
const LOCALSTORAGE_KEY = "kus-ai-github-token";

/** Store a GitHub token. */
export async function persistGitHubToken(token: string): Promise<void> {
  saveToken(token);
  // Also write to the old key for backward compat
  try { localStorage.setItem(LOCALSTORAGE_KEY, token); } catch { /* ignore */ }
}

/** Clear the stored GitHub token. */
export async function clearPersistedGitHubToken(): Promise<void> {
  clearToken();
  try { localStorage.removeItem(LOCALSTORAGE_KEY); } catch { /* ignore */ }
}

/** Clear stale auth keys from localStorage. */
export function clearStaleAuthKeys(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.includes("pkce") || key.includes("code-verifier") || key.includes("sb-") || (key.includes("supabase") && key.includes("auth"))) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) localStorage.removeItem(key);
  } catch { /* ignore */ }
}

/** Returns a GitHub token. Checks new key first, then old key. */
export async function getGitHubToken(): Promise<string | null> {
  const t = getSimpleToken();
  if (t) return t;
  try {
    const old = localStorage.getItem(LOCALSTORAGE_KEY);
    if (old) { saveToken(old); return old; }
  } catch { /* ignore */ }
  return null;
}

/** OAuth flow — kept for backward compat, but not the primary path. */
export async function connectGitHub(redirectPath = "/jyinx"): Promise<void> {
  const { createClient } = await import("@/lib/supabase/client");
  const base = typeof window !== "undefined" ? window.location.origin : "https://kus-ai-app.vercel.app";
  const supabase = createClient();
  await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${base}/auth/callback?next=${encodeURIComponent(redirectPath)}`, scopes: "repo read:user user:email" },
  });
}

/** Verify the active token. */
export async function verifyGitHubScope(): Promise<{ required: boolean; has?: boolean; message: string; login?: string }> {
  const token = await getGitHubToken();
  if (!token) return { required: true, message: "Connect GitHub to commit changes." };
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return { required: true, message: "Token invalid or expired." };
    const user = await res.json() as { login?: string };
    return { required: false, has: true, message: "Connected to GitHub.", login: user.login };
  } catch {
    return { required: true, message: "Could not verify GitHub access." };
  }
}