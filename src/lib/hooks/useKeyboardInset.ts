"use client";

import { useEffect } from "react";

/**
 * Tracks iOS virtual keyboard via VisualViewport and exposes --keyboard-inset on :root.
 * Keeps fixed composers pinned above the keyboard on iPhone X+.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const inset = Math.max(
        0,
        Math.round(window.innerHeight - vv.height - vv.offsetTop)
      );
      document.documentElement.style.setProperty(
        "--keyboard-inset",
        `${inset}px`
      );
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
      document.documentElement.style.setProperty("--keyboard-inset", "0px");
    };
  }, []);
}
