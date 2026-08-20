"use client";

import { useMemo, useState } from "react";
import { useJyinxModelStore } from "@/lib/jyinx/model-store";
import { providerFromModel, type HierarchicalSelection } from "@/lib/models/catalog";
import { HierarchicalModelSelector } from "@/components/models/HierarchicalModelSelector";
import { JyinxGitHubRepos, type JyinxRepository } from "@/components/jyinx/JyinxGitHubRepos";
import { ConnectorsHub } from "@/components/settings/ConnectorsHub";
import { BillingModal } from "@/components/settings/BillingModal";
import { ReportModal } from "@/components/legal/ReportModal";
import { DeleteAccountModal } from "@/components/legal/DeleteAccountModal";

type Props = {
  open: boolean;
  onClose: () => void;
  activeModel: string;
  onModelChange: (model: string) => void;
  /** Optional GitHub repository control panel (workspace picker). */
  selectedRepositoryId?: number | null;
  onRepositoryChange?: (repository: JyinxRepository | null) => void;
  onRepositoriesLoaded?: (repositories: JyinxRepository[]) => void;
  redirectPath?: string;
};

function readFlag(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const value = localStorage.getItem(key);
  return value === null ? fallback : value !== "false";
}

export function JyinxSettingsPanel({
  open,
  onClose,
  activeModel,
  onModelChange,
  selectedRepositoryId,
  onRepositoryChange,
  onRepositoriesLoaded,
  redirectPath = "/jyinx",
}: Props) {
  const { setHistoryEnabled: setSharedHistoryEnabled } = useJyinxModelStore();
const [autoOpenChat, setAutoOpenChat] = useState<boolean>(() => readFlag("jyinx:auto-open-chat", true));
const [historyEnabled, setHistoryEnabledState] = useState<boolean>(() => readFlag("jyinx:history-enabled", true));
  const [cacheState, setCacheState] = useState<"idle" | "clearing" | "done" | "error">("idle");
  const [cacheMessage, setCacheMessage] = useState("");
  const [showConnectors, setShowConnectors] = useState(false);
  const [showBilling, setShowBilling] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const selection: HierarchicalSelection = useMemo(() => {
    const p = providerFromModel(activeModel);
    const m = p.models.find((x) => x.id === activeModel) ?? p.models[0];
    return {
      provider: p.id,
      providerLabel: p.label,
      model: m?.id ?? activeModel,
      modelLabel: m?.label ?? activeModel,
      agent: "auto",
      agentName: "Auto",
    };
  }, [activeModel]);

  if (!open) return null;

  const toggle = (key: string, value: boolean, setter: (value: boolean) => void) => {
    setter(value); localStorage.setItem(key, String(value)); if (key === "jyinx:history-enabled") setSharedHistoryEnabled(value);
  };

  const clearCache = async (action: "refusals" | "all") => {
    if (cacheState === "clearing") return;
    setCacheState("clearing");
    setCacheMessage("");
    try {
      const response = await fetch("/api/jyinx/cache", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) , cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; removed?: number; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Cache cleanup failed.");
      setCacheState("done");
      setCacheMessage(`Removed ${data.removed ?? 0} stale cached response(s).`);
    } catch (cause) {
      setCacheState("error");
      setCacheMessage(cause instanceof Error ? cause.message : "Cache cleanup failed.");
    }
  };
  return <div className="fixed inset-0 z-[60] bg-black/60" onClick={onClose}><section className="absolute right-0 top-0 flex h-full w-[min(92vw,390px)] flex-col border-l border-border bg-surface p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}><header className="flex items-center justify-between border-b border-border pb-3"><div><p className="text-sm font-semibold">Jyinx settings</p><p className="mt-1 text-xs text-muted">Workspace and connection preferences</p></div><button type="button" onClick={onClose} className="rounded-lg border border-border px-2 py-1 text-xs text-muted">Close</button></header><div className="space-y-4 overflow-y-auto py-4"><section className="rounded-xl border border-border bg-background/50 p-3"><p className="text-sm font-medium">Model routing</p><p className="mt-1 text-xs text-muted">Active model: {selection.modelLabel}</p><div className="mt-3"><HierarchicalModelSelector value={selection} onChange={(sel) => onModelChange(sel.model)} components={{ optionMeta: (entry) => `${entry.contextWindow.toLocaleString()} ctx` }} /></div></section><section className="rounded-xl border border-border bg-background/50 p-3"><p className="text-sm font-medium">Workspace repository</p>{onRepositoryChange ? <JyinxGitHubRepos redirectPath={redirectPath} selectedRepositoryId={selectedRepositoryId ?? undefined} onSelectRepository={onRepositoryChange} onRepositoriesLoaded={onRepositoriesLoaded} /> : <p className="mt-1 text-xs text-muted">Sign in to GitHub in the workspace to choose a repository.</p>}</section><div className="grid grid-cols-2 gap-2"><a href="/jyinx/workspace" className="rounded-xl border border-border bg-background/40 px-3 py-2.5 text-xs text-muted hover:border-gold/40 hover:text-gold">🔌 Connectors workspace</a><a href="/jyinx/billing" className="rounded-xl border border-border bg-background/40 px-3 py-2.5 text-xs text-muted hover:border-gold/40 hover:text-gold">💳 Billing dashboard</a></div><button type="button" onClick={() => setShowBilling(true)} className="flex w-full items-center justify-between rounded-xl border border-border bg-background/40 px-3 py-2.5 text-sm hover:border-gold/40"><span className="flex items-center gap-2">💳 Credits &amp; Billing</span><span className="text-[11px] text-muted">Balance &amp; top-up</span></button><section className="rounded-xl border border-gold/25 bg-gold/5 p-3"><button type="button" onClick={() => setShowConnectors((v) => !v)} className="flex w-full items-center justify-between text-sm"><span className="flex items-center gap-2 font-medium text-gold">🔌 Connectors &amp; Services</span><span className="text-xs text-muted">{showConnectors ? "Hide" : "Manage"}</span></button><p className="mt-1 text-left text-xs text-muted">Link GitHub, Vercel, Supabase, and 40+ hosting, database, cache and monitoring tools. Connected tools can be invoked by Jyinx agents.</p>{showConnectors && <div className="mt-3 max-h-[55vh] overflow-y-auto rounded-xl border border-border bg-background/40"><ConnectorsHub /></div>}</section><section className="rounded-xl border border-border bg-background/50 p-3"><label className="flex items-center justify-between gap-4 text-sm"><span><span className="block font-medium">Persist chat history</span><span className="mt-1 block text-xs text-muted">Store Jyinx conversations locally on this device.</span></span><input type="checkbox" checked={historyEnabled} onChange={(event) => toggle("jyinx:history-enabled", event.target.checked, setHistoryEnabledState)} /></label></section><section className="rounded-xl border border-border bg-background/50 p-3"><label className="flex items-center justify-between gap-4 text-sm"><span><span className="block font-medium">Open agent chat</span><span className="mt-1 block text-xs text-muted">Open the chat panel when entering Jyinx.</span></span><input type="checkbox" checked={autoOpenChat} onChange={(event) => toggle("jyinx:auto-open-chat", event.target.checked, setAutoOpenChat)} /></label></section><section className="rounded-xl border border-border bg-background/50 p-3"><p className="text-sm font-medium">Cached responses</p><p className="mt-1 text-xs text-muted">Jyinx caches similar prompts to answer at $0 cost. Clear stale entries if a response seems outdated.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void clearCache("refusals")} disabled={cacheState === "clearing"} className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs font-medium text-gold hover:bg-gold/20 disabled:opacity-60">Clear stale refusals</button><button type="button" onClick={() => void clearCache("all")} disabled={cacheState === "clearing"} className="rounded-lg border border-border px-3 py-2 text-xs text-muted hover:text-foreground disabled:opacity-60">Clear all cache</button></div>{cacheMessage && <p className={`mt-2 text-xs ${cacheState === "error" ? "text-danger" : "text-gold"}`}>{cacheMessage}</p>}</section><section className="rounded-xl border border-gold/25 bg-gold/5 p-3 text-xs text-muted"><p className="font-medium text-gold">Connection controls</p><p className="mt-1">GitHub access uses your authorized connection with the <code className="text-gold">repo</code> scope. If a commit is blocked, Jyinx will prompt you to reconnect GitHub.</p></section><section className="rounded-xl border border-border bg-background/50 p-3"><p className="text-sm font-medium text-muted">Legal &amp; Safety</p><div className="mt-3 space-y-2"><a href="/privacy" target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2 text-xs text-muted hover:border-gold/40 hover:text-foreground"><span>Privacy Policy</span><svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg></a><a href="/terms" target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2 text-xs text-muted hover:border-gold/40 hover:text-foreground"><span>Terms of Service</span><svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg></a><button type="button" onClick={() => setShowReport(true)} className="flex w-full items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2 text-xs text-muted hover:border-gold/40 hover:text-foreground"><span>Report Content</span><span className="text-[10px]">Flag unsafe AI output</span></button><button type="button" onClick={() => setShowDelete(true)} className="flex w-full items-center justify-between rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400 hover:border-red-500/40"><span>Delete Account &amp; Data</span><span className="text-[10px]">Irreversible</span></button></div></section></div></section><BillingModal open={showBilling} onClose={() => setShowBilling(false)} /><ReportModal open={showReport} onClose={() => setShowReport(false)} /><DeleteAccountModal open={showDelete} onClose={() => setShowDelete(false)} /></div>;
}
