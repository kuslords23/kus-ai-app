"use client";

import { useAuth } from "@/lib/hooks/useAuth";
import { motion } from "framer-motion";

export function Header() {
  const { user, signOut } = useAuth();

  return (
    <header className="shrink-0 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-border bg-background/90">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gold/15 border border-gold/30 flex items-center justify-center">
          <span className="text-gold text-xs font-bold">K</span>
        </div>
        <div>
          <p className="font-semibold text-sm text-foreground leading-tight">Kus AI</p>
          <p className="text-[10px] text-muted leading-tight">Same soul as Hub</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <a
          href={
            process.env.NEXT_PUBLIC_SPORTS_COMPANION_URL ||
            "https://kus-sports.vercel.app"
          }
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted hover:text-gold transition-colors"
        >
          Sports
        </a>
        <a
          href={
            process.env.NEXT_PUBLIC_HUB_URL ||
            "https://sport-clan-nexus.vercel.app"
          }
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted hover:text-gold transition-colors"
        >
          Hub
        </a>
        {user && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={signOut}
            className="text-xs text-muted hover:text-danger transition-colors"
          >
            Sign Out
          </motion.button>
        )}
      </div>
    </header>
  );
}
