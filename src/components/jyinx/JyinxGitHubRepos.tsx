"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GitHubSetup } from "@/components/jyinx/GitHubSetup";

type Repository = {
  id: number;
  name: string;
  fullName: string;
  isPrivate: boolean;
  defaultBranch: string;
  updatedAt: string;
  url: string;
  owner: string;
};

type JyinxGitHubReposProps = {
  onSelectRepository: (repository: Repository) => void;
  selectedRepositoryId?: number;
  onRepositoriesLoaded?: (repositories: Repository[]) => void;
};

export function JyinxGitHubRepos({
  onSelectRepository,
  selectedRepositoryId,
  onRepositoriesLoaded,
}: JyinxGitHubReposProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerToken, setProviderToken] = useState<string | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [sessionChecked, setSessionChecked] = useState(false);

  const loadRepositories = useCallback(async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/github/repos", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as { repositories?: Repository[]; error?: string };
      if (!response.ok) {
        // Clear stale token if GitHub says it's expired
        if (response.status === 401) {
          try { localStorage.removeItem("kus-ai-github-token"); } catch { /* ignore */ }
          setProviderToken(null);
        }
        throw new Error(data.error || "Could not load GitHub repositories.");
      }
      const nextRepositories = data.repositories ?? [];
      setRepositories(nextRepositories);
      onRepositoriesLoaded?.(nextRepositories);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load GitHub repositories.");
    } finally {
      setLoading(false);
    }
  }, [onRepositoriesLoaded]);

  useEffect(() => {
    const githubError = new URLSearchParams(window.location.search).get("github_error");
    if (githubError) setError(githubError);
    let live = true;
    const applySession = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        let token = data.session?.provider_token ?? null;
        // Fall back to stored PAT (from getGitHubToken) when no OAuth session
        if (!token) {
          const { getGitHubToken } = await import("@/lib/jyinx/github-connect");
          token = await getGitHubToken();
        }
        if (!live) return;
        setProviderToken(token);
        setSessionChecked(true);
        if (token) await loadRepositories(token);
        else setLoading(false);
      } catch {
        if (live) {
          // Session check failed, but PAT may still work via getGitHubToken fallback
          const { getGitHubToken } = await import("@/lib/jyinx/github-connect");
          const token = await getGitHubToken().catch(() => null);
          if (live) {
            setProviderToken(token);
            setSessionChecked(true);
            if (token) await loadRepositories(token);
            else setLoading(false);
          }
        }
      }
    };
    void applySession();
    const supabase = createClient();
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!live) return;
      let token = session?.provider_token ?? null;
      // Fall back to stored PAT when OAuth session doesn't have a token
      if (!token) {
        const { getGitHubToken } = await import("@/lib/jyinx/github-connect");
        token = await getGitHubToken();
      }
      setProviderToken(token);
      setSessionChecked(true);
      if (token) void loadRepositories(token);
      else setLoading(false);
    });
    return () => { live = false; listener.subscription.unsubscribe(); };
  }, [loadRepositories]);

  return (
    <section className="mt-4 rounded-2xl border border-border bg-background/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div><p className="text-sm font-medium">GitHub repositories</p><p className="mt-0.5 text-[11px] text-muted">Choose a repository for Jyinx context.</p></div>
        {providerToken && <button type="button" onClick={() => void loadRepositories(providerToken)} className="text-[11px] text-gold hover:text-gold-light">Refresh</button>}
      </div>
      {!providerToken && sessionChecked && !loading && (
        <div className="mt-3">
          <GitHubSetup onTokenReady={(token) => { setProviderToken(token); void loadRepositories(token); }} />
        </div>
      )}
      {loading && <p className="mt-3 text-xs text-muted">Checking GitHub connection…</p>}
      {!loading && !sessionChecked && <p className="mt-3 text-xs text-muted">Restoring GitHub session…</p>}
      {error && <p className="mt-3 text-xs leading-relaxed text-danger">{error}</p>}
      {providerToken && !loading && !error && <div className="mt-3 max-h-52 space-y-1 overflow-y-auto">{repositories.map((repository) => <button type="button" key={repository.id} onClick={() => onSelectRepository(repository)} className={`w-full rounded-xl border px-3 py-2 text-left transition ${selectedRepositoryId === repository.id ? "border-gold/45 bg-gold/10" : "border-border hover:border-gold/25 hover:bg-surface-hover"}`}><span className="flex items-center justify-between gap-2"><span className="truncate text-xs font-medium">{repository.fullName}</span><span className="shrink-0 text-[10px] text-muted">{repository.isPrivate ? "Private" : "Public"}</span></span><span className="mt-1 block text-[10px] text-muted">{repository.defaultBranch} · updated {new Date(repository.updatedAt).toLocaleDateString()}</span></button>)}{repositories.length === 0 && <p className="py-2 text-xs text-muted">No repositories available to this GitHub account.</p>}</div>}
    </section>
  );
}

export type { Repository as JyinxRepository };
