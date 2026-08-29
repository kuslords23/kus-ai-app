/**
 * Unified Marketplace — Supabase-backed.
 * Apps, Agents, Fine-Tuned Models, Private Skills.
 * Built apps from Jyinx Builder stored permanently with full HTML content.
 */

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export type MarketplaceAssetClass = "app" | "agent" | "model" | "skill";

export type MarketplaceListing = {
  id: string;
  assetClass: MarketplaceAssetClass;
  name: string;
  description: string;
  creatorId: string;
  priceCredits: number;
  department?: string | null;
  tags: string[];
  rating: number;
  installs: number;
  isActive: boolean;
  htmlContent?: string | null;
  stack?: string | null;
  createdAt: string;
};

export type PurchaseResult = {
  ok: boolean;
  purchaseId?: string;
  creditsCharged?: number;
  creatorShare?: number;
  platformShare?: number;
  checkoutUrl?: string;
  error?: string;
};

export const CREATOR_REVENUE_SHARE = 0.7;
const TABLE = "marketplace_listings";

async function db() {
  return createSupabaseServerClient();
}

function mapRow(row: Record<string, unknown>): MarketplaceListing {
  return {
    id: String(row.id),
    assetClass: row.asset_class as MarketplaceAssetClass,
    name: String(row.name),
    description: String(row.description ?? ""),
    creatorId: String(row.creator_id),
    priceCredits: Number(row.price_credits ?? 0),
    department: row.department ? String(row.department) : null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    rating: Number(row.rating ?? 0),
    installs: Number(row.installs ?? 0),
    isActive: row.is_active !== false,
    htmlContent: row.html_content ? String(row.html_content) : null,
    stack: row.stack ? String(row.stack) : null,
    createdAt: String(row.created_at),
  };
}

export async function listMarketplace(filters?: {
  assetClass?: MarketplaceAssetClass;
  department?: string;
  q?: string;
  creatorId?: string;
}): Promise<MarketplaceListing[]> {
  try {
    const supabase = await db();
    let query = supabase
      .from(TABLE)
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (filters?.creatorId) query = query.eq("creator_id", filters.creatorId);
    if (filters?.assetClass) query = query.eq("asset_class", filters.assetClass);
    if (filters?.department) query = query.eq("department", filters.department);

    const { data, error } = await query.limit(100);
    if (error || !data) return [];
    const results = (data as unknown as Record<string, unknown>[]).map(mapRow);

    if (filters?.q) {
      const q = filters.q.toLowerCase();
      return results.filter(
        (r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.tags.some((t) => t.includes(q))
      );
    }
    return results;
  } catch {
    return [];
  }
}

export async function getListing(id: string): Promise<MarketplaceListing | null> {
  try {
    const supabase = await db();
    const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error || !data) return null;
    return mapRow(data as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function publishListing(
  listing: Omit<MarketplaceListing, "rating" | "installs" | "isActive" | "createdAt">
): Promise<MarketplaceListing | null> {
  try {
    const supabase = await db();
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        id: listing.id,
        asset_class: listing.assetClass,
        name: listing.name,
        description: listing.description,
        creator_id: listing.creatorId,
        price_credits: listing.priceCredits,
        department: listing.department ?? null,
        tags: listing.tags,
        html_content: listing.htmlContent ?? null,
        stack: listing.stack ?? null,
      })
      .select("*")
      .maybeSingle();
    if (error || !data) return null;
    return mapRow(data as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function getUserListings(creatorId: string): Promise<MarketplaceListing[]> {
  return listMarketplace({ creatorId });
}

export async function recordInstall(listingId: string): Promise<void> {
  try {
    const supabase = await db();
    await supabase.rpc("increment_marketplace_installs", { p_listing_id: listingId });
  } catch {
    // best-effort
  }
}

export function splitRevenue(priceCredits: number): { creatorShare: number; platformShare: number } {
  const creatorShare = Math.floor(priceCredits * CREATOR_REVENUE_SHARE);
  const platformShare = priceCredits - creatorShare;
  return { creatorShare, platformShare };
}

export async function purchaseListing(params: {
  listingId: string;
  buyerId: string;
  creditBalance: number;
  preferHubtelTopUp?: boolean;
  returnUrl?: string;
}): Promise<PurchaseResult> {
  const listing = await getListing(params.listingId);
  if (!listing) return { ok: false, error: "Listing not found" };

  if (params.creditBalance < listing.priceCredits || params.preferHubtelTopUp) {
    try {
      const { createHubtelCheckout } = await import("@/server/billing/hubtel");
      const checkout = await createHubtelCheckout({
        userId: params.buyerId,
        bundleId: "starter",
        returnUrl: params.returnUrl,
        metadata: { marketplaceListingId: listing.id, purpose: "marketplace_purchase" },
      });
      if (!checkout.ok) {
        return { ok: false, error: checkout.error ?? "Insufficient credits and Hubtel checkout unavailable" };
      }
      return { ok: false, checkoutUrl: checkout.url, error: "Top up via Hubtel to complete purchase" };
    } catch {
      return { ok: false, error: "Insufficient credits" };
    }
  }

  const { creatorShare, platformShare } = splitRevenue(listing.priceCredits);
  await recordInstall(params.listingId);

  return {
    ok: true,
    purchaseId: `purch_${Date.now().toString(36)}`,
    creditsCharged: listing.priceCredits,
    creatorShare,
    platformShare,
  };
}