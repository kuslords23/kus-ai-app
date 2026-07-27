"use client";

import type { ReactNode } from "react";

interface ComposerDockProps {
  children: ReactNode;
  className?: string;
}

/**
 * Bottom composer — flush to screen edge. No home-indicator / safe-area padding.
 */
export function ComposerDock({ children, className = "" }: ComposerDockProps) {
  return (
    <div className={`composer-bar ${className}`.trim()}>{children}</div>
  );
}
