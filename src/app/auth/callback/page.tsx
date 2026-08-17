"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

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

    const exchange = async () => {
      try {
        const supabase = createClient();
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code ?? "");
        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }
        // Verify the token actually carries the `repo` scope. If the OAuth
        // handshake granted a token without write access, send the user back to
        // Jyinx's reconnect flow instead of letting commits fail later.
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.provider_token;
        if (token) {
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
            // Post-exhange scope check is best-effort; proceed.
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

  return <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground"><div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center">{error ? <><p className="text-sm font-medium text-danger">Login could not be completed</p><p className="mt-2 text-xs leading-relaxed text-muted">{error}</p><button type="button" onClick={() => window.location.replace("/jyinx")} className="mt-4 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-gold">Return to Jyinx</button></> : <p className="text-sm text-muted">Completing sign-in…</p>}</div></main>;
}

export default function AuthCallbackPage() {
  return <Suspense fallback={<main className="flex min-h-dvh items-center justify-center bg-background text-foreground"><p className="text-sm text-muted">Completing sign-in…</p></main>}><AuthCallback /></Suspense>;
}