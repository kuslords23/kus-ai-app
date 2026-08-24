import { createClient as createSupabaseClient } from "@/lib/supabase/server";

// SERVER-ONLY: this module talks to Supabase via cookies() (next/headers) and
// must never be imported from a Client Component. Guard against accidental
// leaks into the client bundle.
if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/jyinx/hosting-engine.ts is server-only — do not import it from Client Components."
  );
}

/**
 * Jyinx Instant Hosting & Deployment Pipeline.
 *
 * Tracks built sites/projects in a Supabase `jyinx_sites` table and maps each
 * to a custom preview subdomain with a live SSL-backed URL. Triggering a deploy
 * fires the Vercel deploy hook; the site's live URL is resolvable on the
 * platform (`/l/:subdomain`) and pointable to a real preview domain.
 *
 * Suggested schema:
 *   create table jyinx_sites (
 *     id uuid primary key default gen_random_uuid(),
 *     slug text not null unique,
 *     name text not null,
 *     html text not null,
 *     stack text not null default 'html',
 *     status text not null default 'draft',       -- draft | deploying | live | error
 *     deploy_url text,
 *     deploy_log text,
 *     owner text,
 *     created_at timestamptz default now(),
 *     updated_at timestamptz default now()
 *   );
 */

const SITES_TABLE = "jyinx_sites";

export type SiteStatus = "draft" | "deploying" | "live" | "error";

export type Site = {
  id: string;
  slug: string;
  name: string;
  html: string;
  stack: string;
  status: SiteStatus;
  deployUrl?: string | null;
  deployLog?: string | null;
  owner?: string | null;
  created_at: string;
  updated_at: string;
};

export type SiteInput = {
  slug: string;
  name: string;
  html: string;
  stack?: string;
  status?: SiteStatus;
  deployUrl?: string;
  owner?: string;
};

const RESERVED_SLUGS = new Set(["l", "blog", "builder", "ide", "mobile", "metrics", "admin", "api", "login", "auth", "jyinx", "k"]);

/** Normalizes a project/branch name into a short unique preview subdomain. */
export function siteSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "mysite";
  if (RESERVED_SLUGS.has(slug)) return `${slug}-preview`;
  return slug;
}

/** Builds the live preview URL for a site. */
export function sitePublicUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/$/, "")}/l/${encodeURIComponent(slug)}`;
}

function mapRow(row: Record<string, unknown>): Site {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    html: String(row.html),
    stack: String(row.stack ?? "html"),
    status: (row.status as SiteStatus) ?? "draft",
    deployUrl: row.deploy_url ? String(row.deploy_url) : null,
    deployLog: row.deploy_log ? String(row.deploy_log) : null,
    owner: row.owner ? String(row.owner) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function client() {
  return createSupabaseClient();
}

/** Lists sites (optionally for a given owner). */
export async function listSites(opts: { owner?: string; limit?: number } = {}): Promise<Site[]> {
  try {
    const supabase = await client();
    let query = supabase.from(SITES_TABLE).select("*").order("updated_at", { ascending: false });
    if (opts.owner) query = query.eq("owner", opts.owner);
    query = query.limit(opts.limit ?? 100);
    const { data, error } = await query;
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[]).map(mapRow);
  } catch {
    return [];
  }
}

/** Fetches a site by slug. */
export async function getSiteBySlug(slug: string): Promise<Site | null> {
  try {
    const supabase = await client();
    const { data, error } = await supabase.from(SITES_TABLE).select("*").eq("slug", slug).maybeSingle();
    if (error || !data) return null;
    return mapRow(data as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Creates or updates a site record. */
export async function upsertSite(input: SiteInput): Promise<Site | null> {
  try {
    const supabase = await client();
    const payload = {
      slug: input.slug,
      name: input.name,
      html: input.html,
      stack: input.stack ?? "html",
      status: input.status ?? "draft",
      deploy_url: input.deployUrl ?? null,
      owner: input.owner ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from(SITES_TABLE)
      .upsert(payload, { onConflict: "slug" })
      .select("*")
      .single();
    if (error || !data) return null;
    return mapRow(data as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

/**
 * Publishes a site: saves it and, when a Vercel deploy hook is configured,
 * fires the deployment. Returns the site with its live URL.
 */
export async function deploySite(input: SiteInput, origin: string): Promise<{ site: Site; url: string; deployed: boolean }> {
  const site = await upsertSite({ ...input, status: "deploying", deployUrl: sitePublicUrl(origin, input.slug) });
  if (!site) throw new Error("Unable to register the site.");

  let deployed = false;
  const deployHook = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (deployHook) {
    try {
      const response = await fetch(deployHook, { method: "POST", cache: "no-store" });
      deployed = response.ok;
      await upsertSite({
        ...input,
        slug: site.slug,
        name: site.name,
        html: site.html,
        stack: site.stack,
        status: deployed ? "live" : "error",
        deployUrl: site.deployUrl ?? undefined,
        owner: input.owner,
      });
    } catch {
      await upsertSite({ ...input, slug: site.slug, name: site.name, html: site.html, stack: site.stack, status: "error", deployUrl: site.deployUrl ?? undefined, owner: input.owner });
    }
  } else {
    // No hook configured yet — still expose a preview URL on this platform.
    await upsertSite({ ...input, slug: site.slug, name: site.name, html: site.html, stack: site.stack, status: "live", deployUrl: site.deployUrl ?? undefined, owner: input.owner });
  }

  return { site, url: site.deployUrl ?? sitePublicUrl(origin, site.slug), deployed };
}