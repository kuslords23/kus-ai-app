"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { ChatMessage, type ChatMessageData } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { SuggestionChips } from "./SuggestionChips";
import { TypingIndicator } from "./TypingIndicator";
import { streamRagResponse, type RagMessage } from "@/lib/rag/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { useVoiceInput, useVoiceOutput } from "@/lib/hooks/useVoice";
import { COMPANION_PERSONA } from "@/lib/companion/persona";

const HISTORY_KEY = "kus-ai-chat-history";

export function ChatPanel({
  showHistory,
  showSettings,
  onClosePanels,
  voiceEnabled,
  setVoiceEnabled,
}: {
  showHistory?: boolean;
  showSettings?: boolean;
  onClosePanels?: () => void;
  voiceEnabled: boolean;
  setVoiceEnabled: (v: boolean) => void;
}) {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { session } = useAuth();
  const voiceIn = useVoiceInput();
  const { speak, setEnabled: setVoiceOutEnabled } = useVoiceOutput();

  useEffect(() => {
    setVoiceOutEnabled(voiceEnabled);
  }, [voiceEnabled, setVoiceOutEnabled]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessageData[];
        if (Array.isArray(parsed) && parsed.length) setMessages(parsed.slice(-40));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      // ignore
    }
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, scrollToBottom]);

  const sendMessage = useCallback(
    async (content: string) => {
      const userMsg: ChatMessageData = {
        id: crypto.randomUUID(),
        role: "user",
        content,
      };
      const assistantId = crypto.randomUUID();
      const assistantMsg: ChatMessageData = {
        id: assistantId,
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      const ragMessages: RagMessage[] = [
        {
          role: "user",
          content: `[Companion persona]\n${COMPANION_PERSONA.systemHint}\n\n[User question]\n${content}`,
        },
      ];

      // Keep recent conversation context for the hub RAG
      const history = messages.slice(-8).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        let full = "";
        for await (const chunk of streamRagResponse(
          [...history, ...ragMessages],
          session?.access_token,
          {
            companion: "kus-ai",
            persona: COMPANION_PERSONA.name,
            source: "hub+internet",
          }
        )) {
          if (chunk.type === "text" && chunk.content) {
            full += chunk.content;
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = {
                ...last,
                content: last.content + chunk.content,
              };
              return updated;
            });
          } else if (chunk.type === "card" && chunk.data) {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = {
                ...last,
                cards: [
                  ...(last.cards ?? []),
                  chunk.data as NonNullable<ChatMessageData["cards"]>[0],
                ],
              };
              return updated;
            });
          } else if (chunk.type === "chip" && chunk.data) {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = {
                ...last,
                chips: [
                  ...(last.chips ?? []),
                  chunk.data as NonNullable<ChatMessageData["chips"]>[0],
                ],
              };
              return updated;
            });
          } else if (chunk.type === "error") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = {
                ...last,
                content: chunk.content ?? "Something went wrong. Try again.",
              };
              return updated;
            });
          }
        }

        if (voiceEnabled && full.trim()) {
          speak(full.trim());
        }
      } catch {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = {
            ...last,
            content: last.content || "Connection error. Please try again.",
          };
          return updated;
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [messages, session?.access_token, voiceEnabled, speak]
  );

  const handleChipClick = useCallback(
    (chip: { label: string; url?: string; action?: string }) => {
      if (chip.url && chip.url !== "#") {
        window.open(chip.url, "_blank");
      } else {
        sendMessage(chip.label);
      }
    },
    [sendMessage]
  );

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem(HISTORY_KEY);
    toast.success("Chat history cleared");
    onClosePanels?.();
  };

  const isEmpty = messages.length === 0;
  const showTyping =
    isStreaming &&
    messages.length > 0 &&
    messages[messages.length - 1]?.role === "assistant" &&
    !messages[messages.length - 1]?.content;

  return (
    <div className="relative flex flex-col h-full min-h-0">
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3"
      >
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center min-h-full gap-5 py-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gold/25 to-purple/30 border border-gold/30 flex items-center justify-center pulse-gold"
            >
              <span className="text-2xl">👑</span>
            </motion.div>
            <div className="text-center space-y-1.5 px-3">
              <h2 className="text-lg font-semibold text-foreground">
                {COMPANION_PERSONA.name}
              </h2>
              <p className="text-sm text-muted max-w-sm mx-auto">
                Your royal companion for the whole kingdom — sports, hub, music,
                leagues. Powered by hub knowledge + the internet.
              </p>
            </div>
            <SuggestionChips
              onSelect={handleChipClick}
              sportsUrl={process.env.NEXT_PUBLIC_SPORTS_COMPANION_URL}
              hubUrl={process.env.NEXT_PUBLIC_HUB_URL}
            />
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                isStreaming={
                  isStreaming &&
                  i === messages.length - 1 &&
                  msg.role === "assistant"
                }
                onChipClick={handleChipClick}
                onSpeak={speak}
              />
            ))}
            {showTyping && <TypingIndicator />}
          </>
        )}
      </div>

      <div className="shrink-0 px-3 pt-1.5 pb-[max(0.7rem,env(safe-area-inset-bottom))] space-y-2">
        {!isEmpty && (
          <SuggestionChips
            compact
            onSelect={handleChipClick}
            sportsUrl={process.env.NEXT_PUBLIC_SPORTS_COMPANION_URL}
            hubUrl={process.env.NEXT_PUBLIC_HUB_URL}
          />
        )}
        <ChatInput
          onSend={sendMessage}
          disabled={isStreaming}
          placeholder={COMPANION_PERSONA.tagline}
          voiceSupported={voiceIn.supported}
          listening={voiceIn.listening}
          onToggleListen={voiceIn.toggle}
          transcript={voiceIn.transcript}
        />
      </div>

      <AnimatePresence>
        {(showHistory || showSettings) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 bg-black/50"
            onClick={onClosePanels}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-0 left-0 right-0 glass border-t border-border rounded-t-3xl p-5 max-h-[70%] overflow-y-auto"
            >
              {showHistory && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gold">Chat history</h3>
                  <p className="text-xs text-muted">
                    Last {messages.length} messages saved on this device.
                  </p>
                  <button
                    onClick={clearHistory}
                    className="w-full py-2.5 rounded-xl border border-danger/40 text-danger text-sm"
                  >
                    Clear history
                  </button>
                </div>
              )}
              {showSettings && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gold">Settings</h3>
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>Voice replies (speak answers)</span>
                    <input
                      type="checkbox"
                      checked={voiceEnabled}
                      onChange={(e) => setVoiceEnabled(e.target.checked)}
                      className="accent-[var(--gold)] w-4 h-4"
                    />
                  </label>
                  <p className="text-xs text-muted leading-relaxed">
                    Answers come from the hub RAG brain + internet context. Sign-in
                    stays in this app. Sports/Hub open as deep links when needed.
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
