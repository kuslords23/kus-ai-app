"use client";

import type { ReactNode } from "react";

interface ComposerDockProps {
  children: ReactNode;
  className?: string;
}

/**
 * ChatGPT-style bottom bar — flush to screen base, safe-area only under the pill.
 */
export function ComposerDock({ children, className = "" }: ComposerDockProps) {
  return (
    <div className={`composer-bar ${className}`.trim()}>{children}</div>
  );
}
