"use client";

import { useState } from "react";
import { COMMAND_CATEGORIES, type CommandDefinition } from "@/lib/bridge";

/**
 * SidebarCommands — VS Code-style menu bar for the mobile sidebar.
 *
 * Primary categories with right chevrons, collapsible sub-items,
 * and external navigation pinned at the bottom.
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
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

  const run = (id: string) => {
    onRun(id);
    onClose();
  };

  // Primary menu categories (VS Code-style — exact match)
  const primaryCategories = [
    { id: "file", label: "File", icon: "🗒" },
    { id: "edit", label: "Edit", icon: "✏️" },
    { id: "selection", label: "Selection", icon: "↔" },
    { id: "view", label: "View", icon: "👁" },
    { id: "go", label: "Go", icon: "🔎" },
    { id: "run", label: "Run", icon: "▶" },
    { id: "terminal", label: "Terminal", icon: "⌨" },
    { id: "help", label: "Help", icon: "❓" },
  ];

// Map our command categories to VS Code menu items
  const categoryMap: Record<string, string[]> = {
    file: ["file"],
    edit: ["edit"],
    selection: ["edit"],
    view: ["view"],
    go: ["edit", "file", "window"],
    run: ["run"],
    terminal: ["run"],
    help: ["agent", "window"],
  };

  const getCategoryCommands = (catId: string) => {
    const mappedIds = categoryMap[catId] ?? [catId];
    return commands.filter((c) => mappedIds.includes(c.category));
  };

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Primary category list */}
      <div className="flex-1 overflow-y-auto py-1">
        {primaryCategories.map((cat) => {
          const catCommands = getCategoryCommands(cat.id);
          const isExpanded = expandedCategory === cat.id;
          const isHovered = hoveredCategory === cat.id;

          return (
            <div key={cat.id} className="relative">
              {/* Category button */}
              <button
                type="button"
                onClick={() => setExpandedCategory(isExpanded ? null : cat.id)}
                onMouseEnter={() => setHoveredCategory(cat.id)}
                onMouseLeave={() => setHoveredCategory(null)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] transition-colors ${
                  isExpanded || isHovered
                    ? "bg-surface-hover text-foreground"
                    : "text-muted hover:text-foreground hover:bg-surface-hover/50"
                }`}
              >
                <span className="w-5 text-center shrink-0 text-sm">{cat.icon}</span>
                <span className="flex-1 font-medium">{cat.label}</span>
                <span className={`text-[10px] text-muted/60 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}>
                  ›
                </span>
              </button>

              {/* Flyout sub-items */}
              {isExpanded && catCommands.length > 0 && (
                <div className="border-l-2 border-gold/30 ml-5 pl-3 py-1 mb-1 space-y-0.5">
                  {catCommands.map((cmd) => (
                    <button
                      key={cmd.id}
                      type="button"
                      onClick={() => run(cmd.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
                    >
                      <span className="w-4 text-center text-[11px] shrink-0 text-muted/60">{cmd.icon}</span>
                      <span className="flex-1 truncate">{cmd.title}</span>
                      {cmd.shortcut && (
                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-mono bg-muted/10 text-muted/60 border border-border/30">
                          {cmd.shortcut}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Empty state for categories with no commands */}
              {isExpanded && catCommands.length === 0 && (
                <div className="border-l-2 border-gold/30 ml-5 pl-3 py-2 mb-1">
                  <p className="text-[11px] text-muted/60 italic">No commands available</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Horizontal separator */}
      <div className="shrink-0 border-t border-border/40 mx-3" />

      {/* External links pinned at bottom */}
      <div className="shrink-0 py-2 px-1 space-y-0.5">
        {externalLinks.map((link) => (
          <button
            key={link.label}
            type="button"
            onClick={() => {
              if (link.href) window.location.href = link.href;
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[12px] text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
          >
            <span className="w-5 text-center shrink-0 text-sm">{link.icon}</span>
            <span className="flex-1">{link.label}</span>
            <span className="text-[10px] text-muted/30">↗</span>
          </button>
        ))}
      </div>
    </div>
  );
}