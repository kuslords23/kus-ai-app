"use client";

/**
 * Connectors Hub — categorized dashboard for linking external tools to Jyinx.
 *
 * Tabbed by category (Version Control / Hosting / Databases / Cache & Search /
 * Monitoring), listing 10+ mainstream tools per section with live status badges
 * (Connected / Disconnected / Error), quick-connect modals (token, OAuth,
 * connection-string), and a workspace-binding toggle. Auth relies on the
 * Supabase session cookie (server-side); client calls use `credentials: include`.
 */

import { useEffect, useState } from "react";
import type { ConnectorCategory, ConnectorSpec } from "@/server/connectors/types";
import { allSpecs } from "@/server/connectors/types";

type Status = "connected" | "disconnected" | "error";

interface ConnectorView {
  id: string;
  name: string;
  icon: string;
  category: ConnectorCategory;
  description: string;
  authType: "oauth" | "token" | "connection-string";
  bindsApp?: boolean;
}

interface HubResponse {
  catalog?: Record<ConnectorCategory, ConnectorSpec[]>;
  statuses: Record<string, { status: Status; message?: string }>;
}

const CATEGORIES: Array<{ id: ConnectorCategory; label: string }> = [
  { id: "version-control", label: "Version Control" },
  { id: "hosting", label: "Hosting / Cloud" },
  { id: "database", label: "Databases / BaaS" },
  { id: "cache-search", label: "Cache / Search" },
  { id: "monitoring", label: "Monitoring / Testing" },
];

const STATUS_STYLE: Record<Status, string> = {
  connected: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  disconnected: "bg-zinc-500/10 text-muted border-border",
  error: "bg-red-500/15 text-red-400 border-red-500/40",
};

// Baseline catalog from the bundled registry — always available so tools render
// even when the /api/connectors status call is unavailable or unauthenticated.
const LOCAL_CATALOG: Record<ConnectorCategory, ConnectorView[]> = (() => {
  const built: Record<ConnectorCategory, ConnectorView[]> = {
    "version-control": [],
    hosting: [],
    database: [],
    "cache-search": [],
    monitoring: [],
  };
  for (const spec of allSpecs()) {
    built[spec.category].push({
      id: spec.id,
      name: spec.name,
      icon: spec.icon,
      category: spec.category,
      description: spec.description,
      authType: spec.authType,
      bindsApp: spec.bindsApp,
    });
  }
  return built;
})();

