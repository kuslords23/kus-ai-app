"use client";

import type { AgentTask } from "./types";

type Props = { task: AgentTask; onClose: () => void; onAction: (task: AgentTask) => void };

export function TaskDetail({ task, onClose, onAction }: Props) {
  return <div className="fixed inset-0 z-[65] flex items-end bg-black/70 sm:items-center sm:justify-center" onClick={onClose}><section className="max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 sm:max-w-lg sm:rounded-3xl" onClick={(event) => event.stopPropagation()}><header className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.16em] text-muted">Task detail</p><h2 className="mt-1 text-lg font-semibold">{task.title}</h2><p className="mt-1 text-xs text-gold">⌘ {task.branch} · +{task.additions} -{task.deletions}</p></div><button type="button" onClick={onClose} className="rounded-lg border border-border px-2 py-1 text-xs text-muted">Close</button></header><section className="mt-5"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted">Agent activity</p><div className="space-y-3">{task.logs.map((log, index) => <div key={`${task.id}-${index}`} className="flex gap-3 text-sm"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gold" /><p className="text-muted">{log}</p></div>)}</div></section><button type="button" onClick={() => onAction(task)} className="mt-6 w-full rounded-2xl bg-gold px-4 py-3 text-sm font-semibold text-background">{task.status === "review" ? "Review changes" : "Build workspace"}</button></section></div>;
}
