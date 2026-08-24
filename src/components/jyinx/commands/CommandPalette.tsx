"use client";

/**
 * Command Palette — Cmd+K global search command bar.
 *
 * Search any Jyinx command and run it immediately. Also surfaces quick file
 * search, build status, and git status driven by the live `IdeState`.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  COMMAND_CATEGORIES,
  type CommandDefinition,
  type IdeState,
} from "@/lib/bridge";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: CommandDefinition[];
  onRun: (commandId: string) => void;
  state?: IdeState | null;
}

export function CommandPalette({ open, onClose, commands, onRun, state }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (c.keywords ?? []).some((k) => k.toLowerCase().includes(q))
    );
  }, [commands, query]);

  useEffect(() => setIndex(0), [query, results.length]);

  if (!open) return null;

  const run = (id: string) => {
    onRun(id);
    onClose();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") { onClose(); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    if (event.key === "Enter" && results[index]) { event.preventDefault(); run(results[index].id); }
  };

  const grouped = COMMAND_CATEGORIES.map((cat) => ({
    ...cat,
    items: results.filter((c) => c.category === cat.id),
  })).filter((g) => g.items.length > 0);

  const git = state?.git;
  const last = state?.lastResult;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center bg-black/50 p-4 pt-[12vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="text-muted">⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search commands, run a build, check git status…"
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
          />
          <button type="button" onClick={onClose} className="rounded border border-border px-1.5 text-[10px] text-muted hover:text-gold">
            esc
          </button>
        </div>

        {/* Live status strip */}
        {(git || last) && (
          <div className="flex items-center gap-3 border-b border-border bg-background/40 px-3 py-1.5 text-[10px] text-muted">
            {git && (
              <span className="font-mono">⎇ {git.branch ?? "no branch"} · {git.status}</span>
            )}
            {git && git.uncommitted > 0 && (
              <span className="rounded-full bg-gold/15 px-1.5 py-0.5 text-gold">{git.uncommitted} uncommitted</span>
            )}
            {last && last.status !== "idle" && (
              <span className={last.status === "failure" ? "text-danger" : "text-success"}>
                {last.kind}: {last.status}
              </span>
            )}
          </div>
        )}

        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {grouped.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted">No commands match “{query}”.</p>}
          {grouped.map((group) => (
            <div key={group.id}>
              <p className="px-2 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
                {group.label}
              </p>
              {group.items.map((cmd) => (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => run(cmd.id)}
                  onMouseEnter={() => setIndex(results.indexOf(cmd))}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                    results.indexOf(cmd) === index ? "bg-gold/15 text-gold" : "text-foreground"
                  }`}
                >
                  <span className="w-4 text-center text-muted">{cmd.icon}</span>
                  <span className="flex-1">{cmd.title}</span>
                  <span className="text-[9px] text-muted">{cmd.shortcut ?? cmd.id}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}