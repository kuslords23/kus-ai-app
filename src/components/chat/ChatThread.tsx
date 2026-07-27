"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatMessage, type ChatMessageData } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { SuggestionChips } from "./SuggestionChips";
import { streamRag, type RagAction } from "@/lib/rag/client";
import { getSuggestionChips, WELCOME_TEXT } from "@/lib/rag/chips";
import {
  buildUserContext,
  loadCompanionMemory,
  saveCompanionMemory,
} from "@/lib/rag/userContext";
import {
  persistThreadMessage,
  titleFromMessage,
  updateThreadMessage,
} from "@/lib/threads/storage";
import type { ChatThread } from "@/lib/threads/types";
import { useAuth } from "@/lib/hooks/useAuth";
import { useVoiceOutput } from "@/lib/hooks/useVoice";
import { loadSettings } from "@/lib/settings";

function handleDeepLink(action?: RagAction) {
  if (!action) return;
  const hub =
    process.env.NEXT_PUBLIC_HUB_URL || "https://sport-clan-nexus.vercel.app";
  const sports =
    process.env.NEXT_PUBLIC_SPORTS_COMPANION_URL ||
    "https://kus-sports.vercel.app";

  if (action.url) {
    window.open(String(action.url), "_blank");
    return;
  }
  const tab = action.tab;
  if (tab === "leagues" || tab === "sports" || action.sportsSubTab) {
    const sub = action.sportsSubTab ? `?tab=${action.sportsSubTab}` : "";
    window.open(`${sports}${sub}`, "_blank");
    return;
  }
  if (
    tab === "marketplace" ||
    tab === "wallet" ||
    tab === "messages" ||
    tab === "feed"
  ) {
    window.open(hub, "_blank");
  }
}

interface ChatThreadProps {
  thread: ChatThread | null;
  onUpdate: (threadId: string, updater: (t: ChatThread) => ChatThread) => void;
  onFirstMessage?: () => void;
  voiceReplies?: boolean;
  autoFocus?: boolean;
  showWelcome?: boolean;
  bootstrapQuery?: string | null;
  onBootstrapConsumed?: () => void;
}

