"use client";

import { useState } from "react";
import { saveToken, getToken, clearToken } from "@/lib/github-token";

/**
 * Minimal GitHub settings component.
 * Just a PAT input field + Save button + status indicator.
 * No GitHub App, no OAuth, no complexity.
 */
export function GitHubSetup({ onTokenReady }: { onTokenReady?: (token: string) => void }) {
  const [patInput, setPatInput] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const saved = getToken();

  const handleSave = async () => {
    const token = patInput.trim();
    if (!token) return;
    setSaving(true);
    setStatus(null);
    try {
      // Save to localStorage
      saveToken(token);
      // Verify by calling GitHub
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      });
      if (!res.ok) {
        clearToken();
        setStatus({ ok: false, msg: `Token rejected (${res.status}). Check that it has repo scope.` });
        setSaving(false);
        return;
      }
      const user = await res.json() as { login?: string };
      const scopes = res.headers.get("x-oauth-scopes") || "";
      const hasRepo = scopes.includes("repo");
      setStatus({ ok: true, msg: `Connected as ${user.login || "unknown"}${hasRepo ? " with repo write access" : " (scopes: " + scopes + ")"}` });
      setPatInput("");
      onTokenReady?.(token);
    } catch (err) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : "Failed to verify token" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">GitHub</p>
      {saved ? (
        <div className="rounded-xl border border-success/30 bg-success/10 p-3">
          <p className="text-xs text-success">✅ Token is stored ({saved.slice(0, 8)}...)</p>
          <button
            type="button"
            onClick={() => { clearToken(); setStatus({ ok: true, msg: "Token removed." }); }}
            className="mt-2 rounded-lg border border-border px-2 py-1 text-[10px] text-muted hover:text-foreground"
          >
            Remove Token
          </button>
        </div>
      ) : (
        <p className="text-[10px] text-muted">No token stored. Paste your GitHub PAT below.</p>
      )}
      <div className="flex gap-2">
        <input
          type="password"
          value={patInput}
          onChange={(e) => setPatInput(e.target.value)}
          placeholder="github_pat_11AA... or ghp_..."
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-gold/50"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !patInput.trim()}
          className="shrink-0 rounded-lg bg-gold px-4 py-2 text-xs font-semibold text-background hover:bg-gold/90 disabled:opacity-50"
        >
          {saving ? "..." : "Save & Verify"}
        </button>
      </div>
      {status && (
        <p className={`text-[10px] ${status.ok ? "text-success" : "text-red-400"}`}>{status.msg}</p>
      )}
      <p className="text-[10px] text-muted leading-relaxed">
        Create a classic PAT with <strong>repo</strong> scope in{" "}
        <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" className="text-gold underline">GitHub Settings → Tokens</a>.
        Then paste it here.
      </p>
    </div>
  );
}