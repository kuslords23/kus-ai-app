"use client";

/**
 * Billing & credit management dashboard.
 *
 * Displays the user's current token credit balance, transaction history, and
 * 1-click checkout buttons for credit bundles. Checkout redirects to Stripe
 * Checkout (hosted), then the webhook credits the wallet.
 */

import { useEffect, useState } from "react";

interface Bundle {
  id: string;
  label: string;
  credits: number;
  priceUsd: number;
  description: string;
}

interface Transaction {
  id?: string;
  amount: number;
  kind: "credit" | "debit";
  source: string;
  reference?: string;
  created_at?: string;
}

interface BillingData {
  balance: number;
  transactions: Transaction[];
  bundles: Bundle[];
}

export function BillingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/billing", { credentials: "include" });
      if (res.ok) setData((await res.json()) as BillingData);
    } catch {
      /* offline */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => void refresh(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  async function checkout(bundleId: string) {
    setCheckingOut(bundleId);
    setError(null);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ bundleId }),
      });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
      if (!res.ok || !payload?.url) {
        setError(payload?.error ?? "Checkout could not be started.");
        return;
      }
      window.location.assign(payload.url); // Stripe hosted checkout
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout failed.");
    } finally {
      setCheckingOut(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="glass border border-border rounded-3xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gold">Billing &amp; credits</h2>
          <button onClick={onClose} className="text-sm text-muted" aria-label="Close">✕</button>
        </div>

        {loading ? (
          <p className="text-xs text-muted py-8 text-center">Loading balance…</p>
        ) : (
          <>
            <div className="mt-4 rounded-2xl border border-gold/30 bg-gold/10 p-4 text-center">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Credit balance</p>
              <p className="mt-1 text-3xl font-semibold text-gold">{data?.balance ?? 0}</p>
              <p className="text-[10px] text-muted mt-1">
                Flagship model calls draw from this balance when you&apos;re not using your own key.
              </p>
              {error && <p className="mt-2 text-xs text-danger">{error}</p>}
            </div>

            <p className="mt-5 text-sm font-medium">Top up</p>
            <div className="mt-2 grid gap-2">
              {(data?.bundles ?? []).map((bundle) => (
                <button
                  key={bundle.id}
                  onClick={() => void checkout(bundle.id)}
                  disabled={checkingOut !== null}
                  className="flex items-center justify-between rounded-xl border border-border bg-background/50 px-4 py-3 text-left hover:border-gold/40 transition-colors disabled:opacity-50"
                >
                  <div>
                    <p className="text-sm font-medium">{bundle.label} — {bundle.credits.toLocaleString()} credits</p>
                    <p className="text-[11px] text-muted">{bundle.description}</p>
                  </div>
                  <span className="text-sm font-semibold text-gold">${bundle.priceUsd}</span>
                </button>
              ))}
            </div>

            <p className="mt-5 text-[11px] uppercase tracking-[0.18em] text-muted">Recent activity</p>
            <div className="mt-2 space-y-1.5">
              {(data?.transactions?.length ?? 0) === 0 && (
                <p className="text-xs text-muted text-center py-3">No transactions yet.</p>
              )}
              {(data?.transactions ?? []).slice(0, 12).map((tx, i) => (
                <div key={tx.id ?? i} className="flex items-center justify-between text-xs rounded-xl border border-border bg-background/40 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{tx.source}</p>
                    <p className="text-[10px] text-muted">
                      {tx.reference ?? ""} · {tx.created_at ? new Date(tx.created_at).toLocaleString() : ""}
                    </p>
                  </div>
                  <span className={tx.kind === "credit" ? "text-success" : "text-danger"}>
                    {tx.kind === "credit" ? "+" : "−"}{Math.abs(tx.amount ?? 0)}
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-4 text-[10px] text-muted">
              Payments are processed by Stripe. Webhooks credit your wallet automatically. New users receive a small free buffer before paid usage begins.
            </p>
          </>
        )}
      </div>
    </div>
  );
}