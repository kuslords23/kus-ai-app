"use client";

/**
 * Adaptive Top-Level Action & Menu Bar.
 *
 * Desktop / landscape / companion mode: a classic horizontal menu bar
 * (File · Edit · View · Run · Source Control · Agent · Window · Help).
 * Phone / portrait: a single primary "menu" button opening a searchable
 * Actions sheet (reusing the command palette surface).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { COMMAND_CATEGORIES, type CommandDefinition } from "@/lib/bridge";

interface JyinxMenuBarProps {
  commands: CommandDefinition[];
  onRun: (commandId: string) => void;
  onOpenPalette: () => void;
}

export function JyinxMenuBar({ commands, onRun, onOpenPalette }: JyinxMenuBarProps) {
  const [active, setActive] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!active) return;
    const onPointer = (event: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) {
        setActive(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActive(null);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenPalette();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [active, onOpenPalette]);

const filteredCommands = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (c.keywords ?? []).some((k) => k.toLowerCase().includes(q))
    );
  }, [commands, search]);

  const actionsByCategory = useMemo(
    () =>
      COMMAND_CATEGORIES.map((cat) => ({
        ...cat,
        items: filteredCommands.filter((c) => c.category === cat.id),
      })).filter((g) => g.items.length > 0),
    [filteredCommands]
  );

  const menuDefs = useMemo<Array<{ id: string; label: string }>>(
    () => COMMAND_CATEGORIES.map((cat) => ({ id: cat.id, label: cat.label })).concat([{ id: "help", label: "Help" }]),
    []
  );

  return (
    <div ref={barRef} className="relative -mb-px flex items-center gap-0.5 overflow-x-auto">
      {/* Desktop / landscape / companion: classic horizontal menu bar */}
      <div className="hidden items-center gap-0.5 lg:flex">
        {menuDefs.map((menu) => (
        <div key={String(menu.id)} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setActive(active === menu.id ? null : menu.id)}
            onMouseEnter={() => { if (active) setActive(menu.id); }}
            className={`cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
              active === menu.id ? "bg-gold/15 text-gold" : "text-muted hover:bg-surface hover:text-foreground"
            }`}
          >
            {menu.label}
          </button>

          {active === menu.id && (
            <div className="absolute left-0 top-full z-40 mt-1 min-w-52 overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
              <div className="max-h-80 overflow-y-auto p-1">
                {menu.id === "help" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => { setActive(null); onOpenPalette(); }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-foreground hover:bg-gold/10"
                    >
                      <span className="text-muted">⌘K</span> Command Palette
                    </button>
                    <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-muted hover:bg-gold/10">
                      <span>⌨️</span> Keyboard shortcuts
                    </button>
                    <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-muted hover:bg-gold/10">
                      <span>ℹ️</span> About Jyinx
                    </button>
                  </>
                ) : (
                  <>
                    <div className="border-b border-border px-2 py-1">
                      <input
                        autoFocus
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={`Search ${menu.label}…`}
                        className="w-full rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-gold"
                      />
                    </div>
                    {filteredCommands.filter((c) => c.category === menu.id).map((cmd) => (
                      <button
                        key={cmd.id}
                        type="button"
                        onClick={() => { setActive(null); onRun(cmd.id); }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-foreground hover:bg-gold/10"
                        title={cmd.description}
                      >
                        <span className="w-4 text-center text-muted">{cmd.icon}</span>
                        <span className="flex-1">{cmd.title}</span>
                        {cmd.shortcut && <span className="text-[9px] text-muted">{cmd.shortcut}</span>}
                      </button>
                    ))}
                    {filteredCommands.filter((c) => c.category === menu.id).length === 0 && (
                      <p className="px-2 py-2 text-[10px] text-muted">No commands match “{search}”.</p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={onOpenPalette}
        className="ml-auto hidden shrink-0 cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted transition-colors hover:border-gold/40 hover:text-gold lg:flex"
        title="Command palette (Cmd+K)"
      >
        <span>⌘K</span>
      </button>
      </div>

      {/* Phone / portrait: single menu button → searchable Actions sheet */}
      <button
        type="button"
        onClick={() => { setMobileOpen(true); setSearch(""); }}
        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:border-gold/40 hover:text-gold lg:hidden"
        aria-haspopup="dialog"
        aria-expanded={mobileOpen}
      >
        <span>☰</span>
        <span>Actions</span>
      </button>

      {mobileOpen && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setMobileOpen(false)}>
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-surface sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <span className="text-muted">🔍</span>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search actions…"
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
              />
              <button type="button" onClick={() => setMobileOpen(false)} className="rounded border border-border px-1.5 text-[10px] text-muted">esc</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {actionsByCategory.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted">No actions match “{search}”.</p>}
              {actionsByCategory.map((group) => (
                <div key={group.id}>
                  <p className="px-2 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">{group.label}</p>
                  {group.items.map((cmd) => (
                    <button
                      key={cmd.id}
                      type="button"
                      onClick={() => { setMobileOpen(false); onRun(cmd.id); }}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-foreground hover:bg-gold/10"
                    >
                      <span className="w-4 text-center text-muted">{cmd.icon}</span>
                      <span className="flex-1">{cmd.title}</span>
                      {cmd.shortcut && <span className="text-[9px] text-muted">{cmd.shortcut}</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}