export function ConnectorsHub({ onClose }: { onClose?: () => void }) {
  const [catalog, setCatalog] = useState<Record<ConnectorCategory, ConnectorView[]>>(LOCAL_CATALOG);
  const [statuses, setStatuses] = useState<Record<string, { status: Status; message?: string }>>({});
  const [active, setActive] = useState<ConnectorCategory>("version-control");
  const [loading, setLoading] = useState(true);
  const [bindApp, setBindApp] = useState(false);
  const [connectTarget, setConnectTarget] = useState<ConnectorView | null>(null);
  const [credValue, setCredValue] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/connectors", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as HubResponse;
      // Merge server spec catalog(s) over the local baseline so every category stays populated.
      if (data.catalog) {
        setCatalog((current) => {
          const next: Record<ConnectorCategory, ConnectorView[]> = {
            "version-control": [...current["version-control"]],
            hosting: [...current.hosting],
            database: [...current.database],
            "cache-search": [...current["cache-search"]],
            monitoring: [...current.monitoring],
          };
          for (const [category, specs] of Object.entries(data.catalog!) as Array<[ConnectorCategory, ConnectorSpec[]]>) {
            if (!next[category]) continue;
            const seen = new Set(next[category].map((v) => v.id));
            for (const spec of specs) {
              if (seen.has(spec.id)) continue;
              next[category].push({
                id: spec.id,
                name: spec.name,
                icon: spec.icon,
                category: spec.category,
                description: spec.description,
                authType: spec.authType,
                bindsApp: spec.bindsApp,
              });
            }
          }
          return next;
        });
      }
      setStatuses(data.statuses ?? {});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    return () => {
      /* noop */
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const list = catalog[active] ?? [];

  async function connect() {
    if (!connectTarget) return;
    if (!credValue) {
      setToast("Enter the credential first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          op: "connect",
          connectorId: connectTarget.id,
          authType: connectTarget.authType,
          value: credValue,
          endpoint: connectTarget.id === "supabase" || connectTarget.authType === "connection-string" ? endpoint || undefined : undefined,
          boundApp: bindApp ? "auto" : undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setToast(data?.error ?? "Could not connect.");
        return;
      }
      setToast(`${connectTarget.name} connected.`);
      await refresh();
    } catch (cause) {
      setToast(cause instanceof Error ? cause.message : "Connection failed.");
    } finally {
      setBusy(false);
      setConnectTarget(null);
      setCredValue("");
      setEndpoint("");
    }
  }

  async function disconnect(connector: ConnectorView) {
    setBusy(true);
    try {
      await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ op: "disconnect", connectorId: connector.id }),
      });
      setToast(`${connector.name} disconnected.`);
      setStatuses((prev) => ({ ...prev, [connector.id]: { status: "disconnected" } }));
    } finally {
      setBusy(false);
    }
  }

  const entryCount = Object.values(catalog).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <h2 className="font-semibold text-gold">Connectors</h2>
        <span className="text-[10px] text-muted">{entryCount} tools</span>
        <label className="ml-auto flex items-center gap-2 text-[11px] text-muted">
          <span>Bind to workspace</span>
          <button
            onClick={() => setBindApp((v) => !v)}
            aria-label="Toggle workspace binding"
            className={`w-9 h-5 rounded-full border relative transition-colors ${bindApp ? "bg-gold/40 border-gold" : "bg-background/40 border-border"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${bindApp ? "left-4 bg-gold" : "left-0.5 bg-muted"}`} />
          </button>
        </label>
        {onClose && (
          <button onClick={onClose} className="text-sm text-muted" aria-label="Close">
            ✕
          </button>
        )}
      </div>

      <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setActive(c.id)}
            className={`px-3 py-1.5 rounded-full text-[11px] whitespace-nowrap border transition-colors ${
              active === c.id ? "border-gold bg-gold/15 text-gold" : "border-border text-muted"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-28 space-y-2">
        {loading && <p className="text-xs text-muted text-center py-8">Loading connectors…</p>}
        {!loading && list.length === 0 && <p className="text-xs text-muted text-center py-8">No tools in this category.</p>}
        {list.map((c) => {
          const st = statuses[c.id]?.status ?? "disconnected";
          return (
            <div key={c.id} className="flex items-center gap-3 p-3 rounded-2xl border border-border bg-background/50">
              <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center text-lg">{c.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] border capitalize ${STATUS_STYLE[st]}`}>{st}</span>
                </div>
                <p className="text-[11px] text-muted truncate">{c.description}</p>
              </div>
              <button
                onClick={() => (st === "connected" ? void disconnect(c) : setConnectTarget(c))}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg text-[11px] border border-gold/40 text-gold hover:bg-gold/10 disabled:opacity-50"
              >
                {st === "connected" ? "Disconnect" : "Connect"}
              </button>
            </div>
          );
        })}
        <p className="text-[10px] text-muted pt-1">
          Backed by the connector registry — bind to the workspace to auto-inject env vars in 1-Click scaffolds.
        </p>
      </div>

      {connectTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setConnectTarget(null)}>
          <div className="glass border border-border rounded-2xl p-4 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">{connectTarget.icon} Connect {connectTarget.name}</h3>
              <button onClick={() => setConnectTarget(null)} className="text-muted text-sm" aria-label="Close">
                ✕
              </button>
            </div>
            <p className="text-[11px] text-muted">{connectTarget.description}</p>
            {connectTarget.authType === "oauth" ? (
              <div className="rounded-xl border border-border bg-background/40 p-3 text-[11px] text-muted">
                OAuth flow — after authorizing, your token is encrypted and stored on your workspace.
              </div>
            ) : connectTarget.authType === "connection-string" ? (
              <>
                <label className="block text-[11px] text-muted">Connection string</label>
                <input
                  value={credValue}
                  onChange={(e) => setCredValue(e.target.value)}
                  placeholder="postgres://…  or  mongodb+srv://…"
                  className="w-full px-3 py-2 rounded-xl bg-background/60 border border-border text-xs"
                />
                <label className="block text-[11px] text-muted">Endpoint host</label>
                <input
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="project-ref.supabase.co"
                  className="w-full px-3 py-2 rounded-xl bg-background/60 border border-border text-xs"
                />
              </>
            ) : (
              <>
                <label className="block text-[11px] text-muted">API token</label>
                <input
                  value={credValue}
                  onChange={(e) => setCredValue(e.target.value)}
                  placeholder="Paste API token"
                  className="w-full px-3 py-2 rounded-xl bg-background/60 border border-border text-xs"
                />
                {connectTarget.id === "supabase" && (
                  <>
                    <label className="block text-[11px] text-muted">Project endpoint</label>
                    <input
                      value={endpoint}
                      onChange={(e) => setEndpoint(e.target.value)}
                      placeholder="https://your-ref.supabase.co"
                      className="w-full px-3 py-2 rounded-xl bg-background/60 border border-border text-xs"
                    />
                  </>
                )}
              </>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setConnectTarget(null)} className="flex-1 py-2 rounded-lg border border-border text-xs text-muted">
                Cancel
              </button>
              <button
                onClick={() => void connect()}
                disabled={busy || !credValue}
                className="flex-1 py-2 rounded-lg bg-gold/20 border border-gold/40 text-gold text-xs disabled:opacity-50"
              >
                {busy ? "Connecting…" : "Connect"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 inset-x-0 mx-auto w-max max-w-[90vw] bg-surface border border-gold/40 text-xs px-4 py-2 rounded-full z-[60]">
          {toast}
        </div>
      )}
    </div>
  );
}