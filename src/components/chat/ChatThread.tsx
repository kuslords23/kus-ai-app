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
  getNotebooks,
  createNotebook,
  upsertNotebook,
  saveChatExchangeToNotebook,
} from "@/lib/jyinx/notebooks";
import {
  buildPendingAction,
  classifyAction,
  describeAction,
  executeAction,
  logAction,
  type PendingAction,
} from "@/lib/actions/executor";
import { notifyError, notifySuccess } from "@/lib/errors/notify";
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
import { getPreferredCustomKey, gatewayFetch } from "@/lib/kusai/apiKeys";

type RoyalModel = "royal" | "gemini" | "kusai";

const ROYAL_GEMINI_MODELS = [
  { id: "openrouter/free", label: "OpenRouter Free" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "google/gemini-2.5-flash:free", label: "Gemini Flash (free)" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "meta-llama/llama-3-8b-instruct:free", label: "Llama 3 8B (free)" },
];

const ROYAL_MODEL_KEY = "royal:model-choice";
const ROYAL_GEMINI_MODEL_KEY = "royal:gemini-model-id";

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
  /** Open the app menu / sidebar where the model picker now lives. */
  onOpenMenu?: () => void;
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
  onOpenMenu,
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
  const geminiHistoryRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessageData | null>(null);
  const [editingBump, setEditingBump] = useState(0);

  // Persist the chosen Royal persona model + Gemini sub-model across reloads.
  useEffect(() => {
    try {
      const savedModel = localStorage.getItem(ROYAL_MODEL_KEY);
      if (savedModel === "royal" || savedModel === "gemini" || savedModel === "kusai")
        setModel(savedModel as RoyalModel);
      const savedId = localStorage.getItem(ROYAL_GEMINI_MODEL_KEY);
      if (savedId) {
        const known = ROYAL_GEMINI_MODELS.find((m) => m.id === savedId);
        if (known) setGeminiModelId(known.id);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ROYAL_MODEL_KEY, model);
      localStorage.setItem(ROYAL_GEMINI_MODEL_KEY, geminiModelId);
    } catch { /* ignore */ }
  }, [model, geminiModelId]);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);

  // Keep the model selection in sync with the sidebar / settings picker.
  useEffect(() => {
    const onModelChange = (event: Event) => {
      const detail = (event as CustomEvent<{ model: string; geminiId?: string }>).detail;
      if (!detail) return;
      try {
        const nextModel = detail.model;
        if (nextModel === "gemini") {
          setModel("gemini");
          if (detail.geminiId) setGeminiModelId(detail.geminiId);
        } else if (nextModel === "kusai") {
          setModel("kusai");
        } else {
          setModel("royal");
        }
      } catch { /* ignore */ }
    };
    window.addEventListener("royal:model-change", onModelChange);
    return () => window.removeEventListener("royal:model-change", onModelChange);
  }, []);

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
      attachments: m.attachments,
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

      if (editingMsg) setEditingMsg(null);

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
        attachments: sentAttachments.map((a) => ({
          id: a.id,
          kind: a.kind,
          name: a.name,
          mimeType: a.mimeType,
          previewUrl: a.previewUrl,
          dataUrl: a.dataUrl,
          size: a.size,
        })),
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

      // Server-side ingest: store bytes and get fetchable references so the
      // hub / Jyinx can retrieve the raw file (esp. images) by URL.
      const fileRefs: Array<{ name: string; mimeType: string; kind: string; url: string; token?: string }> = [];
      for (const a of sentAttachments) {
        if (!a.dataUrl) continue;
        const comma = a.dataUrl.indexOf(",");
        const base64 = comma >= 0 ? a.dataUrl.slice(comma + 1) : a.dataUrl;
        try {
          const up = await fetch("/api/kusai/files", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: a.name,
              mimeType: a.mimeType,
              kind: a.kind,
              data: base64,
            }),
          });
          const upData = (await up.json().catch(() => null)) as {
            url?: string;
            token?: string;
          } | null;
          if (up.ok && upData?.url) {
            fileRefs.push({
              name: a.name,
              url: upData.url,
              token: upData.token ?? "",
              mimeType: a.mimeType,
              kind: a.kind,
            });
          }
        } catch {
          // upload is best-effort; fall back to inline data payloads below
        }
      }

      if (model === "gemini") {
        const geminiAbort = abortRef.current;
        const customKey = getPreferredCustomKey().apiKey;
        // Prefer uploaded references for images; fall back to inline data URLs.
        const images = sentAttachments
          .filter((a) => a.kind === "image" && a.dataUrl)
          .map((a) => fileRefs.find((r) => r.mimeType === a.mimeType && r.kind === "image")?.url ?? (a.dataUrl as string));
        const docAttachments = sentAttachments
          .filter((a) => a.kind === "file" && a.dataUrl)
          .map((a) => ({
            name: a.name,
            data: (a.dataUrl as string).slice(
              (a.dataUrl as string).indexOf(",") + 1
            ),
          }));
        try {
          const geminiRes = await gatewayFetch("/api/kusai/royal-gemini", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(customKey ? { "x-custom-api-key": customKey } : {}),
            },
            body: JSON.stringify({
              prompt: displayQuery,
              model: geminiModelId,
              system: ROYAL_SYSTEM_PROMPT,
              history: geminiHistoryRef.current.slice(-8),
              images,
              attachments: docAttachments,
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
            attachments: attachmentsForRag(sentAttachments).map((att, idx) => {
              const ref = fileRefs[idx];
              return ref && ref.url ? { ...att, url: ref.url } : att;
            }),
            agentId: activeAgentId,
            sourceType: ragAgent.sourceType || attachmentSourceType,
            accessToken: session?.access_token,
            customApiKey: getPreferredCustomKey().apiKey,
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

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notifySuccess("Copied to clipboard");
    } catch {
      notifyError("Couldn't copy", "Clipboard unavailable in this browser.");
    }
  }, []);

  const handleSave = useCallback(
    (msg: ChatMessageData) => {
      const notebooks = getNotebooks();
      let notebook = notebooks[0];
      if (!notebook) {
        notebook = createNotebook("Royal saved chats");
        upsertNotebook(notebook);
      }
      saveChatExchangeToNotebook(notebook.id, {
        role: "assistant",
        title: `Royal chat · ${new Date().toLocaleString()}`,
        content: msg.content,
      });
      notifySuccess("Saved to notebook");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleEdit = useCallback(
    (msg: ChatMessageData) => {
      if (!thread) return;
      const idx = thread.messages.findIndex((m) => m.id === msg.id);
      if (idx === -1) return;
      // Remove this user message and the assistant replies that follow it.
      const dropIds = new Set<string>([msg.id]);
      for (let i = idx + 1; i < thread.messages.length; i++) {
        const m = thread.messages[i];
        if (m.role === "user") break;
        dropIds.add(m.id);
      }
      onUpdate(thread.id, (t) => ({
        ...t,
        messages: t.messages.filter((m) => !dropIds.has(m.id)),
      }));
      setEditingMsg(msg);
      setEditingBump((b) => b + 1);
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    },
    [thread, onUpdate]
  );

  const handleRetry = useCallback(
    (msg: ChatMessageData) => {
      if (!thread || isStreaming) return;
      const idx = thread.messages.findIndex((m) => m.id === msg.id);
      if (idx <= 0) return;
      const userMsg = [...thread.messages]
        .slice(0, idx)
        .reverse()
        .find((m) => m.role === "user");
      if (!userMsg) return;
      // Drop this assistant message and the triggering user message, then resend.
      const dropIds = new Set<string>();
      for (let i = idx; i >= 0; i--) {
        const m = thread.messages[i];
        dropIds.add(m.id);
        if (m.role === "user") break;
      }
      onUpdate(thread.id, (t) => ({
        ...t,
        messages: t.messages.filter((m) => !dropIds.has(m.id)),
      }));
      void sendMessage(userMsg.content);
    },
    [thread, isStreaming, onUpdate, sendMessage]
  );

  const clearEditing = useCallback(() => setEditingMsg(null), []);

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
            onCopy={handleCopy}
            onEdit={msg.role === "user" ? handleEdit : undefined}
            onRetry={msg.role === "assistant" ? handleRetry : undefined}
            onSave={msg.role === "assistant" ? handleSave : undefined}
            editing={editingMsg?.id === msg.id}
          />
        ))}
      </div>

      <ComposerDock className="space-y-1.5">
        {status && <p className="text-[10px] text-muted px-0.5">{status}</p>}

        <div className="flex items-center gap-1.5 px-0.5 flex-wrap">
          <button
            type="button"
            onClick={onOpenMenu}
            className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/40 px-2 py-0.5 text-[10px] font-medium text-muted hover:border-gold/40 hover:text-foreground"
            title="Change Royal model in the menu"
          >
            <span className="text-gold">●</span>
            {model === "gemini"
              ? `✦ ${
                  ROYAL_GEMINI_MODELS.find((m) => m.id === geminiModelId)?.label ??
                  geminiModelId
                }`
              : model === "kusai"
                ? "Kus AI"
                : "Kus AI · Royal"}
            <span className="text-muted">☰</span>
          </button>
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
          externalValue={editingMsg?.content}
          externalValueBump={editingBump}
          onExternalValueCleared={clearEditing}
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
