/**
 * Unified Marketplace — Apps, Agents, Fine-Tuned Models, Private Skills (listed metadata only).
 * Micro-transaction hooks via Hubtel with creator revenue share.
 */

export type MarketplaceAssetClass = "app" | "agent" | "model" | "skill";

export type MarketplaceListing = {
  id: string;
  assetClass: MarketplaceAssetClass;
  name: string;
  description: string;
  creatorId: string;
  priceCredits: number;
  department?: "security" | "qa" | "uiux" | "optimization" | "general";
  tags: string[];
  rating: number;
  installs: number;
  isActive: boolean;
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

/** Creator receives 70%, platform 30% of listing price in credits. */
export const CREATOR_REVENUE_SHARE = 0.7;

const MEMORY: MarketplaceListing[] = [
  {
    id: "agent-sec-auditor",
    assetClass: "agent",
    name: "Security Auditor Dept",
    description: "Defensive static audit agent with patch briefs for the Coder.",
    creatorId: "system",
    priceCredits: 25,
    department: "security",
    tags: ["security", "qa"],
    rating: 4.6,
    installs: 120,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "agent-uiux",
    assetClass: "agent",
    name: "UI/UX Layout Agent",
    description: "Layout and design-system agent for Website/Blog Builder tabs.",
    creatorId: "system",
    priceCredits: 20,
    department: "uiux",
    tags: ["layout", "design"],
    rating: 4.4,
    installs: 88,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "model-code-lite",
    assetClass: "model",
    name: "Code Lite (open-weight)",
    description: "Domain-tuned coding model rented per task via micro credits.",
    creatorId: "system",
    priceCredits: 15,
    department: "optimization",
    tags: ["model", "code"],
    rating: 4.2,
    installs: 210,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "app-blog-kit",
    assetClass: "app",
    name: "Blog Starter Kit",
    description: "Scaffolded blog app template publishable from Jyinx.",
    creatorId: "system",
    priceCredits: 40,
    tags: ["app", "blog"],
    rating: 4.5,
    installs: 54,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
];

export function listMarketplace(filters?: {
  assetClass?: MarketplaceAssetClass;
  department?: string;
  q?: string;
}): MarketplaceListing[] {
  let rows = MEMORY.filter((r) => r.isActive);
  if (filters?.assetClass) rows = rows.filter((r) => r.assetClass === filters.assetClass);
  if (filters?.department) rows = rows.filter((r) => r.department === filters.department);
  if (filters?.q) {
    const q = filters.q.toLowerCase();
    rows = rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.tags.some((t) => t.includes(q))
    );
  }
  return rows;
}

export function getListing(id: string): MarketplaceListing | undefined {
  return MEMORY.find((r) => r.id === id);
}

export function publishListing(listing: Omit<MarketplaceListing, "rating" | "installs" | "createdAt" | "isActive">): MarketplaceListing {
  const row: MarketplaceListing = {
    ...listing,
    rating: 0,
    installs: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  MEMORY.unshift(row);
  return row;
}

export function splitRevenue(priceCredits: number): { creatorShare: number; platformShare: number } {
  const creatorShare = Math.floor(priceCredits * CREATOR_REVENUE_SHARE);
  const platformShare = priceCredits - creatorShare;
  return { creatorShare, platformShare };
}

/**
 * Purchase with credits, or return a Hubtel checkout URL for mobile-money top-up then purchase.
 */
export async function purchaseListing(params: {
  listingId: string;
  buyerId: string;
  creditBalance: number;
  preferHubtelTopUp?: boolean;
  returnUrl?: string;
}): Promise<PurchaseResult> {
  const listing = getListing(params.listingId);
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
        return {
          ok: false,
          error: checkout.error ?? "Insufficient credits and Hubtel checkout unavailable",
        };
      }
      return { ok: false, checkoutUrl: checkout.url, error: "Top up via Hubtel to complete purchase" };
    } catch {
      return { ok: false, error: "Insufficient credits" };
    }
  }

  const { creatorShare, platformShare } = splitRevenue(listing.priceCredits);
  listing.installs += 1;

  return {
    ok: true,
    purchaseId: `purch_${Date.now().toString(36)}`,
    creditsCharged: listing.priceCredits,
    creatorShare,
    platformShare,
  };
}
