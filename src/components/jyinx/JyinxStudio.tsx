"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { JyinxChatPanel } from "@/components/jyinx/JyinxChatPanel";
import { DEFAULT_JYINX_MODEL, JYINX_MODELS } from "@/lib/jyinx/model-registry";

type QueueState = { status: "ONLINE" | "OFFLINE" | "CONNECTING"; pendingItems: number; lastSync: string | null; total: number };

const starterCode = `export function calculateRoyalScore(wins: number, goals: number) {
  const formBonus = wins * 3;
  return formBonus + goals;
}`;
const files = ["src/app/page.tsx", "src/lib/royal-score.ts", "src/components/MatchCard.tsx", "README.md"];

function statusStyle(status: QueueState["status"]) {
  return status === "ONLINE" ? "bg-success" : status === "CONNECTING" ? "bg-gold" : "bg-danger";
}

export function JyinxStudio() {
  const [activeModel, setActiveModel] = useState(DEFAULT_JYINX_MODEL.id);
  const [selectedFile, setSelectedFile] = useState(files[0]);
  const [drawer, setDrawer] = useState<"files" | "inspector" | "chat" | null>(null);
  const [code, setCode] = useState(starterCode);
  const [queue, setQueue] = useState<QueueState>({ status: "ONLINE", pendingItems: 0, lastSync: null, total: 0 });
  const activeModelInfo = useMemo(() => JYINX_MODELS.find((model) => model.id === activeModel) ?? DEFAULT_JYINX_MODEL, [activeModel]);

  useEffect(() => {
    let cancelled = false;
    const loadQueue = async () => {
      try {
        const response = await fetch("/api/jyinx/queue", { cache: "no-store" });
        if (!response.ok) throw new Error("Queue unavailable");
        const data = (await response.json()) as QueueState;
        if (!cancelled) setQueue(data);
      } catch {
        if (!cancelled) setQueue((current) => ({ ...current, status: "OFFLINE" }));
      }
    };
    void loadQueue();
    const interval = window.setInterval(() => void loadQueue(), 15_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, []);

  const modelSelect = (
    <select value={activeModel} onChange={(event) => setActiveModel(event.target.value)} className="rounded-lg border border-border bg-surface px-2 py-2 text-xs outline-none focus:border-gold">
      {JYINX_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label} · {model.tier}</option>)}
    </select>
  );

  const inspector = (
    <aside className="flex h-full min-h-0 flex-col overflow-y-auto border-l border-border bg-surface/60 p-4">
      <div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Inspector</p><p className="mt-1 text-sm font-medium">Workspace diagnostics</p></div><button className="text-xs text-muted hover:text-gold lg:hidden" onClick={() => setDrawer(null)}>Close</button></div>
      <section className="rounded-2xl border border-border bg-background/50 p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">Connection</p><span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[10px] text-muted"><span className={`h-1.5 w-1.5 rounded-full ${statusStyle(queue.status)}`} />{queue.status === "ONLINE" ? "Synced" : queue.status === "CONNECTING" ? "Syncing" : "Local only"}</span></div><dl className="mt-3 space-y-2 text-xs"><div className="flex justify-between text-muted"><dt>Queued requests</dt><dd className="text-foreground">{queue.pendingItems}</dd></div><div className="flex justify-between text-muted"><dt>Tracked items</dt><dd className="text-foreground">{queue.total}</dd></div><div className="flex justify-between text-muted"><dt>Last sync</dt><dd className="text-foreground">{queue.lastSync ? new Date(queue.lastSync).toLocaleTimeString() : "Not yet"}</dd></div></dl></section>
      <section className="mt-4 rounded-2xl border border-border bg-background/50 p-3"><p className="text-sm font-medium">Model controller</p><div className="mt-3">{modelSelect}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full w-[28%] rounded-full bg-gold" /></div><p className="mt-2 text-[11px] text-muted">{activeModelInfo.contextWindow.toLocaleString()} token context · session estimate 28%</p></section>
      <section className="mt-4 rounded-2xl border border-gold/25 bg-gold/5 p-3"><p className="text-xs font-medium text-gold">Offline-safe workspace</p><p className="mt-1 text-[11px] leading-relaxed text-muted">Changes and queue operations remain local until a connection is available.</p></section>
    </aside>
  );

  const fileExplorer = (
    <aside className="flex h-full min-h-0 flex-col border-r border-border bg-surface/60 p-3"><div className="mb-4 flex items-center justify-between px-1"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Explorer</p><p className="mt-1 text-sm font-medium">Kus AI workspace</p></div><button className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-gold">+</button></div><div className="space-y-1">{files.map((file) => <button key={file} onClick={() => setSelectedFile(file)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${selectedFile === file ? "bg-gold/10 text-gold" : "text-muted hover:bg-surface-hover hover:text-foreground"}`}><span className="text-gold/80">{file.endsWith(".md") ? "◇" : "▹"}</span>{file}</button>)}</div><div className="mt-auto rounded-xl border border-border bg-background/50 p-3 text-[11px] text-muted"><p className="font-medium text-foreground">Git workspace</p><p className="mt-1">No uncommitted changes</p></div></aside>
  );

  return <div className="flex h-dvh overflow-hidden bg-background text-foreground">
    <div className="hidden w-64 shrink-0 lg:block">{fileExplorer}</div>
    <main className="flex min-w-0 flex-1 flex-col"><header className="flex shrink-0 items-center gap-2 border-b border-border bg-background/90 px-3 py-3 backdrop-blur lg:px-5"><div className="flex min-w-0 items-center gap-2"><button className="rounded-lg border border-border p-2 text-muted hover:text-gold lg:hidden" onClick={() => setDrawer("files")} aria-label="Open files">☰</button><Link href="/" className="hidden text-xs text-muted hover:text-gold sm:block">← Royal</Link><div className="min-w-0"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-success shadow-[0_0_12px_rgba(74,222,128,0.9)]" /><h1 className="truncate text-sm font-semibold">Jyinx IDE</h1></div><p className="hidden text-[10px] text-muted sm:block">Developer workspace</p></div></div><div className="ml-auto flex items-center gap-2"><div className="hidden sm:block">{modelSelect}</div><button onClick={() => setDrawer("chat")} className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs font-medium text-gold hover:bg-gold/20">Agent chat</button><button className="rounded-lg border border-border p-2 text-muted hover:text-gold lg:hidden" onClick={() => setDrawer("inspector")} aria-label="Open inspector">◉</button></div></header>
      <div className="flex min-h-0 flex-1"><section className="flex min-w-0 flex-1 flex-col"><div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs"><div className="flex items-center gap-2"><span className="text-gold">●</span><span className="text-muted">{selectedFile}</span></div><span className="text-muted">TypeScript</span></div><textarea value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} className="min-h-[180px] flex-1 resize-none bg-[#0d0917] p-4 font-mono text-xs leading-6 text-purple-soft outline-none md:text-sm" aria-label="Jyinx code editor" /><div className="border-t border-border bg-surface/40 px-4 py-2 text-[11px] text-muted"><span className="text-success">●</span> No diagnostics · Local workspace saved</div></section><div className="hidden w-[min(42%,440px)] shrink-0 border-l border-border xl:block"><JyinxChatPanel open onClose={() => undefined} model={activeModelInfo} code={code} file={selectedFile} /></div></div>
      <nav className="flex shrink-0 items-center justify-around border-t border-border bg-surface/95 px-2 py-2 xl:hidden"><Link href="/" className="rounded-lg px-3 py-1.5 text-xs text-muted">Royal</Link><button onClick={() => setDrawer("files")} className="rounded-lg px-3 py-1.5 text-xs text-muted">Files</button><button onClick={() => setDrawer("chat")} className="rounded-lg bg-gold/15 px-3 py-1.5 text-xs font-medium text-gold">Chat</button><button onClick={() => setDrawer("inspector")} className="rounded-lg px-3 py-1.5 text-xs text-muted">Status</button></nav></main>
    <div className="hidden w-72 shrink-0 lg:block">{inspector}</div>
    {drawer && <div className="fixed inset-0 z-50 bg-black/60 lg:hidden" onClick={() => setDrawer(null)}><div className={`absolute top-0 bottom-0 w-[min(92vw,420px)] bg-surface shadow-2xl ${drawer === "files" ? "left-0" : "right-0"}`} onClick={(event) => event.stopPropagation()}>{drawer === "files" ? fileExplorer : drawer === "inspector" ? inspector : <JyinxChatPanel open onClose={() => setDrawer(null)} model={activeModelInfo} code={code} file={selectedFile} />}</div></div>}
  </div>;
}
