"use client";

import { motion } from "framer-motion";

interface CardData {
  type: string;
  title: string;
  subtitle?: string;
  url?: string;
  data?: Record<string, unknown>;
}

export function InlineCard({ card }: { card: CardData }) {
  const icon =
    card.type === "match"
      ? "⚽"
      : card.type === "clan"
        ? "🛡"
        : card.type === "player"
          ? "⭐"
          : "↗";

  const content = (
    <motion.div
      whileHover={{ scale: 1.015 }}
      className="rounded-xl border border-gold/20 bg-background/50 p-3 cursor-pointer hover:border-gold/40 transition-colors"
    >
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center text-sm">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{card.title}</p>
          {card.subtitle && (
            <p className="text-xs text-muted truncate">{card.subtitle}</p>
          )}
        </div>
        <svg className="w-4 h-4 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>
    </motion.div>
  );

  if (card.url) {
    return (
      <a href={card.url} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return content;
}
