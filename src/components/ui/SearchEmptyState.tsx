"use client";

/**
 * Intelligent Search Empty State.
 *
 * Handles zero-result search scenarios gracefully with autocorrect cues
 * ("Did you mean...?"), alternative search links, and trending category tags
 * to prevent dead ends.
 */

import { useMemo, useState } from "react";

export interface Suggestion {
  label: string;
  onClick: (term: string) => void;
}

interface SearchEmptyStateProps {
  query: string;
  /** Optional helper to compute a "Did you mean?" correction. */
  suggest?: (q: string) => string | null;
  alternatives?: Suggestion[];
  /** Plain tag strings rendered as hashtags. */
  trending?: string[];
  clearLabel?: string;
  onClear?: () => void;
  /** The search action to run for a refocused term. */
  onSearch: (term: string) => void;
}

const TRENDING_FALLBACK = [
  "React hooks", "Supabase RLS", "TypeScript types",
  "API routes", "Tailwind CSS", "Next.js",
];

export function SearchEmptyState({
  query,
  suggest,
  alternatives = [],
  trending,
  clearLabel = "Clear search",
  onClear,
  onSearch,
}: SearchEmptyStateProps) {
  const [typed, setTyped] = useState("");

  const correction = useMemo(() => (suggest ? suggest(query.trim()) : null), [query, suggest]);

  const trendingList = trending ?? TRENDING_FALLBACK;
  const hasAnyCue = Boolean(correction) || alternatives.length > 0;
  const normalizedQuery = query.trim();

  function run(term: string) {
    const target = term.trim();
    if (!target) return;
    setTyped("");
    onSearch(target);
  }

  return (
    <div className="flex flex-col items-center justify-center text-center px-4 py-10">
      <div className="w-12 h-12 rounded-2xl bg-zinc-800 border border-border flex items-center justify-center text-xl">
        🔍
      </div>
      <h3 className="text-sm font-semibold mt-3">
        No results for “{normalizedQuery || "your search"}”
      </h3>

      {hasAnyCue && (
        <div className="mt-4 w-full max-w-sm space-y-2">
          {correction && (
            <button
              onClick={() => run(correction)}
              className="w-full flex items-center gap-2 rounded-xl border border-gold/25 bg-gold/10 px-3 py-2 text-left text-xs hover:bg-gold/15 transition-colors"
            >
              <span>💡</span>
              <span>
                Did you mean{" "}
                <span className="text-gold font-medium">“{correction}”</span>?
              </span>
            </button>
          )}

          {alternatives.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted mb-1.5">
                Try one of these
              </p>
              {alternatives.map((alt) => (
                <button
                  key={alt.label}
                  onClick={() => run(alt.label)}
                  className="block w-full text-left rounded-lg px-3 py-1.5 text-xs text-muted hover:bg-background/60 hover:text-foreground transition-colors"
                >
                  → {alt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 w-full max-w-sm">
        <div className="relative">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run(typed);
            }}
            placeholder={`Search ${normalizedQuery}…`}
            className="w-full text-xs px-3 py-2 rounded-xl bg-background/60 border border-border outline-none focus:border-gold/40 transition-colors"
          />
          <button
            onClick={() => run(typed)}
            aria-label="Search"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] text-gold px-2 py-1 rounded-lg hover:bg-gold/10"
          >
            Go
          </button>
        </div>
      </div>

      <p className="mt-5 text-[10px] uppercase tracking-[0.18em] text-muted">
        Trending now
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 max-w-sm">
        {trendingList.map((tag) => (
          <button
            key={tag}
            onClick={() => run(tag)}
            className="px-2.5 py-1 rounded-full border border-border text-[10px] text-muted hover:border-gold/40 hover:text-gold transition-colors"
          >
            #{tag.replace(/\s+/g, "")}
          </button>
        ))}
      </div>

      <button
        onClick={onClear}
        className="mt-5 text-[11px] text-muted underline decoration-dotted hover:text-foreground transition-colors"
      >
        {clearLabel}
      </button>
    </div>
  );
}