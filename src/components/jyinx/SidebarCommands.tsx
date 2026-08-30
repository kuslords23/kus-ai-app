"use client";

import { useState } from "react";
import { COMMAND_CATEGORIES, type CommandDefinition } from "@/lib/bridge";

/**
 * SidebarCommands — command registry panel tucked into the mobile sidebar menu.
 *
 * Shows commands grouped by category. Users can search or browse.
 * Both the user and the autonomous agent can interact with these commands.
 */
export function SidebarCommands({
  commands,
  onRun,
  onClose,
}: {
  commands: CommandDefinition[];
  onRun: (commandId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = query.trim()
    ? commands.filter((c) =>
        c.title.toLowerCase().includes(query.toLowerCase()) ||
        c.id.toLowerCase().includes(query.toLowerCase()) ||
        (c.keywords ?? []).some((k) => k.toLowerCase().includes(query.toLowerCase()))
      )
    : commands;

  const grouped = COMMAND_CATEGORIES.map((cat) => ({
    ...cat,
    items: filtered.filter((c) => c.category === cat.id),
  })).filter((g) => g.items.length > 0);

  const run = (id: string) => {
    onRun(id);
    onClose();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Search */}
      <div className="shrink-0 px-1 pb-2">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5">
          <span className="text-[10px] text-muted">🔎</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands..."
            className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="text-[10px] text-muted hover:text-foreground">✕</button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex shrink-0 gap-1 overflow-x-auto pb-2 px-1">
        <button
          type="button"
          onClick={() => setActiveCategory(null)}
          className={`shrink-0 rounded-lg px-2 py-1 text-[10px] transition-colors ${
            activeCategory === null ? "bg-gold/15 text-gold" : "text-muted hover:text-foreground border border-transparent hover:border-border"
          }`}
        >
          All
        </button>
        {COMMAND_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
            className={`shrink-0 rounded-lg px-2 py-1 text-[10px] transition-colors ${
              activeCategory === cat.id ? "bg-gold/15 text-gold" : "text-muted hover:text-foreground border border-transparent hover:border-border"
            }`}
          >
            {cat.icon} {cat.label}
          </button>
        ))}
      </div>

      {/* Command list */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {grouped.length === 0 && (
          <p className="px-2 py-4 text-center text-[10px] text-muted">No commands match "{query}".</p>
        )}
        {grouped.map((group) => {
          const items = activeCategory ? group.items : group.items;
          if (items.length === 0) return null;
          return (
            <div key={group.id}>
              <p className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
                {group.icon} {group.label}
              </p>
              <div className="space-y-0.5">
                {items.map((cmd) => (
                  <button
                    key={cmd.id}
                    type="button"
                    onClick={() => run(cmd.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-surface-hover"
                  >
                    <span className="w-4 text-center text-[10px] text-muted">{cmd.icon}</span>
                    <span className="flex-1 text-foreground">{cmd.title}</span>
                    {cmd.shortcut && (
                      <span className="shrink-0 text-[9px] text-muted font-mono">{cmd.shortcut}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}