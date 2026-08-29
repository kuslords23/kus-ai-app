"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getGitHubToken } from "@/lib/jyinx/github-connect";
import type { JyinxRepository } from "@/components/jyinx/JyinxGitHubRepos";

type ContextFile = { path: string; content: string };

type ContextState = {
  files: ContextFile[];
  context: string;
  loading: boolean;
  error: string | null;
};

export function useRepositoryContext(repository: JyinxRepository | null, query?: string | null): ContextState {
  const [state, setState] = useState<ContextState>({ files: [], context: "", loading: false, error: null });

  useEffect(() => {
    let live = true;
    const load = async () => {
      if (!repository) {
        setState({ files: [], context: "", loading: false, error: null });
        return;
      }
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        let token: string | null = null;
        try {
          const { data } = await createClient().auth.getSession();
          token = data.session?.provider_token ?? null;
        } catch {
          /* fall through */
        }
        if (!token) token = await getGitHubToken();
        if (!token) throw new Error("Reconnect GitHub to load repository context.");
        const params = new URLSearchParams({ repository: repository.fullName, branch: repository.defaultBranch, context: "1" });
        if (query) params.set("q", query);
        const response = await fetch(`/api/github/workspace?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const result = (await response.json()) as { files?: ContextFile[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Unable to load repository context.");
        const files = result.files ?? [];
        if (live) setState({ files, context: files.map((file) => `### ${file.path}\n${file.content}`).join("\n\n"), loading: false, error: null });
      } catch (cause) {
        if (live) setState({ files: [], context: "", loading: false, error: cause instanceof Error ? cause.message : "Unable to load repository context." });
      }
    };
    void load();
    return () => { live = false; };
  }, [repository, query]);

  return state;
}
