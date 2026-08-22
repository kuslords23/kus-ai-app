import { NextResponse } from "next/server";
import { listMarketplace, purchaseListing, publishListing, type MarketplaceAssetClass } from "@/lib/jyinx/marketplace/storefront";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const assetClass = searchParams.get("class") as MarketplaceAssetClass | null;
  const department = searchParams.get("department") ?? undefined;
  const q = searchParams.get("q") ?? undefined;

  return NextResponse.json({
    listings: listMarketplace({
      assetClass: assetClass || undefined,
      department,
      q,
    }),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (action === "purchase") {
    const result = await purchaseListing({
      listingId: String(body.listingId ?? ""),
      buyerId: user.id,
      creditBalance: Number(body.creditBalance ?? 0),
      preferHubtelTopUp: Boolean(body.preferHubtelTopUp),
      returnUrl: body.returnUrl,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 402 });
  }

  if (action === "publish") {
    const listing = publishListing({
      id: `lst_${Date.now().toString(36)}`,
      assetClass: body.assetClass,
      name: String(body.name ?? "").slice(0, 120),
      description: String(body.description ?? "").slice(0, 2000),
      creatorId: user.id,
      priceCredits: Math.max(1, Number(body.priceCredits ?? 10)),
      department: body.department,
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 12).map(String) : [],
    });
    return NextResponse.json({ listing });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
