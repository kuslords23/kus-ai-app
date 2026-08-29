"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getGitHubToken } from "@/lib/jyinx/github-connect";
import type { JyinxRepository } from "@/components/jyinx/JyinxGitHubRepos";

export type JyinxWorkspaceEntry = { name: string; path: string; type: "file" | "dir"; size: number };

type Props = { repository: JyinxRepository | null; onOpenFile: (path: string, content: string) => void; onEntriesLoaded?: (entries: JyinxWorkspaceEntry[]) => void };

export function JyinxWorkspaceFiles({ repository, onOpenFile, onEntriesLoaded }: Props) {
  const [entries, setEntries] = useState<JyinxWorkspaceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const getToken = async (): Promise<string | null> => {
      try {
        const { data } = await createClient().auth.getSession();
        if (data.session?.provider_token) return data.session.provider_token;
      } catch {
        /* fall through */
      }
      return getGitHubToken();
    };

    const load = async () => {
      if (!repository) { setEntries([]); return; }
      setLoading(true); setError(null);
      try {
        const token = await getToken();
        if (!token) throw new Error("Reconnect GitHub to browse files.");
        const response = await fetch(`/api/github/workspace?repository=${encodeURIComponent(repository.fullName)}&branch=${encodeURIComponent(repository.defaultBranch)}`, { headers: { Authorization: `Bearer ${token}` } });
        const dataJson = (await response.json()) as { entries?: JyinxWorkspaceEntry[]; error?: string };
        if (!response.ok) throw new Error(dataJson.error || "Unable to load repository files.");
        if (live) { const nextEntries = dataJson.entries ?? []; setEntries(nextEntries); onEntriesLoaded?.(nextEntries); }
      } catch (cause) { if (live) setError(cause instanceof Error ? cause.message : "Unable to load files."); }
      finally { if (live) setLoading(false); }
    };
    void load(); return () => { live = false; };
  }, [onEntriesLoaded, repository]);

  const open = async (entry: JyinxWorkspaceEntry) => {
    if (!repository || entry.type !== "file") return;
    try {
      const token = await getToken();
      if (!token) throw new Error("Reconnect GitHub to open files.");
      const response = await fetch(`/api/github/workspace?repository=${encodeURIComponent(repository.fullName)}&branch=${encodeURIComponent(repository.defaultBranch)}&path=${encodeURIComponent(entry.path)}`, { headers: { Authorization: `Bearer ${token}` } });
      const result = (await response.json()) as { file?: { path: string; content: string }; error?: string };
      if (!response.ok || !result.file) throw new Error(result.error || "Unable to open file.");
      onOpenFile(result.file.path, result.file.content);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to open file."); }
  };

  return <div className="space-y-1">{loading && <p className="px-2 py-2 text-xs text-muted">Loading repository files…</p>}{error && <p className="px-2 py-2 text-xs text-danger">{error}</p>}{!repository && <p className="px-2 py-2 text-xs text-muted">Connect GitHub and select a repository in Status.</p>}{entries.filter((entry) => entry.type === "file").slice(0, 50).map((entry) => <button key={entry.path} type="button" onClick={() => void open(entry)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-muted hover:bg-surface-hover hover:text-foreground"><span className="text-gold/80">▹</span>{entry.path}</button>)}</div>;
}
