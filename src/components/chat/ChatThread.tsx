"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatMessage, type ChatMessageData } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { SuggestionChips } from "./SuggestionChips";
import { AttachmentMenu } from "@/components/attachments/AttachmentMenu";
import { AgentPicker } from "@/components/agents/AgentPicker";
import { ActionConfirmModal } from "@/components/actions/ActionConfirmModal";
import { streamRag, type RagAction } from "@/lib/rag/client";
import { getSuggestionChips, WELCOME_TEXT } from "@/lib/rag/chips";
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
  const { user } = useAuth();
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
          content: `Hey **${name}** — good to see you. I'm **Royal**, same soul as hub AI, in your own home.`,
        });
      }
      welcome.push({
        id: "ai_welcome_agent",
        role: "assistant",
        content: `Active agent: **${agent.name}** ${agent.icon} — tap the chip below to switch skills, or use **+** for files, photos, camera, and companion connectors.`,
      });
      return welcome;
    }
    return thread.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      cards: m.cards,
      chips: m.chips,
    }));
  }, [thread, showWelcome, userContext.user?.name, agent.name, agent.icon]);

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

      const displayQuery =
        query || `Shared ${outgoing.length} file${outgoing.length > 1 ? "s" : ""}`;
      const sentAttachments = [...outgoing];
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
      setStatus(`${agent.name} thinking…`);

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

      const ctx = buildFullRagContext({
        user,
        settings: appSettings,
        agent: ragAgent,
        royalMemory: royal,
      });

      try {
        let assembled = "";
        const result = await streamRag(
          displayQuery,
          {
            userContext: ctx,
            history: [...history, { role: "user", content: displayQuery }],
            attachments: attachmentsForRag(sentAttachments),
            agentId: activeAgentId,
            sourceType: ragAgent.sourceType,
          },
          {
            onMeta: () => setStatus(`${agent.name} thinking…`),
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
            title: titleFromMessage(displayQuery),
          }));
        }

        setStatus(
          result.usedWebSearch
            ? "News"
            : result.mode === "sports"
              ? "Sports"
              : agent.name
        );

        handleAction(result.action, result.actionTaken);

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
      sendMessage(
        bootstrapQuery,
        bootstrapAttachments?.length ? bootstrapAttachments : undefined
      );
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
          attachments={attachments}
          onRemoveAttachment={(id) =>
            setAttachments((prev) => prev.filter((a) => a.id !== id))
          }
          onOpenAttachMenu={() => setAttachMenuOpen(true)}
          activeAgent={{ icon: agent.icon, name: agent.name }}
          onAgentClick={() => setAgentPickerOpen(true)}
        />
      </div>

      <AttachmentMenu
        open={attachMenuOpen}
        onClose={() => setAttachMenuOpen(false)}
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
