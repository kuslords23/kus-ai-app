"use client";

import { useEffect } from "react";

/**
 * Pins the app shell to the iOS visual viewport so the header never slides
 * under the status bar and the composer stays flush above the keyboard /
 * home indicator without a phantom gap.
 */
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const sync = () => {
      const top = Math.max(0, Math.round(vv.offsetTop));
      const left = Math.max(0, Math.round(vv.offsetLeft));
      const width = Math.round(vv.width);
      const height = Math.round(vv.height);
      const keyboard = Math.max(
        0,
        Math.round(window.innerHeight - height - top)
      );

      const root = document.documentElement;
      root.style.setProperty("--vv-top", `${top}px`);
      root.style.setProperty("--vv-left", `${left}px`);
      root.style.setProperty("--vv-width", `${width}px`);
      root.style.setProperty("--vv-height", `${height}px`);
      root.style.setProperty("--keyboard-open", keyboard > 0 ? "1" : "0");
    };

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    window.addEventListener("orientationchange", sync);

    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      window.removeEventListener("orientationchange", sync);
      const root = document.documentElement;
      root.style.removeProperty("--vv-top");
      root.style.removeProperty("--vv-left");
      root.style.removeProperty("--vv-width");
      root.style.removeProperty("--vv-height");
      root.style.removeProperty("--keyboard-open");
    };
  }, []);
}
