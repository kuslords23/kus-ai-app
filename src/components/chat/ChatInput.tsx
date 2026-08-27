"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { ChatAttachment } from "@/lib/attachments/types";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  voiceSupported?: boolean;
  listening?: boolean;
  onToggleListen?: () => void;
  transcript?: string;
  large?: boolean;
  attachments?: ChatAttachment[];
  onRemoveAttachment?: (id: string) => void;
  onOpenAttachMenu?: () => void;
  activeAgent?: { icon: string; name: string };
  onAgentClick?: () => void;
  onFocus?: () => void;
  /** Hide agent chip row (e.g. agent shown in header) */
  hideAgentChip?: boolean;
  /** Programmatically load a draft into the composer (e.g. edit a message). */
  externalValue?: string;
  /** Bump this to re-apply `externalValue` when it hasn't changed. */
  externalValueBump?: number;
  onExternalValueCleared?: () => void;
}

export function ChatInput({
  onSend,
  disabled,
  isStreaming,
  onStop,
  placeholder,
  autoFocus,
  voiceSupported,
  listening,
  onToggleListen,
  transcript,
  large,
  attachments = [],
  onRemoveAttachment,
  onOpenAttachMenu,
  activeAgent,
  onAgentClick,
  onFocus,
  hideAgentChip,
  externalValue,
  externalValueBump,
  onExternalValueCleared,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (transcript) setValue(transcript);
  }, [transcript]);

  // Load an external draft (edit flow) and focus, then let the caller clear it.
  useEffect(() => {
    if (externalValue === undefined) return;
    setValue(externalValue);
    textareaRef.current?.focus();
    const raf = requestAnimationFrame(() =>
      textareaRef.current?.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      )
    );
    return () => cancelAnimationFrame(raf);
  }, [externalValue, externalValueBump]);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [value]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || disabled) return;
    onSend(trimmed || "See attached files");
    setValue("");
    onExternalValueCleared?.();
  };

  return (
    <div className="space-y-1.5">
      {!hideAgentChip && activeAgent && onAgentClick && (
        <button
          type="button"
          onClick={onAgentClick}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border border-border/80 bg-surface/50 hover:border-gold/40"
        >
          <span>{activeAgent.icon}</span>
          <span>{activeAgent.name}</span>
          <span className="text-muted">▾</span>
        </button>
      )}

      {attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="relative shrink-0 w-12 h-12 rounded-xl border border-border overflow-hidden bg-surface"
            >
              {a.previewUrl && a.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.previewUrl}
                  alt={a.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-base">
                  {a.kind === "video" ? "🎬" : "📄"}
                </div>
              )}
              {onRemoveAttachment && (
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(a.id)}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-background border border-border text-[9px]"
                  aria-label="Remove"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ChatGPT-style floating pill */}
      <div
        className={`flex items-center gap-1.5 border border-border/80 shadow-sm ${
          large ? "rounded-[1.75rem] px-2 py-1.5" : "rounded-2xl px-2 py-1.5"
        }`}
        style={{ background: "var(--composer-bg)" }}
      >
        {onOpenAttachMenu && (
          <motion.button
            whileTap={{ scale: 0.92 }}
            type="button"
            onClick={onOpenAttachMenu}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-muted hover:text-foreground"
            aria-label="Add"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </motion.button>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={placeholder ?? "Ask anything…"}
          disabled={disabled}
          rows={1}
          onFocus={onFocus}
          className="flex-1 bg-transparent text-foreground text-[15px] placeholder:text-muted resize-none outline-none min-h-[36px] max-h-[120px] py-2 leading-snug"
        />

        {voiceSupported && (
          <motion.button
            whileTap={{ scale: 0.92 }}
            type="button"
            onClick={onToggleListen}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
              listening ? "text-danger" : "text-muted hover:text-foreground"
            }`}
            aria-label="Voice"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill={listening ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2" />
            </svg>
          </motion.button>
        )}

        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={isStreaming && onStop ? onStop : handleSubmit}
          disabled={!isStreaming && (disabled || (!value.trim() && attachments.length === 0))}
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 disabled:opacity-25 ${
            isStreaming
              ? "bg-danger/90 text-white"
              : "bg-gold text-background"
          }`}
          aria-label={isStreaming ? "Stop" : "Send"}
        >
          {isStreaming ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          ) : (
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          )}
        </motion.button>
      </div>
    </div>
  );
}
