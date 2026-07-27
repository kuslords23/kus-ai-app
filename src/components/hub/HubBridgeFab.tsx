"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { openHub, companionSiteUrl } from "@/lib/auth/hubBridge";
import { toast } from "sonner";

/**
 * Floating bridge to the Hub (auth + actions) with return path back to Royal.
 */
export function HubBridgeFab() {
  const [expanded, setExpanded] = useState(false);
  const [showReturnHint, setShowReturnHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("from") === "hub") {
      toast.success("Welcome back from the Hub");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (sessionStorage.getItem("kus_hub_opened") === "1") {
      setShowReturnHint(true);
      sessionStorage.removeItem("kus_hub_opened");
    }
  }, []);

  return (
    <div className="fixed right-3 z-30 flex flex-col items-end gap-2 pointer-events-none" style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" }}>
      {showReturnHint && (
        <motion.p
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          className="pointer-events-auto text-[10px] text-muted bg-surface/90 border border-border rounded-lg px-2 py-1 max-w-[140px] text-right"
        >
          Hub opens with a <strong className="text-gold">← Royal</strong> button to return here.
        </motion.p>
      )}

      <div
        className="pointer-events-auto group"
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        <motion.button
          type="button"
          onClick={() => openHub()}
          className="flex items-center gap-2 rounded-full border border-gold/40 bg-gold/15 text-gold shadow-lg backdrop-blur-sm hover:bg-gold/25 transition-colors"
          style={{ padding: expanded ? "10px 14px" : "10px" }}
          aria-label="Open Hub"
          title="Open Hub — wallet, sports, kingdom actions"
        >
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <path d="M9 22V12h6v10" />
          </svg>
          {expanded && <span className="text-xs font-medium pr-0.5">Open Hub</span>}
        </motion.button>
      </div>

      <a
        href={companionSiteUrl()}
        className="sr-only"
        aria-hidden
      >
        Royal AI companion
      </a>
    </div>
  );
}
