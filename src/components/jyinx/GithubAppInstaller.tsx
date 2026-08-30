"use client";

import { useState, useEffect } from "react";
import { persistGitHubToken, clearStaleAuthKeys } from "@/lib/jyinx/github-connect";

/**
 * GithubAppInstaller — Primary GitHub auth via GitHub App installation.
 *
 * Shows the "Install GitHub App" button as the primary auth method.
 * Falls back to PAT input for advanced users.
 * Auto-refreshes installation tokens when they expire.
 */
export function GithubAppInstaller({
  onTokenReady,
  connectedLabel,
  onConnect,
}: {
  onTokenReady?: (token: string) => void;
  connectedLabel?: string;
  onConnect?: () => void;
}) {
  const [installUrl, setInstallUrl] = useState("");
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patInput, setPatInput] = useState("");
  const [patSaving, setPatSaving] = useState(false);
  const [patTesting, setPatTesting] = useState(false);
  const [patResult, setPatResult] = useState<string | null>(null);
  const [patResultOk, setPatResultOk] = useState(false);

  // Fetch the GitHub App install URL on mount
  useEffect(() => {
    const fetchInstallUrl = async () => {
      try {
        const res = await fetch("/api/github-app?action=install-url", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { url?: string };
          if (data.url) setInstallUrl(data.url);
        }
      } catch {
        // GitHub App not configured — PAT fallback only
      }
    };
    fetchInstallUrl();
  }, []);

  const handleInstall = async () => {
    if (!installUrl) return;
    setInstalling(true);
    setError(null);
    try {
      // Open the GitHub App install page in a new window
      const width = 800;
      const height = 700;
      const left = window.screenX + (window.innerWidth - width) / 2;
      const top = window.screenY + (window.innerHeight - height) / 2;
      const popup = window.open(
        installUrl,
        "github-app-install",
        `width=${width},height=${height},left=${left},top=${top},popup=1`
      );
      if (!popup) {
        // Popup blocked — redirect instead
        window.location.href = installUrl;
        return;
      }
      // Poll for the popup to close (user completes install and closes it)
      const pollTimer = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(pollTimer);
          setInstalling(false);
          onConnect?.();
          // Refresh the page to pick up the new installation
          window.location.reload();
        }
      }, 500);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to open GitHub App install.");
      setInstalling(false);
    }
  };

  // Test a PAT against GitHub
  const testPat = async (token: string) => {
    setPatTesting(true);
    setPatResult(null);
    try {
      const res = await fetch("/api/github/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "scope" }),
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; login?: string; scopes?: string[]; error?: string };
      if (data.ok) {
        const hasRepo = data.scopes?.includes("repo") || data.scopes?.includes("fine-grained-pat");
        setPatResultOk(true);
        setPatResult(hasRepo ? `Connected as ${data.login} with repo write access` : `Connected as ${data.login} (scopes: ${(data.scopes ?? []).join(", ") || "none"})`);
        onTokenReady?.(token);
      } else {
        setPatResultOk(false);
        setPatResult(data.error ?? "Token invalid or expired");
      }
    } catch (cause) {
      setPatResultOk(false);
      setPatResult(cause instanceof Error ? cause.message : "Failed to verify token");
    } finally {
      setPatTesting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Primary: GitHub App Install */}
      {installUrl && (
        <div>
          <button
            type="button"
            onClick={() => void handleInstall()}
            disabled={installing}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3 text-sm font-semibold text-background hover:bg-gold/90 disabled:opacity-60 transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            {installing ? "Opening GitHub…" : "Install GitHub App"}
          </button>
          {connectedLabel && (
            <p className="mt-1 text-[11px] text-success text-center">{connectedLabel}</p>
          )}
          <p className="mt-1.5 text-[10px] text-muted text-center leading-relaxed">
            Recommended. Short-lived tokens with automatic refresh. Select which repos to grant access.
          </p>
        </div>
      )}

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center text-[10px]"><span className="bg-surface px-2 text-muted">or use Personal Access Token (PAT)</span></div>
      </div>

      {/* Fallback: PAT input */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="password"
            value={patInput}
            onChange={(e) => setPatInput(e.target.value)}
            placeholder="github_pat_11AA..."
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-[11px] outline-none focus:border-gold/50"
          />
          <button
            type="button"
            onClick={async () => {
              const token = patInput.trim();
              if (!token) return;
              setPatSaving(true);
              try {
                // Clear stale auth keys that might interfere
                clearStaleAuthKeys();
                // Use persistGitHubToken which saves to localStorage + Supabase DB
                await persistGitHubToken(token);
                // Verify it was saved correctly by reading it back
                const saved = localStorage.getItem("kus-ai-github-token");
                if (!saved || saved !== token) {
                  // Fallback: try direct save
                  localStorage.setItem("kus-ai-github-token", token);
                }
                await testPat(token);
              } finally {
                setPatSaving(false);
              }
            }}
            disabled={patSaving || patTesting || !patInput.trim()}
            className="shrink-0 rounded-lg bg-gold px-3 py-1.5 text-[11px] font-semibold text-background hover:bg-gold/90 disabled:opacity-50 transition-colors"
          >
            {patSaving || patTesting ? "…" : "Save & Test"}
          </button>
        </div>
        {patResult && (
          <p className={`text-[10px] ${patResultOk ? "text-success" : "text-danger"}`}>{patResult}</p>
        )}
        {error && <p className="text-[10px] text-danger">{error}</p>}
        <p className="text-[10px] text-muted leading-relaxed">
          Generate a classic PAT with <strong>repo</strong> scope in GitHub Settings → Developer settings → Personal access tokens → Tokens (classic).
        </p>
      </div>
    </div>
  );
}