"use client";

import { useEffect, useRef, useState } from "react";
import type { JyinxModel } from "@/lib/jyinx/model-registry";

type Message = { id: string; role: "user" | "assistant"; content: string };
type ChatAgent = { modelId: string; endpoint: string; systemPrompt: string; tag: string };
type Props = { open: boolean; onClose?: () => void; model: JyinxModel; code: string; file: string; workspaceId?: string; repository?: string; repositoryContext?: string; agent?: ChatAgent | null };

export function JyinxChatPanel({ open, onClose, model, code, file, workspaceId = "local", repository, repositoryContext, agent }: Props) {
  const storageKey = `jyinx:chat:${workspaceId}`;
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved && localStorage.getItem("jyinx:history-enabled") !== "false") {
      try { setMessages(JSON.parse(saved) as Message[]); return; } catch { /* use greeting */ }
    }
    setMessages([{ id: "welcome", role: "assistant", content: "Describe a change and Jyinx will review the active workspace with the selected model." }]);
  }, [storageKey]);

  useEffect(() => {
    if (messages.length && localStorage.getItem("jyinx:history-enabled") !== "false") localStorage.setItem(storageKey, JSON.stringify(messages.slice(-100)));
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, storageKey]);

  const sendPrompt = async () => {
    const text = prompt.trim();
    if (!text || sending) return;
    setPrompt("");
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", content: text }]);
    setSending(true);
    try {
      const response = await fetch("/api/jyinx/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text, model: model.id, code, file, repository, repositoryContext, agent }) });
      const data = (await response.json().catch(() => ({}))) as { content?: string; error?: string };
      setMessages((current) => [...current, { id: `assistant-${Date.now()}`, role: "assistant", content: data.content || data.error || "Jyinx could not complete that request." }]);
    } catch { setMessages((current) => [...current, { id: `offline-${Date.now()}`, role: "assistant", content: "Network unavailable. Your workspace remains local; try again when you are connected." }]); }
    finally { setSending(false); }
  };

  if (!open) return null;
  return <section className="flex h-full min-h-0 flex-col bg-surface"><header className="flex items-center justify-between border-b border-border px-4 py-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Jyinx agent</p><p className="mt-1 text-xs text-gold">{model.label} · {model.tier}</p></div>{onClose && <button type="button" onClick={onClose} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-gold">Close</button>}</header><div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">{messages.map((message) => <article key={message.id} className={`rounded-2xl border p-3 text-sm leading-relaxed ${message.role === "user" ? "ml-7 border-gold/30 bg-gold/10" : "mr-4 border-border bg-background/65"}`}><p className="mb-1 text-[10px] uppercase tracking-wider text-muted">{message.role === "user" ? "You" : "Jyinx"}</p><p className="whitespace-pre-wrap">{message.content}</p></article>)}{sending && <div className="mr-4 rounded-2xl border border-border bg-background/65 p-3 text-sm text-muted">Jyinx is thinking…</div>}</div><div className="border-t border-border p-3"><div className="flex gap-2 rounded-xl border border-gold/30 bg-background p-2 focus-within:border-gold"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendPrompt(); } }} rows={2} placeholder="Ask Jyinx to change this file…" className="min-h-10 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted" /><button type="button" onClick={() => void sendPrompt()} disabled={!prompt.trim() || sending} className="self-end rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50">Send</button></div></div></section>;
}
