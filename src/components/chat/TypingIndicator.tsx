"use client";

import { motion } from "framer-motion";

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-start mb-4"
    >
      <div className="bubble-ai rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
        <span className="text-sm">👑</span>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-gold"
              style={{ animation: `typing-dot 1.2s ease-in-out ${i * 0.15}s infinite` }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
