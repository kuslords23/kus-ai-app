"use client";

import type { Workspace } from "./types";

type Props = {
  workspaces: Workspace[];
  activeId: string;
  onSelect: (workspace: Workspace) => void;
  onAdd: () => void;
  onOpenIde: () => void;
};

export function WorkspaceDirectory({ workspaces, activeId, onSelect, onAdd, onOpenIde }: Props) {
  return <section className="mt-6"><div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Workspaces</p><p className="mt-1 text-xs text-muted">Connected project directories</p></div><button type="button" onClick={onAdd} className="rounded-xl border border-gold/35 bg-gold/10 px-3 py-2 text-xs font-medium text-gold">+ Add</button></div><button type="button" onClick={onOpenIde} className="mb-3 flex w-full items-center justify-between rounded-2xl border border-purple/35 bg-purple/10 px-4 py-3 text-left"><span><span className="block text-sm font-medium text-purple-soft">Open full Jyinx IDE</span><span className="mt-1 block text-[11px] text-muted">Editor, agent chat, repo files, and pull requests</span></span><span className="text-purple-soft">›</span></button><div className="space-y-2">{workspaces.map((workspace) => <button type="button" key={workspace.id} onClick={() => onSelect(workspace)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${activeId === workspace.id ? "border-gold/45 bg-gold/10" : "border-border bg-surface/60 hover:border-gold/25"}`}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple/15 text-purple-soft">⌘</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{workspace.name}</span><span className="mt-1 block truncate text-[11px] text-muted">{workspace.branch} · {workspace.source === "github" ? "GitHub" : "Local"}</span></span><span className="text-muted">›</span></button>)}</div></section>;
}
