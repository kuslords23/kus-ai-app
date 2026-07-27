"use client";

import { motion } from "framer-motion";

interface SuggestionChipsProps {
  chips: Array<{ label: string; prompt?: string; primary?: boolean }>;
  onSelect: (chip: { label: string; prompt?: string; url?: string }) => void;
}

export function SuggestionChips({ chips, onSelect }: SuggestionChipsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {chips.map((chip, i) => (
        <motion.button
          key={`${chip.label}-${i}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03 }}
          onClick={() => onSelect(chip)}
          className={`shrink-0 px-3 py-1.5 text-[11px] rounded-full border transition-all whitespace-nowrap ${
            chip.primary
              ? "border-gold/45 bg-gold/15 text-gold"
              : "border-gold/25 bg-surface/60 text-gold/85 hover:bg-gold/10"
          }`}
        >
          {chip.label}
        </motion.button>
      ))}
    </div>
  );
}
