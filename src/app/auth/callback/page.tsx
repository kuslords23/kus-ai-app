"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Clears stale Supabase PKCE code verifier + auth keys from localStorage.
 * PKCE verifier conflicts happen when the OAuth flow is opened in a new tab
 * or the localStorage state gets out of sync between sessions.
 */
function clearStaleAuthKeys() {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key.includes("supabase") ||
        key.includes("oauth") ||
        key.includes("pkce") ||
        key.includes("code-verifier") ||
        key.includes("auth-token")
      ) {
        keysToRemove.push(key);
      }
    }
    // Only clear the stale PKCE keys, not the main session
    for (const key of keysToRemove) {
      if (key.includes("code-verifier") || key.includes("pkce")) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore
  }
}

function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const code = searchParams.get("code");
    const oauthError = searchParams.get("error_description") || searchParams.get("error");
    const next = (() => {
      const value = searchParams.get("next");
      return value && value.startsWith("/") && !value.startsWith("//") ? value : "/jyinx";
    })();

    if (oauthError) {
      window.location.replace(`/jyinx?github_error=${encodeURIComponent(oauthError)}`);
      return;
    }

    if (!code) {
      setError("No authorization code received from GitHub.");
      return;
    }

    const exchange = async (isRetry = false) => {
      try {
        // Clear stale PKCE verifiers before attempting the exchange
        clearStaleAuthKeys();

        const supabase = createClient();
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          // PKCE code verifier error — try once more after clearing storage
          if (
            !isRetry &&
            (exchangeError.message?.toLowerCase().includes("code verifier") ||
             exchangeError.message?.toLowerCase().includes("pkce") ||
             exchangeError.message?.toLowerCase().includes("invalid code"))
          ) {
            setRetrying(true);
            // Clear more aggressively and retry
            try {
              const keysToRemove: string[] = [];
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.includes("supabase") || key.includes("pkce") || key.includes("code-verifier") || key.includes("auth"))) {
                  keysToRemove.push(key);
                }
              }
              for (const key of keysToRemove) {
                localStorage.removeItem(key);
              }
            } catch {
              /* ignore */
            }
            // Retry the exchange
            const supabaseRetry = createClient();
            const { error: retryError } = await supabaseRetry.auth.exchangeCodeForSession(code);
            if (retryError) {
              setError(retryError.message);
              return;
            }
          } else {
            setError(exchangeError.message);
            return;
          }
        }

        // Verify the token actually carries the `repo` scope. If the OAuth
        // handshake granted a token without write access, send the user back to
        // Jyinx's reconnect flow instead of letting commits fail later.
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.provider_token;
        if (token) {
          // Persist the token to localStorage so it survives page refreshes
          // and background API calls (Supabase's provider_token is ephemeral).
          const { persistGitHubToken } = await import("@/lib/jyinx/github-connect");
          persistGitHubToken(token);
          try {
            const check = await fetch("/api/github/commit", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ action: "scope" }),
              cache: "no-store",
            });
            const result = (await check.json().catch(() => ({}))) as { ok?: boolean; scopes?: string[]; error?: string };
            if (!result.ok) {
              const message = encodeURIComponent(result.error || "GitHub connection is missing write access. Reconnect with the request permissions.");
              window.location.replace(`/jyinx?github_error=${message}`);
              return;
            }
            if (result.scopes && !result.scopes.includes("repo")) {
              window.location.replace(`/jyinx?github_error=${encodeURIComponent("Your GitHub connection is missing the repo write scope. Please connect GitHub again to allow Jyinx to modify and commit files.")}`);
              return;
            }
          } catch {
            // Post-exchange scope check is best-effort; proceed.
          }
        }
        const params = new URLSearchParams(searchParams.toString());
        params.delete("code");
        params.delete("next");
        const suffix = next === "/jyinx" ? "" : `?next=${encodeURIComponent(next)}`;
        window.location.replace(`${next}${suffix}${params.toString() ? (suffix ? "&" : "?") + params.toString() : ""}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not complete login.");
      }
    };
    void exchange();
  }, [router, searchParams]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center">
        {error ? (
          <>
            <p className="text-sm font-medium text-danger">Login could not be completed</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">{error}</p>
            {retrying && <p className="mt-2 text-xs text-gold">Retried with fresh session — still failed.</p>}
            <button
              type="button"
              onClick={() => {
                // Clear all stale auth keys and redirect to reconnect
                try {
                  for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && (key.includes("supabase") || key.includes("pkce") || key.includes("auth") || key.includes("oauth"))) {
                      localStorage.removeItem(key);
                    }
                  }
                } catch {
                  /* ignore */
                }
                window.location.replace("/jyinx");
              }}
              className="mt-4 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-gold"
            >
              Clear auth &amp; retry
            </button>
          </>
        ) : (
          <p className="text-sm text-muted">{retrying ? "Retrying with fresh session…" : "Completing sign-in…"}</p>
        )}
      </div>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<main className="flex min-h-dvh items-center justify-center bg-background text-foreground"><p className="text-sm text-muted">Completing sign-in…</p></main>}>
      <AuthCallback />
    </Suspense>
  );
}