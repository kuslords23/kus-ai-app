"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type QueueState = {
  status: "ONLINE" | "OFFLINE" | "CONNECTING";
  pendingItems: number;
  lastSync: string | null;
  total: number;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const models = [
  { id: "openrouter/auto", label: "OpenRouter Auto", tier: "Smart routing" },
  { id: "qwen/qwen3-coder:free", label: "Qwen 3 Coder", tier: "Free" },
  { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B", tier: "Free" },
  { id: "openai/gpt-oss-20b:free", label: "GPT-OSS 20B", tier: "Free" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron Ultra", tier: "Premium" },
];

const starterCode = `export function calculateRoyalScore(wins: number, goals: number) {
  const formBonus = wins * 3;
  return formBonus + goals;
}`;

const files = ["src/app/page.tsx", "src/lib/royal-score.ts", "src/components/MatchCard.tsx", "README.md"];

function statusStyle(status: QueueState["status"]) {
  if (status === "ONLINE") return "bg-success";
  if (status === "CONNECTING") return "bg-gold";
  return "bg-danger";
}

export function JyinxStudio() {
  const [activeModel, setActiveModel] = useState(models[0].id);
  const [selectedFile, setSelectedFile] = useState(files[0]);
  const [drawer, setDrawer] = useState<"files" | "inspector" | null>(null);
  const [code, setCode] = useState(starterCode);
  const [prompt, setPrompt] = useState("");
  const [queue, setQueue] = useState<QueueState>({
    status: "ONLINE",
    pendingItems: 0,
    lastSync: null,
    total: 0,
  });
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Jyinx is ready. Select a model, describe the change you want, and review the workspace before applying it.",
    },
  ]);

  const activeModelInfo = useMemo(
    () => models.find((model) => model.id === activeModel) ?? models[0],
    [activeModel]
  );

  useEffect(() => {
    let cancelled = false;
    const loadQueue = async () => {
      try {
        const response = await fetch("/api/jyinx/queue", { cache: "no-store" });
        if (!response.ok) throw new Error("Queue unavailable");
        const data = (await response.json()) as QueueState;
        if (!cancelled) setQueue(data);
      } catch {
        if (!cancelled) {
          setQueue((current) => ({ ...current, status: "OFFLINE" }));
        }
      }
    };

    void loadQueue();
    const interval = window.setInterval(() => void loadQueue(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const sendPrompt = () => {
    const text = prompt.trim();
    if (!text) return;

    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", content: text },
      {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: `Draft captured for ${activeModelInfo.label}. Connect an OpenRouter key through the server-side model gateway to generate and apply this change.`,
      },
    ]);
    setPrompt("");
  };

  const inspector = (
    <aside className="flex h-full min-h-0 flex-col overflow-y-auto border-l border-border bg-surface/60 p-4">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Inspector</p>
          <p className="mt-1 text-sm font-medium">Workspace diagnostics</p>
        </div>
        <button className="text-xs text-muted hover:text-gold lg:hidden" onClick={() => setDrawer(null)}>Close</button>
      </div>

      <section className="rounded-2xl border border-border bg-background/50 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Connection</p>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[10px] text-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${statusStyle(queue.status)}`} />
            {queue.status === "ONLINE" ? "Synced" : queue.status === "CONNECTING" ? "Syncing" : "Local only"}
          </span>
        </div>
        <dl className="mt-3 space-y-2 text-xs">
          <div className="flex justify-between text-muted"><dt>Queued requests</dt><dd className="text-foreground">{queue.pendingItems}</dd></div>
          <div className="flex justify-between text-muted"><dt>Tracked items</dt><dd className="text-foreground">{queue.total}</dd></div>
          <div className="flex justify-between text-muted"><dt>Last sync</dt><dd className="text-foreground">{queue.lastSync ? new Date(queue.lastSync).toLocaleTimeString() : "Not yet"}</dd></div>
        </dl>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-background/50 p-3">
        <p className="text-sm font-medium">Model controller</p>
        <select value={activeModel} onChange={(event) => setActiveModel(event.target.value)} className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold">
          {models.map((model) => <option key={model.id} value={model.id}>{model.label} · {model.tier}</option>)}
        </select>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full w-[28%] rounded-full bg-gold" /></div>
        <p className="mt-2 text-[11px] text-muted">Session token meter · 28% of local context budget</p>
      </section>

      <section className="mt-4 rounded-2xl border border-gold/25 bg-gold/5 p-3">
        <p className="text-xs font-medium text-gold">Offline-safe workspace</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">Changes and queue operations remain local until a connection is available.</p>
      </section>
    </aside>
  );

  const fileExplorer = (
    <aside className="flex h-full min-h-0 flex-col border-r border-border bg-surface/60 p-3">
      <div className="mb-4 flex items-center justify-between px-1">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Explorer</p><p className="mt-1 text-sm font-medium">Kus AI workspace</p></div>
        <button className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-gold">+</button>
      </div>
      <div className="space-y-1">
        {files.map((file) => <button key={file} onClick={() => setSelectedFile(file)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${selectedFile === file ? "bg-gold/10 text-gold" : "text-muted hover:bg-surface-hover hover:text-foreground"}`}><span className="text-gold/80">{file.endsWith(".md") ? "◇" : "▹"}</span>{file}</button>)}
      </div>
      <div className="mt-auto rounded-xl border border-border bg-background/50 p-3 text-[11px] text-muted"><p className="font-medium text-foreground">Git workspace</p><p className="mt-1">No uncommitted changes</p></div>
    </aside>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <div className="hidden w-64 shrink-0 lg:block">{fileExplorer}</div>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-border bg-background/90 px-3 py-3 backdrop-blur lg:px-5">
          <div className="flex items-center gap-2 min-w-0">
            <button className="rounded-lg border border-border p-2 text-muted hover:text-gold lg:hidden" onClick={() => setDrawer("files")} aria-label="Open files">☰</button>
            <Link href="/" className="hidden text-xs text-muted hover:text-gold sm:block">← Royal</Link>
            <div className="min-w-0"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-success shadow-[0_0_12px_rgba(74,222,128,0.9)]" /><h1 className="truncate text-sm font-semibold">Jyinx IDE</h1></div><p className="hidden text-[10px] text-muted sm:block">Developer workspace</p></div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <select value={activeModel} onChange={(event) => setActiveModel(event.target.value)} className="max-w-32 rounded-lg border border-border bg-surface px-2 py-2 text-xs outline-none focus:border-gold sm:max-w-56"><option value={activeModel}>{activeModelInfo.label}</option>{models.filter((model) => model.id !== activeModel).map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select>
            <button className="hidden rounded-lg border border-border px-3 py-2 text-xs text-muted hover:border-gold/40 hover:text-gold sm:block">New chat</button>
            <button className="rounded-lg border border-border p-2 text-muted hover:text-gold lg:hidden" onClick={() => setDrawer("inspector")} aria-label="Open inspector">◉</button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <section className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs"><div className="flex items-center gap-2"><span className="text-gold">●</span><span className="text-muted">{selectedFile}</span></div><span className="text-muted">TypeScript</span></div>
            <textarea value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} className="min-h-[180px] flex-1 resize-none bg-[#0d0917] p-4 font-mono text-xs leading-6 text-purple-soft outline-none md:text-sm" aria-label="Jyinx code editor" />
            <div className="border-t border-border bg-surface/40 px-4 py-2 text-[11px] text-muted"><span className="text-success">●</span> No diagnostics · Local workspace saved</div>
          </section>

          <section className="hidden w-[min(42%,440px)] shrink-0 flex-col border-l border-border xl:flex">
            <div className="border-b border-border px-4 py-3"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Composer</p></div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((message) => <article key={message.id} className={`rounded-2xl border p-3 text-sm leading-relaxed ${message.role === "user" ? "ml-8 border-gold/30 bg-gold/10" : "mr-3 border-border bg-surface"}`}><p className="mb-1 text-[10px] uppercase tracking-wider text-muted">{message.role === "user" ? "You" : "Jyinx"}</p><p>{message.content}</p></article>)}
              <div className="rounded-xl border border-success/20 bg-success/5 p-3 text-xs text-muted"><span className="font-medium text-success">Diff preview</span><pre className="mt-2 overflow-x-auto font-mono text-[11px]"><span className="text-success">+ const formBonus = wins * 3;</span>{"\n"}<span className="text-danger">- return wins + goals;</span></pre></div>
            </div>
            <div className="border-t border-border p-3"><div className="flex gap-2 rounded-xl border border-gold/30 bg-background p-2 focus-within:border-gold"><button className="px-1 text-lg text-muted hover:text-gold" aria-label="Attach context">+</button><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendPrompt(); } }} rows={1} placeholder="Ask Jyinx to change this workspace…" className="max-h-24 min-h-6 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted" /><button onClick={sendPrompt} className="rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-background">Send</button></div></div>
          </section>
        </div>

        <nav className="flex shrink-0 items-center justify-around border-t border-border bg-surface/95 px-2 py-2 xl:hidden">
          <Link href="/" className="rounded-lg px-3 py-1.5 text-xs text-muted">Royal</Link>
          <button onClick={() => setDrawer("files")} className="rounded-lg px-3 py-1.5 text-xs text-muted">Files</button>
          <span className="rounded-lg bg-gold/15 px-3 py-1.5 text-xs font-medium text-gold">Jyinx</span>
          <button onClick={() => setDrawer("inspector")} className="rounded-lg px-3 py-1.5 text-xs text-muted">Status</button>
        </nav>
      </main>
      <div className="hidden w-72 shrink-0 lg:block">{inspector}</div>
      {drawer && <div className="fixed inset-0 z-50 bg-black/60 lg:hidden" onClick={() => setDrawer(null)}><div className={`absolute top-0 bottom-0 w-[min(86vw,340px)] bg-surface shadow-2xl ${drawer === "files" ? "left-0" : "right-0"}`} onClick={(event) => event.stopPropagation()}>{drawer === "files" ? fileExplorer : inspector}</div></div>}
    </div>
  );
}
