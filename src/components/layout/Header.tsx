"use client";

import { motion } from "framer-motion";

interface HeaderProps {
  companionName?: string;
  voiceEnabled?: boolean;
  onToggleVoice?: () => void;
  onOpenHistory?: () => void;
  onOpenSettings?: () => void;
  onSignOut?: () => void;
}

export function Header({
  companionName = "Kus AI",
  voiceEnabled,
  onToggleVoice,
  onOpenHistory,
  onOpenSettings,
  onSignOut,
}: HeaderProps) {
  return (
    <header className="shrink-0 glass border-b border-border px-3 pt-[max(0.65rem,env(safe-area-inset-top))] pb-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-gold/30 to-purple/30 border border-gold/35 flex items-center justify-center shrink-0">
            <span className="text-gold text-sm font-bold leading-none">K</span>
            <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[9px]">👑</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{companionName}</p>
            <p className="text-[10px] text-muted truncate">Royal Assistant</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {process.env.NEXT_PUBLIC_SPORTS_COMPANION_URL && (
            <a
              href={process.env.NEXT_PUBLIC_SPORTS_COMPANION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden xs:inline text-[11px] px-2 py-1 rounded-lg text-muted hover:text-gold transition-colors"
            >
              Sports
            </a>
          )}
          {process.env.NEXT_PUBLIC_HUB_URL && (
            <a
              href={process.env.NEXT_PUBLIC_HUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] px-2 py-1 rounded-lg text-muted hover:text-gold transition-colors"
            >
              Hub
            </a>
          )}

          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onToggleVoice}
            aria-label="Toggle voice mode"
            className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${
              voiceEnabled
                ? "border-gold/50 bg-gold/15 text-gold"
                : "border-border text-muted hover:text-foreground"
            }`}
            title={voiceEnabled ? "Voice mode on" : "Voice mode off"}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M15.54 8.46a5 5 0 010 7.07" />
            </svg>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onOpenHistory}
            aria-label="History"
            className="w-8 h-8 rounded-lg border border-border text-muted hover:text-foreground flex items-center justify-center"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M3 12a9 9 0 1 0 9-9" />
              <path d="M3 3v6h6" />
              <path d="M12 7v5l3 2" />
            </svg>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onOpenSettings}
            aria-label="Settings"
            className="w-8 h-8 rounded-lg border border-border text-muted hover:text-foreground flex items-center justify-center"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </motion.button>

          {onSignOut && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={onSignOut}
              className="text-[11px] px-2 py-1 rounded-lg text-muted hover:text-danger transition-colors"
            >
              Out
            </motion.button>
          )}
        </div>
      </div>
    </header>
  );
}
