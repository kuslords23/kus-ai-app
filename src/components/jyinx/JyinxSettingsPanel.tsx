"use client";

import { useEffect, useMemo, useState } from "react";
import { useJyinxModelStore } from "@/lib/jyinx/model-store";
import { providerFromModel, type HierarchicalSelection } from "@/lib/models/catalog";
import { HierarchicalModelSelector } from "@/components/models/HierarchicalModelSelector";
import { JyinxGitHubRepos, type JyinxRepository } from "@/components/jyinx/JyinxGitHubRepos";

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
  const [autoOpenChat, setAutoOpenChat] = useState(true);
  const [historyEnabled, setHistoryEnabledState] = useState(true);

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

  useEffect(() => {
    setAutoOpenChat(localStorage.getItem("jyinx:auto-open-chat") !== "false");
    setHistoryEnabledState(localStorage.getItem("jyinx:history-enabled") !== "false");
  }, [open]);
  if (!open) return null;

  const toggle = (key: string, value: boolean, setter: (value: boolean) => void) => {
    setter(value); localStorage.setItem(key, String(value)); if (key === "jyinx:history-enabled") setSharedHistoryEnabled(value);
  };
  return <div className="fixed inset-0 z-[60] bg-black/60" onClick={onClose}><section className="absolute right-0 top-0 flex h-full w-[min(92vw,390px)] flex-col border-l border-border bg-surface p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}><header className="flex items-center justify-between border-b border-border pb-3"><div><p className="text-sm font-semibold">Jyinx settings</p><p className="mt-1 text-xs text-muted">Workspace and connection preferences</p></div><button type="button" onClick={onClose} className="rounded-lg border border-border px-2 py-1 text-xs text-muted">Close</button></header><div className="space-y-4 overflow-y-auto py-4"><section className="rounded-xl border border-border bg-background/50 p-3"><p className="text-sm font-medium">Model routing</p><p className="mt-1 text-xs text-muted">Active model: {selection.modelLabel}</p><div className="mt-3"><HierarchicalModelSelector value={selection} onChange={(sel) => onModelChange(sel.model)} components={{ optionMeta: (entry) => `${entry.contextWindow.toLocaleString()} ctx` }} /></div></section><section className="rounded-xl border border-border bg-background/50 p-3"><p className="text-sm font-medium">Workspace repository</p>{onRepositoryChange ? <JyinxGitHubRepos redirectPath={redirectPath} selectedRepositoryId={selectedRepositoryId ?? undefined} onSelectRepository={onRepositoryChange} onRepositoriesLoaded={onRepositoriesLoaded} /> : <p className="mt-1 text-xs text-muted">Sign in to GitHub in the workspace to choose a repository.</p>}</section><section className="rounded-xl border border-border bg-background/50 p-3"><label className="flex items-center justify-between gap-4 text-sm"><span><span className="block font-medium">Persist chat history</span><span className="mt-1 block text-xs text-muted">Store Jyinx conversations locally on this device.</span></span><input type="checkbox" checked={historyEnabled} onChange={(event) => toggle("jyinx:history-enabled", event.target.checked, setHistoryEnabledState)} /></label></section><section className="rounded-xl border border-border bg-background/50 p-3"><label className="flex items-center justify-between gap-4 text-sm"><span><span className="block font-medium">Open agent chat</span><span className="mt-1 block text-xs text-muted">Open the chat panel when entering Jyinx.</span></span><input type="checkbox" checked={autoOpenChat} onChange={(event) => toggle("jyinx:auto-open-chat", event.target.checked, setAutoOpenChat)} /></label></section><section className="rounded-xl border border-gold/25 bg-gold/5 p-3 text-xs text-muted"><p className="font-medium text-gold">Connection controls</p><p className="mt-1">GitHub access uses your authorized connection. Jyinx writes only to a review branch and creates a pull request; it does not push directly to main.</p></section></div></section></div>;
}
