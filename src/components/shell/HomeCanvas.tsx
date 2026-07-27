"use client";

import { motion } from "framer-motion";
import { ChatInput } from "@/components/chat/ChatInput";
import { SuggestionChips } from "@/components/chat/SuggestionChips";
import { getSuggestionChips } from "@/lib/rag/chips";
import { buildUserContext } from "@/lib/rag/userContext";
import { useAuth } from "@/lib/hooks/useAuth";
import { useMemo } from "react";
import type { AppSettings } from "@/lib/settings";

interface HomeCanvasProps {
  onSend: (text: string) => void;
  onSpeak: () => void;
  listening?: boolean;
  voiceSupported?: boolean;
  settings: AppSettings;
  disabled?: boolean;
}

export function HomeCanvas({
  onSend,
  onSpeak,
  listening,
  voiceSupported,
  settings,
  disabled,
}: HomeCanvasProps) {
  const { user } = useAuth();
  const userContext = useMemo(() => buildUserContext(user), [user]);
  const chips = useMemo(() => getSuggestionChips(userContext), [userContext]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-6">
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-20 h-20 rounded-3xl bg-gradient-to-br from-gold/25 to-purple/30 border border-gold/35 flex items-center justify-center pulse-gold"
        >
          <span className="text-3xl font-bold text-gold">K</span>
        </motion.div>

        <div className="text-center space-y-2 max-w-sm">
          <h1 className="text-xl font-semibold">Kus AI</h1>
          <p className="text-sm text-muted">
            Royal advisor for the whole kingdom — same soul as hub, Grok-style home.
          </p>
        </div>

        <div className="flex gap-2">
          <span className="px-3 py-1 rounded-full text-[11px] border border-gold/35 bg-gold/10 text-gold capitalize">
            {settings.mode}
          </span>
          {settings.voiceModeDefault && (
            <span className="px-3 py-1 rounded-full text-[11px] border border-purple/40 bg-purple/10 text-purple-soft">
              Voice
            </span>
          )}
        </div>

        <SuggestionChips
          chips={chips.slice(0, 6)}
          onSelect={(c) => onSend(c.prompt || c.label)}
        />
      </div>

      <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
        {voiceSupported && (
          <div className="flex justify-center">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onSpeak}
              className={`px-6 py-2.5 rounded-full text-sm font-medium border ${
                listening
                  ? "bg-danger/20 border-danger/40 text-danger"
                  : "bg-foreground text-background border-foreground"
              }`}
            >
              {listening ? "Listening…" : "Speak"}
            </motion.button>
          </div>
        )}

        <ChatInput
          large
          onSend={onSend}
          disabled={disabled}
          placeholder="Ask anything…"
          voiceSupported={voiceSupported}
          listening={listening}
          onToggleListen={onSpeak}
        />
      </div>
    </div>
  );
}
