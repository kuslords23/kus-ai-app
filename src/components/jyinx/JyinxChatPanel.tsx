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

type Message = { id: string; role: "user" | "assistant"; content: string; connectGithub?: boolean };
type ChatAgent = { modelId: string; endpoint: string; systemPrompt: string; tag: string };
type Props = { open: boolean; onClose?: () => void; model: JyinxModel; code: string; file: string; workspaceId?: string; repository?: string; repositoryContext?: string; agent?: ChatAgent | null; pendingPrompt?: string; autonomous?: boolean; boundFile?: string };

const ACTION_PROMPT = /(^|\s)(commit|save|push|write|update|apply|edit|change|create)\b/i;

// Stop words that would produce useless repository searches when deriving the
// request-time query keyword set.
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

/**
 * Issue a keyword-scoped repository search so Jyinx can pin down the files a
 * request refers to (UI components, views, pages, etc.) rather than only the
 * preloaded top-level context. Returns formatted file blocks (empty when the
 * repo isn't connected or nothing matches).
 */
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

export function JyinxChatPanel({ open, onClose, model, code, file, workspaceId = "local", repository, repositoryContext, agent, pendingPrompt, autonomous = false, boundFile }: Props) {
  // Autonomous mode: every thought/interaction is bound tightly to the
  // selected repository file so it persists and can be replayed per-file.
  const autKey = autonomous ? `autonomous:${boundFile ?? file ?? "none"}` : "";
  const storageKey = autKey ? `jyinx:chat:${workspaceId}:${autKey}` : `jyinx:chat:${workspaceId}`;
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [reportMsg, setReportMsg] = useState<Message | null>(null);
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem(storageKey);
    if (saved && localStorage.getItem("jyinx:history-enabled") !== "false") {
      try {
        return JSON.parse(saved) as Message[];
      } catch {
        /* fall through to greeting */
      }
    }
    return [{ id: "welcome", role: "assistant", content: "I can modify and commit files in your connected GitHub repository. Ask me to change code and I'll write the edits and commit them when a repository is attached. Say e.g. \"edit `src/App.tsx` to add a button and commit it\"." }];
  });
  const [connecting, setConnecting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const attachments = useChatAttachments();
  const consumedPrompt = useRef(false);

  // "Open in Jyinx" hand-off: seed the composer once with the notebook-derived
  // instruction so the notebook context gets acted on immediately.
  useEffect(() => {
    if (pendingPrompt && !consumedPrompt.current && !sending) {
      consumedPrompt.current = true;
      setPrompt(pendingPrompt);
    }
  }, [pendingPrompt, sending]);

  useEffect(() => {
    if (messages.length && (autonomous || localStorage.getItem("jyinx:history-enabled") !== "false")) localStorage.setItem(storageKey, JSON.stringify(messages.slice(-100)));
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, storageKey, autonomous]);

  const handleConnect = async () => {
    if (connecting) return;
    setConnecting(true);
    try { await connectGitHub("/jyinx"); } finally { setConnecting(false); }
  };

  const sendPrompt = async () => {
    const text = prompt.trim();
    if (!text || sending) return;
    setPrompt("");
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", content: text }]);
    setSending(true);
    try {
      const githubToken = await getGitHubToken();
      // Action requests without a connected repository → hand to the Connect flow directly.
      if (ACTION_PROMPT.test(text) && (!repository || !githubToken)) {
        setMessages((current) => [...current, { id: `connect-${Date.now()}`, role: "assistant", content: !githubToken ? "To modify or commit files I need your GitHub account. Connect GitHub so I can apply changes to a repository." : "I need to know which repository to commit to. Select a repository in Settings, then ask again.", connectGithub: true }]);
        return;
      }
      // Conversation memory: send the prior history (bounded, skipping system/
      // connect rows and assistant connect-prompts) so Jyinx can pull context
      // from the same thread instead of answering each message in isolation.
      const history = messages
        .filter((m) => m.id !== "welcome" && !m.connectGithub)
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }));
      const attachmentPayload = await attachments.toPayload();
      // Automatically search the repository for the files the request is about
      // (not just the preloaded root context): pull keywords from the prompt and
      // fetch keyword-scoped context so Jyinx can locate component/UI files in
      // components/, app/, or views/ instead of only top-level config files.
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

  if (!open) return null;
  const workshopModes = AGENTS.filter((a) =>
    ["plan", "ask", "learn", "research", "build"].includes(a.id)
  );

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Jyinx agent</p>
          <p className="mt-1 text-xs text-gold">
            {model.label} · {model.tier}
            {autonomous ? (boundFile ? <span className="text-muted">· 📎 {boundFile}</span> : <span className="text-muted">· ⟳ autonomous</span>) : ""}
          </p>
        </div>
        {onClose && <button type="button" onClick={onClose} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-gold">Close</button>}
      </header>

      <div ref={scrollRef} className="flex-1 flex flex-col space-y-3 overflow-y-auto p-4">
        {/* Welcome suggestion chips */}
        {messages.length <= 1 && (
          <div className="self-start w-full max-w-full space-y-2 pb-2">
            <p className="text-[10px] uppercase tracking-wider text-muted px-1">Workshop Modes</p>
            <div className="flex flex-wrap gap-2">
              {workshopModes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setPrompt(mode.icon + " " + mode.name + ": ")}
                  className="shrink-0 px-3 py-1.5 text-[11px] rounded-full border border-gold/25 bg-surface/60 text-gold/85 hover:bg-gold/10 hover:border-gold/45 transition-all"
                >
                  {mode.icon} {mode.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <article key={message.id} className={"max-w-[85%] w-fit box-border rounded-2xl border p-3 text-sm leading-relaxed " + (message.role === "user" ? "self-end border-gold/30 bg-gold/10" : "self-start border-border bg-background/65")}>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-muted">{message.role === "user" ? "You" : "Jyinx"}</p>
            {message.role === "user" ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <div className="whitespace-pre-wrap">{renderMessageText(message.content)}</div>
            )}
            {message.connectGithub && (
              <button type="button" onClick={() => void handleConnect()} disabled={connecting} className="mt-3 rounded-xl border border-gold/35 bg-gold/10 px-3 py-2 text-xs font-medium text-gold hover:bg-gold/20 disabled:opacity-60">
                {connecting ? "Opening GitHub\u2026" : "Connect GitHub \u2192"}
              </button>
            )}
            {message.role === "assistant" && (
              <div className="mt-2 flex justify-end">
                <button type="button" onClick={() => setReportMsg(message)} className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:border-danger/40 hover:text-danger" aria-label="Report response">Report</button>
              </div>
            )}
          </article>
        ))}
        {sending && (
          <div className="max-w-[85%] w-fit self-start rounded-2xl border border-border bg-background/65 p-3 text-sm text-muted">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
              Thinking\u2026
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border bg-background/60 px-4 pb-2 pt-2">
        {attachments.attachments.length > 0 && <AttachmentChips attachments={attachments.attachments} onRemove={attachments.removeAttachment} />}
        <div className="flex items-end gap-2">
          <AttachButton onAttach={attachments.addAttachment} disabled={sending} />
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendPrompt(); } }}
            placeholder={autonomous ? "Tell Jyinx what to build\u2026" : "Ask Jyinx to help with code\u2026"}
            rows={2}
            className="min-h-[40px] w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-gold/50"
          />
          <button type="button" onClick={() => void sendPrompt()} disabled={!prompt.trim() || sending} className="shrink-0 rounded-xl bg-gold px-4 py-2 text-xs font-semibold text-background hover:bg-gold/90 disabled:opacity-50 transition-colors">
            {sending ? "\u2026" : "\u2192"}
          </button>
        </div>
      </div>

      {reportMsg && <ReportModal message={reportMsg.content} onClose={() => setReportMsg(null)} />}
    </section>
  );
}