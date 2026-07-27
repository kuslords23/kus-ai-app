"use client";

import type { ReactNode } from "react";

interface ComposerDockProps {
  children: ReactNode;
  className?: string;
}

/** In-flow bottom composer — lives inside the visual-viewport shell (not position:fixed). */
export function ComposerDock({ children, className = "" }: ComposerDockProps) {
  return (
    <div
      className={`shrink-0 border-t border-border/60 bg-background/95 backdrop-blur-md px-3 pt-1.5 pb-[env(safe-area-inset-bottom,0px)] ${className}`.trim()}
    >
      {children}
    </div>
  );
}
