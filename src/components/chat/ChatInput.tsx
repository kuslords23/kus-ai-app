"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { ChatAttachment } from "@/lib/attachments/types";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
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
}

export function ChatInput({
  onSend,
  disabled,
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
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (transcript) setValue(transcript);
  }, [transcript]);

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
  };

  return (
    <div className="space-y-1.5">
      {activeAgent && onAgentClick && (
        <button
          type="button"
          onClick={onAgentClick}
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] border border-border bg-surface/60 hover:border-gold/40"
        >
          <span>{activeAgent.icon}</span>
          <span>{activeAgent.name}</span>
          <span className="text-muted">▾</span>
        </button>
      )}

      {attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-1">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="relative shrink-0 w-14 h-14 rounded-xl border border-border overflow-hidden bg-surface"
            >
              {a.previewUrl && a.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.previewUrl}
                  alt={a.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-lg">
                  {a.kind === "video" ? "🎬" : "📄"}
                </div>
              )}
              {onRemoveAttachment && (
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(a.id)}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-background border border-border text-[10px]"
                  aria-label="Remove"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div
        className={`flex items-end gap-2 border border-border backdrop-blur-md ${
          large ? "rounded-full px-3 py-2.5" : "rounded-2xl p-2"
        }`}
        style={{ background: "var(--composer-bg)" }}
      >
        {onOpenAttachMenu && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            type="button"
            onClick={onOpenAttachMenu}
            className="w-9 h-9 rounded-full border border-border flex items-center justify-center shrink-0 text-muted hover:text-gold hover:border-gold/40"
            aria-label="Add files or connectors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
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
          className="flex-1 bg-transparent text-foreground text-sm placeholder:text-muted resize-none outline-none min-h-[36px] py-1.5"
        />

        {voiceSupported && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            type="button"
            onClick={onToggleListen}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
              listening
                ? "bg-danger/20 text-danger pulse-gold"
                : "text-muted hover:text-gold hover:bg-gold/10"
            }`}
            aria-label="Voice input"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill={listening ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
            </svg>
          </motion.button>
        )}

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handleSubmit}
          disabled={disabled || (!value.trim() && attachments.length === 0)}
          className="w-9 h-9 rounded-full bg-gold text-background flex items-center justify-center shrink-0 disabled:opacity-30"
          aria-label="Send"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </motion.button>
      </div>
    </div>
  );
}
