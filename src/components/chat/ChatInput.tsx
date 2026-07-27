"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  voiceSupported?: boolean;
  listening?: boolean;
  onToggleListen?: () => void;
  transcript?: string;
}

export function ChatInput({
  onSend,
  disabled,
  placeholder,
  voiceSupported,
  listening,
  onToggleListen,
  transcript,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (transcript) setValue(transcript);
  }, [transcript]);

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
    <div className="glass border border-border rounded-[1.35rem] p-2 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      <div className="flex items-end gap-1.5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-9 h-9 rounded-xl text-muted hover:text-gold hover:bg-gold/10 flex items-center justify-center shrink-0 transition-colors"
          aria-label="Attach"
          title="Attach screenshot or card"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={() =>
            toast.message("Attachment ready", {
              description: "Image attach will sync with hub upload soon. For now, describe what you need.",
            })
          }
        />

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
          placeholder={
            placeholder ??
            "Ask anything about the app, sports, music, or leagues…"
          }
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent text-foreground text-sm placeholder:text-muted/80 resize-none outline-none min-h-[36px] py-2 max-h-[120px]"
        />

        {voiceSupported && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            type="button"
            onClick={onToggleListen}
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              listening
                ? "bg-danger/20 text-danger pulse-gold"
                : "text-muted hover:text-gold hover:bg-gold/10"
            }`}
            aria-label={listening ? "Stop listening" : "Voice input"}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill={listening ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
            </svg>
          </motion.button>
        )}

        <motion.button
          whileTap={{ scale: 0.9 }}
          type="button"
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="w-9 h-9 rounded-xl bg-gold text-background flex items-center justify-center shrink-0 disabled:opacity-30 transition-opacity shadow-[0_0_16px_rgba(212,168,67,0.35)]"
          aria-label="Send"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </motion.button>
      </div>
      {listening && (
        <p className="px-2 pt-1 text-[10px] text-gold/80">Listening… speak now</p>
      )}
    </div>
  );
}
