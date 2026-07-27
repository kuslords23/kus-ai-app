"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    <div className="flex items-end gap-2 p-3 bg-surface border border-border rounded-2xl">
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
        placeholder={placeholder ?? "Ask the Royal Advisor..."}
        disabled={disabled}
        rows={1}
        className="flex-1 bg-transparent text-foreground text-sm placeholder:text-muted resize-none outline-none min-h-[20px]"
      />
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        className="w-9 h-9 rounded-xl bg-gold text-background flex items-center justify-center shrink-0 disabled:opacity-30 transition-opacity"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </motion.button>
    </div>
  );
}
