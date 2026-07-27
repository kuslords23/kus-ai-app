"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

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
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div
      className={`flex items-end gap-2 border border-border backdrop-blur-md ${
        large ? "rounded-full px-4 py-3" : "rounded-2xl p-2.5"
      }`}
      style={{ background: "var(--composer-bg)" }}
    >
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
        disabled={disabled || !value.trim()}
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
  );
}
