import { NextRequest, NextResponse } from "next/server";
import {
  listMarketplace,
  purchaseListing,
  publishListing,
  getUserListings,
  type MarketplaceAssetClass,
} from "@/lib/jyinx/marketplace/storefront";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const assetClass = request.nextUrl.searchParams.get("class") as MarketplaceAssetClass | null;
  const department = request.nextUrl.searchParams.get("department") ?? undefined;
  const q = request.nextUrl.searchParams.get("q") ?? undefined;
  const userId = request.nextUrl.searchParams.get("userId") ?? undefined;

  if (userId) {
    const listings = await getUserListings(userId);
    return NextResponse.json({ listings });
  }

  const listings = await listMarketplace({
    assetClass: assetClass || undefined,
    department,
    q,
  });
  return NextResponse.json({ listings });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = body.action as string;

  // Resolve user from session
  let userId = "";
  try {
    const supabase = await (await import("@/lib/supabase/server")).createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) userId = user.id;
  } catch {
    /* fall through */
  }
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (action === "purchase") {
    const result = await purchaseListing({
      listingId: String(body.listingId ?? ""),
      buyerId: userId,
      creditBalance: Number(body.creditBalance ?? 0),
      preferHubtelTopUp: Boolean(body.preferHubtelTopUp),
      returnUrl: body.returnUrl,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 402 });
  }

  if (action === "publish" || action === "publish-app") {
    const listing = await publishListing({
      id: `lst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      assetClass: body.assetClass || "app",
      name: String(body.name ?? "").slice(0, 120),
      description: String(body.description ?? "").slice(0, 2000),
      creatorId: userId,
      priceCredits: Math.max(0, Number(body.priceCredits ?? 0)),
      department: body.department ?? null,
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 12).map(String) : [],
      htmlContent: typeof body.htmlContent === "string" ? body.htmlContent : null,
      stack: typeof body.stack === "string" ? body.stack : null,
    });
    if (!listing) return NextResponse.json({ error: "Could not publish listing." }, { status: 500 });
    return NextResponse.json({ listing });
  }

  if (action === "my-apps") {
    const listings = await getUserListings(userId);
    return NextResponse.json({ listings });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}