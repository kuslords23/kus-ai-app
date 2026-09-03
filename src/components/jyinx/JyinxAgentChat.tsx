"use client";

import { useEffect, useRef, useState } from "react";
import type { JyinxModel } from "@/lib/jyinx/model-registry";
import { gatewayFetch } from "@/lib/kusai/apiKeys";
import { getGitHubToken, connectGitHub } from "@/lib/jyinx/github-connect";
import { useChatAttachments } from "./use-chat-attachments";
import { AttachmentChips, AttachButton } from "./ChatAttachmentUI";
import { renderMessageText } from "@/components/chat/MessageRenderer";
import { ReportModal } from "@/components/legal/ReportModal";
import { AGENTS } from "@/lib/agents/registry";
import type { AgentExecutionEvent } from "@/lib/agent-execution";
import { StreamingText } from "@/components/ui/StreamingText";
import { RepoReference } from "@/components/jyinx/RepoReference";
import { extractCodeBlocks, type ExtractedFile } from "@/lib/jyinx/extract-code-blocks";

type Message = { id: string; role: "user" | "assistant" | "system"; content: string; connectGithub?: boolean; kind?: "narration" | "reasoning" | "rejected" | "error" | "deploying" | "deployed" | "edit" | "done" | "log" | "whitespace"; detail?: string; files?: Array<{ path: string; content: string }>; url?: string; summary?: string; label?: string; icon?: string };
type ChatAgent = { modelId: string; endpoint: string; systemPrompt: string; tag: string };

type Props = {
  open: boolean;
  onClose?: () => void;
  model: JyinxModel;
  code: string;
  file: string;
  workspaceId?: string;
  repository?: string;
  repositoryContext?: string;
  agent?: ChatAgent | null;
  pendingPrompt?: string;
  boundFile?: string;
  /** Repository files for autonomous mode context. */
  repositoryFiles?: Array<{ path: string; content: string }>;
  /** Called when the autonomous agent streams file edits to the IDE. */
  onEdits?: (edits: Array<{ path: string; content: string }>) => void;
  /** Unique session key for persisting history across panel toggles. */
  sessionKey?: string;
  /** When true, start in autonomous mode by default. */
  defaultMode?: AgentMode;
};

type AgentMode = "chat" | "autonomous";

const ACTION_PROMPT = /(^|\s)(commit|save|push|write|update|apply|edit|change|create)\b/i;

const STOPWORDS = new Set([
  "the", "a", "an", "to", "of", "in", "on", "at", "for", "and", "or", "is", "are",
  "i", "you", "me", "it", "this", "that", "these", "those", "my", "your", "we", "our",
  "please", "make", "add", "change", "edit", "update", "fix", "create", "with", "file", "code",
  "circle", "circles", "top", "bottom", "left", "right", "middle", "center", "small", "large", "button", "three",
]);

function promptKeywords(prompt: string): string {
  const words = prompt.toLowerCase().replace(/[^a-z0-9\s/_-]/g, " ").split(/\s+/).filter(Boolean);
  const meaningful = words.filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  return meaningful.slice(0, 4).join(" ");
}

async function searchRepositoryContext(
  repository: string | undefined,
  githubToken: string | null,
  prompt: string
): Promise<string> {
  if (!repository || !githubToken) return "";
  const query = promptKeywords(prompt);
  if (!query) return "";
  try {
    const response = await fetch(`/api/github/workspace?repository=${encodeURIComponent(repository)}&context=1&q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${githubToken}` },
      cache: "no-store",
    });
    if (!response.ok) return "";
    const result = (await response.json()) as { files?: Array<{ path: string; content: string }> };
    const files = (result.files ?? []).slice(0, 6);
    if (!files.length) return "";
    return files.map((file) => `### ${file.path}\n${file.content}`).join("\n");
  } catch {
    return "";
  }
}

const workshopModes = AGENTS.filter((a) =>
  ["plan", "ask", "learn", "research", "build"].includes(a.id)
);

