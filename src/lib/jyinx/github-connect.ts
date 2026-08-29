"use client";

/**
 * Shared "Connect GitHub" helper for Jyinx surfaces (chat, autonomous agent,
 * project creation, workspace picker). Centralizes:
 *  - the OAuth redirect (always requests the `repo` scope),
 *  - the provider-token / session lookup,
 *  - persistence of the GitHub token to localStorage so it survives
 *    page refreshes and background API calls,
 *  - scope verification via the backend commit route (`x-scope-check` action).
 */

export const GITHUB_CONNECT_PATH = "/auth/callback";
export const GITHUB_SITE_ORIGIN = "https://kus-ai-app.vercel.app";

/**
 * Returns a storage key scoped to the Supabase project ref so credentials
 * don't bleed between different apps on the same domain. Uses the same
 * ref derivation as the auth client in @/lib/supabase/client.
 */
function persistedTokenKey(): string {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (url) {
      const hostname = new URL(url).hostname;
      const parts = hostname.split(".");
      if (parts.length >= 2) {
        return `kus-ai-github-token:${parts[0]}`;
      }
    }
  } catch {
    /* ignore */
  }
  return "kus-ai-github-token:default";
}

export type GitHubConnectResult =
  | { ok: true; token: string; login?: string }
  | { ok: false; reason: "no-session" | "no-repo-scope" | "github-error"; message: string };

/** Starts the GitHub OAuth flow requesting the `repo` scope, returns to the given path. */
export async function connectGitHub(redirectPath = "/jyinx"): Promise<void> {
  const supabase = (await import("@/lib/supabase/client")).createClient();
  await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${GITHUB_SITE_ORIGIN}/auth/callback?next=${encodeURIComponent(redirectPath)}`,
      scopes: "repo read:user user:email",
    },
  });
}

/**
 * Persist the GitHub token to localStorage so it survives page refreshes
 * and background API calls (Supabase's provider_token is ephemeral).
 * Also writes the token to the Supabase session via a custom event so
 * in-memory hooks pick it up immediately.
 */
export function persistGitHubToken(token: string): void {
  try {
    localStorage.setItem(persistedTokenKey(), token);
    // Dispatch a custom event so the auth hook can pick it up
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("github-token-persisted", { detail: { token } }));
    }
  } catch {
    /* quota — ignore */
  }
}

/** Clear the persisted GitHub token (e.g. on sign-out). */
export function clearPersistedGitHubToken(): void {
  try {
    localStorage.removeItem(persistedTokenKey());
  } catch {
    /* ignore */
  }
}

/**
 * Clear all stale Supabase auth keys from localStorage that can cause PKCE
 * code verifier conflicts. Call this when the user gets a "code verifier"
 * error during OAuth login.
 */
export function clearStaleAuthKeys(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key.includes("pkce") ||
        key.includes("code-verifier") ||
        key.includes("code_verifier") ||
        key.includes("sb-") ||
        (key.includes("supabase") && key.includes("auth"))
      ) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Returns the active session's `provider_token` (GitHub), falling back to the
 * persisted token when the session token is unavailable. This ensures commits
 * and pushes work reliably across page navigations.
 *
 * Also attempts to refresh the session if the token is missing, since Supabase
 * may have the session alive but lost the provider_token.
 */
export async function getGitHubToken(): Promise<string | null> {
  try {
    const supabase = (await import("@/lib/supabase/client")).createClient();
    const { data } = await supabase.auth.getSession();
    let sessionToken = data.session?.provider_token ?? null;

    // If the session exists but the provider_token is missing, try to refresh
    if (!sessionToken && data.session) {
      try {
        const { data: refreshed } = await supabase.auth.refreshSession();
        sessionToken = refreshed.session?.provider_token ?? null;
      } catch {
        // refresh failed, fall through
      }
    }

    if (sessionToken) {
      persistGitHubToken(sessionToken);
      return sessionToken;
    }
  } catch {
    // fall through to persisted token
  }
  // Fallback to the persisted token when the session token is gone
  // Try the new scoped key first, then the old legacy key for migration
  try {
    const token = localStorage.getItem(persistedTokenKey());
    if (token) return token;
    // Legacy fallback for users who logged in before the scoped key change
    return localStorage.getItem("jyinx_persisted_github_token");
  } catch {
    return null;
  }
}

/**
 * Attempts to resolve a GitHub App installation token for the given user and
 * repository. Falls back to the OAuth token (session + persisted).
 */
export async function getGitHubTokenForRepo(
  userId: string,
  repoFullName: string
): Promise<string | null> {
  try {
    const response = await fetch(`/api/github-app?action=resolve-token&userId=${encodeURIComponent(userId)}&repo=${encodeURIComponent(repoFullName)}`, {
      cache: "no-store",
    });
    if (response.ok) {
      const data = (await response.json()) as { token?: string };
      if (data.token) return data.token;
    }
  } catch {
    // fall through to OAuth token
  }
  return getGitHubToken();
}

/**
 * Returns the GitHub App install URL so the user can install the app.
 */
export async function getGitHubAppInstallUrl(state?: string): Promise<string> {
  try {
    const params = new URLSearchParams({ action: "install-url" });
    if (state) params.set("state", state);
    const response = await fetch(`/api/github-app?${params.toString()}`, { cache: "no-store" });
    const data = (await response.json()) as { url?: string };
    if (data.url) return data.url;
  } catch {
    // fall through
  }
  return "https://github.com/apps/jyinx-bot/installations/new";
}

/**
 * Verifies the active token has repo-write access by asking the backend to
 * probe GitHub (`/api/github/commit` with `action: "scope"`). Returns a label
 * the UI can render, plus whether a re-connect is required.
 */
export async function verifyGitHubScope(): Promise<{ required: boolean; has?: boolean; message: string; login?: string }> {
  try {
    const token = await getGitHubToken();
    if (!token) return { required: true, message: "Connect GitHub to commit changes." };
    const response = await fetch("/api/github/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "scope" }),
      cache: "no-store",
    });
    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; scopes?: string[]; login?: string; error?: string };
    if (data.ok) return { required: false, has: true, message: "Connected to GitHub.", login: data.login };
    return {
      required: true,
      message: (data as { error?: string }).error || "Your GitHub connection is missing write permissions — reconnect.",
    };
  } catch {
    return { required: true, message: "Could not verify GitHub access — reconnect." };
  }
}