"use client";

import { useState } from "react";
import { getToken, clearToken } from "@/lib/github-token";

/**
 * Minimal commit button.
 *
 * Props:
 *  - repository: "owner/repo"
 *  - branch: "main" (default)
 *  - files: [{ path, content }]
 *  - onDone: () => void
 *
 * Calls /api/commit directly with the stored PAT.
 * On 401, clears the token so the user re-enters it.
 */
export function CommitButton({
  repository,
  branch = "main",
  files,
  message = "Jyinx update",
  onDone,
  onError,
}: {
  repository: string;
  branch?: string;
  files: Array<{ path: string; content: string }>;
  message?: string;
  onDone?: (url: string) => void;
  onError?: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const commit = async () => {
    const token = getToken();
    if (!token) {
      onError?.("No GitHub token. Open Settings → GitHub and paste your PAT.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ repository, branch, message, files }),
      });
      const data = await res.json() as { sha?: string; url?: string; error?: string };
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          clearToken();
          onError?.("GitHub rejected the token. Open Settings → GitHub and paste your PAT again.");
          return;
        }
        onError?.(data.error || `HTTP ${res.status}`);
        return;
      }
      onDone?.(data.url || `https://github.com/${repository}/commit/${data.sha}`);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Failed to commit");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={commit}
      disabled={busy || files.length === 0}
      className="rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted hover:text-foreground hover:border-gold/40 transition-colors disabled:opacity-50"
    >
      {busy ? "..." : `Commit (${files.length})`}
    </button>
  );
}