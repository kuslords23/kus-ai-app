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
    origin?: "hub" | "web";
    data?: Record<string, unknown>;
  }>;
  chips?: Array<{
    label: string;
    url?: string;
    action?: string;
    prompt?: string;
  }>;
  sourceLabel?: string;
  feedback?: "helpful" | "not_helpful";
}

interface ChatMessageProps {
  message: ChatMessageData;
  isStreaming?: boolean;
  onChipClick?: (chip: {
    label: string;
    url?: string;
    action?: string;
    prompt?: string;
  }) => void;
  onSpeak?: (text: string) => void;
  onFeedback?: (type: "helpful" | "not_helpful") => void;
  showFeedback?: boolean;
}

/** Lightweight **bold** rendering for hub-style answers. */
function renderContent(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-gold-light">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function ChatMessage({
  message,
  isStreaming,
  onChipClick,
  onSpeak,
  onFeedback,
  showFeedback,
}: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={`flex w-full ${isUser ? "justify-end" : "justify-start"} mb-3.5`}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-gold/15 border border-gold/25 flex items-center justify-center mr-2 mt-1 shrink-0 text-[10px] font-bold text-gold">
          K
        </div>
      )}
      <div
        className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-3.5 py-2.5 ${
          isUser
            ? "bubble-user rounded-br-md"
            : "bubble-ai rounded-bl-md"
        }`}
      >
        <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed">
          {renderContent(message.content)}
          {isStreaming && (
            <span className="inline-block w-1.5 h-3.5 bg-gold ml-0.5 align-middle animate-pulse rounded-sm" />
          )}
        </div>

        {message.cards && message.cards.length > 0 && (
          <div className="mt-2.5 space-y-2">
            {message.cards.map((card, i) => (
              <InlineCard key={i} card={card} />
            ))}
          </div>
        )}

        {message.chips && message.chips.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {message.chips.map((chip, i) => (
              <button
                key={i}
                onClick={() => onChipClick?.(chip)}
                className="px-2.5 py-1 text-[11px] rounded-full border border-gold/40 text-gold hover:bg-gold/10 transition-colors"
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {message.sourceLabel && !isStreaming && (
          <p className="mt-2 text-[10px] text-muted">
            Sources: {message.sourceLabel}
          </p>
        )}

        {!isUser && !isStreaming && message.content && onSpeak && (
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <button
              onClick={() => onSpeak(message.content)}
              className="text-[10px] text-muted hover:text-gold transition-colors"
            >
              ▶ Listen
            </button>
            {showFeedback && onFeedback && !message.feedback && (
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onFeedback("helpful")}
                  className="text-[10px] text-muted hover:text-gold px-1.5 py-0.5 rounded border border-transparent hover:border-border"
                  aria-label="Helpful"
                >
                  👍
                </button>
                <button
                  type="button"
                  onClick={() => onFeedback("not_helpful")}
                  className="text-[10px] text-muted hover:text-danger px-1.5 py-0.5 rounded border border-transparent hover:border-border"
                  aria-label="Not helpful"
                >
                  👎
                </button>
              </span>
            )}
            {message.feedback === "helpful" && (
              <span className="text-[10px] text-muted">Thanks for the feedback</span>
            )}
            {message.feedback === "not_helpful" && (
              <span className="text-[10px] text-muted">We&apos;ll learn from this</span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
