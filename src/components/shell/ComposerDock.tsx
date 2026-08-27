"use client";

import type { ReactNode } from "react";

interface ComposerDockProps {
  children: ReactNode;
  className?: string;
}

/**
 * Bottom composer — ChatGPT-style ~12px gap under the pill. No home-indicator padding.
 */
export function ComposerDock({ children, className = "" }: ComposerDockProps) {
  return (
    <div className={`composer-bar ${className}`.trim()}>{children}</div>
  );
}