export function ChatThreadView({
  thread,
  onUpdate,
  onFirstMessage,
  voiceReplies,
  autoFocus,
  showWelcome = true,
  bootstrapQuery,
  onBootstrapConsumed,
}: ChatThreadProps) {
  const { user } = useAuth();
  const userContext = useMemo(() => buildUserContext(user), [user]);
  const chips = useMemo(() => getSuggestionChips(userContext), [userContext]);
  const { speak } = useVoiceOutput();

  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages: ChatMessageData[] = useMemo(() => {
    if (!thread) return [];
    if (thread.messages.length === 0 && showWelcome) {
      const welcome: ChatMessageData[] = [
        { id: "ai_welcome", role: "assistant", content: WELCOME_TEXT },
      ];
      const name = userContext.user?.name;
      if (name) {
        welcome.push({
          id: "ai_welcome_ctx",
          role: "assistant",
          content: `Hey **${name}** — good to see you. Same soul as hub AI, in your own home.`,
        });
      }
      return welcome;
    }
    return thread.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      cards: m.cards,
      chips: m.chips,
    }));
  }, [thread, showWelcome, userContext.user?.name]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isStreaming]);

  const sendMessage = useCallback(
    async (raw: string) => {
      const query = raw.trim();
      if (!query || isStreaming || !thread) return;

      if (query === "__open_sports__") {
        window.open(
          process.env.NEXT_PUBLIC_SPORTS_COMPANION_URL ||
            "https://kus-sports.vercel.app",
          "_blank"
        );
        return;
      }
      if (query === "__open_hub__") {
        window.open(
          process.env.NEXT_PUBLIC_HUB_URL ||
            "https://sport-clan-nexus.vercel.app",
          "_blank"
        );
        return;
      }

      if (thread.messages.length === 0) onFirstMessage?.();

      const userMsg = {
        id: `ai_u_${Date.now()}`,
        role: "user" as const,
        content: query,
        at: Date.now(),
      };
      const replyId = `ai_r_${Date.now()}`;

      onUpdate(thread.id, (t) => {
        const withUser = persistThreadMessage([t], t.id, userMsg)[0];
        return persistThreadMessage([withUser], withUser.id, {
          id: replyId,
          role: "assistant",
          content: "",
          at: Date.now(),
        })[0];
      });

      setIsStreaming(true);
      setStatus("Thinking…");

      const history = thread.messages
        .filter((m) => m.content)
        .slice(-16)
        .map((m) => ({ role: m.role, content: m.content }));

      const memory = user?.id ? loadCompanionMemory(user.id) : null;
      const ctx = { ...userContext, companionMemory: memory ?? undefined };

      try {
        let assembled = "";
        const result = await streamRag(
          query,
          {
            userContext: ctx,
            history: [...history, { role: "user", content: query }],
          },
          {
            onMeta: () => setStatus("Thinking…"),
            onToken: (text) => {
              assembled += text;
              onUpdate(thread.id, (t) =>
                updateThreadMessage([t], t.id, replyId, { content: assembled })[0]
              );
            },
          }
        );

        const finalText =
          result.answer?.trim() ||
          assembled.trim() ||
          "Kus AI hiccuped — try “help” or ask again.";

        const cards = result.sportsData
          ? [
              {
                type: "match",
                title: "Sports data",
                subtitle: "Open in Sports companion",
                url:
                  process.env.NEXT_PUBLIC_SPORTS_COMPANION_URL ||
                  "https://kus-sports.vercel.app",
                data: result.sportsData as Record<string, unknown>,
              },
            ]
          : undefined;

        const actionChips = result.action?.tab
          ? [
              {
                label: `Open ${result.action.tab}`,
                action: "navigate",
                url:
                  result.action.tab === "leagues" ||
                  result.action.tab === "sports"
                    ? process.env.NEXT_PUBLIC_SPORTS_COMPANION_URL
                    : process.env.NEXT_PUBLIC_HUB_URL,
              },
            ]
          : undefined;

        onUpdate(thread.id, (t) =>
          updateThreadMessage([t], t.id, replyId, {
            content: finalText,
            cards,
            chips: actionChips,
          })[0]
        );

        if (thread.title === "New chat") {
          onUpdate(thread.id, (t) => ({
            ...t,
            title: titleFromMessage(query),
          }));
        }

        setStatus(
          result.usedWebSearch
            ? "News"
            : result.mode === "sports"
              ? "Sports"
              : "Kus AI"
        );

        handleDeepLink(result.action);

        const settings = loadSettings();
        if ((voiceReplies ?? settings.voiceReplies) && finalText) {
          speak(finalText, true);
        }

        if (user?.id) {
          saveCompanionMemory({
            userId: user.id,
            preferenceSummary: memory?.preferenceSummary || "",
            episodicSummary: memory?.episodicSummary || "",
            toneNotes:
              memory?.toneNotes || "collaborative, concise, producer-aware",
            recentTopics: [
              ...(memory?.recentTopics ?? []),
              query.slice(0, 48),
            ].slice(0, 12),
            updatedAt: new Date().toISOString(),
          });
        }
      } catch {
        onUpdate(thread.id, (t) =>
          updateThreadMessage([t], t.id, replyId, {
            content:
              "Couldn’t reach Kus AI just now — check your connection and try again.",
          })[0]
        );
        setStatus("");
      } finally {
        setIsStreaming(false);
      }
    },
    [
      isStreaming,
      thread,
      onUpdate,
      onFirstMessage,
      user?.id,
      userContext,
      voiceReplies,
      speak,
    ]
  );

  const onChip = useCallback(
    (chip: { label: string; prompt?: string; url?: string }) => {
      if (chip.url) {
        window.open(chip.url, "_blank");
        return;
      }
      sendMessage(chip.prompt || chip.label);
    },
    [sendMessage]
  );

  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapQuery && !bootstrapped.current && thread) {
      bootstrapped.current = true;
      sendMessage(bootstrapQuery);
      onBootstrapConsumed?.();
    }
  }, [bootstrapQuery, thread, sendMessage, onBootstrapConsumed]);

  if (!thread) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm">
        Select or start a chat
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3"
      >
        {messages.map((msg, i) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            isStreaming={
              isStreaming &&
              i === messages.length - 1 &&
              msg.role === "assistant"
            }
            onChipClick={onChip}
            onSpeak={(text) => speak(text, true)}
          />
        ))}
      </div>

      <div className="shrink-0 px-3 pt-1 space-y-2 pb-[max(0.7rem,env(safe-area-inset-bottom))]">
        {status && <p className="text-[10px] text-muted px-1">{status}</p>}
        <SuggestionChips chips={chips} onSelect={onChip} />
        <ChatInput
          onSend={sendMessage}
          disabled={isStreaming}
          autoFocus={autoFocus}
          placeholder="Ask anything about sports, wallet, music, leagues…"
        />
      </div>
    </div>
  );
}
