"use client";

import { useEffect, useState } from "react";
import { getTotals, type LedgerTotals } from "@/services/tokenLedger";
import { userKeyManager, maskKey, type BYOKProvider } from "@/services/userKeyManager";

const EMPTY: LedgerTotals = {
  totalRequests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  totalTokens: 0,
  totalCost: 0,
  byModel: {},
};

const PROVIDERS: BYOKProvider[] = ["openai", "anthropic", "deepseek", "openrouter", "gemini"];

/**
 * Client-side usage & expense estimator.
 *
 * Reads real-time token metrics from the local token ledger and cross-references
 * them with an up-to-date provider pricing manifest. Displays an itemized cost
 * breakdown down to the micro-penny for every model used. Also surfaces the
 * stacked BYOK keys so the user can plug in personal provider keys at cost.
 */
export function CostTracker() {
  const [totals, setTotals] = useState<LedgerTotals>(EMPTY);
  const [keys, setKeys] = useState<Record<BYOKProvider, string | null>>({
    openai: null,
    anthropic: null,
    deepseek: null,
    openrouter: null,
    gemini: null,
  });
  const [draft, setDraft] = useState<Record<BYOKProvider, string>>({
    openai: "",
    anthropic: "",
    deepseek: "",
    openrouter: "",
    gemini: "",
  });

  useEffect(() => {
    let live = true;
    const refresh = async () => {
      const t = await getTotals();
      if (live) setTotals(t);
    };
    void refresh();
    // Refresh whenever the key manager changes.
    const unsubscribe = userKeyManager.subscribe(() => {
      const next: Record<BYOKProvider, string | null> = {
        openai: userKeyManager.getKey("openai"),
        anthropic: userKeyManager.getKey("anthropic"),
        deepseek: userKeyManager.getKey("deepseek"),
        openrouter: userKeyManager.getKey("openrouter"),
        gemini: userKeyManager.getKey("gemini"),
      };
      setKeys(next);
    });
    const interval = window.setInterval(() => void refresh(), 10_000);
    return () => {
      live = false;
      unsubscribe();
      window.clearInterval(interval);
    };
  }, []);

  const save = (provider: BYOKProvider) => {
    const value = draft[provider];
    if (!value.trim()) return;
    userKeyManager.saveKey(provider, value);
    setDraft((current) => ({ ...current, [provider]: "" }));
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-background/50 p-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm font-semibold">Token & cost ledger</p>
            <p className="mt-1 text-xs text-muted">{totals.totalRequests} requests · live local estimate</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-gold">${totals.totalCost.toFixed(6)}</p>
            <p className="text-[10px] text-muted">all-time</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-border bg-surface/60 px-3 py-2"><span className="block text-muted">Input</span><span className="block font-medium">{totals.inputTokens.toLocaleString()}</span></div>
          <div className="rounded-lg border border-border bg-surface/60 px-3 py-2"><span className="block text-muted">Output</span><span className="block font-medium">{totals.outputTokens.toLocaleString()}</span></div>
          <div className="rounded-lg border border-border bg-surface/60 px-3 py-2"><span className="block text-muted">Cached</span><span className="block font-medium text-success">{totals.cachedTokens.toLocaleString()}</span></div>
          <div className="rounded-lg border border-border bg-surface/60 px-3 py-2"><span className="block text-muted">Total</span><span className="block font-medium">{totals.totalTokens.toLocaleString()}</span></div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-background/50 p-3">
        <p className="text-sm font-semibold">Cost by model</p>
        {Object.keys(totals.byModel).length === 0 ? (
          <p className="mt-2 text-xs text-muted">No usage recorded yet.</p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {Object.entries(totals.byModel)
              .sort(([, a], [, b]) => b.cost - a.cost)
              .map(([model, row]) => (
                <div key={model} className="flex items-center justify-between rounded-lg border border-border bg-surface/50 px-3 py-1.5 text-xs">
                  <span className="min-w-0 truncate text-muted">{model}</span>
                  <span className="shrink-0 font-medium">{(row.cost).toFixed(6)}</span>
                </div>
              ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-background/50 p-3">
        <p className="text-sm font-semibold">Bring your own key</p>
        <p className="mt-1 text-xs text-muted">Supply a personal provider key to run paid models at exact upstream cost — zero platform markup.</p>
        <div className="mt-3 space-y-2">
          {PROVIDERS.map((provider) => (
            <div key={provider} className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
              <span className="w-20 text-[11px] capitalize text-muted">{provider}</span>
              {keys[provider] ? (
                <>
                  <span className="truncate rounded-lg border border-border bg-surface/60 px-2 py-1.5 text-[11px] text-foreground">{maskKey(keys[provider]!)}</span>
                  <button type="button" onClick={() => userKeyManager.removeKey(provider)} className="rounded-lg border border-border px-2 py-1.5 text-[11px] text-danger">Remove</button>
                </>
              ) : (
                <>
                  <input
                    type="password"
                    value={draft[provider]}
                    onChange={(e) => setDraft((c) => ({ ...c, [provider]: e.target.value }))}
                    placeholder="sk-…"
                    className="min-w-0 rounded-lg border border-border bg-surface/60 px-2 py-1.5 text-[11px] outline-none focus:border-gold"
                  />
                  <button type="button" onClick={() => save(provider)} disabled={!draft[provider].trim()} className="rounded-lg border border-gold/30 bg-gold/10 px-2 py-1.5 text-[11px] text-gold disabled:opacity-40">Save</button>
                </>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}