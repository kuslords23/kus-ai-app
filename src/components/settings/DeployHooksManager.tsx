"use client";

/**
 * Deploy Hooks Manager — configure Vercel/Netlify/Railway/Custom deploy hooks
 * directly from the Jyinx settings UI, no environment variables needed.
 */
import { useCallback, useEffect, useState } from "react";

type DeployHookHost = "vercel" | "netlify" | "railway" | "custom";

interface DeployHook {
  id: string;
  host: DeployHookHost;
  label: string | null;
  hookUrl: string;
  isActive: boolean;
  lastUsedAt: string | null;
}

const HOST_META: Record<DeployHookHost, { label: string; icon: string; placeholder: string }> = {
  vercel: { label: "Vercel", icon: "▲", placeholder: "https://api.vercel.com/v1/integrations/deploy/..." },
  netlify: { label: "Netlify", icon: "🌐", placeholder: "https://api.netlify.com/build_hooks/..." },
  railway: { label: "Railway", icon: "🚂", placeholder: "https://railway.app/project/.../deploy" },
  custom: { label: "Custom", icon: "🔗", placeholder: "https://your-deploy-hook.example.com/..." },
};

export function DeployHooksManager() {
  const [hooks, setHooks] = useState<DeployHook[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newHost, setNewHost] = useState<DeployHookHost>("vercel");
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadHooks = useCallback(async () => {
    try {
      const res = await fetch("/api/deploy-hooks");
      if (res.ok) {
        const data = (await res.json()) as { hooks?: DeployHook[] };
        setHooks(data.hooks ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadHooks(); }, [loadHooks]);

  const showNotice = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 3000); };

  const addHook = async () => {
    if (!newUrl.trim()) return;
    const res = await fetch("/api/deploy-hooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: newHost, hookUrl: newUrl.trim(), label: newLabel.trim() || undefined }),
    });
    if (res.ok) {
      showNotice(`${HOST_META[newHost].label} hook added.`);
      setNewUrl("");
      setNewLabel("");
      setAdding(false);
      void loadHooks();
    } else {
      const data = (await res.json().catch(() => null)) as { error?: string };
      showNotice(data?.error || "Failed to add hook.");
    }
  };

  const deleteHook = async (id: string) => {
    const res = await fetch(`/api/deploy-hooks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      showNotice("Hook removed.");
      void loadHooks();
    } else {
      showNotice("Failed to remove hook.");
    }
  };

  const toggleHook = async (id: string, isActive: boolean) => {
    const res = await fetch(`/api/deploy-hooks?id=${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    if (res.ok) void loadHooks();
  };

  const grouped = hooks.reduce<Record<DeployHookHost, DeployHook[]>>(
    (acc, h) => { (acc[h.host] ??= []).push(h); return acc; },
    { vercel: [], netlify: [], railway: [], custom: [] }
  );

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted">
        Configure deploy hooks so Jyinx can push your committed code to hosting platforms.
        Get the hook URL from your hosting provider&apos;s dashboard.
      </p>

      {/* Existing hooks */}
      {loading ? (
        <p className="text-xs text-muted">Loading hooks…</p>
      ) : hooks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">
          No deploy hooks configured yet. Add your first one below.
        </div>
      ) : (
        (["vercel", "netlify", "railway", "custom"] as DeployHookHost[]).map((host) => {
          const items = grouped[host];
          if (!items?.length) return null;
          const meta = HOST_META[host];
          return (
            <div key={host}>
              <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted">{meta.icon} {meta.label}</p>
              {items.map((hook) => (
                <div key={hook.id} className="mb-1.5 flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs">
                  <button
                    type="button"
                    onClick={() => toggleHook(hook.id, !hook.isActive)}
                    className={`shrink-0 rounded-full p-1 transition-colors ${hook.isActive ? "text-emerald-400 hover:text-emerald-300" : "text-muted hover:text-foreground"}`}
                    title={hook.isActive ? "Active — click to disable" : "Disabled — click to enable"}
                  >
                    {hook.isActive ? "●" : "○"}
                  </button>
                  <span className="min-w-0 flex-1 truncate font-mono">{hook.label || hook.hookUrl.slice(0, 50) + "…"}</span>
                  <span className="shrink-0 text-[9px] text-muted">{hook.lastUsedAt ? "used" : "never used"}</span>
                  <button type="button" onClick={() => deleteHook(hook.id)} className="shrink-0 rounded px-1.5 py-0.5 text-muted hover:text-danger transition-colors" title="Remove">✕</button>
                </div>
              ))}
            </div>
          );
        })
      )}

      {/* Add new hook form */}
      {adding ? (
        <div className="rounded-xl border border-border bg-surface/50 p-3 space-y-2">
          <div className="flex gap-2">
            {(["vercel", "netlify", "railway", "custom"] as DeployHookHost[]).map((host) => (
              <button
                key={host}
                type="button"
                onClick={() => setNewHost(host)}
                className={`rounded-md px-2 py-1 text-[10px] transition-colors ${newHost === host ? "bg-gold/15 text-gold border border-gold/30" : "text-muted border border-transparent hover:border-border"}`}
              >
                {HOST_META[host].icon} {HOST_META[host].label}
              </button>
            ))}
          </div>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label (optional, e.g. Production)"
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-gold"
          />
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder={HOST_META[newHost].placeholder}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-mono outline-none focus:border-gold"
          />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void addHook()} disabled={!newUrl.trim()} className="rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-50">Save Hook</button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-xs text-muted hover:border-gold/40 hover:text-gold transition-colors">
          + Add Deploy Hook
        </button>
      )}

      {notice && <p className="rounded-lg border border-gold/25 bg-gold/5 px-3 py-1.5 text-xs text-gold">{notice}</p>}
    </div>
  );
}