export function JyinxAgentChat({ open, onClose, model, code, file, workspaceId = "local", repository, repositoryContext, agent, pendingPrompt, boundFile, repositoryFiles = [], onEdits, sessionKey, defaultMode }: Props) {
  // Unified storage key: same history per repo regardless of mode
  const histKey = `jyinx:agentchat:${sessionKey ?? workspaceId}`;
  const [mode, setMode] = useState<AgentMode>(defaultMode ?? "chat");

  // Sync mode when defaultMode prop changes (e.g. from CustomizeSidebar toggle)
  useEffect(() => {
    if (defaultMode) setMode(defaultMode);
  }, [defaultMode]);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [reportMsg, setReportMsg] = useState<Message | null>(null);
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(histKey);
      if (saved && localStorage.getItem("jyinx:history-enabled") !== "false") {
        const parsed = JSON.parse(saved) as Message[];
        if (parsed.length) return parsed;
      }
    } catch { /* ignore */ }
    return [{ id: "welcome", role: "assistant", content: "Hi! I'm Jyinx, your coding assistant. I can help you build, edit, and manage your code. Just tell me what you'd like to do in plain English — I'll explain everything as I go. I can also search the web for code examples, browse the marketplace, and commit changes to your GitHub repository." }];
  });
  const [connecting, setConnecting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const attachments = useChatAttachments();
  const consumedPrompt = useRef(false);
  const startedRef = useRef(false);
  const [repoRefOpen, setRepoRefOpen] = useState(false);
  const [referencedRepos, setReferencedRepos] = useState<Array<{ repo: string; files: Array<{ path: string; content: string }> }>>([]);
  const abortRef = useRef<AbortController | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [backgroundTask, setBackgroundTask] = useState(false);

  // Request wake lock to prevent screen sleep during autonomous tasks
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          // Re-acquire if task is still running
          if (sending) {
            navigator.wakeLock.request('screen').then((wl) => { wakeLockRef.current = wl; }).catch(() => {});
          }
        });
      }
    } catch { /* Wake lock not supported */ }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try { await wakeLockRef.current.release(); } catch { /* ignore */ }
      wakeLockRef.current = null;
    }
  };

  const stop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    releaseWakeLock();
    setBackgroundTask(false);
    try { localStorage.removeItem("jyinx:background-task"); } catch { /* ignore */ }
    setSending(false);
    setMessages((current) => [...current, { id: `stop-${Date.now()}`, role: "assistant", content: "⏹ Stopped by user.", kind: "done", label: "⏹ Stopped", summary: "Process stopped by user." }]);
  };

  // Persist history to localStorage + auto-scroll (unless user scrolled up)
  useEffect(() => {
    if (messages.length && localStorage.getItem("jyinx:history-enabled") !== "false") {
      localStorage.setItem(histKey, JSON.stringify(messages.slice(-100)));
    }
    if (scrollRef.current && !userScrolledRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, sending, histKey]);

  // Detect manual scroll — stop auto-scrolling when user scrolls up
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 80;
    userScrolledRef.current = !isAtBottom;
  };

  // Seed pending prompt from notebook hand-off
  useEffect(() => {
    if (pendingPrompt && !consumedPrompt.current && !sending) {
      consumedPrompt.current = true;
      setPrompt(pendingPrompt);
    }
  }, [pendingPrompt, sending]);

  // Auto-start autonomous mode when initialPrompt is pending from builder
  useEffect(() => {
    if (!open || !pendingPrompt || startedRef.current) return;
    startedRef.current = true;
    setMode("autonomous");
  }, [open, pendingPrompt]);

  const handleConnect = async () => {
    if (connecting) return;
    setConnecting(true);
    try { await connectGitHub("/jyinx"); } finally { setConnecting(false); }
  };

