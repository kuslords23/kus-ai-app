"use client";

import { motion } from "framer-motion";
import { QUICK_ACTIONS } from "@/lib/companion/persona";

interface SuggestionChipsProps {
  onSelect: (suggestion: { label: string; action?: string; url?: string }) => void;
  sportsUrl?: string;
  hubUrl?: string;
  compact?: boolean;
}

export function SuggestionChips({
  onSelect,
  sportsUrl,
  hubUrl,
  compact,
}: SuggestionChipsProps) {
  const chips = QUICK_ACTIONS.map((s) => {
    if ("url" in s && s.url === "sports") return { label: s.label, url: sportsUrl || "#" };
    if ("url" in s && s.url === "hub") return { label: s.label, url: hubUrl || "#" };
    return {
      label: s.label,
      action: "action" in s ? s.action : undefined,
    };
  });

  return (
    <div
      className={`flex gap-2 overflow-x-auto no-scrollbar px-1 ${
        compact ? "pb-2" : "flex-wrap justify-center"
      }`}
    >
      {chips.map((chip, i) => (
        <motion.button
          key={chip.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          onClick={() => onSelect(chip)}
          className="shrink-0 px-3.5 py-1.5 text-[11px] rounded-full border border-gold/25 bg-purple-soft/40 text-gold/90 hover:bg-gold/10 hover:border-gold/45 transition-all whitespace-nowrap"
        >
          {chip.label}
        </motion.button>
      ))}
    </div>
  );
}
