"use client";

/**
 * Connectors Workspace — interactive page for managing service integrations.
 *
 * Shows all mainstream tools (from bundled registry) immediately, overlayed
 * with live connection status from the API when available.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { allSpecs, type ConnectorCategory, type ConnectorSpec } from "@/server/connectors/types";

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
  catalog?: Record<ConnectorCategory, ConnectorSpec[]>;
  statuses: Record<string, { status: Status; message?: string }>;
}

type FilterId = "all" | ConnectorCategory;

const CATEGORIES: Array<{ id: FilterId; label: string; hint: string }> = [
  { id: "all", label: "All", hint: "Every tool" },
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

function flattenCatalog(catalog: Record<ConnectorCategory, ConnectorView[]>): ConnectorView[] {
  return Object.values(catalog).flat();
}

export function ConnectorsWorkspace() {
  const [catalog, setCatalog] = useState<Record<ConnectorCategory, ConnectorView[]>>(LOCAL_CATALOG);
  const [statuses, setStatuses] = useState<Record<string, { status: Status; message?: string }>>({});
  const [active, setActive] = useState<FilterId>("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [connectTarget, setConnectTarget] = useState<ConnectorView | null>(null);
  const [credValue, setCredValue] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [authorizing, setAuthorizing] = useState(false);

  const mergeCatalog = useCallback((serverCatalog?: Record<ConnectorCategory, ConnectorSpec[]>) => {
    if (!serverCatalog) return;
    setCatalog((current) => {
      const next: Record<ConnectorCategory, ConnectorView[]> = {
        "version-control": [...current["version-control"]],
        hosting: [...current.hosting],
        database: [...current.database],
        "cache-search": [...current["cache-search"]],
        monitoring: [...current.monitoring],
      };
      for (const [cat, specs] of Object.entries(serverCatalog) as Array<[ConnectorCategory, ConnectorSpec[]]>) {
        if (!next[cat]) continue;
        const seen = new Set(next[cat].map((v) => v.id));
        for (const spec of specs) if (!seen.has(spec.id)) next[cat].push({ ...spec, category: spec.category });
      }
      return next;
    });
  }, []);

  async function refresh() {
    try {
      const res = await fetch("/api/connectors", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load connectors");
      const data = (await res.json()) as WorkspaceResponse;
      mergeCatalog(data.catalog);
      setStatuses(data.statuses ?? {});
    } catch (e) {
      console.warn("[connectors] sync failed:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, []);

  const allViews = useMemo(() => flattenCatalog(catalog), [catalog]);
  const categoryList = active === "all" ? allViews : catalog[active] ?? [];
  const list = useMemo(() =>
    searchQuery.trim()
      ? categoryList.filter((v) =>
          v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.category.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : categoryList,
    [categoryList, searchQuery]
  );
  const total = allViews.length;
  const connectedCount = useMemo(
    () => Object.values(statuses).filter((s) => s.status === "connected").length,
    [statuses]
  );

  const connect = async () => {
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
        body: JSON.stringify({ op: "connect", connectorId: connectTarget.id, authType: connectTarget.authType, value: credValue, endpoint }),
      });
      const d = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !d?.ok) {
        toast.error(d?.error ?? "Could not connect.");
        return;
      }
      toast.success(`${connectTarget.name} connected.`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connection failed.");
    } finally {
      setAuthorizing(false);
      setBusy({});
      setConnectTarget(null);
      setCredValue("");
      setEndpoint("");
    }
  };

  const toggle = (c: ConnectorView, next: boolean) => {
    setBusy((p) => ({ ...p, [c.id]: true }));
    (async () => {
      if (next) return setConnectTarget(c);
      await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ op: "disconnect", connectorId: c.id }),
      });
      setStatuses((s) => ({ ...s, [c.id]: { status: "disconnected" } }));
      toast.success(`${c.name} disconnected.`);
      setBusy({});
    })();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur px-4 py-3 flex items-center gap-3">
        <Link href="/jyinx" className="text-xs text-muted hover:text-gold px-2 py-1 rounded-lg border border-border">← Back to Jyinx</Link>
        <div>
          <h1 className="text-sm font-semibold text-gold">Connectors workspace</h1>
          <p className="text-[10px] text-muted">{connectedCount} connected · {total} tools</p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pb-32 pt-4 h-full flex flex-col">
        <section className="rounded-2xl border border-gold/25 bg-gold/5 p-3 text-xs text-muted">
          <p className="font-medium text-gold">Service toggles</p>
          <p className="mt-1">Flip any tool ON to start the inline connect flow. Statuses refresh live.</p>
        </section>

        <div className="mt-4 flex items-center gap-3">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs">🔎</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search connectors by name, description, or category…"
              className="w-full rounded-xl border border-border bg-background/60 pl-8 pr-3 py-2 text-xs text-foreground outline-none focus:border-gold focus:bg-background/80"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-gold"
              >
                ✕
              </button>
            )}
          </div>
          <p className="shrink-0 text-[10px] text-muted">{list.length} result{list.length !== 1 ? "s" : ""}</p>
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
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

        <div className="mt-3 space-y-2 overflow-y-auto max-h-[calc(100vh-300px)] pr-1 scrollbar-thin">
          {loading && <p className="py-10 text-center text-xs text-muted">Loading connectors…</p>}
          {!loading && list.length === 0 && <p className="py-10 text-center text-xs text-muted">No tools found.</p>}
          {list.map((c) => {
            const st = statuses[c.id]?.status ?? "disconnected";
            const on = st === "connected";
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-border bg-background/50 p-3">
                <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center text-lg">
                  {c.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] border capitalize ${STATUS_STYLE[st]}`}>
                      {st}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted">{c.description}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={on}
                  aria-label={`Toggle ${c.name}`}
                  onClick={() => void toggle(c, !on)}
                  disabled={busy[c.id]}
                  className={`w-11 h-6 rounded-full border relative transition-colors ${
                    on ? "bg-gold/40 border-gold" : "bg-background/40 border-border"
                  }`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${on ? "left-5" : "left-0.5"} ${on ? "bg-gold" : "bg-muted"}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {connectTarget && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" onClick={() => setConnectTarget(null)}>
          <div className="glass border border-border rounded-2xl p-4 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">Connect {connectTarget.name}</h3>
              <button onClick={() => setConnectTarget(null)} className="text-muted text-sm" aria-label="Close">✕</button>
            </div>
            <p className="text-[11px] text-muted">{connectTarget.description}</p>
            {connectTarget.authType === "oauth" ? (
              <div className="rounded-xl border border-border bg-background/40 p-3 text-[11px] text-muted">
                OAuth flow — click authorize to securely wire {connectTarget.name} to your workspace.
              </div>
            ) : (
              <div>
                <label className="block text-[11px] text-muted">Token / Connection string</label>
                <input
                  value={credValue}
                  onChange={(e) => setCredValue(e.target.value)}
                  placeholder="API token or connection string"
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-background/60 border border-border text-xs"
                />
                {connectTarget.id === "supabase" && (
                  <label className="block text-[11px] text-muted mt-2">Endpoint</label>
                )}
              </div>
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
                {authorizing ? "Connecting…" : "Connect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}