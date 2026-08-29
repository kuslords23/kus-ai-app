"use client";

/**
 * GitHub token persistence — permanent, user-attached storage.
 *
 * The token resolution order is:
 *   1. Supabase database (github_pat_tokens table) — permanent, per-user
 *   2. localStorage (persisted OAuth token) — survives page refresh
 *   3. Supabase session provider_token — ephemeral, last resort
 *
 * This ensures the GitHub connection is permanent as long as the user
 * has provided a PAT or completed OAuth at least once.
 */

export const GITHUB_CONNECT_PATH = "/auth/callback";

/**
 * Returns the app's base URL at call time using the actual browser origin.
 * This ensures GitHub OAuth redirects work wherever the app is deployed.
 */
function appBaseUrl(): string {
  if (typeof window !== "undefined") {
    // Use the full origin so the OAuth callback works on any domain
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://kus-ai-app.vercel.app";
}

const LOCALSTORAGE_KEY = "kus-ai-github-token";

// ── Token persistence ─────────────────────────────────────

/** Store a GitHub token permanently (in localStorage for immediate use,
 *  and in Supabase when the user is logged in). */
export async function persistGitHubToken(token: string): Promise<void> {
  // Always save to localStorage for immediate access
  try {
    localStorage.setItem(LOCALSTORAGE_KEY, token);
  } catch {
    /* ignore */
  }

  // Also persist to Supabase database when the user is logged in, so the
  // token survives a full browser clear or device change.
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    if (session.session?.user?.id) {
      await fetch("/api/github-pat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.session.user.id,
          rawToken: token,
          label: "OAuth token",
          scopes: ["repo"],
        }),
      }).catch(() => {
        /* best-effort */
      });
    }
  } catch {
    /* best-effort */
  }
}

/** Clear the stored GitHub token from both localStorage and the database. */
export async function clearPersistedGitHubToken(): Promise<void> {
  try {
    localStorage.removeItem(LOCALSTORAGE_KEY);
  } catch {
    /* ignore */
  }

  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    if (session.session?.user?.id) {
      await fetch("/api/github-pat", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.session.user.id }),
      }).catch(() => {
        /* best-effort */
      });
    }
  } catch {
    /* best-effort */
  }
}

/** Clear stale Supabase auth keys from localStorage. */
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

// ── Token retrieval (permanent, multi-source) ─────────────

/**
 * Returns a GitHub token that can write to repositories.
 *
 * Resolution order:
 *   1. Supabase database (github_pat_tokens) — user-attached, permanent
 *   2. localStorage — survives page refresh
 *   3. Supabase session provider_token — ephemeral, last resort
 */
export async function getGitHubToken(): Promise<string | null> {
  // 1. Try the Supabase database (permanent, user-attached)
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user?.id;

    if (userId) {
      const res = await fetch(`/api/github-pat?userId=${encodeURIComponent(userId)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const body = (await res.json()) as { token?: string };
        if (body.token) {
          // Refresh localStorage with the DB token
          try {
            localStorage.setItem(LOCALSTORAGE_KEY, body.token);
          } catch {
            /* ignore */
          }
          return body.token;
        }
      }
    }
  } catch {
    /* fall through */
  }

  // 2. Try localStorage
  try {
    const localToken = localStorage.getItem(LOCALSTORAGE_KEY);
    if (localToken) return localToken;
  } catch {
    /* fall through */
  }

  // 3. Try the Supabase session's provider_token (ephemeral)
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    let sessionToken = data.session?.provider_token ?? null;

    if (!sessionToken && data.session) {
      try {
        const { data: refreshed } = await supabase.auth.refreshSession();
        sessionToken = refreshed.session?.provider_token ?? null;
      } catch {
        /* refresh failed */
      }
    }

    if (sessionToken) {
      // Save it to localStorage for next time
      try {
        localStorage.setItem(LOCALSTORAGE_KEY, sessionToken);
      } catch {
        /* ignore */
      }
      return sessionToken;
    }
  } catch {
    /* fall through */
  }

  return null;
}

// ── OAuth authentication ──────────────────────────────────

export type GitHubConnectResult =
  | { ok: true; token: string; login?: string }
  | { ok: false; reason: "no-session" | "no-repo-scope" | "github-error"; message: string };

/** Starts the GitHub OAuth flow requesting the `repo` scope. */
export async function connectGitHub(redirectPath = "/jyinx"): Promise<void> {
  const supabase = (await import("@/lib/supabase/client")).createClient();
  const base = appBaseUrl();
  await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${base}/auth/callback?next=${encodeURIComponent(redirectPath)}`,
      scopes: "repo read:user user:email",
    },
  });
}

/** Verify the active token has repo-write access. */
export async function verifyGitHubScope(): Promise<{
  required: boolean;
  has?: boolean;
  message: string;
  login?: string;
}> {
  try {
    const token = await getGitHubToken();
    if (!token) return { required: true, message: "Connect GitHub to commit changes." };
    const response = await fetch("/api/github/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "scope" }),
      cache: "no-store",
    });
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      scopes?: string[];
      login?: string;
      error?: string;
    };
    if (data.ok) return { required: false, has: true, message: "Connected to GitHub.", login: data.login };
    return {
      required: true,
      message: (data as { error?: string }).error || "Your GitHub connection is missing write permissions — reconnect.",
    };
  } catch {
    return { required: true, message: "Could not verify GitHub access — reconnect." };
  }
}