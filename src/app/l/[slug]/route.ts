import type { NextRequest } from "next/server";
import { getSiteBySlug, sitePublicUrl } from "@/lib/jyinx/hosting-engine";

export const dynamic = "force-dynamic";

/**
 * Live published site for a preview subdomain (/l/:slug).
 * Returns the stored site's full HTML document so the route can be pointed at
 * by a real custom subdomain/domain (SSL offloaded by the hosting platform).
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const site = await getSiteBySlug(slug);

  if (!site || site.status === "draft") {
    return new Response("<!doctype html><html><body style=\"font-family:sans-serif;color:#666;padding:40px;text-align:center\">Site not found.</body></html>", {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kus-ai-app.vercel.app";
  const canonical = sitePublicUrl(origin, site.slug);

  // Inject a canonical + no-CSP-clash title block; the stored doc already has
  // meta viewport & its own title. We prepend schema-less SEO meta via a <base>.
  const headInject = `<link rel="canonical" href="${canonical}" />\n<meta name="generator" content="Jyinx Hosting" />`;

  const document = site.html.replace(/<head[^>]*>/, (match) => `${match}\n${headInject}`);

  return new Response(document, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Strict SSL-friendly cache; any real preview domain should map here.
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      "X-Robots-Tag": site.status === "live" ? "index, follow" : "noindex, nofollow",
    },
  });
}