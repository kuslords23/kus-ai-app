"use client";

import { motion } from "framer-motion";

const SUGGESTIONS = [
  { label: "Show live scores", action: "live_scores" },
  { label: "My clan stats", action: "clan_stats" },
  { label: "Top players today", action: "top_players" },
  { label: "Upcoming matches", action: "upcoming_matches" },
  { label: "Open Sports", url: "" },
  { label: "Open Hub", url: "" },
];

interface SuggestionChipsProps {
  onSelect: (suggestion: { label: string; action?: string; url?: string }) => void;
  sportsUrl?: string;
  hubUrl?: string;
}

export function SuggestionChips({ onSelect, sportsUrl, hubUrl }: SuggestionChipsProps) {
  const chips = SUGGESTIONS.map((s) => {
    if (s.label === "Open Sports") return { ...s, url: sportsUrl || "#" };
    if (s.label === "Open Hub") return { ...s, url: hubUrl || "#" };
    return s;
  });

  return (
    <div className="flex flex-wrap gap-2 justify-center px-4">
      {chips.map((chip, i) => (
        <motion.button
          key={chip.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          onClick={() => onSelect(chip)}
          className="px-4 py-2 text-xs rounded-full border border-gold/30 text-gold/80 hover:bg-gold/10 hover:text-gold hover:border-gold/50 transition-all"
        >
          {chip.label}
        </motion.button>
      ))}
    </div>
  );
}
