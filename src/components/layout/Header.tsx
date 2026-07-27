"use client";

import { useAuth } from "@/lib/hooks/useAuth";
import { motion } from "framer-motion";

export function Header() {
  const { user, signOut } = useAuth();

  return (
    <header className="shrink-0 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-border bg-background">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center">
          <svg className="w-4 h-4 text-gold" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          </svg>
        </div>
        <span className="font-semibold text-sm text-foreground">Kus-lords AI</span>
      </div>

      <div className="flex items-center gap-3">
        {process.env.NEXT_PUBLIC_SPORTS_COMPANION_URL && (
          <a
            href={process.env.NEXT_PUBLIC_SPORTS_COMPANION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted hover:text-gold transition-colors"
          >
            Sports
          </a>
        )}
        {process.env.NEXT_PUBLIC_HUB_URL && (
          <a
            href={process.env.NEXT_PUBLIC_HUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted hover:text-gold transition-colors"
          >
            Hub
          </a>
        )}
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
