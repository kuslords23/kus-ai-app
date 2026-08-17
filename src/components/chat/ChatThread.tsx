"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatMessage, type ChatMessageData } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { SuggestionChips } from "./SuggestionChips";
import { AttachmentMenu } from "@/components/attachments/AttachmentMenu";
import { AgentPicker } from "@/components/agents/AgentPicker";
import { ActionConfirmModal } from "@/components/actions/ActionConfirmModal";
import { ComposerDock } from "@/components/shell/ComposerDock";
import { streamRag, type RagAction } from "@/lib/rag/client";
import { getSuggestionChips, WELCOME_TEXT } from "@/lib/rag/chips";
import { enrichQueryWithAttachments, sourceTypeFromAttachments } from "@/lib/rag/attachments";
import { buildEnrichedCards, dataSourceLabel } from "@/lib/rag/enrichment";
import {
  buildFullRagContext,
  saveCompanionMemory,
} from "@/lib/rag/userContext";
import {
  persistThreadMessage,
  titleFromMessage,
  updateThreadMessage,
} from "@/lib/threads/storage";
import { persistMessageToCloud } from "@/lib/threads/sync";
import type { ChatThread } from "@/lib/threads/types";
import { useAuth } from "@/lib/hooks/useAuth";
import { useVoiceOutput } from "@/lib/hooks/useVoice";
import { loadSettings } from "@/lib/settings";
import {
  getAgent,
  resolveAgentForRag,
} from "@/lib/agents/registry";
import type { ChatAttachment } from "@/lib/attachments/types";
import { attachmentsForRag } from "@/lib/attachments/types";
import {
  applyMemoryDecay,
  addDecision,
  findRegretWarning,
  inferEmotionalMood,
  loadRoyalMemory,
  recordEmotionalSnapshot,
  saveRoyalMemory,
} from "@/lib/memory/royalMemory";
import { shouldSpeakInSilentMode } from "@/lib/briefings/daily";
import {
  buildPendingAction,
  classifyAction,
  describeAction,
  executeAction,
  logAction,
  type PendingAction,
} from "@/lib/actions/executor";
import { notifyError } from "@/lib/errors/notify";
import { openCompanionUrl, openHub } from "@/lib/auth/hubBridge";
import { MAX_TOTAL_ATTACHMENT_BYTES } from "@/lib/attachments/limits";
import {
  emitCorrection,
  emitHelpful,
  emitRagError,
  emitRetrievalMiss,
} from "@/lib/learning/emit";
import { isLikelyRetrievalMiss } from "@/lib/learning/retrievalMiss";
import {
  fetchKingdomKnowledge,
  looksLikeHubMetaJunk,
} from "@/lib/kingdom/client";
import {
  appendRoyalGeminiSample,
  emitRoyalGeminiSampleToTrainingPlane,
} from "@/lib/kusai/royalGeminiTelemetry";
import { ROYAL_SYSTEM_PROMPT } from "@/lib/persona/royal";

type RoyalModel = "royal" | "gemini";

const ROYAL_GEMINI_MODELS = [
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
];

interface ChatThreadProps {
  thread: ChatThread | null;
  onUpdate: (threadId: string, updater: (t: ChatThread) => ChatThread) => void;
  onFirstMessage?: () => void;
  voiceReplies?: boolean;
  autoFocus?: boolean;
  showWelcome?: boolean;
  bootstrapQuery?: string | null;
  bootstrapAttachments?: ChatAttachment[] | null;
  onBootstrapConsumed?: () => void;
  activeAgentId: string;
  onAgentChange: (id: string) => void;
  settings: import("@/lib/settings").AppSettings;
}