// ── Chat mode send ──
  const sendChat = async (text: string) => {
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", content: text }]);
    setSending(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const githubToken = await getGitHubToken();
      if (ACTION_PROMPT.test(text) && (!repository || !githubToken)) {
        setMessages((current) => [...current, { id: `connect-${Date.now()}`, role: "assistant", content: !githubToken ? "To modify or commit files I need your GitHub account. Connect GitHub so I can apply changes to a repository." : "I need to know which repository to commit to. Select a repository in Settings, then ask again.", connectGithub: true }]);
        setSending(false);
        return;
      }
      const history = messages
        .filter((m) => m.id !== "welcome" && !m.connectGithub && m.role !== "system")
        .slice(-20)
        .map((m) => ({ role: m.role === "user" ? "user" as const : "assistant" as const, content: m.content }));
      const attachmentPayload = await attachments.toPayload();
      const scopedContext = await searchRepositoryContext(repository, githubToken, text);
      let enhancedText = text;
      if (referencedRepos.length > 0) {
        const repoRefSection = "\n\n[Referenced repositories for context]:\n" + referencedRepos.map((r) =>
          `--- ${r.repo} ---\n${r.files.map((f) => `File: ${f.path}\n\`\`\`\n${f.content.slice(0, 2000)}\n\`\`\``).join("\n")}`
        ).join("\n");
        enhancedText = text + repoRefSection;
      }
      const fullContext = [repositoryContext, scopedContext].filter(Boolean).join("\n");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (githubToken) headers["x-github-token"] = `Bearer ${githubToken}`;
      const response = await gatewayFetch("/api/jyinx/chat", { method: "POST", headers, signal: controller.signal, body: JSON.stringify({ prompt: enhancedText, model: model.id, code, file, repository, branch: "main", repositoryContext: fullContext, agent, history, attachments: attachmentPayload }) });
      const dataJson = (await response.json().catch(() => ({}))) as { content?: string; error?: string; connectGithub?: boolean };
      const content = dataJson.content || dataJson.error || "Jyinx could not complete that request.";
      setMessages((current) => [...current, { id: `assistant-${Date.now()}`, role: "assistant", content, connectGithub: dataJson.connectGithub === true }]);

      // Extract code blocks from the response and apply to IDE workspace
      if (content && onEdits) {
        const { files } = extractCodeBlocks(content);
        if (files.length > 0) {
          onEdits(files);
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessages((current) => [...current, { id: `offline-${Date.now()}`, role: "assistant", content: error instanceof Error ? error.message : "Network unavailable. Your workspace remains local; try again when you are connected." }]);
    }
    finally { setSending(false); attachments.clearAttachments(); }
  };

  // ── Autonomous mode send ──
  const sendAutonomous = async (text: string) => {
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", content: text }]);
    setSending(true);
    setBackgroundTask(true);
    try { localStorage.setItem("jyinx:background-task", JSON.stringify({ repo: repository, prompt: text.slice(0, 100), at: Date.now() })); } catch { /* ignore */ }
    void requestWakeLock();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const token = await getGitHubToken();
      if (!token) {
        setMessages((current) => [...current, { id: `connect-${Date.now()}`, role: "assistant", content: "Connect GitHub to commit changes to the repository.", connectGithub: true }]);
        setSending(false);
        return;
      }
      const history = messages
        .filter((m) => m.id !== "welcome" && !m.connectGithub && m.role !== "system")
        .slice(-20)
        .map((m) => ({ role: m.role === "user" ? "user" as const : "assistant" as const, content: m.content }));
      let enhancedText = text;
      if (referencedRepos.length > 0) {
        const repoRefSection = "\n\n[Referenced repositories for context]:\n" + referencedRepos.map((r) =>
          `--- ${r.repo} ---\n${r.files.map((f) => `File: ${f.path}\n\`\`\`\n${f.content.slice(0, 2000)}\n\`\`\``).join("\n")}`
        ).join("\n");
        enhancedText = text + repoRefSection;
      }
      const response = await gatewayFetch("/api/jyinx/agent", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-github-token": `Bearer ${token}` },
        body: JSON.stringify({ prompt: enhancedText, model: model.id, repository: repository ?? "", branch: "main", repositoryFiles, history }),
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessages((current) => [...current, { id: `error-${Date.now()}`, role: "system", content: data?.error || "Agent pipeline could not start." }]);
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (controller.signal.aborted) break;
        buffer += decoder.decode(value, { stream: true });
        let split = buffer.indexOf("\n\n");
        while (split !== -1) {
          const chunk = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (line) {
            try {
              const event = JSON.parse(line.slice(6)) as AgentExecutionEvent;
              pushAgentEvent(event);
            } catch { /* ignore malformed */ }
          }
          split = buffer.indexOf("\n\n");
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessages((current) => [...current, { id: `error-${Date.now()}`, role: "system", content: error instanceof Error ? error.message : "Failed to connect to the agent pipeline." }]);
    } finally { setSending(false); releaseWakeLock(); setBackgroundTask(false); abortRef.current = null; }
  };

  const pushAgentEvent = (event: AgentExecutionEvent) => {
    if (event.type === "edit" && onEdits && event.files?.length) {
      onEdits(event.files);
    }

    // Render each event type as a chat message so the user sees
    // the agent's thought process unfold naturally in the conversation.
    switch (event.type) {
      case "narration":
        setMessages((current) => [...current, {
          id: `narration-${Date.now()}`,
          role: "assistant",
          content: event.detail ? `${event.message}\n\n${event.detail}` : event.message,
          kind: "narration",
          label: "📋 Planning",
        }]);
        break;
      case "reasoning":
        setMessages((current) => [...current, {
          id: `reason-${Date.now()}`,
          role: "assistant",
          content: event.message,
          kind: "reasoning",
          label: "⟳ Reasoning",
        }]);
        break;
      case "log":
        setMessages((current) => [...current, {
          id: `log-${Date.now()}`,
          role: "assistant",
          content: event.message,
          kind: "log",
          label: "• Info",
        }]);
        break;
      case "rejected":
        setMessages((current) => [...current, {
          id: `rejected-${Date.now()}`,
          role: "assistant",
          content: `Review flagged: ${event.reason}`,
          kind: "rejected",
          label: "❌ Review rejected",
        }]);
        break;
      case "edit":
        setMessages((current) => [...current, {
          id: `edit-${Date.now()}`,
          role: "assistant",
          content: event.files.map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n"),
          kind: "edit",
          label: `✏️ Editing ${event.files.length} file(s)`,
          files: event.files,
        }]);
        break;
      case "whitespace":
        setMessages((current) => [...current, {
          id: `ws-${Date.now()}`,
          role: "assistant",
          content: event.message,
          kind: "whitespace",
          label: "📄 Whitespace",
        }]);
        break;
      case "deploying":
        setMessages((current) => [...current, {
          id: `deploying-${Date.now()}`,
          role: "assistant",
          content: event.message,
          kind: "deploying",
          label: "🚀 Deploying",
        }]);
        break;
      case "deployed":
        setMessages((current) => [...current, {
          id: `deployed-${Date.now()}`,
          role: "assistant",
          content: `Deployed — ${event.url}`,
          kind: "deployed",
          label: "✅ Deployed",
          url: event.url,
        }]);
        break;
      case "error":
        setMessages((current) => [...current, {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: event.message,
          kind: "error",
          label: "❌ Error",
          connectGithub: event.connect === true,
        }]);
        break;
      case "done":
        setMessages((current) => [...current, {
          id: `done-${Date.now()}`,
          role: "assistant",
          content: event.summary,
          kind: "done",
          label: "✅ Done",
          summary: event.summary,
        }]);
        break;
    }
  };

  const send = () => {
    const text = prompt.trim();
    if (!text || sending) return;
    setPrompt("");
    if (mode === "autonomous") {
      void sendAutonomous(text);
    } else {
      void sendChat(text);
    }
  };

  if (!open) return null;

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      {/* Header with mode toggle */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Jyinx agent</p>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setMode("chat")}
                className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${mode === "chat" ? "bg-gold/15 text-gold" : "text-muted hover:text-foreground"}`}
              >
                💬 Chat
              </button>
              <button
                type="button"
                onClick={() => setMode("autonomous")}
                className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${mode === "autonomous" ? "bg-gold/15 text-gold" : "text-muted hover:text-foreground"}`}
              >
                🤖 Auto
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-gold truncate">
            {model.label} · {mode === "autonomous" ? "Autonomous" : "Chat"}
            {boundFile && <span className="text-muted"> · 📎 {boundFile}</span>}
            {repository && <span className="text-muted"> · {repository.split("/").pop()}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {backgroundTask && !sending && (
            <span className="rounded-md border border-gold/30 bg-gold/10 px-2 py-1 text-[10px] text-gold flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
              Background
            </span>
          )}
          {sending && (
            <button
              type="button"
              onClick={stop}
              className="rounded-md bg-red-500/15 border border-red-500/40 px-2.5 py-1 text-[10px] font-medium text-red-400 hover:bg-red-500/25 transition-colors"
            >
              ⏹ Stop
            </button>
          )}
          {onClose && <button type="button" onClick={onClose} className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-gold">Close</button>}
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 flex flex-col space-y-3 overflow-y-auto p-4">
        {/* Welcome suggestion chips — only in chat mode when no messages */}
        {mode === "chat" && messages.length <= 1 && (
          <div className="self-start w-full max-w-full space-y-2 pb-2">
            <p className="text-[10px] uppercase tracking-wider text-muted px-1">Workshop Modes</p>
            <div className="flex flex-wrap gap-2">
              {workshopModes.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPrompt(m.icon + " " + m.name + ": ")}
                  className="shrink-0 px-3 py-1.5 text-[11px] rounded-full border border-gold/25 bg-surface/60 text-gold/85 hover:bg-gold/10 hover:border-gold/45 transition-all"
                >
                  {m.icon} {m.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, idx) => {
          // Autonomous events — terminal-style activity feed with left-border accents
          if (message.kind) {
            const borderColor =
              message.kind === "done" || message.kind === "deployed" ? "border-l-success" :
              message.kind === "error" || message.kind === "rejected" ? "border-l-red-400" :
              message.kind === "narration" || message.kind === "deploying" ? "border-l-gold" :
              message.kind === "reasoning" || message.kind === "edit" ? "border-l-purple-soft" :
              "border-l-border";
            const labelColor =
              message.kind === "done" || message.kind === "deployed" ? "text-success" :
              message.kind === "error" || message.kind === "rejected" ? "text-red-400" :
              message.kind === "narration" || message.kind === "deploying" ? "text-gold" :
              message.kind === "reasoning" || message.kind === "edit" ? "text-purple-soft" :
              message.kind === "log" ? "text-muted" :
              "text-muted";

            return (
              <div key={message.id} className={`self-start w-full border-l-2 ${borderColor} pl-3 py-1.5 ${message.kind === "done" ? "mb-1" : ""}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-medium ${labelColor}`}>
                    {message.label || message.kind}
                  </span>
                  {message.kind === "edit" && message.files && (
                    <span className="text-[9px] text-muted/60">{message.files.length} file(s)</span>
                  )}
                </div>
                {message.kind === "edit" && message.files ? (
                  <div className="space-y-1.5 mt-1">
                    {message.files.map((file, fi) => (
                      <div key={fi}>
                        <p className="text-[10px] font-mono text-gold/80">{file.path}</p>
                        <pre className="whitespace-pre-wrap rounded-md p-2 text-[10px] leading-relaxed overflow-x-auto max-h-48 overflow-y-auto" style={{ backgroundColor: "var(--editor-bg)", color: "var(--editor-text)" }}>
                          {sending && idx === messages.length - 1 && fi === message.files!.length - 1 ? (
                            <StreamingText text={file.content} speed={15} />
                          ) : (
                            file.content
                          )}
                        </pre>
                      </div>
                    ))}
                  </div>
                ) : message.kind === "done" ? (
                  <p className="text-xs text-success/90 whitespace-pre-wrap">{message.summary || message.content}</p>
                ) : message.kind === "error" || message.kind === "rejected" ? (
                  <p className="text-xs text-red-400/90 whitespace-pre-wrap">{message.content}</p>
                ) : message.kind === "deployed" && message.url ? (
                  <p className="text-xs text-success/90">🚀 <a href={message.url} target="_blank" rel="noreferrer" className="underline">{message.content}</a></p>
                ) : (
                  <div className="text-xs text-muted/90 whitespace-pre-wrap">{renderMessageText(message.content)}</div>
                )}
                {message.connectGithub && (
                  <button type="button" onClick={() => void handleConnect()} disabled={connecting} className="mt-1.5 rounded-md border border-gold/35 bg-gold/10 px-2 py-1 text-[10px] font-medium text-gold hover:bg-gold/20 disabled:opacity-60">
                    {connecting ? "Opening GitHub…" : "Connect GitHub →"}
                  </button>
                )}
              </div>
            );
          }

          // Regular user/assistant messages
          // For assistant messages, check if the content has code blocks
          const isAssistantMsg = message.role === "assistant" && !message.kind;
          const codeBlocks = isAssistantMsg ? extractCodeBlocks(message.content) : null;
          const hasCode = codeBlocks && codeBlocks.files.length > 0;

          return (
            <article key={message.id} className={"box-border rounded-md border border-border/40 p-2.5 text-sm leading-relaxed " + (message.role === "user" ? "max-w-[85%] w-fit self-end border-gold/30 bg-gold/10" : "self-start w-full border-border/40 bg-background/65")}>
              <p className="mb-1 text-[9px] uppercase tracking-wider text-muted">{message.role === "user" ? "You" : "Jyinx"}</p>
              {message.role === "user" ? (
                <p className="whitespace-pre-wrap">{message.content}</p>
              ) : sending && idx === messages.length - 1 ? (
                // Streaming - use StreamingText, parse later
                <div className="whitespace-pre-wrap"><StreamingText text={message.content} /></div>
              ) : hasCode ? (
                <div className="space-y-2">
                  {/* Show clean text with code blocks replaced by file references */}
                  <div className="whitespace-pre-wrap mb-3">{renderMessageText(codeBlocks!.cleanText)}</div>
                  {/* Show each file as a styled section */}
                  <div className="space-y-2 border-t border-border pt-2">
                    {codeBlocks!.files.map((file, fi) => (
                      <div key={fi} className="rounded-lg border border-border bg-background/40 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-surface/40 border-b border-border">
                          <span className="text-[10px] font-mono text-gold truncate">📄 {file.path}</span>
                          <button
                            type="button"
                            onClick={() => onEdits?.([file])}
                            className="shrink-0 rounded border border-gold/30 px-2 py-0.5 text-[9px] text-gold hover:bg-gold/10"
                          >
                            Apply to IDE
                          </button>
                        </div>
                        <pre className="whitespace-pre-wrap p-3 text-[11px] leading-relaxed overflow-x-auto max-h-48 overflow-y-auto" style={{ backgroundColor: "var(--editor-bg)", color: "var(--editor-text)" }}>{file.content}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{renderMessageText(message.content)}</div>
              )}
              {message.connectGithub && (
                <button type="button" onClick={() => void handleConnect()} disabled={connecting} className="mt-3 rounded-xl border border-gold/35 bg-gold/10 px-3 py-2 text-xs font-medium text-gold hover:bg-gold/20 disabled:opacity-60">
                  {connecting ? "Opening GitHub…" : "Connect GitHub →"}
                </button>
              )}
              {message.role === "assistant" && !message.kind && (
                <div className="mt-2 flex justify-end">
                  <button type="button" onClick={() => setReportMsg(message)} className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:border-danger/40 hover:text-danger" aria-label="Report response">Report</button>
                </div>
              )}
            </article>
          );
        })}
        {sending && mode === "chat" && (
          <div className="max-w-[85%] w-fit self-start rounded-2xl border border-border bg-background/65 p-3 text-sm text-muted">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
              Thinking…
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border bg-background/60 px-4 pb-2 pt-2">
        {attachments.ts?.length > 0 && <AttachmentChips attachments={attachments.ts} onRemove={attachments.removeAttachment} />}

        {/* Referenced repos chips */}
        {referencedRepos.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {referencedRepos.map((r) => (
              <span key={r.repo} className="inline-flex items-center gap-1 rounded-full border border-gold/25 bg-gold/5 py-0.5 pl-2 pr-1 text-[10px] text-gold">
                📦 {r.repo.split("/").pop()}
                <button type="button" onClick={() => setReferencedRepos((prev) => prev.filter((x) => x.repo !== r.repo))} className="text-muted hover:text-foreground">✕</button>
              </span>
            ))}
          </div>
        )}

        {/* Repo reference picker */}
        {repoRefOpen && (
          <div className="mb-2">
            <RepoReference
              onSelectRepo={(repo, files) => {
                setReferencedRepos((prev) => {
                  const filtered = prev.filter((r) => r.repo !== repo);
                  return [...filtered, { repo, files }];
                });
              }}
              onClose={() => setRepoRefOpen(false)}
            />
          </div>
        )}

        <div className="flex items-end gap-2">
          <AttachButton onClick={attachments.openPicker} disabled={sending} />
          <button
            type="button"
            onClick={() => setRepoRefOpen(!repoRefOpen)}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${
              repoRefOpen ? "bg-gold/15 text-gold border border-gold/30" : "text-muted hover:bg-border/50 hover:text-gold"
            }`}
            title="Reference a repository"
          >
            📦
          </button>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={mode === "autonomous" ? "Tell Jyinx what to build…" : "Ask Jyinx to help with code…"}
            rows={2}
            className="min-h-[40px] w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-gold/50"
          />
          <button type="button" onClick={() => send()} disabled={!prompt.trim() || sending} className="shrink-0 rounded-xl bg-gold px-4 py-2 text-xs font-semibold text-background hover:bg-gold/90 disabled:opacity-50 transition-colors">
            {sending ? "…" : "→"}
          </button>
        </div>
      </div>

      {reportMsg && <ReportModal open={reportMsg !== null} onClose={() => setReportMsg(null)} messageId={reportMsg?.id} snippet={reportMsg?.content} />}
    </section>
  );
}