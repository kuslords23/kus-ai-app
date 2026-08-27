import { NextRequest, NextResponse } from "next/server";
import { listSites, getSiteBySlug, upsertSite, deploySite, siteSlug } from "@/lib/jyinx/hosting-engine";

export const runtime = "nodejs";

function originOf(request: NextRequest): string {
  return request.nextUrl.origin;
}

/** GET /api/hosting — list published sites, optionally ?owner= */
export async function GET(request: NextRequest) {
  const owner = request.nextUrl.searchParams.get("owner") ?? undefined;
  const sites = await listSites({ owner });
  return NextResponse.json({ sites });
}

/** POST /api/hosting — register + deploy a site. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { name?: unknown; html?: unknown; stack?: unknown; owner?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const html = typeof body?.html === "string" ? body.html.trim() : "";
  if (!name || !html) {
    return NextResponse.json({ error: "name and html are required to publish a site." }, { status: 400 });
  }
  const stack = typeof body?.stack === "string" && body.stack ? body.stack : "html";
  const owner = typeof body?.owner === "string" ? body.owner : undefined;
  const slug = siteSlug(name + "-" + Date.now().toString(36).slice(-4));

  try {
    const { site, url, deployed } = await deploySite({ slug, name, html, stack, owner }, originOf(request));
    return NextResponse.json({ site, url, deployed });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Unable to publish the site." }, { status: 500 });
  }
}

/** PUT /api/hosting?slug=:slug — update HTML/stack of an existing site. */
export async function PUT(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  const body = (await request.json().catch(() => null)) as { html?: unknown; stack?: unknown; name?: unknown } | null;
  const existing = await getSiteBySlug(slug);
  if (!existing) return NextResponse.json({ error: "Site not found." }, { status: 404 });
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : existing.name;
  const html = typeof body?.html === "string" ? body.html : existing.html;
  const stack = typeof body?.stack === "string" && body.stack ? body.stack : existing.stack;
  const updated = await upsertSite({ slug: existing.slug, name, html, stack, status: existing.status, deployUrl: existing.deployUrl ?? undefined, owner: existing.owner ?? undefined });
  if (!updated) return NextResponse.json({ error: "Unable to update the site." }, { status: 500 });
  return NextResponse.json({ site: updated });
}