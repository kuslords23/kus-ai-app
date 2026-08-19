"use client";

/**
 * Connectors Workspace — dedicated interactive page for managing service
 * integrations in Jyinx.
 *
 * Lists all mainstream tools by category with ON/OFF toggle switches and live
 * connection status indicators. Connection + credential input happens inline in
 * a modal (API key / connection string / OAuth consent) and persists to the
 * secure backend vault via `/api/connectors`.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { ConnectorCategory } from "@/server/connectors/types";

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

interface WorkspaceResponse {
  catalog?: Record<ConnectorCategory, ConnectorView[]>;
  statuses: Record<string, { status: Status; message?: string }>;
}

const CATEGORIES: Array<{ id: ConnectorCategory; label: string; hint: string }> = [
  { id: "version-control", label: "Version Control", hint: "GitHub · GitLab · Bitbucket" },
  { id: "hosting", label: "Hosting / Cloud", hint: "Vercel · Netlify · AWS" },
  { id: "database", label: "Databases / BaaS", hint: "Supabase · Mongo · Neon" },
  { id: "cache-search", label: "Cache / Search", hint: "Redis · Algolia · Meilisearch" },
  { id: "monitoring", label: "Monitoring / Testing", hint: "Sentry · Grafana · Playwright" },
];

const STATUS_STYLE: Record<Status, string> = {
  connected: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  disconnected: "bg-zinc-500/10 text-muted border-border",
  error: "bg-red-500/15 text-red-400 border-red-500/40",
};

export function ConnectorsWorkspace() {
  const [catalog, setCatalog] = useState<Record<ConnectorCategory, ConnectorView[]> | null>(null);
  const [statuses, setStatuses] = useState<Record<string, { status: Status; message?: string }>>({});
  const [active, setActive] = useState<ConnectorCategory>("version-control");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [connectTarget, setConnectTarget] = useState<ConnectorView | null>(null);
  const [credValue, setCredValue] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [authorizing, setAuthorizing] = useState(false);

  async function refresh() {
    try {
      const res = await fetch("/api/connectors", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load connectors");
      const data = (await res.json()) as WorkspaceResponse;
      setCatalog(data.catalog ?? null);
      setStatuses(data.statuses ?? {});
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Failed to load connectors.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0); // initial load
    const interval = setInterval(() => void refresh(), 30_000); // live status sync
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  const total = useMemo(() => {
    if (!catalog) return 0;
    return Object.values(catalog).reduce((sum, arr) => sum + arr.length, 0);
  }, [catalog]);

  const connectedCount = useMemo(
    () => Object.values(statuses).filter((s) => s.status === "connected").length,
    [statuses]
  );

  const list = catalog?.[active] ?? [];

  async function connect() {
    if (!connectTarget) return;
    if (connectTarget.authType !== "oauth" && !credValue) {
      toast.error("Enter the credential first.");
      return;
    }
    setAuthorizing(true);
    setBusy((p) => ({ ...p, [connectTarget.id]: true }));
    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          op: "connect",
          connectorId: connectTarget.id,
          authType: connectTarget.authType,
          value: credValue || "oauth-consent",
          endpoint:
            connectTarget.id === "supabase" || connectTarget.authType === "connection-string"
              ? endpoint || undefined
              : undefined,
          boundApp: "auto",
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? "Could not connect.");
        return;
      }
      toast.success(`${connectTarget.name} connected.`);
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Connection failed.");
    } finally {
      setAuthorizing(false);
      setBusy((p) => (connectTarget ? { ...p, [connectTarget.id]: false } : p));
      setConnectTarget(null);
      setCredValue("");
      setEndpoint("");
    }
  }

  async function toggle(connector: ConnectorView, next: boolean) {
    setBusy((p) => ({ ...p, [connector.id]: true }));
    try {
      if (next) {
        setConnectTarget(connector);
      } else {
        await fetch("/api/connectors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ op: "disconnect", connectorId: connector.id }),
        });
        setStatuses((prev) => ({ ...prev, [connector.id]: { status: "disconnected" } }));
        toast.success(`${connector.name} disconnected.`);
      }
    } finally {
      setBusy((p) => ({ ...p, [connector.id]: false }));
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur px-4 py-3 flex items-center gap-3">
        <Link
          href="/jyinx"
          className="text-xs text-muted hover:text-gold px-2 py-1 rounded-lg border border-border"
        >
          ← Back to Jyinx
        </Link>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-gold truncate">Connectors workspace</h1>
          <p className="text-[10px] text-muted truncate">
            {connectedCount} connected · {total} tools available
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pb-32 pt-4">
        <section className="rounded-2xl border border-gold/25 bg-gold/5 p-3 text-xs text-muted">
          <p className="font-medium text-gold">Service toggles</p>
          <p className="mt-1">
            Flip any tool ON to start the inline connect flow. Connected tools are stored securely and exposed to Jyinx
            agents as tools (deploy, migrate, push, env-sync). Statuses refresh live.
          </p>
        </section>

        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] border transition-colors ${
                active === c.id ? "border-gold bg-gold/15 text-gold" : "border-border text-muted"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-2">
          {loading && <p className="py-10 text-center text-xs text-muted">Loading connectors…</p>}
          {!loading && list.length === 0 && <p className="py-10 text-center text-xs text-muted">No tools in this category.</p>}
          {list.map((c) => {
            const st = statuses[c.id]?.status ?? "disconnected";
            const on = st === "connected";
            const busyThis = busy[c.id];
            return (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-background/50 p-3 w-full box-border"
              >
                <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center text-lg shrink-0">
                  {c.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] border capitalize ${STATUS_STYLE[st]}`}>
                      {st}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted truncate max-w-[46vw]">{c.description}</p>
                </div>

                <button
                  role="switch"
                  aria-checked={on}
                  aria-label={`Toggle ${c.name}`}
                  onClick={() => void toggle(c, !on)}
                  disabled={busyThis}
                  className={`w-11 h-6 rounded-full border relative transition-colors shrink-0 ${
                    on ? "bg-gold/40 border-gold" : "bg-background/40 border-border"
                  } ${busyThis ? "opacity-50" : ""}`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
                      on ? "left-5 bg-gold" : "left-0.5 bg-muted"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-[10px] text-muted">
          Credentials are encrypted at rest per user. OAuth tokens never leave the backend vault. Run automated actions
          from the agent panel once tools are ON.
        </p>
      </div>

      {connectTarget && (
        <div
          className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center p-4"
          onClick={() => setConnectTarget(null)}
        >
          <div className="glass border border-border rounded-2xl p-4 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">
                {connectTarget.icon} Connect {connectTarget.name}
              </h3>
              <button onClick={() => setConnectTarget(null)} className="text-muted text-sm" aria-label="Close">
                ✕
              </button>
            </div>
            <p className="text-[11px] text-muted">{connectTarget.description}</p>

            {connectTarget.authType === "oauth" ? (
              <div className="rounded-xl border border-border bg-background/40 p-3 text-[11px] text-muted">
                OAuth flow — click authorize to securely wire {connectTarget.name} to your workspace. No key needed.
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
                disabled={authorizing}
                className="flex-1 py-2 rounded-lg bg-gold/20 border border-gold/40 text-gold text-xs disabled:opacity-50"
              >
                {authorizing ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full border border-gold/50 border-t-transparent animate-spin" />
                    Connecting…
                  </span>
                ) : connectTarget.authType === "oauth" ? (
                  "Authorize"
                ) : (
                  "Connect"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}