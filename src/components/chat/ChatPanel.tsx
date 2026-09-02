"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatMessage, type ChatMessageData } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { SuggestionChips } from "./SuggestionChips";
import { StreamingText } from "@/components/ui/StreamingText";
import { streamRag, type RagAction } from "@/lib/rag/client";
import { getSuggestionChips, WELCOME_TEXT } from "@/lib/rag/chips";
import {
  buildUserContext,
  loadChatHistory,
  saveChatHistory,
  loadCompanionMemory,
  saveCompanionMemory,
} from "@/lib/rag/userContext";
import { useAuth } from "@/lib/hooks/useAuth";
import { loadSelection } from "@/lib/models/catalog";

function handleDeepLink(action?: RagAction) {
  if (!action) return;
  const hub = process.env.NEXT_PUBLIC_HUB_URL || "https://sport-clan-nexus.vercel.app";
  const sports =
    process.env.NEXT_PUBLIC_SPORTS_COMPANION_URL || "https://kus-sports.vercel.app";

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
  if (tab === "marketplace" || tab === "wallet" || tab === "messages" || tab === "feed") {
    window.open(hub, "_blank");
  }
}

export function ChatPanel() {
  const { user } = useAuth();
  const userContext = useMemo(() => buildUserContext(user), [user]);
  const chips = useMemo(() => getSuggestionChips(userContext), [userContext]);

  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const bootRef = useRef(false);

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

  // Hub-style welcome + restore history
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;

    const uid = user?.id ?? null;
    const history = loadChatHistory(uid);
    const welcome: ChatMessageData = {
      id: "ai_welcome",
      role: "assistant",
      content: WELCOME_TEXT,
    };

    if (history.length >= 4) {
      setMessages(
        history.map((h, i) => ({
          id: `hist_${i}_${h.at || i}`,
          role: h.role,
          content: h.content,
        }))
      );
    } else {
      const name = userContext.user?.name;
      const personalized: ChatMessageData[] = [welcome];
      if (name) {
        personalized.push({
          id: "ai_welcome_ctx",
          role: "assistant",
          content: `Hey **${name}** — good to see you. You're in the standalone Kus AI companion. What's on your mind?`,
        });
      }
      setMessages(personalized);
    }
  }, [user?.id, userContext.user?.name]);

  useEffect(() => {
    const uid = user?.id ?? null;
    if (!uid || messages.length === 0) return;
    const toStore = messages
      .filter((m) => m.id !== "ai_welcome" && m.content.trim())
      .map((m) => ({
        role: m.role,
        content: m.content,
        at: Date.now(),
      }));
    saveChatHistory(uid, toStore);
  }, [messages, user?.id]);

const sendMessage = useCallback(
    async (raw: string) => {
      const query = raw.trim();
      if (!query || isStreaming) return;

      // Check if the user has selected a non-Royal model
      const modelSel = loadSelection();
      const useCustomModel = modelSel && modelSel.model !== "kus-ai/royal" && modelSel.model !== "openrouter/auto";

      // Custom model path: route through Jyinx chat
      if (useCustomModel) {
        const userMsgC: ChatMessageData = { id: `ai_u_${Date.now()}`, role: "user", content: query };
        const replyIdC = `ai_r_${Date.now()}`;
        setMessages((prev) => [...prev, userMsgC, { id: replyIdC, role: "assistant", content: "" }]);
        setIsStreaming(true);
        setStatus(modelSel?.modelLabel || "AI");
        try {
          let assembled = "";
          const res = await fetch("/api/jyinx/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: query,
              model: modelSel?.model || "openrouter/free",
              code: "", file: "royal-chat", repository: "local", branch: "main", repositoryContext: "",
              history: messages.filter((m) => m.content && (m.role === "user" || m.role === "assistant")).slice(-16).map((m) => ({ role: m.role, content: m.content })),
            }),
          });
          if (res.ok) {
            const data = await res.json() as { content?: string; error?: string };
            assembled = data.content || data.error || "No response";
          } else { assembled = "Couldn't reach the AI — try again."; }
          setMessages((prev) => prev.map((m) => m.id === replyIdC ? { ...m, content: assembled } : m));
        } catch {
          setMessages((prev) => prev.map((m) => m.id === replyIdC ? { ...m, content: "Network error — check your connection." } : m));
        } finally { setIsStreaming(false); setStatus(""); }
        return;
      }

      // Default: route through the hub RAG brain (original flow)
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

      const userMsg: ChatMessageData = {
        id: `ai_u_${Date.now()}`,
        role: "user",
        content: query,
      };
      const replyId = `ai_r_${Date.now()}`;
      const assistantMsg: ChatMessageData = {
        id: replyId,
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);
      setStatus("Thinking…");

      const history = messages
        .filter((m) => m.content && (m.role === "user" || m.role === "assistant"))
        .filter((m) => m.id !== "ai_welcome" && m.id !== "ai_welcome_ctx")
        .slice(-16)
        .map((m) => ({ role: m.role, content: m.content }));

      const memory = user?.id ? loadCompanionMemory(user.id) : null;
      const ctx = {
        ...userContext,
        companionMemory: memory ?? undefined,
      };

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
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === replyId ? { ...m, content: assembled } : m
                )
              );
            },
          }
        );

        const finalText =
          result.answer?.trim() ||
          assembled.trim() ||
          "Kus AI hiccuped — try “help” or ask again.";

      const modeLabel = result.usedWebSearch
        ? "🔎 Web Search"
        : result.mode === "sports"
          ? "⚽ Sports Expert"
          : "🤖 Kus AI";
      setStatus(modeLabel);

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== replyId) return m;
          const cards = [];
            if (result.sportsData) {
              cards.push({
                type: "match",
                title: "Sports data",
                subtitle: "Open in Sports companion",
                url:
                  process.env.NEXT_PUBLIC_SPORTS_COMPANION_URL ||
                  "https://kus-sports.vercel.app",
                data: result.sportsData as Record<string, unknown>,
              });
            }
            const actionChips = [];
            if (result.action?.tab) {
              actionChips.push({
                label: `Open ${result.action.tab}`,
                action: "navigate",
                url:
                  result.action.tab === "leagues" ||
                  result.action.tab === "sports"
                    ? process.env.NEXT_PUBLIC_SPORTS_COMPANION_URL
                    : process.env.NEXT_PUBLIC_HUB_URL,
              });
            }
        return {
          ...m,
          content: finalText,
          sourceLabel: modeLabel,
          cards: cards.length ? cards : m.cards,
          chips: actionChips.length ? actionChips : m.chips,
        };
      })
    );

    handleDeepLink(result.action);

    if (user?.id) {
      const topics = [
            ...(memory?.recentTopics ?? []),
            query.slice(0, 48),
          ].slice(0, 12);
          saveCompanionMemory({
            userId: user.id,
            preferenceSummary: memory?.preferenceSummary || "",
            episodicSummary: memory?.episodicSummary || "",
            toneNotes:
              memory?.toneNotes ||
              "collaborative, concise, producer-aware",
            recentTopics: topics,
            updatedAt: new Date().toISOString(),
          });
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === replyId
              ? {
                  ...m,
                  content:
                    m.content ||
                    "Couldn’t reach Kus AI just now — check your connection and try again.",
                }
              : m
          )
        );
setStatus("");
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming, messages, user?.id, userContext]
  );
}
