"use client";

import { useEffect } from "react";

/**
 * When the keyboard is open, shrink the app shell to the visual viewport.
 * When closed, the shell uses CSS `inset: 0` to fill the full screen (no bottom gap).
 */
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;

    const sync = () => {
      const top = Math.max(0, Math.round(vv.offsetTop));
      const keyboard = Math.max(
        0,
        Math.round(window.innerHeight - vv.height - top)
      );

      if (keyboard > 0) {
        root.classList.add("keyboard-open");
        root.style.setProperty("--vv-top", `${top}px`);
        root.style.setProperty("--vv-left", `${Math.round(vv.offsetLeft)}px`);
        root.style.setProperty("--vv-width", `${Math.round(vv.width)}px`);
        root.style.setProperty("--vv-height", `${Math.round(vv.height)}px`);
      } else {
        root.classList.remove("keyboard-open");
        root.style.removeProperty("--vv-top");
        root.style.removeProperty("--vv-left");
        root.style.removeProperty("--vv-width");
        root.style.removeProperty("--vv-height");
      }
    };

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    window.addEventListener("orientationchange", sync);

    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      window.removeEventListener("orientationchange", sync);
      root.classList.remove("keyboard-open");
      root.style.removeProperty("--vv-top");
      root.style.removeProperty("--vv-left");
      root.style.removeProperty("--vv-width");
      root.style.removeProperty("--vv-height");
    };
  }, []);
}
