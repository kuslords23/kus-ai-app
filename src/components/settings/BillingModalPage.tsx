"use client";

/**
 * Full-page wrapper for the billing dashboard (used at `/jyinx/billing`).
 * Renders the BillingModal UI as a always-open centered canvas with a
 * navigation bar back to Jyinx.
 */

import Link from "next/link";
import { BillingModal } from "@/components/settings/BillingModal";

export function BillingModalPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur px-4 py-3 flex items-center gap-3">
        <Link href="/jyinx" className="text-xs text-muted hover:text-gold px-2 py-1 rounded-lg border border-border">
          ← Back to Jyinx
        </Link>
        <div>
          <h1 className="text-sm font-semibold text-gold">Billing &amp; credits</h1>
          <p className="text-[10px] text-muted">Balance, history and credit bundles.</p>
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 py-6">
        <BillingModal open onClose={() => undefined} />
      </div>
    </div>
  );
}