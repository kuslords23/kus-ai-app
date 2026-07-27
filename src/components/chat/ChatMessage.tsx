"use client";

import { motion } from "framer-motion";
import { InlineCard } from "./InlineCard";

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards?: Array<{
    type: string;
    title: string;
    subtitle?: string;
    url?: string;
    data?: Record<string, unknown>;
  }>;
  chips?: Array<{
    label: string;
    url?: string;
    action?: string;
  }>;
}

interface ChatMessageProps {
  message: ChatMessageData;
  isStreaming?: boolean;
  onChipClick?: (chip: { label: string; url?: string; action?: string }) => void;
}

export function ChatMessage({ message, isStreaming, onChipClick }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex w-full ${isUser ? "justify-end" : "justify-start"} mb-4`}
    >
      <div
        className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-gold/20 text-foreground border border-gold/30"
            : "bg-surface text-foreground border border-border"
        }`}
      >
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.content}
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-gold ml-0.5 animate-pulse rounded-sm" />
          )}
        </div>

        {message.cards && message.cards.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.cards.map((card, i) => (
              <InlineCard key={i} card={card} />
            ))}
          </div>
        )}

        {message.chips && message.chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.chips.map((chip, i) => (
              <button
                key={i}
                onClick={() => onChipClick?.(chip)}
                className="px-3 py-1.5 text-xs rounded-full border border-gold/40 text-gold hover:bg-gold/10 transition-colors"
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
