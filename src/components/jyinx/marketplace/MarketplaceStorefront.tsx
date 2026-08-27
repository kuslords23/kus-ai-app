"use client";

import { useEffect, useState } from "react";
import type { MarketplaceListing, MarketplaceAssetClass } from "@/lib/jyinx/marketplace/storefront";

const CLASSES: Array<{ id: MarketplaceAssetClass | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "app", label: "Apps" },
  { id: "agent", label: "Agents" },
  { id: "model", label: "Models" },
  { id: "skill", label: "Skills" },
];

export function MarketplaceStorefront() {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [assetClass, setAssetClass] = useState<MarketplaceAssetClass | "all">("all");
  const [q, setQ] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const params = new URLSearchParams();
    if (assetClass !== "all") params.set("class", assetClass);
    if (q.trim()) params.set("q", q.trim());
    const res = await fetch(`/api/marketplace?${params.toString()}`);
    const data = await res.json();
    setListings(data.listings ?? []);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetClass]);

  const hire = async (listingId: string, preferHubtel = false) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "purchase",
          listingId,
          creditBalance: 0,
          preferHubtelTopUp: preferHubtel,
          returnUrl: typeof window !== "undefined" ? `${window.location.origin}/` : undefined,
        }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      if (data.ok) {
        setNotice(`Purchased. Charged ${data.creditsCharged} credits (creator share ${data.creatorShare}).`);
        await load();
      } else {
        setNotice(data.error ?? "Purchase failed");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-semibold">Jyinx Marketplace</h1>
        {CLASSES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setAssetClass(c.id)}
            className={`rounded-md border px-2 py-1 text-xs ${
              assetClass === c.id ? "border-gold/50 bg-gold/10 text-gold" : "border-border text-muted"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search apps, agents, models, skills"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg border border-border px-3 py-2 text-sm">
          Search
        </button>
      </form>

      {notice && <p className="mb-3 text-xs text-gold">{notice}</p>}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-24">
        {listings.map((listing) => (
          <article key={listing.id} className="rounded-xl border border-border bg-surface/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted">
                  {listing.assetClass}
                  {listing.department ? ` · ${listing.department}` : ""}
                </p>
                <h2 className="text-sm font-semibold">{listing.name}</h2>
                <p className="mt-1 text-xs text-muted">{listing.description}</p>
              </div>
              <p className="shrink-0 text-sm text-gold">{listing.priceCredits} cr</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void hire(listing.id, false)}
                className="rounded-md bg-gold/20 px-3 py-1.5 text-xs text-gold disabled:opacity-50"
              >
                Hire / Buy
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void hire(listing.id, true)}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-muted disabled:opacity-50"
              >
                Pay with Hubtel
              </button>
            </div>
          </article>
        ))}
        {listings.length === 0 && <p className="text-sm text-muted">No listings match.</p>}
      </div>
    </div>
  );
}
