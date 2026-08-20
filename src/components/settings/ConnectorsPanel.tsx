"use client";

/**
 * Connectors & Integrations Panel.
 *
 * A comprehensive, centralized management screen for external services in
 * Jyinx settings. Users view, toggle, and configure connectors (GitHub,
 * Supabase, Vercel, AWS, custom API keys) with live connection statuses,
 * sync options, and credential mapping.
 *
 * Distinct from ConnectorsHub (inline drawer) and ConnectorsWorkspace
 * (page at /jyinx/workspace) — this is the settings-dashboard panel.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface ConnectorEntry {
  id: string;
  name: string;
  icon: string;
  category: string;
  status: "connected" | "disconnected" | "error" | "pending";
  authType: "oauth" | "token" | "connection-string";
  lastSync?: string;
  scopeLabel?: string;
  bindings?: string[];
}

interface ConnectorCache {
  catalog?: ConnectorEntry[];
  statuses: Record<string, { status: string; message?: string }>;
}

const CATEGORIES = ["all", "version-control", "hosting", "database", "cache-search", "monitoring"] as const;
type CategoryFilter = typeof CATEGORIES[number];

async function fetchConnectors(): Promise<ConnectorCache | null> {
  try {
    const res = await fetch("/api/connectors", { credentials: "include" });
    if (!res.ok) return null;
    return (await res.json()) as ConnectorCache;
  } catch {
    return null;
  }
}

const FALLBACK: ConnectorEntry[] = [
  { id: "github", name: "GitHub", icon: "🐙", category: "version-control", status: "disconnected", authType: "oauth", scopeLabel: "repo, user" },
  { id: "gitlab", name: "GitLab", icon: "🦊", category: "version-control", status: "disconnected", authType: "oauth" },
  { id: "vercel", name: "Vercel", icon: "▲", category: "hosting", status: "disconnected", authType: "token", bindings: ["deploy", "env"] },
  { id: "netlify", name: "Netlify", icon: "🔷", category: "hosting", status: "disconnected", authType: "token" },
  { id: "supabase", name: "Supabase", icon: "⚡", category: "database", status: "disconnected", authType: "token", bindings: ["db", "auth", "storage"] },
  { id: "firebase", name: "Firebase", icon: "🔥", category: "database", status: "disconnected", authType: "token" },
  { id: "redis", name: "Redis", icon: "🔴", category: "cache-search", status: "disconnected", authType: "connection-string" },
  { id: "sentry", name: "Sentry", icon: "🛡️", category: "monitoring", status: "disconnected", authType: "token" },
];

export function ConnectorsPanel() {
  const [entries, setEntries] = useState<ConnectorEntry[]>(FALLBACK);
  const [statuses, setStatuses] = useState<Record<string, { status: string; message?: string }>>({});
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<ConnectorEntry | null>(null);
  const [credential, setCredential] = useState("");

  const sync = useCallback(async () => {
    const data = await fetchConnectors();
    if (data) {
      if (data.catalog) setEntries((prev) => mergeEntries(prev, data.catalog!));
      setStatuses(data.statuses ?? {});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void sync(), 0);
    return () => clearTimeout(t);
  }, [sync]);

  const filtered = useMemo(() => {
    return filter === "all" ? entries : entries.filter((e) => e.category === filter);
  }, [entries, filter]);

  const stats = useMemo(() => {
    let connected = 0;
    let errorCount = 0;
    for (const s of Object.values(statuses)) {
      if (s.status === "connected") connected++;
      if (s.status === "error") errorCount++;
    }
    return { connected, errorCount, total: entries.length };
  }, [statuses, entries]);

  async function handleConnect(e: ConnectorEntry) {
    if (e.authType === "oauth") {
      // Delegate to the connector-specific OAuth flow.
      setConnecting(e.id);
      try {
        const res = await fetch("/api/connectors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ op: "connect", connectorId: e.id, authType: "oauth" }),
        });
        const d = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
        if (d?.url) {
          window.location.assign(d.url);
          return;
        }
        if (d?.ok) {
          setStatuses((s) => ({ ...s, [e.id]: { status: "connected" } }));
          toast.success(`${e.name} connected`);
        } else {
          toast.error(d?.error ?? "Connection failed.");
        }
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "Connection failed.");
      } finally {
        setConnecting(null);
      }
    } else {
      setShowModal(e);
      setCredential("");
    }
  }

  async function handleTokenSubmit() {
    if (!showModal || !credential.trim()) return;
    setConnecting(showModal.id);
    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ op: "connect", connectorId: showModal.id, authType: showModal.authType, value: credential }),
      });
      const d = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !d?.ok) {
        toast.error(d?.error ?? "Could not save credential.");
        return;
      }
      setStatuses((s) => ({ ...s, [showModal.id]: { status: "connected" } }));
      toast.success(`${showModal.name} connected`);
      setShowModal(null);
      setCredential("");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Connection failed.");
    } finally {
      setConnecting(null);
    }
  }

  async function handleDisconnect(e: ConnectorEntry) {
    setConnecting(e.id);
    try {
      await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ op: "disconnect", connectorId: e.id }),
      });
      setStatuses((s) => ({ ...s, [e.id]: { status: "disconnected" } }));
      toast.success(`${e.name} disconnected`);
    } finally {
      setConnecting(null);
    }
  }

  function statusFor(e: ConnectorEntry): string {
    return statuses[e.id]?.status ?? e.status;
  }

  const statusBadge = (s: string) => {
    const styles: Record<string, string> = {
      connected: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
      disconnected: "bg-zinc-500/10 text-muted border-border",
      error: "bg-red-500/15 text-red-400 border-red-500/40",
      pending: "bg-gold/15 text-gold border-gold/40",
    };
    return `px-2 py-0.5 rounded-full text-[9px] border capitalize ${styles[s] ?? styles.disconnected}`;
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-border bg-background/40 px-3 py-2 text-center">
          <p className="text-sm font-semibold text-gold">{stats.connected}</p>
          <p className="text-[10px] text-muted">Connected</p>
        </div>
        <div className="rounded-xl border border-border bg-background/40 px-3 py-2 text-center">
          <p className="text-sm font-semibold">{stats.total}</p>
          <p className="text-[10px] text-muted">Available</p>
        </div>
        <div className="rounded-xl border border-border bg-background/40 px-3 py-2 text-center">
          <p className="text-sm font-semibold text-red-400">{stats.errorCount}</p>
          <p className="text-[10px] text-muted">Errors</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1 rounded-full text-[10px] border transition-colors ${
              filter === cat
                ? "border-gold/40 bg-gold/15 text-gold"
                : "border-border bg-background/40 text-muted hover:border-gold/25"
            }`}
          >
            {cat === "all" ? "All" : cat === "version-control" ? "Version Control" : cat === "hosting" ? "Hosting" : cat === "database" ? "Databases" : cat === "cache-search" ? "Cache/Search" : "Monitoring"}
          </button>
        ))}
        <button onClick={() => void sync()} className="ml-auto px-3 py-1 rounded-full text-[10px] border border-border text-muted hover:text-gold">
          ↻ Refresh
        </button>
      </div>

      {/* Connectors list */}
      {loading ? (
        <p className="text-center text-xs text-muted py-6">Loading connectors…</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-xs text-muted py-6">No connectors in this category.</p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((e) => {
            const st = statusFor(e);
            const busy = connecting === e.id;
            return (
              <div key={e.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-2.5">
                <span className="text-lg shrink-0">{e.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{e.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={statusBadge(st)}>{st}</span>
                    {e.scopeLabel && <span className="text-[9px] text-muted">{e.scopeLabel}</span>}
                  </div>
                  {e.bindings && (
                    <div className="flex gap-1 mt-1">
                      {e.bindings.map((b) => (
                        <span key={b} className="text-[8px] text-muted bg-background/60 px-1 rounded">{b}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {st === "connected" ? (
                    <button
                      onClick={() => void handleDisconnect(e)}
                      disabled={busy}
                      className="px-2.5 py-1 rounded-lg text-[10px] border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => void handleConnect(e)}
                      disabled={busy}
                      className="px-2.5 py-1 rounded-lg text-[10px] border border-gold/40 bg-gold/20 text-gold hover:bg-gold/30 disabled:opacity-40 transition-colors"
                    >
                      {busy ? "…" : "Connect"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Token Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" onClick={() => setShowModal(null)}>
          <div className="glass border border-border rounded-2xl p-4 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Connect {showModal.name}</h3>
              <button onClick={() => setShowModal(null)} className="text-muted text-sm">✕</button>
            </div>
            <label className="block">
              <span className="text-[10px] text-muted">{showModal.authType === "token" ? "API Token / Key" : "Connection String"}</span>
              <input
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                placeholder={showModal.authType === "token" ? "sk-…" : "postgresql://…"}
                className="mt-1 w-full px-3 py-2 rounded-xl bg-background/60 border border-border text-xs outline-none focus:border-gold/40"
              />
            </label>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowModal(null)} className="flex-1 py-2 rounded-lg border border-border text-xs text-muted">Cancel</button>
              <button onClick={() => void handleTokenSubmit()} disabled={!credential.trim()} className="flex-1 py-2 rounded-lg bg-gold/20 border border-gold/40 text-gold text-xs disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────

function mergeEntries(current: ConnectorEntry[], incoming: ConnectorEntry[]): ConnectorEntry[] {
  const map = new Map<string, ConnectorEntry>();
  for (const e of current) map.set(e.id, e);
  for (const e of incoming) map.set(e.id, { ...(map.get(e.id) ?? e), ...e });
  return [...map.values()];
}