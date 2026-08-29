"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function AuthCallback() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const oauthError = searchParams.get("error_description") || searchParams.get("error");
    const next = (() => {
      const value = searchParams.get("next");
      return value && value.startsWith("/") && !value.startsWith("//") ? value : "/jyinx";
    })();

    if (oauthError) {
      window.location.replace(`/jyinx?github_error=${encodeURIComponent(oauthError)}`);
      return;
    }

    const complete = async () => {
      try {
        // With implicit flow, the session is detected from the URL hash
        // automatically by createBrowserClient with detectSessionInUrl: true.
        // We just need to initialize the client once to trigger the detection.
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();

        if (sessionData.session?.provider_token) {
          // Persist the GitHub token to localStorage
          const { persistGitHubToken } = await import("@/lib/jyinx/github-connect");
          persistGitHubToken(sessionData.session.provider_token);

          // Verify the token has repo scope
          try {
            const check = await fetch("/api/github/commit", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session.provider_token}` },
              body: JSON.stringify({ action: "scope" }),
              cache: "no-store",
            });
            const result = (await check.json().catch(() => ({}))) as { ok?: boolean; scopes?: string[]; error?: string };
            if (!result.ok) {
              window.location.replace(`/jyinx?github_error=${encodeURIComponent(result.error || "GitHub connection is missing write access.")}`);
              return;
            }
            if (result.scopes && !result.scopes.includes("repo")) {
              window.location.replace(`/jyinx?github_error=${encodeURIComponent("Your GitHub connection is missing the repo write scope.")}`);
              return;
            }
          } catch {
            // best-effort scope check
          }
        }

        // Redirect to the destination
        const params = new URLSearchParams(searchParams.toString());
        params.delete("code");
        params.delete("next");
        params.delete("state");
        const suffix = next === "/jyinx" ? "" : `?next=${encodeURIComponent(next)}`;
        window.location.replace(`${next}${suffix}${params.toString() ? (suffix ? "&" : "?") + params.toString() : ""}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not complete login.");
      }
    };
    void complete();
  }, [searchParams]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center">
        {error ? (
          <>
            <p className="text-sm font-medium text-danger">Login could not be completed</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">{error}</p>
            <button type="button" onClick={() => window.location.replace("/jyinx")} className="mt-4 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-gold">
              Return to Jyinx
            </button>
          </>
        ) : (
          <p className="text-sm text-muted">Completing sign-in…</p>
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