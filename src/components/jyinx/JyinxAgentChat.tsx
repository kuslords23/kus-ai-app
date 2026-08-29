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

type Message = { id: string; role: "user" | "assistant" | "system"; content: string; connectGithub?: boolean; kind?: "narration" | "reasoning" | "rejected" | "error" | "deploying" | "deployed" | "edit" | "done" | "log"; detail?: string; files?: Array<{ path: string; content: string }>; url?: string; summary?: string };
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
    return [{ id: "welcome", role: "assistant", content: "I can modify and commit files in your connected GitHub repository. Ask me to change code and I'll write the edits and commit them when a repository is attached. Say e.g. \"edit `src/App.tsx` to add a button and commit it\"." }];
  });
  const [connecting, setConnecting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const attachments = useChatAttachments();
  const consumedPrompt = useRef(false);
  const startedRef = useRef(false);

  // Persist history to localStorage
  useEffect(() => {
    if (messages.length && localStorage.getItem("jyinx:history-enabled") !== "false") {
      localStorage.setItem(histKey, JSON.stringify(messages.slice(-100)));
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, histKey]);

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
    try {
      const githubToken = await getGitHubToken();
      if (ACTION_PROMPT.test(text) && (!repository || !githubToken)) {
        setMessages((current) => [...current, { id: `connect-${Date.now()}`, role: "assistant", content: !githubToken ? "To modify or commit files I need your GitHub account. Connect GitHub so I can apply changes to a repository." : "I need to know which repository to commit to. Select a repository in Settings, then ask again.", connectGithub: true }]);
        return;
      }
      const history = messages
        .filter((m) => m.id !== "welcome" && !m.connectGithub && m.role !== "system")
        .slice(-20)
        .map((m) => ({ role: m.role === "user" ? "user" as const : "assistant" as const, content: m.content }));
      const attachmentPayload = await attachments.toPayload();
      const scopedContext = await searchRepositoryContext(repository, githubToken, text);
      const fullContext = [repositoryContext, scopedContext].filter(Boolean).join("\n");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (githubToken) headers["x-github-token"] = `Bearer ${githubToken}`;
      const response = await gatewayFetch("/api/jyinx/chat", { method: "POST", headers, body: JSON.stringify({ prompt: text, model: model.id, code, file, repository, branch: "main", repositoryContext: fullContext, agent, history, attachments: attachmentPayload }) });
      const dataJson = (await response.json().catch(() => ({}))) as { content?: string; error?: string; connectGithub?: boolean };
      setMessages((current) => [...current, { id: `assistant-${Date.now()}`, role: "assistant", content: dataJson.content || dataJson.error || "Jyinx could not complete that request.", connectGithub: dataJson.connectGithub === true }]);
    } catch { setMessages((current) => [...current, { id: `offline-${Date.now()}`, role: "assistant", content: "Network unavailable. Your workspace remains local; try again when you are connected." }]); }
    finally { setSending(false); attachments.clearAttachments(); }
  };

  // ── Autonomous mode send ──
  const sendAutonomous = async (text: string) => {
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", content: text }]);
    setSending(true);
    try {
      const token = await getGitHubToken();
      if (!token) {
        setMessages((current) => [...current, { id: `connect-${Date.now()}`, role: "assistant", content: "Connect GitHub to commit changes to the repository.", connectGithub: true }]);
        return;
      }
      // Send full conversation history so the autonomous pipeline has context
      // from any plan/ask discussion that happened in chat mode.
      const history = messages
        .filter((m) => m.id !== "welcome" && !m.connectGithub && m.role !== "system")
        .slice(-20)
        .map((m) => ({ role: m.role === "user" ? "user" as const : "assistant" as const, content: m.content }));
      const response = await gatewayFetch("/api/jyinx/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-github-token": `Bearer ${token}` },
        body: JSON.stringify({ prompt: text, model: model.id, repository: repository ?? "", branch: "main", repositoryFiles, history }),
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
      setMessages((current) => [...current, { id: `error-${Date.now()}`, role: "system", content: error instanceof Error ? error.message : "Failed to connect to the agent pipeline." }]);
    } finally { setSending(false); }
  };

  const pushAgentEvent = (event: AgentExecutionEvent) => {
    if (event.type === "edit" && onEdits && event.files?.length) {
      onEdits(event.files);
    }
    setMessages((current) => {
      const m: Message = { id: `event-${Date.now()}-${current.length}`, role: "system", content: "", kind: event.type };
      switch (event.type) {
        case "narration": m.content = event.message; m.detail = event.detail; break;
        case "log": m.content = `• ${event.message}`; break;
        case "reasoning": m.content = event.message; break;
        case "rejected": m.content = event.reason; break;
        case "whitespace": m.content = event.message; break;
        case "error": m.content = event.message; m.connectGithub = event.connect === true; break;
        case "deploying": m.content = event.message; break;
        case "deployed": m.content = `Deployed: ${event.url}`; m.url = event.url; break;
        case "edit": m.content = `✏️ ${event.files.length} file(s) applied`; m.files = event.files; break;
        case "done": m.content = event.summary; m.summary = event.summary; break;
      }
      return [...current, m];
    });
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
        {onClose && <button type="button" onClick={onClose} className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-gold">Close</button>}
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 flex flex-col space-y-3 overflow-y-auto p-4">
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

        {mode === "autonomous" && messages.length === 0 && !sending && (
          <p className="text-sm text-muted self-start">Describe an autonomous change. Jyinx will draft edits, review them, and commit them to GitHub.</p>
        )}

        {messages.map((message) => (
          message.kind ? (
            <AutonomousRow key={message.id} message={message} />
          ) : (
            <article key={message.id} className={"max-w-[85%] w-fit box-border rounded-2xl border p-3 text-sm leading-relaxed " + (message.role === "user" ? "self-end border-gold/30 bg-gold/10" : "self-start border-border bg-background/65")}>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-muted">{message.role === "user" ? "You" : "Jyinx"}</p>
              {message.role === "user" ? (
                <p className="whitespace-pre-wrap">{message.content}</p>
              ) : (
                <div className="whitespace-pre-wrap">{renderMessageText(message.content)}</div>
              )}
              {message.connectGithub && (
                <button type="button" onClick={() => void handleConnect()} disabled={connecting} className="mt-3 rounded-xl border border-gold/35 bg-gold/10 px-3 py-2 text-xs font-medium text-gold hover:bg-gold/20 disabled:opacity-60">
                  {connecting ? "Opening GitHub…" : "Connect GitHub →"}
                </button>
              )}
              {message.role === "assistant" && (
                <div className="mt-2 flex justify-end">
                  <button type="button" onClick={() => setReportMsg(message)} className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:border-danger/40 hover:text-danger" aria-label="Report response">Report</button>
                </div>
              )}
            </article>
          )
        ))}
        {sending && mode === "autonomous" && (
          <div className="flex items-center gap-2 px-1 py-1 text-xs text-muted self-start">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gold border-t-transparent" />
            Working through the pipeline…
          </div>
        )}
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
        <div className="flex items-end gap-2">
          <AttachButton onClick={attachments.openPicker} disabled={sending} />
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

function AutonomousRow({ message }: { message: Message }) {
  switch (message.kind) {
    case "narration":
      return (
        <article className="self-start w-full max-w-[85%] rounded-2xl border border-gold/30 bg-gold/5 p-3">
          <p className="text-[10px] uppercase tracking-wider text-gold">Plan</p>
          <p className="mt-1 text-sm text-foreground">{message.content}</p>
          {message.detail && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-background/60 p-2 text-[11px] text-purple-soft">{message.detail}</pre>}
        </article>
      );
    case "reasoning":
      return <div className="self-start w-full flex items-start gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs text-muted"><span className="mt-0.5 text-gold">⟳</span><span>{message.content}</span></div>;
    case "rejected":
      return <div className="self-start w-full rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">Review flagged: {message.content}</div>;
    case "error":
      return <div className="self-start w-full rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">{message.content}</div>;
    case "deploying":
      return <div className="self-start w-full flex items-center gap-2 rounded-lg border border-gold/25 bg-gold/5 px-3 py-2 text-xs text-gold"><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gold border-t-transparent" />{message.content}</div>;
    case "deployed":
      return <div className="self-start w-full rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">🚀 {message.url ? <a href={message.url} target="_blank" rel="noreferrer" className="underline hover:text-success">{message.content}</a> : message.content}</div>;
    case "edit":
      return <div className="self-start w-full rounded-lg border border-purple/30 bg-purple/10 px-3 py-2 text-xs text-purple-400">{message.content}</div>;
    case "done":
      return <div className="self-start w-full rounded-2xl border border-success/30 bg-success/10 p-3 text-sm text-success">{message.summary || message.content}</div>;
    default:
      return <div className="self-start w-full px-1 py-1 text-xs text-muted">{message.content}</div>;
  }
}