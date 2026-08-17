"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChatMessage, type ChatMessageData } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { useAuth } from "@/lib/hooks/useAuth";
import { ROYAL_SYSTEM_PROMPT } from "@/lib/persona/royal";
import {
  appendRoyalGeminiSample,
  emitRoyalGeminiSampleToTrainingPlane,
  exportRoyalGeminiJsonl,
} from "@/lib/kusai/royalGeminiTelemetry";

export const ROYAL_GEMINI_MODEL = "google/gemini-2.5-pro";
export const ROYAL_GEMINI_DEFAULT = "google/gemini-2.5-flash";

type RoyalTurn = {
  role: "user" | "assistant";
  content: string;
};

type Parity = Record<string, { helpful?: boolean; notHelpful?: boolean }>;

interface KusAiRoyalChatProps {
  /** Distinct route that binds Gemini to the Royal chat only. */
  endpoint?: string;
  model?: string;
  /** When true, each Gemini exchange is written to the training pipe. */
  trainingEnabled?: boolean;
  onTrainingToggle?: (enabled: boolean) => void;
}

/**
 * Kus-AI-Royal chat surface.
 *
 * Gemini is bound strictly to this interface layer. The chat posts to the
 * isolated `/api/kusai/royal-gemini` route and, when training is enabled,
 * pipes every prompt + Gemini response into the training-data pipeline
 * (Training Plane `learning_events` + local JSONL distill). The Jyinx IDE
 * and background builder are intentionally untouched by this component.
 */
export function KusAiRoyalChat({
  endpoint = "/api/kusai/royal-gemini",
  model = ROYAL_GEMINI_DEFAULT,
  trainingEnabled = false,
  onTrainingToggle,
}: KusAiRoyalChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [training, setTraining] = useState(trainingEnabled);
  const [feedback, setFeedback] = useState<Parity>({});
  const [modelLabel, setModelLabel] = useState(model);
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<RoyalTurn[]>([]);
  const bootedRef = useRef(false);

  const toggleTraining = useCallback(() => {
    setTraining((prev) => {
      const next = !prev;
      onTrainingToggle?.(next);
      return next;
    });
  }, [onTrainingToggle]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isStreaming]);

  // Welcome message so the surface is never empty.
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    const name = user?.user_metadata?.name || user?.email || "";
    setMessages([
      {
        id: "royal_welcome",
        role: "assistant",
        content: `**Royal** here — powered by **Gemini** for this conversation.\n\nAsk anything and your exchanges can be added to my local training pipeline so you can fine-tune a custom model. Toggle **Training data** in the header to capture prompts + responses.`,
      },
    ]);
    if (name) {
      setMessages((prev) => [
        ...prev,
        {
          id: "royal_welcome_ctx",
          role: "assistant",
          content: `Glad to see you, **${name}**. What are we working on?`,
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_metadata?.name, user?.email]);

  const sendMessage = useCallback(
    async (raw: string) => {
      const query = raw.trim();
      if (!query || isStreaming) return;

      const userMsg: ChatMessageData = {
        id: `royal_u_${Date.now()}`,
        role: "user",
        content: query,
      };
      const replyId = `royal_r_${Date.now()}`;
      setMessages((prev) => [...prev, userMsg]);
      setMessages((prev) => [
        ...prev,
        { id: replyId, role: "assistant", content: "" },
      ]);
      setIsStreaming(true);
      setError("");

      try {
        const history = historyRef.current;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: query,
            model,
            system: ROYAL_SYSTEM_PROMPT,
            history: history.slice(-8),
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          content?: string;
          model?: string;
          error?: string;
        } | null;

        if (!res.ok || !data?.content) {
          throw new Error(data?.error || "Gemini could not reply.");
        }

        const answer = data.content.trim();
        if (data.model) setModelLabel(data.model);

        setMessages((prev) =>
          prev.map((m) => (m.id === replyId ? { ...m, content: answer } : m))
        );

        historyRef.current = [
          ...history,
          { role: "user" as const, content: query },
        ].slice(-40);
        historyRef.current = [
          ...historyRef.current,
          { role: "assistant" as const, content: answer },
        ].slice(-40);

        if (training) {
          appendRoyalGeminiSample({
            instruction: query,
            system: ROYAL_SYSTEM_PROMPT.slice(0, 1200),
            model: data.model || model,
            output: answer,
          });
          emitRoyalGeminiSampleToTrainingPlane({
            instruction: query,
            system: ROYAL_SYSTEM_PROMPT.slice(0, 1200),
            model: data.model || model,
            output: answer,
            sessionId: user?.id,
          });
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Request failed";
        setError(message);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === replyId
              ? {
                  ...m,
                  content:
                    "Gemini couldn't reply just now — check your connection and try again.",
                }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [endpoint, isStreaming, model, training, user?.id]
  );

  const handleFeedback = useCallback(
    (messageId: string, type: "helpful" | "not_helpful") => {
      setFeedback((prev) => ({
        ...prev,
        [messageId]: {
          ...prev[messageId],
          ...(type === "helpful" ? { helpful: true } : { notHelpful: true }),
        },
      }));
    },
    []
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold/25 to-purple/30 border border-gold/35 flex items-center justify-center text-sm">
          👑
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-none">Royal · Gemini</p>
          <p className="text-[10px] text-muted truncate">{modelLabel}</p>
        </div>

        <button
          type="button"
          onClick={toggleTraining}
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] border transition-colors ${
            training
              ? "border-gold/50 bg-gold/15 text-gold"
              : "border-border text-muted hover:text-foreground"
          }`}
          aria-pressed={training}
          title="Capture prompts + responses for the training pipeline"
        >
          {training ? "● Training data: on" : "○ Training data: off"}
        </button>

        {training && (
          <button
            type="button"
            onClick={() => {
              exportRoyalGeminiJsonl();
              setSyncing(true);
              setTimeout(() => setSyncing(false), 600);
            }}
            disabled={syncing}
            className="shrink-0 rounded-full px-2.5 py-1 text-[10px] border border-border text-muted hover:text-gold transition-colors"
            title="Export captured exchanges as JSONL for fine-tuning"
          >
            {syncing ? "…" : "Export JSONL"}
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3"
      >
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            isStreaming={isStreaming && msg.id === messages[messages.length - 1]?.id}
            showFeedback={training}
            onFeedback={(type) => handleFeedback(msg.id, type)}
            onSpeak={(text) => {
              // no-op voice binding; kept for parity with shared bubble
            }}
          />
        ))}
        {error && (
          <p className="text-[11px] text-danger px-1 pt-1">{error}</p>
        )}
      </div>

      <div className="shrink-0 px-3 pt-1 pb-2 space-y-1.5">
        <ChatInput
          onSend={sendMessage}
          disabled={isStreaming}
          isStreaming={isStreaming}
          placeholder="Message Royal (Gemini)…"
        />
        <p className="px-1 text-[10px] text-muted">
          Gemini model is bound to this Royal chat only. Jyinx IDE and the
          builder are not affected.
        </p>
      </div>
    </div>
  );
}

export default KusAiRoyalChat;