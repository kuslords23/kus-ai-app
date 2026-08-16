"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Metrics = { all: number; working: number; attention: number; review: number; updatedAt: string };

export function JyinxMetricsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const response = await fetch("/api/jyinx/metrics", { cache: "no-store" });
        const data = (await response.json()) as Metrics & { error?: string };
        if (!response.ok) throw new Error(data.error || "Metrics unavailable.");
        if (live) { setMetrics(data); setError(null); }
      } catch (cause) {
        if (live) setError(cause instanceof Error ? cause.message : "Metrics unavailable.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => { live = false; window.clearInterval(timer); };
  }, []);

  return <main className="min-h-dvh overflow-y-auto bg-background p-5 text-foreground sm:p-8"><header className="mx-auto flex max-w-3xl items-center justify-between"><div><p className="text-xs uppercase tracking-[0.18em] text-muted">Jyinx live operations</p><h1 className="mt-1 text-2xl font-semibold">Agent metrics</h1></div><Link href="/jyinx" className="rounded-xl border border-border px-3 py-2 text-xs text-muted">Back to Jyinx</Link></header><section className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">{([["All agents", metrics?.all ?? "—"], ["Working", metrics?.working ?? "—"], ["Needs attention", metrics?.attention ?? "—"], ["In review", metrics?.review ?? "—"]] as const).map(([label, value]) => <article key={label} className="rounded-2xl border border-border bg-surface/70 p-4"><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted">{label}</p></article>)}</section><section className="mx-auto mt-4 max-w-3xl rounded-2xl border border-border bg-surface/50 p-4 text-xs text-muted">{error ? <p className="text-danger">{error}</p> : <p>{metrics ? `Last updated ${new Date(metrics.updatedAt).toLocaleTimeString()}. Values are refreshed from the Jyinx queue backend.` : "Loading live metrics…"}</p>}</section></main>;
}
