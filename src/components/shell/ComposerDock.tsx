"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface ComposerDockProps {
  children: ReactNode;
  className?: string;
}

/**
 * Fixed bottom composer — sits above home indicator or keyboard (iPhone X+).
 */
export function ComposerDock({ children, className = "" }: ComposerDockProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const setHeight = () => {
      document.documentElement.style.setProperty(
        "--composer-height",
        `${el.offsetHeight}px`
      );
    };

    setHeight();
    const ro = new ResizeObserver(setHeight);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.setProperty("--composer-height", "0px");
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`composer-dock ${className}`.trim()}
    >
      {children}
    </div>
  );
}
