"use client";

import type { AgentTask, MobileFilters } from "./types";
import Link from "next/link";

type Props = { open: boolean; filters: MobileFilters; onChange: (filters: MobileFilters) => void; onClose: () => void };

const statuses: AgentTask["status"][] = ["working", "attention", "review", "merged", "draft"];

export function CustomizeDrawer({ open, filters, onChange, onClose }: Props) {
  if (!open) return null;
  const update = (patch: Partial<MobileFilters>) => onChange({ ...filters, ...patch });
  const toggleStatus = (status: AgentTask["status"]) => update({ statuses: filters.statuses.includes(status) ? filters.statuses.filter((value) => value !== status) : [...filters.statuses, status] });
  return (
    <div className="fixed inset-0 z-[70] bg-black/60" onClick={onClose}>
      <aside className="absolute right-0 top-0 h-full w-[min(92vw,380px)] overflow-y-auto border-l border-border bg-surface p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <p className="text-lg font-semibold">Menu</p>
            <p className="mt-1 text-xs text-muted">Navigate and customize</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted">Done</button>
        </header>

        {/* Navigation links */}
        <section className="space-y-2 border-b border-border py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted mb-2">Navigate</p>
          <Link href="/jyinx/search" onClick={onClose} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-2.5 text-xs text-muted hover:border-gold/40 hover:text-gold transition-colors">🔎 Code Search</Link>
          <Link href="/jyinx/code-library" onClick={onClose} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-2.5 text-xs text-muted hover:border-gold/40 hover:text-gold transition-colors">📦 Code Library</Link>
          <Link href="/jyinx/peer-chat" onClick={onClose} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-2.5 text-xs text-muted hover:border-gold/40 hover:text-gold transition-colors">👥 Peer Chat</Link>
          <Link href="/jyinx/notebooks" onClick={onClose} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-2.5 text-xs text-muted hover:border-gold/40 hover:text-gold transition-colors">📓 Notebooks</Link>
          <Link href="/jyinx/billing" onClick={onClose} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-2.5 text-xs text-muted hover:border-gold/40 hover:text-gold transition-colors">💳 Billing</Link>
          <Link href="/jyinx/marketplace" onClick={onClose} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-2.5 text-xs text-muted hover:border-gold/40 hover:text-gold transition-colors">🏪 Marketplace</Link>
        </section>

        {/* Filter controls */}
        <section className="space-y-3 border-b border-border py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Group by</p>
          <div className="grid grid-cols-3 gap-2">{(["category", "status", "date"] as const).map((value) => (
            <button type="button" key={value} onClick={() => update({ groupBy: value })} className={`rounded-xl border px-2 py-2 text-xs capitalize ${filters.groupBy === value ? "border-gold/50 bg-gold/10 text-gold" : "border-border text-muted"}`}>{value}</button>
          ))}</div>
        </section>

        <section className="space-y-3 border-b border-border py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Status</p>
          <div className="flex flex-wrap gap-2">{statuses.map((status) => (
            <button type="button" key={status} onClick={() => toggleStatus(status)} className={`rounded-full border px-3 py-1.5 text-xs capitalize ${filters.statuses.includes(status) ? "border-purple/60 bg-purple/15 text-purple-soft" : "border-border text-muted"}`}>{status}</button>
          ))}</div>
          <select value={filters.branch} onChange={(event) => update({ branch: event.target.value as MobileFilters["branch"] })} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none">
            <option value="all">All branch states</option>
            <option value="clean">Clean</option>
            <option value="ahead">Ahead of base</option>
            <option value="behind">Behind base</option>
          </select>
        </section>
      </aside>
    </div>
  );
}
