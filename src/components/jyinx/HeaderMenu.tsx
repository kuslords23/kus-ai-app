"use client";

import { useEffect, useRef, useState } from "react";

export type HeaderMenuAction =
  | "new-project"
  | "commit"
  | "chat"
  | "settings"
  | "autonomous"
  | "cost"
  | "builder"
  | "blog"
  | "search"
  | "peer-chat"
  | "code-library"
  | "marketplace"
  | "back";

type Props = {
  /** Active flags used to render checkmarks alongside toggles. */
  active?: Partial<Record<HeaderMenuAction, boolean>>;
  onAction: (action: HeaderMenuAction) => void;
  trigger?: React.ReactNode;
  align?: "left" | "right";
};

/**
 * Consolidated header options dropdown.
 *
 * Replaces a crowded row of inline buttons with a single hamburger/options
 * trigger that reveals the secondary actions: Create Project, Commit to
 * GitHub, Chat, Settings, Autonomous Mode, and Cost tracker.
 */
export function HeaderMenu({ active, onAction, trigger, align = "right" }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items: Array<{ key: HeaderMenuAction; label: string; icon: string; checked?: boolean }> = [
    { key: "new-project", label: "Create project", icon: "＋" },
    { key: "commit", label: "Commit to GitHub", icon: "⬆" },
    { key: "chat", label: "Chat interface", icon: "💬" },
    { key: "autonomous", label: "Autonomous mode", icon: "⟳", checked: active?.autonomous },
    { key: "cost", label: "Cost & keys", icon: "＄" },
    { key: "builder", label: "Web builder", icon: "▦" },
    { key: "blog", label: "Blog & CMS", icon: "✎" },
    { key: "search", label: "Online code search", icon: "🔎" },
    { key: "peer-chat", label: "Peer-to-Peer chat", icon: "👥" },
    { key: "code-library", label: "Code library", icon: "📦" },
    { key: "marketplace", label: "Marketplace", icon: "🏪" },
    { key: "settings", label: "Settings", icon: "⚙" },
    { key: "back", label: "Back to Royal", icon: "←" },
  ];

  const run = (action: HeaderMenuAction) => {
    setOpen(false);
    onAction(action);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:border-gold/40 hover:text-gold"
        aria-label="Menu"
        aria-expanded={open}
      >
        {trigger ?? (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {open && (
        <div className={`absolute top-full z-40 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-2xl ${align === "right" ? "right-0" : "left-0"}`}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => run(item.key)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-gold/10"
            >
              <span className="w-4 text-center text-muted" aria-hidden>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.checked && <span className="text-gold" aria-hidden>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Simple two-line brand/status block for the header. */
export function HeaderBrand({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold leading-tight">{title}</p>
      {subtitle && <p className="truncate text-[10px] text-muted leading-tight">{subtitle}</p>}
    </div>
  );
}