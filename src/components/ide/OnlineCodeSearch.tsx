"use client";

/**
 * In-IDE Online Code Search.
 *
 * A search interface within the Jyinx IDE sidebar/toolbar that queries
 * external public codebases, repositories, and documentation on the web.
 * Displays results with clear metadata, syntax previews, and prominent
 * "Copy Code" or "Send to Chat" actions. Auto-ingests viewed snippets into
 * the shared code vault.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export interface OnlineCodeResult {
  id: string;
  title: string;
  description?: string;
  language: string;
  snippet: string;
  stars?: number;
  author?: string;
  source: "github" | "stackoverflow" | "docs" | "npm" | "paste";
  url?: string;
  repo?: string;
}

interface OnlineCodeSearchProps {
  /** Where matched code is inserted (chat input hook). */
  onSend?: (result: OnlineCodeResult) => void;
  onCopy?: (code: string) => void;
  /** Called when a snippet is viewed / sent so it can be auto-ingested. */
  onIngest?: (result: OnlineCodeResult) => void;
  className?: string;
}

const SAMPLE_LANG_COLOR: Record<string, string> = {
  typescript: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  javascript: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  python: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  rust: "bg-orange-500/20 text-orange-400 border-orange-500/40",
  go: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40",
  sql: "bg-purple-500/20 text-purple-400 border-purple-500/40",
  dockerfile: "bg-sky-500/20 text-sky-400 border-sky-500/40",
  tsx: "bg-blue-500/20 text-blue-400 border-blue-500/40",
};

export function OnlineCodeSearch({
  onSend,
  onCopy,
  onIngest,
  className = "",
}: OnlineCodeSearchProps) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<OnlineCodeResult[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(term: string | null) {
    const q = (term ?? query).trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/jyinx/code-search?q=${encodeURIComponent(q)}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data = (await res.json()) as { results: OnlineCodeResult[] };
      setResults(data.results);
      if (data.results.length === 0) {
        setError("no-results");
      }
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : "Search failed.";
      setError(msg);
    } finally {
      setSearching(false);
    }
  }

  const copyCode = useCallback(
    (r: OnlineCodeResult) => {
      navigator.clipboard?.writeText(r.snippet).then(
        () => toast.success("Code copied to clipboard"),
        () => toast.error("Copy failed")
      );
      onCopy?.(r.snippet);
      onIngest?.(r);
    },
    [onCopy, onIngest]
  );

  const send = useCallback(
    (r: OnlineCodeResult) => {
      onSend?.(r);
      onIngest?.(r);
    },
    [onSend, onIngest]
  );

  function expand(id: string) {
    const target = results.find((r) => r.id === id);
    setExpandedId((prev) => (prev === id ? null : id));
    // Auto-ingest on view.
    if (target) onIngest?.(target);
  }

  // Auto-ingest once a query returns results (background categorization).
  useEffect(() => {
    if (results.length > 0) {
      // Fire a single bulk ingest for the fetched results.
      results.forEach((r) => onIngest?.(r));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.length]);

  return (
    <div className={`flex flex-col h-full bg-background border-l border-border ${className}`}>
      {/* Header */}
      <div className="shrink-0 px-3 py-2.5 border-b border-border">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch(null);
            }}
            placeholder="Search public code, repos, docs…"
            className="w-full pl-8 pr-10 py-2 text-xs rounded-xl bg-background/60 border border-border outline-none focus:border-gold/40 transition-colors"
          />
          <button
            onClick={() => runSearch(null)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gold px-2 py-0.5 rounded-md hover:bg-gold/10"
          >
            {searching ? "…" : "Go"}
          </button>
        </div>
        <p className="text-[9px] text-muted mt-1.5">
          {results.length > 0 && `Showing ${results.length} results`}
        </p>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {searching && (
          <div className="py-8 text-center text-xs text-muted">Searching public code…</div>
        )}
        {!searching && error === "no-results" && results.length === 0 && (
          <NoResults query={query} onRequery={runSearch} />
        )}
        {!searching && error && error !== "no-results" && (
          <div className="py-8 text-center text-xs text-danger">{error}</div>
        )}
        {results.map((r) => (
          <div
            key={r.id}
            className="rounded-xl border border-border bg-background/40 overflow-hidden group"
          >
            <button
              onClick={() => expand(r.id)}
              className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-background/60 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{r.title}</p>
                <p className="text-[10px] text-muted truncate mt-0.5">{r.description}</p>
              </div>
              <div className="flex flex-col items-end shrink-0 gap-1">
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${langColor(r.language)}`}>
                  {r.language}
                </span>
                {r.stars ? (
                  <span className="text-[9px] text-muted">⭐ {r.stars}</span>
                ) : (
                  <span className="text-[9px] text-muted">{r.source}</span>
                )}
              </div>
            </button>

            {expandedId === r.id && (
              <div className="px-3 pb-3">
                <pre className="text-[10px] leading-relaxed bg-black/30 rounded-lg p-2.5 overflow-x-auto max-h-48">
                  <code>{r.snippet}</code>
                </pre>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => copyCode(r)}
                    className="flex-1 text-[10px] text-gold border border-gold/30 rounded-lg py-1.5 hover:bg-gold/10 transition-colors"
                  >
                    Copy Code
                  </button>
                  {onSend && (
                    <button
                      onClick={() => send(r)}
                      className="flex-1 text-[10px] bg-gold/20 border border-gold/40 text-gold rounded-lg py-1.5 hover:bg-gold/30 transition-colors"
                    >
                      Send to Chat
                    </button>
                  )}
                </div>
                {r.repo && (
                  <a
                    href={r.repo}
                    target="_blank"
                    rel="noreferrer"
                    className="block mt-2 text-[9px] text-muted hover:text-gold truncate"
                  >
                    ← {r.repo}
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function langColor(lang: string): string {
  return Object.prototype.hasOwnProperty.call(SAMPLE_LANG_COLOR, lang)
    ? (SAMPLE_LANG_COLOR as Record<string, string>)[lang]
    : "bg-zinc-500/20 text-zinc-400 border-zinc-500/40";
}

function NoResults({ query, onRequery }: { query: string; onRequery: (q: string) => void }) {
  const trends = ["react hooks", "supabase", "tailwind", "next.js api"];
  return (
    <div className="py-8 text-center">
      <p className="text-xs text-muted">No results for “{query}”</p>
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {trends.map((t) => (
          <button
            key={t}
            onClick={() => onRequery(t)}
            className="px-2 py-0.5 rounded-full border border-border text-[10px] text-muted hover:border-gold/40 hover:text-gold"
          >
            #{t.replace(/\s+/g, "")}
          </button>
        ))}
      </div>
    </div>
  );
}