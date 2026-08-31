"use client";

import { useState, useEffect, useRef } from "react";
import { getToken } from "@/lib/github-token";

type RepoInfo = { fullName: string; description?: string; language?: string; updatedAt?: string };

/**
 * RepoReference — lets users search their GitHub repos and reference files from them.
 * Shows a search input, fetches matching repos, and lets the user select one.
 * When selected, it fetches the repo's files and passes them back to the parent.
 */
export function RepoReference({
  onSelectRepo,
  onClose,
}: {
  onSelectRepo: (repo: string, files: Array<{ path: string; content: string }>) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Search repos when query changes
  useEffect(() => {
    if (!query.trim()) { setRepos([]); return; }
    const token = getToken();
    if (!token) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        // 1. Search GitHub for public repos matching the query
        const searchRes = await fetch(
          `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=10&sort=updated`,
          { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
        );
        let searchItems: Array<{ full_name: string; description?: string | null; language?: string | null; updated_at?: string }> = [];
        if (searchRes.ok) {
          const searchData = await searchRes.json() as { items?: Array<{ full_name: string; description?: string | null; language?: string | null; updated_at?: string }> };
          searchItems = searchData.items || [];
        }

        // 2. Also fetch the user's own repos (includes private ones)
        let userRepos: Array<{ full_name: string; description?: string | null; language?: string | null; updated_at?: string }> = [];
        try {
          const userRes = await fetch("https://api.github.com/user/repos?per_page=50&sort=updated&type=all", {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
          });
          if (userRes.ok) {
            userRepos = await userRes.json() as Array<{ full_name: string; description?: string | null; language?: string | null; updated_at?: string }>;
          }
        } catch { /* skip */ }

        // 3. Merge: user repos first (deduped), then search results
        const seen = new Set<string>();
        const merged: Array<{ fullName: string; description?: string; language?: string; updatedAt?: string }> = [];
        for (const r of [...userRepos, ...searchItems]) {
          if (!seen.has(r.full_name)) {
            seen.add(r.full_name);
            merged.push({
              fullName: r.full_name,
              description: r.description || undefined,
              language: r.language || undefined,
              updatedAt: r.updated_at,
            });
          }
        }

        // Filter by query if it looks like an owner/repo pattern
        const q = query.toLowerCase();
        const filtered = q.includes("/")
          ? merged.filter((r) => r.fullName.toLowerCase().includes(q))
          : merged.filter((r) => r.fullName.toLowerCase().includes(q) || (r.description?.toLowerCase() || "").includes(q));

        setRepos(filtered);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectRepo = async (fullName: string) => {
    setSelectedRepo(fullName);
    setLoadingFiles(true);
    setError(null);
    const token = getToken();
    try {
      // Fetch root files to understand the repo structure
      const res = await fetch(`/api/repo-files?repo=${encodeURIComponent(fullName)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Could not fetch repo files");
      const data = await res.json() as { entries?: Array<{ path: string; type: string }>; file?: { path: string; content: string } };
      if (!data.entries && !data.file) throw new Error("No files found");

      // Get the content of key files (README, config files, etc.)
      const keyFiles = ["README.md", "package.json", "tsconfig.json", "next.config.js", "src/index.ts", "index.html"];
      const filesToFetch = keyFiles.filter((f) => data.entries?.some((e) => e.path === f && e.type === "file")).slice(0, 6);

      const files: Array<{ path: string; content: string }> = [];
      for (const filePath of filesToFetch) {
        try {
          const fileRes = await fetch(`/api/repo-files?repo=${encodeURIComponent(fullName)}&path=${encodeURIComponent(filePath)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (fileRes.ok) {
            const fileData = await fileRes.json() as { file?: { path: string; content: string } };
            if (fileData.file) files.push(fileData.file);
          }
        } catch { /* skip */ }
      }

      onSelectRepo(fullName, files);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load repo");
    } finally {
      setLoadingFiles(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Reference a repository</p>
        <button type="button" onClick={onClose} className="text-[10px] text-muted hover:text-foreground">✕</button>
      </div>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search repos by name (e.g. owner/repo)..."
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-gold/50 mb-2"
      />
      {loading && <p className="text-[10px] text-muted px-1">Searching…</p>}
      {error && <p className="text-[10px] text-red-400 px-1">{error}</p>}
      {loadingFiles && selectedRepo && (
        <p className="text-[10px] text-gold px-1">Loading files from {selectedRepo}…</p>
      )}
      <div className="max-h-48 overflow-y-auto space-y-1">
        {repos.map((repo) => (
          <button
            key={repo.fullName}
            type="button"
            onClick={() => void handleSelectRepo(repo.fullName)}
            disabled={loadingFiles}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-surface-hover disabled:opacity-50 transition-colors"
          >
            <span className="shrink-0 text-gold">📦</span>
            <span className="min-w-0 flex-1 truncate font-medium">{repo.fullName}</span>
            {repo.language && <span className="shrink-0 text-[10px] text-muted">{repo.language}</span>}
          </button>
        ))}
        {query && !loading && repos.length === 0 && !error && (
          <p className="text-[10px] text-muted px-1">No repos found. Try a different search.</p>
        )}
      </div>
    </div>
  );
}