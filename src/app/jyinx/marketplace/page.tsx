"use client";

import { MarketplaceStorefront } from "@/components/jyinx/marketplace/MarketplaceStorefront";
import Link from "next/link";

export default function MarketplacePage() {
  return (
    <main className="min-h-[100dvh] bg-background">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link
          href="/jyinx"
          className="shrink-0 rounded-lg border border-gold/30 bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/15"
        >
          ← Back
        </Link>
        <div>
          <h1 className="text-sm font-semibold">Marketplace</h1>
          <p className="text-[10px] text-muted">Browse apps, agents, models, and skills</p>
        </div>
      </div>
      <MarketplaceStorefront />
    </main>
  );
}

