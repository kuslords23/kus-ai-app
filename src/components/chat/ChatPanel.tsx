"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage, type ChatMessageData } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { SuggestionChips } from "./SuggestionChips";
import { streamRagResponse, type RagMessage } from "@/lib/rag/client";
import { useAuth } from "@/lib/hooks/useAuth";

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { session } = useAuth();

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
  }, [messages, scrollToBottom]);

  const sendMessage = useCallback(
    async (content: string) => {
      const userMsg: ChatMessageData = {
        id: crypto.randomUUID(),
        role: "user",
        content,
      };
      const assistantMsg: ChatMessageData = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      const ragMessages: RagMessage[] = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content },
      ];

      try {
        for await (const chunk of streamRagResponse(
          ragMessages,
          session?.access_token
        )) {
          if (chunk.type === "text" && chunk.content) {
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
    [messages, session?.access_token]
  );

  const handleChipClick = useCallback(
    (chip: { label: string; url?: string; action?: string }) => {
      if (chip.url && chip.url !== "#") {
        window.open(chip.url, "_blank");
      } else if (chip.action || chip.label) {
        sendMessage(chip.label);
      }
    },
    [sendMessage]
  );

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center min-h-full gap-5 py-6">
            <div className="w-14 h-14 rounded-full bg-gold/10 border-2 border-gold/30 flex items-center justify-center pulse-gold">
              <svg className="w-7 h-7 text-gold" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
            </div>
            <div className="text-center space-y-2 px-2">
              <h2 className="text-lg font-semibold text-foreground">
                The Royal Advisor
              </h2>
              <p className="text-sm text-muted max-w-sm mx-auto">
                Your guide to the whole kingdom. Ask about scores, clans,
                players, or anything in the realm.
              </p>
            </div>
            <SuggestionChips
              onSelect={handleChipClick}
              sportsUrl={process.env.NEXT_PUBLIC_SPORTS_COMPANION_URL}
              hubUrl={process.env.NEXT_PUBLIC_HUB_URL}
            />
          </div>
        ) : (
          messages.map((msg, i) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              isStreaming={
                isStreaming &&
                i === messages.length - 1 &&
                msg.role === "assistant"
              }
              onChipClick={handleChipClick}
            />
          ))
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-background px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <ChatInput onSend={sendMessage} disabled={isStreaming} />
      </div>
    </div>
  );
}
