"use client";

import { useEffect, useRef, useState } from "react";
import type { JyinxModel } from "@/lib/jyinx/model-registry";
import { gatewayFetch } from "@/lib/kusai/apiKeys";
import { getGitHubToken, connectGitHub } from "@/lib/jyinx/github-connect";
import { useChatAttachments } from "./use-chat-attachments";
import { AttachmentChips, AttachButton } from "./ChatAttachmentUI";
import { renderMessageText } from "@/components/chat/MessageRenderer";

type Message = { id: string; role: "user" | "assistant"; content: string; connectGithub?: boolean };
type ChatAgent = { modelId: string; endpoint: string; systemPrompt: string; tag: string };
type Props = { open: boolean; onClose?: () => void; model: JyinxModel; code: string; file: string; workspaceId?: string; repository?: string; repositoryContext?: string; agent?: ChatAgent | null; pendingPrompt?: string };

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

export function JyinxChatPanel({ open, onClose, model, code, file, workspaceId = "local", repository, repositoryContext, agent, pendingPrompt }: Props) {
  const storageKey = `jyinx:chat:${workspaceId}`;
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
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
    if (messages.length && localStorage.getItem("jyinx:history-enabled") !== "false") localStorage.setItem(storageKey, JSON.stringify(messages.slice(-100)));
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, storageKey]);

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
  return <section className="flex h-full min-h-0 flex-col bg-surface"><header className="flex items-center justify-between border-b border-border px-4 py-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Jyinx agent</p><p className="mt-1 text-xs text-gold">{model.label} · {model.tier}</p></div>{onClose && <button type="button" onClick={onClose} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-gold">Close</button>}</header><div ref={scrollRef} className="flex-1 flex flex-col space-y-3 overflow-y-auto p-4">{messages.map((message) => <article key={message.id} className={`max-w-[85%] w-fit box-border rounded-2xl border p-3 text-sm leading-relaxed ${message.role === "user" ? "self-end border-gold/30 bg-gold/10" : "self-start border-border bg-background/65"}`}><p className="mb-1 text-[10px] uppercase tracking-wider text-muted">{message.role === "user" ? "You" : "Jyinx"}</p>{message.role === "user" ? <p className="whitespace-pre-wrap">{message.content}</p> : <div className="whitespace-pre-wrap">{renderMessageText(message.content)}</div>}{message.connectGithub && <button type="button" onClick={() => void handleConnect()} disabled={connecting} className="mt-3 rounded-xl border border-gold/35 bg-gold/10 px-3 py-2 text-xs font-medium text-gold hover:bg-gold/20 disabled:opacity-60">{connecting ? "Opening GitHub…" : "Connect GitHub →"}</button>}</article>)}{sending && <div className="max-w-[85%] w-fit self-start rounded-2xl border border-border bg-background/65 p-3 text-sm text-muted">Jyinx is thinking…</div>}</div><div className="border-t border-border p-3"><AttachmentChips attachments={attachments.attachments} onRemove={attachments.removeAttachment} /><div className="flex items-end gap-1.5 rounded-xl border border-gold/30 bg-background p-2 focus-within:border-gold"><AttachButton onClick={attachments.openPicker} disabled={sending} />{attachments.pickerInput}<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendPrompt(); } }} rows={2} placeholder="Ask Jyinx to change this file…" className="min-h-10 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted" /><button type="button" onClick={() => void sendPrompt()} disabled={!prompt.trim() || sending} className="self-end rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50">Send</button></div></div></section>;
}