"use client";

import { motion } from "framer-motion";
import { InlineCard } from "./InlineCard";

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Array<{
    id?: string;
    kind: "image" | "file" | "video";
    name: string;
    mimeType?: string;
    previewUrl?: string;
    dataUrl?: string;
    size?: number;
  }>;
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
  /** Copy the raw message text to the clipboard. */
  onCopy?: (text: string) => void;
  /** Re-open a user message in the composer for editing. */
  onEdit?: (message: ChatMessageData) => void;
  /** Re-run the request that produced this message. */
  onRetry?: (message: ChatMessageData) => void;
  /** Save the assistant message into a Notebook. */
  onSave?: (message: ChatMessageData) => void;
  /** True when the user message is currently being edited (truncate content). */
  editing?: boolean;
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
  onCopy,
  onEdit,
  onRetry,
  onSave,
  editing,
}: ChatMessageProps) {
  const isUser = message.role === "user";

  const handleCopy = () => {
    if (message.content) onCopy?.(message.content);
  };

  const actionBtn =
    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted hover:text-gold hover:bg-gold/5 transition-colors";

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
          {isUser && editing && message.content.length > 60
            ? `${message.content.slice(0, 60)}…`
            : renderContent(message.content)}
          {isStreaming && (
            <span className="inline-block w-1.5 h-3.5 bg-gold ml-0.5 align-middle animate-pulse rounded-sm" />
          )}
        </div>

        {!isStreaming && message.content && (
          <div className="mt-1.5 flex items-center gap-1 opacity-70 transition-opacity hover:opacity-100">
            <button type="button" onClick={handleCopy} className={actionBtn} aria-label="Copy message">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy
            </button>
            {isUser && onEdit && (
              <button type="button" onClick={() => onEdit(message)} className={actionBtn} aria-label="Edit message">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                Edit
              </button>
            )}
            {!isUser && onSave && (
              <button type="button" onClick={() => onSave(message)} className={actionBtn} aria-label="Save to notebook">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3M9 20h6M12 4v10"/><path d="M18 10v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-8"/></svg>
                Save
              </button>
            )}
            {!isUser && onRetry && (
              <button type="button" onClick={() => onRetry(message)} className={actionBtn} aria-label="Regenerate response">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/></svg>
                Retry
              </button>
            )}
          </div>
        )}

        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2.5 grid gap-2">
            {message.attachments.map((a, i) => (
              <div
                key={a.id ?? `${a.name}-${i}`}
                className="overflow-hidden rounded-xl border border-border bg-surface/60"
              >
                {a.kind === "image" && (a.previewUrl || a.dataUrl) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.previewUrl || a.dataUrl}
                    alt={a.name}
                    className="w-full max-h-56 object-cover"
                  />
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <span className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center text-sm shrink-0">
                      {a.kind === "video" ? "🎬" : "📄"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-foreground truncate">
                        {a.name}
                      </p>
                      <p className="text-[9px] text-muted uppercase tracking-wide">
                        {a.kind === "image"
                          ? "Image"
                          : a.kind === "video"
                            ? "Video"
                            : a.mimeType?.split("/")[1]?.toUpperCase() || "File"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

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
