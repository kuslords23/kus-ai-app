"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AgentExecutionEvent } from "@/services/agentPipeline";
import { gatewayFetch } from "@/lib/kusai/apiKeys";
import { connectGitHub } from "@/lib/jyinx/github-connect";

type Props = {
  open: boolean;
  onClose?: () => void;
  repository: string;
  branch: string;
  model: string;
  /** Files to inject into the coder agent's context. */
  repositoryFiles?: Array<{ path: string; content: string }>;
  /** When provided, the stream auto-starts with this prompt on mount. */
  initialPrompt?: string;
  /** Optional externally-controlled prompt value. */
  prompt?: string;
  onPromptChange?: (value: string) => void;
  /**
   * Called with the agent's file edits so the IDE can apply them live.
   * Explicitly declared so TypeScript resolves the prop cleanly at every
   * call site (desktop panel, drawer, mobile dashboard).
   */
  onEdits?: (edits: Array<{ path: string; content: string }>) => void;
};

type StreamItem =
  | { kind: "log"; message: string }
  | { kind: "narration"; message: string; detail?: string }
  | { kind: "reasoning"; message: string }
  | { kind: "rejected"; reason: string }
  | { kind: "whitespace"; message: string }
  | { kind: "error"; message: string; connect?: boolean }
  | { kind: "deploying"; message: string }
  | { kind: "deployed"; url: string }
  | { kind: "edit"; files: Array<{ path: string; content: string }> }
  | { kind: "done"; summary: string };

export function AgentExecutionStream({ open, onClose, repository, branch, model, repositoryFiles = [], initialPrompt, onPromptChange, onEdits }: Props) {
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<StreamItem[]>([]);
  const [needConnect, setNeedConnect] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<(text?: string) => void | Promise<void>>(() => {});
  const startedRef = useRef(false);

  const run = async (override?: string) => {
    const text = (override ?? prompt).trim();
    if (!text || running) return;
    onPromptChange?.("");
    setPrompt("");
    setItems([]);
    setNeedConnect(false);
    setRunning(true);
    try {
      const { data } = await createClient().auth.getSession();
      const token = data.session?.provider_token;
      if (!token) {
        setItems([{ kind: "error", message: "Connect GitHub to commit changes to the repository." }]);
        setNeedConnect(true);
        return;
      }
      const response = await gatewayFetch("/api/jyinx/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          prompt: text,
          model,
          repository,
          branch,
          repositoryFiles,
        }),
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setItems([{ kind: "error", message: data?.error || "Agent pipeline could not start." }]);
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
              pushEvent(event);
            } catch { /* ignore malformed */ }
          }
          split = buffer.indexOf("\n\n");
        }
      }
    } catch (error) {
      setItems((current) => [...current, { kind: "error", message: error instanceof Error ? error.message : "Failed to connect to the agent pipeline." }]);
    } finally {
      setRunning(false);
    }
  };

  const pushEvent = (event: AgentExecutionEvent) => {
    setItems((current) => {
      const next = [...current];
      switch (event.type) {
        case "narration": next.push({ kind: "narration", message: event.message, detail: event.detail }); break;
        case "log": next.push({ kind: "narration", message: `• ${event.message}` }); break;
        case "reasoning": next.push({ kind: "reasoning", message: event.message }); break;
        case "rejected": next.push({ kind: "rejected", reason: event.reason }); break;
        case "whitespace": next.push({ kind: "whitespace", message: event.message }); break;
        case "deploying": next.push({ kind: "deploying", message: event.message }); break;
        case "deployed": next.push({ kind: "deployed", url: event.url }); break;
        case "edit": {
          next.push({ kind: "edit", files: event.files });
          if (onEdits && event.files?.length) onEdits(event.files);
          break;
        }
        case "error": next.push({ kind: "error", message: event.message, connect: event.connect === true }); if (event.connect === true) setNeedConnect(true); break;
        case "done": next.push({ kind: "done", summary: event.summary }); break;
      }
      return next;
    });
  };

  // Keep the ref pointing at the latest closure so the effect can call it safely.
  runRef.current = run;

  useEffect(() => {
    if (!open || !initialPrompt || startedRef.current) return;
    startedRef.current = true;
    void runRef.current(initialPrompt);
  }, [open, initialPrompt]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [items, running]);

  if (!open) return null;

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Jyinx · Autonomous agent</p>
          <p className="mt-1 text-xs text-gold">{repository} · {branch}</p>
        </div>
        {onClose && <button type="button" onClick={onClose} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-gold">Close</button>}
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {items.length === 0 && !running && <p className="text-sm text-muted">Describe an autonomous change. Jyinx will draft edits, review them, and commit them to GitHub — no manual git needed.</p>}
        {items.map((item, i) => (
          <StreamRow key={i} item={item} />
        ))}
        {running && items.filter((i) => i.kind === "done").length === 0 && <SpinnerRow />}
        {needConnect && <button type="button" onClick={() => { setConnecting(true); void connectGitHub("/jyinx").finally(() => setConnecting(false)); }} disabled={connecting} className="rounded-xl border border-gold/35 bg-gold/10 px-3 py-2 text-xs font-medium text-gold hover:bg-gold/20 disabled:opacity-60">{connecting ? "Opening GitHub…" : "Connect GitHub →"}</button>}
      </div>

      <form className="border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <div className="flex gap-2 rounded-xl border border-gold/30 bg-background p-2 focus-within:border-gold">
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void run(); } }} rows={2} placeholder="Ask the autonomous agent to edit this repo…" className="min-h-10 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted" />
          <button type="submit" disabled={!prompt.trim() || running} className="self-end rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50">{running ? "Running…" : "Run"}</button>
        </div>
      </form>
    </section>
  );
}

function StreamRow({ item }: { item: StreamItem }) {
  switch (item.kind) {
    case "narration":
      return (
        <article className="rounded-2xl border border-gold/30 bg-gold/5 p-3">
          <p className="text-[10px] uppercase tracking-wider text-gold">Plan</p>
          <p className="mt-1 text-sm text-foreground">{item.message}</p>
          {item.detail && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-background/60 p-2 text-[11px] text-purple-soft">{item.detail}</pre>}
        </article>
      );
    case "reasoning":
      return <div className="flex items-start gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs text-muted"><span className="mt-0.5 text-gold">⟳</span><span>{(item.message)}</span></div>;
    case "rejected":
      return <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">Review flagged: {item.reason}</div>;
    case "whitespace":
      return <div className="rounded-lg border border-gold/25 bg-gold/5 px-3 py-2 text-xs text-gold">{item.message}</div>;
    case "error":
      return <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">{item.message}</div>;
    case "deploying":
      return <div className="flex items-center gap-2 rounded-lg border border-gold/25 bg-gold/5 px-3 py-2 text-xs text-gold"><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gold border-t-transparent" />{item.message}</div>;
    case "deployed":
      return <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">🚀 Deployed — <a href={item.url} target="_blank" rel="noreferrer" className="underline hover:text-success">{item.url}</a></div>;
    case "edit":
      return <div className="rounded-lg border border-purple/30 bg-purple/10 px-3 py-2 text-xs text-purple-400">✏️ {item.files.length} file(s) applied to the IDE workspace — review before committing.</div>;
    case "done":
      return <div className="rounded-2xl border border-success/30 bg-success/10 p-3 text-sm text-success">{item.summary}</div>;
    default:
      return <div className="px-1 py-1 text-xs text-muted">{item.message}</div>;
  }
}

function SpinnerRow() {
  return <div className="flex items-center gap-2 px-1 py-1 text-xs text-muted"><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gold border-t-transparent" />Working through the pipeline…</div>;
}