export function ChatThreadView({
  thread,
  onUpdate,
  onFirstMessage,
  voiceReplies,
  autoFocus,
  showWelcome = true,
  bootstrapQuery,
  bootstrapAttachments,
  onBootstrapConsumed,
  activeAgentId,
  onAgentChange,
  settings,
}: ChatThreadProps) {
  const { user, session } = useAuth();
  const userContext = useMemo(
    () =>
      buildFullRagContext({
        user,
        settings,
        agent: resolveAgentForRag(activeAgentId),
      }),
    [user, settings, activeAgentId]
  );
  const chips = useMemo(() => getSuggestionChips(userContext), [userContext]);
  const { speak } = useVoiceOutput();
  const agent = getAgent(activeAgentId);
  const ragAgent = resolveAgentForRag(activeAgentId);

  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [messageFeedback, setMessageFeedback] = useState<
    Record<string, "helpful" | "not_helpful">
  >({});
  const [model, setModel] = useState<RoyalModel>("royal");
  const [geminiModelId, setGeminiModelId] = useState<string>(
    ROYAL_GEMINI_MODELS[0].id
  );
  const [geminiModelOpen, setGeminiModelOpen] = useState(false);
  const geminiHistoryRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);

  const messages: ChatMessageData[] = useMemo(() => {
    if (!thread) return [];
    if (thread.messages.length === 0 && showWelcome) {
      const name = userContext.user?.name;
      const greeting = name
        ? `Hey **${name}** — I'm **Royal**, your Kus-lords companion.`
        : WELCOME_TEXT;
      return [
        {
          id: "ai_welcome",
          role: "assistant",
          content: `${greeting} Ask anything, attach files, or switch agents with the **+** menu.`,
        },
      ];
    }
    return thread.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      cards: m.cards,
      chips: m.chips,
      sourceLabel: m.sourceLabel,
      feedback: messageFeedback[m.id],
    }));
  }, [thread, showWelcome, userContext.user?.name, messageFeedback]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isStreaming]);

  const handleAction = useCallback(
    (action?: RagAction, actionTaken?: boolean) => {
      if (!action || !actionTaken) return;
      const summary = describeAction(action);
      const royal = user?.id ? loadRoyalMemory(user.id) : null;
      const regret = royal ? findRegretWarning(royal, summary) : null;
      const risk = classifyAction(action);

      if (risk === "low" && !regret) {
        executeAction(action);
        logAction(user?.id, `Opened ${action.tab || action.url || "companion"}`);
        return;
      }
      setPendingAction(
        buildPendingAction(
          action,
          regret ? `Similar to a past regret: "${regret.pattern}"` : undefined
        )
      );
    },
    [user?.id]
  );

  const sendMessage = useCallback(
    async (raw: string, overrideAttachments?: ChatAttachment[]) => {
      const query = raw.trim();
      const outgoing = overrideAttachments ?? attachments;
      const hasAttachments = outgoing.length > 0;
      if ((!query && !hasAttachments) || isStreaming || !thread) return;

      if (query === "__open_sports__") {
        openCompanionUrl(
          process.env.NEXT_PUBLIC_SPORTS_COMPANION_URL ||
            "https://kus-sports.vercel.app"
        );
        return;
      }
      if (query === "__open_hub__") {
        openHub();
        return;
      }

      const totalSize = outgoing.reduce((s, a) => s + a.size, 0);
      if (totalSize > MAX_TOTAL_ATTACHMENT_BYTES) {
        notifyError("Attachments too large", "Max 20 MB total per message.");
        return;
      }

      if (thread.messages.length === 0) onFirstMessage?.();

      const sentAttachments = [...outgoing];
      const displayQuery =
        query || `Shared ${sentAttachments.length} file${sentAttachments.length > 1 ? "s" : ""}`;
      const ragQuery = enrichQueryWithAttachments(displayQuery, sentAttachments);
      if (!overrideAttachments) setAttachments([]);

      const userMsg = {
        id: `ai_u_${Date.now()}`,
        role: "user" as const,
        content: displayQuery,
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

      if (user?.id) {
        void persistMessageToCloud(user.id, thread.id, "user", displayQuery);
      }

      setIsStreaming(true);
      setStatus(`${model === "gemini" ? "Gemini" : agent.name} thinking…`);
      stoppedRef.current = false;
      abortRef.current = new AbortController();

      if (model === "gemini") {
        const geminiAbort = abortRef.current;
        try {
          const geminiRes = await fetch("/api/kusai/royal-gemini", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: displayQuery,
              model: geminiModelId,
              system: ROYAL_SYSTEM_PROMPT,
              history: geminiHistoryRef.current.slice(-8),
            }),
            signal: geminiAbort.signal,
          });
          const geminiData = (await geminiRes.json().catch(() => null)) as {
            content?: string;
            model?: string;
            error?: string;
          } | null;

          if (!geminiRes.ok || !geminiData?.content) {
            if (!stoppedRef.current) {
              notifyError("Gemini couldn't respond", geminiData?.error || "Request failed");
            }
          } else {
            const geminiText = geminiData.content.trim();
            geminiHistoryRef.current = [
              ...geminiHistoryRef.current,
              { role: "user" as const, content: displayQuery },
              { role: "assistant" as const, content: geminiText },
            ].slice(-40);

            onUpdate(thread.id, (t) =>
              updateThreadMessage([t], t.id, replyId, {
                content: geminiText,
                sourceLabel: `${geminiData.model || geminiModelId} · Royal`,
              })[0]
            );

            if (user?.id) {
              void persistMessageToCloud(
                user.id,
                thread.id,
                "assistant",
                geminiText,
                [geminiData.model || geminiModelId]
              );
            }

            if (thread.title === "New chat") {
              onUpdate(thread.id, (t) => ({
                ...t,
                title: titleFromMessage(displayQuery),
              }));
            }

            const contribute = loadSettings().contributeToLearning;
            if (contribute) {
              appendRoyalGeminiSample({
                instruction: displayQuery,
                system: ROYAL_SYSTEM_PROMPT.slice(0, 1200),
                model: geminiData.model || geminiModelId,
                output: geminiText,
              });
              emitRoyalGeminiSampleToTrainingPlane({
                instruction: displayQuery,
                system: ROYAL_SYSTEM_PROMPT.slice(0, 1200),
                model: geminiData.model || geminiModelId,
                output: geminiText,
                sessionId: thread.id,
              });
            }
          }
        } catch (cause) {
          if (!stoppedRef.current) {
            notifyError(
              "Couldn't reach Gemini",
              cause instanceof Error ? cause.message : "Request failed"
            );
            onUpdate(thread.id, (t) =>
              updateThreadMessage([t], t.id, replyId, {
                content:
                  "Gemini couldn't reply just now — check your connection and try again.",
              })[0]
            );
          }
        } finally {
          if (stoppedRef.current && !geminiAbort.signal.aborted) {
            setStatus("Stopped");
          } else if (!stoppedRef.current) {
            setStatus(model === "gemini" ? "Gemini" : agent.name);
          }
          setIsStreaming(false);
          abortRef.current = null;
        }
        return;
      }

      const history = thread.messages
        .filter((m) => m.content)
        .slice(-16)
        .map((m) => ({ role: m.role, content: m.content }));

      const appSettings = loadSettings();
      let royal = user?.id ? loadRoyalMemory(user.id) : null;
      if (royal && user?.id) {
        royal = applyMemoryDecay(royal, appSettings.memoryDecay);
        royal = recordEmotionalSnapshot(
          royal,
          inferEmotionalMood(displayQuery)
        );
      }

      const kingdom = await fetchKingdomKnowledge(displayQuery);
      if (kingdom.hitCount > 0) {
        setStatus(
          `Kingdom Knowledge · ${kingdom.departments.slice(0, 3).join(", ")}`
        );
      }

      const ctx = buildFullRagContext({
        user,
        settings: appSettings,
        agent: ragAgent,
        royalMemory: royal,
        hasAttachments: sentAttachments.length > 0,
        attachmentKinds: sentAttachments.map((a) => a.kind),
        kingdomKnowledge: kingdom.context || undefined,
        departments: kingdom.departments,
      });

      const attachmentSourceType = sourceTypeFromAttachments(sentAttachments);

      try {
        let assembled = "";
        const result = await streamRag(
          ragQuery,
          {
            userContext: ctx,
            history: [...history, { role: "user", content: displayQuery }],
            attachments: attachmentsForRag(sentAttachments),
            agentId: activeAgentId,
            sourceType: ragAgent.sourceType || attachmentSourceType,
            accessToken: session?.access_token,
          },
          {
            onMeta: () => setStatus(`${agent.name} thinking…`),
            onToken: (text) => {
              assembled += text;
              onUpdate(thread.id, (t) =>
                updateThreadMessage([t], t.id, replyId, { content: assembled })[0]
              );
            },
            signal: abortRef.current.signal,
            userAbort: true,
          }
        );

        if (result.error === "stopped" || result.mode === "stopped") {
          setStatus("Stopped");
          if (!assembled.trim() && !result.answer?.trim()) {
            onUpdate(thread.id, (t) =>
              updateThreadMessage([t], t.id, replyId, { content: "(stopped)" })[0]
            );
          }
          return;
        }

        if (!result.ok && result.error) {
          notifyError("Royal couldn't respond", result.error);
          if (settings.contributeToLearning) {
            emitRagError({
              query: displayQuery,
              sessionId: thread.id,
              error: result.error,
              agentId: activeAgentId,
            });
          }
        }

        const hubText =
          result.answer?.trim() ||
          assembled.trim() ||
          "";

        const useKingdom =
          Boolean(kingdom.directAnswer) &&
          (looksLikeHubMetaJunk(hubText) ||
            !hubText ||
            (kingdom.departments[0] === "finance" &&
              /league|betting|marketplace|dream/i.test(hubText)));

        const finalText =
          (useKingdom ? kingdom.directAnswer : hubText) ||
          "Kus AI hiccuped — try “help” or ask again.";

        const cards = useKingdom ? undefined : buildEnrichedCards(result);
        const enrichedCards = cards && cards.length > 0 ? cards : undefined;

        const actionChips =
          !useKingdom && result.action?.tab
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
            cards: enrichedCards,
            chips: actionChips,
            sourceLabel: useKingdom
              ? "Kingdom Knowledge"
              : dataSourceLabel(result) ?? undefined,
          })[0]
        );

        if (thread.title === "New chat") {
          onUpdate(thread.id, (t) => ({
            ...t,
            title: titleFromMessage(displayQuery),
          }));
        }

        setStatus(
          result.usedWebSearch
            ? "Web · Hub checked first"
            : result.dataSource?.toLowerCase().includes("hub")
              ? "Hub"
              : result.mode === "sports"
                ? "Sports"
                : agent.name
        );

        handleAction(result.action, result.actionTaken);

        if (
          settings.contributeToLearning &&
          isLikelyRetrievalMiss(result, displayQuery)
        ) {
          emitRetrievalMiss({
            query: displayQuery,
            sessionId: thread.id,
            dataSource: result.dataSource,
            usedWebSearch: result.usedWebSearch,
            sourceCount: result.sources?.length ?? 0,
            agentId: activeAgentId,
          });
        }

        if (user?.id) {
          void persistMessageToCloud(
            user.id,
            thread.id,
            "assistant",
            finalText,
            result.agentsUsed ?? [agent.id]
          );
        }

        const appSettingsAfter = loadSettings();
        const speakAllowed =
          (voiceReplies ?? appSettingsAfter.voiceReplies) &&
          finalText &&
          (!appSettingsAfter.silentMode ||
            shouldSpeakInSilentMode(finalText, result.actionTaken));

        if (speakAllowed) {
          speak(finalText, true);
        }

        if (user?.id && royal) {
          const updatedRoyal = {
            ...royal,
            recentTopics: [
              ...(royal.recentTopics ?? []),
              displayQuery.slice(0, 48),
            ].slice(0, 12),
            toneNotes: royal.toneNotes || "collaborative, concise, royal",
          };
          saveRoyalMemory(updatedRoyal);
          saveCompanionMemory({
            userId: user.id,
            preferenceSummary: updatedRoyal.preferenceSummary || "",
            episodicSummary: updatedRoyal.episodicSummary || "",
            toneNotes: updatedRoyal.toneNotes,
            recentTopics: updatedRoyal.recentTopics,
            updatedAt: new Date().toISOString(),
          });
        }
      } catch {
        if (!stoppedRef.current) {
          notifyError(
            "Couldn’t reach Royal",
            "Check your connection and try again."
          );
          if (settings.contributeToLearning) {
            emitRagError({
              query: displayQuery,
              sessionId: thread.id,
              error: "network_or_hub_error",
              agentId: activeAgentId,
            });
          };
          onUpdate(thread.id, (t) =>
            updateThreadMessage([t], t.id, replyId, {
              content:
                "Couldn’t reach Kus AI just now — check your connection and try again.",
            })[0]
          );
        }
        setStatus("");
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [
      attachments,
      isStreaming,
      thread,
      onUpdate,
      onFirstMessage,
      user?.id,
      userContext,
      voiceReplies,
      speak,
      agent,
      ragAgent,
      activeAgentId,
      handleAction,
      session?.access_token,
      settings.contributeToLearning,
    ]
  );

  const handleFeedback = useCallback(
    (messageId: string, type: "helpful" | "not_helpful") => {
      if (!settings.contributeToLearning || !thread) return;
      setMessageFeedback((prev) => ({ ...prev, [messageId]: type }));
      const idx = thread.messages.findIndex((m) => m.id === messageId);
      const assistant = thread.messages[idx];
      const userMsg = [...thread.messages]
        .slice(0, idx)
        .reverse()
        .find((m) => m.role === "user");
      if (!assistant) return;
      if (type === "helpful") {
        emitHelpful({
          messageId,
          sessionId: thread.id,
          userQuery: userMsg?.content,
          assistantReply: assistant.content,
        });
      } else {
        emitCorrection({
          messageId,
          sessionId: thread.id,
          userQuery: userMsg?.content,
          assistantReply: assistant.content,
        });
      }
    },
    [settings.contributeToLearning, thread]
  );

  const stopStreaming = useCallback(() => {
    stoppedRef.current = true;
    abortRef.current?.abort();
    setIsStreaming(false);
    setStatus("Stopped");
  }, []);

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
    geminiHistoryRef.current = [];
    bootstrapped.current = false;
  }, [thread?.id]);
  useEffect(() => {
    if (bootstrapQuery && !bootstrapped.current && thread) {
      bootstrapped.current = true;
      const query = bootstrapQuery;
      const files = bootstrapAttachments?.length ? bootstrapAttachments : undefined;
      void sendMessage(query, files);
      onBootstrapConsumed?.();
    }
  }, [bootstrapQuery, bootstrapAttachments, thread, sendMessage, onBootstrapConsumed]);

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
            showFeedback={settings.contributeToLearning}
            onFeedback={(type) => handleFeedback(msg.id, type)}
          />
        ))}
      </div>

      <ComposerDock className="space-y-1.5">
        {status && <p className="text-[10px] text-muted px-0.5">{status}</p>}

        <div className="flex items-center gap-1.5 px-0.5 flex-wrap">
          <button
            type="button"
            onClick={() => setModel("royal")}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
              model === "royal"
                ? "border-gold/50 bg-gold/15 text-gold"
                : "border-border/80 text-muted hover:text-foreground"
            }`}
          >
            {model === "royal" && <span className="text-gold">●</span>}
            {agent.icon} {agent.name} · Royal
          </button>

          <div className="relative inline-flex">
            <button
              type="button"
              onClick={() => setGeminiModelOpen((o) => !o)}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                model === "gemini"
                  ? "border-purple/50 bg-purple/15 text-gold"
                  : "border-border/80 text-muted hover:text-foreground"
              }`}
            >
              {model === "gemini" && <span className="text-gold">●</span>}
              ✦ Gemini {model === "gemini" ? `· ${ROYAL_GEMINI_MODELS.find((m) => m.id === geminiModelId)?.label ?? geminiModelId}` : ""}
              <span className="text-muted">▾</span>
            </button>
            {geminiModelOpen && (
              <div className="absolute z-30 top-full mt-1 left-0 w-52 rounded-xl border border-border bg-background shadow-xl p-1">
                {ROYAL_GEMINI_MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setGeminiModelId(m.id);
                      setModel("gemini");
                      setGeminiModelOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-colors ${
                      geminiModelId === m.id && model === "gemini"
                        ? "bg-gold/15 text-gold"
                        : "text-foreground hover:bg-surface"
                    }`}
                  >
                    {m.label}
                    <span className="block text-[9px] text-muted truncate">{m.id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <SuggestionChips chips={chips} onSelect={onChip} />
        <ChatInput
          onSend={sendMessage}
          disabled={isStreaming}
          isStreaming={isStreaming}
          onStop={stopStreaming}
          autoFocus={autoFocus}
          placeholder="Message Royal…"
          attachments={attachments}
          onRemoveAttachment={(id) =>
            setAttachments((prev) => prev.filter((a) => a.id !== id))
          }
          onOpenAttachMenu={() => setAttachMenuOpen(true)}
          activeAgent={{ icon: agent.icon, name: agent.name }}
          onAgentClick={() => setAgentPickerOpen(true)}
          hideAgentChip
          onFocus={() => {
            scrollRef.current?.scrollTo({
              top: scrollRef.current.scrollHeight,
              behavior: "smooth",
            });
          }}
        />
      </ComposerDock>

      <AttachmentMenu
        open={attachMenuOpen}
        onClose={() => setAttachMenuOpen(false)}
        existingAttachments={attachments}
        onAttachments={(files) =>
          setAttachments((prev) => [...prev, ...files].slice(0, 4))
        }
        onSelectAgent={(id) => onAgentChange(id)}
        onSelectCompanion={(url) => window.open(url, "_blank")}
      />

      <AgentPicker
        open={agentPickerOpen}
        onClose={() => setAgentPickerOpen(false)}
        activeId={activeAgentId}
        onSelect={onAgentChange}
      />

      <ActionConfirmModal
        pending={pendingAction}
        onConfirm={() => {
          if (pendingAction) {
            executeAction(pendingAction.action);
            logAction(user?.id, pendingAction.summary);
            if (user?.id) {
              const royal = loadRoyalMemory(user.id);
              addDecision(
                royal,
                pendingAction.title,
                pendingAction.summary,
                true
              );
            }
          }
          setPendingAction(null);
        }}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
