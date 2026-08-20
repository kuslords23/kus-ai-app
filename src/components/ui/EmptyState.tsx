"use client";

/**
 * Actionable Empty State.
 *
 * A reusable component that explains *why* a section is empty, *what* it's
 * for, and offers a prominent primary CTA button. Should be used across blank
 * dashboard panels, empty code vaults, and unpopulated departmental tabs.
 */

import type { ReactNode } from "react";

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
  icon?: ReactNode;
  variant?: "primary" | "secondary";
}

interface EmptyStateProps {
  /** Short title, e.g. "No projects yet". */
  title: string;
  /** One-line explanation of what belongs here. */
  description: string;
  /** Optional second line explaining *why* it's empty. */
  hint?: string;
  /** Emoji / glyph shown above the title. */
  icon?: ReactNode;
  actions?: EmptyStateAction[];
  /** Compact variant for small in-panel embeds. */
  compact?: boolean;
  /** Extra className passthrough. */
  className?: string;
}

export function EmptyState({
  title,
  description,
  hint,
  icon,
  actions,
  compact = false,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-border bg-background/40 ${
        compact ? "px-4 py-6" : "px-6 py-10"
      } ${className}`}
    >
      <div
        className={`flex items-center justify-center rounded-2xl bg-gold/10 border border-gold/20 text-2xl ${
          compact ? "w-10 h-10" : "w-14 h-14"
        }`}
      >
        {icon ?? "🗂️"}
      </div>

      <h3
        className={`font-semibold text-foreground mt-3 ${
          compact ? "text-sm" : "text-lg"
        }`}
      >
        {title}
      </h3>

      <p
        className={`text-muted mt-1 max-w-md ${
          compact ? "text-[11px]" : "text-xs"
        }`}
      >
        {description}
      </p>

      {hint && (
        <p className="text-muted/70 text-[11px] mt-1.5 max-w-sm">
          {hint}
        </p>
      )}

      {actions && actions.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          {actions.map((action, i) => {
            const base =
              "px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5";
            const variant =
              action.variant === "secondary"
                ? "border border-border text-muted hover:bg-background/60"
                : "bg-gold/20 border border-gold/40 text-gold hover:bg-gold/30";

            const cls = `${base} ${variant}`;

            if (action.href) {
              return (
                <a key={i} href={action.href} className={cls}>
                  {action.icon}
                  {action.label}
                </a>
              );
            }
            return (
              <button key={i} onClick={action.onClick} className={cls}>
                {action.icon}
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}