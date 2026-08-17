import { createClient as createSupabaseClient } from "@/lib/supabase/server";

/**
 * Jyinx Blog Engine & headless CMS.
 *
 * Stores posts in a Supabase `jyinx_blog_posts` table with front-matter
 * (title, slug, excerpt, cover, tags, status, author) and markdown body.
 * Produces SEO metadata (canonical URL, meta description, Open Graph, JSON-LD)
 * and clean route slugs for search engines.
 *
 * Suggested schema (see supabase/migrations):
 *   create table jyinx_blog_posts (
 *     id uuid primary key default gen_random_uuid(),
 *     slug text not null unique,
 *     title text not null,
 *     excerpt text,
 *     cover text,
 *     body text not null,
 *     tags text[] default '{}',
 *     status text not null default 'draft',        -- draft | published
 *     author text,
 *     published_at timestamptz,
 *     created_at timestamptz default now(),
 *     updated_at timestamptz default now()
 *   );
 */

const POSTS_TABLE = "jyinx_blog_posts";

export type BlogPostStatus = "draft" | "published";

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  cover?: string | null;
  body: string;
  tags: string[];
  status: BlogPostStatus;
  author?: string | null;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type BlogPostInput = {
  slug: string;
  title: string;
  body: string;
  excerpt?: string;
  cover?: string;
  tags?: string[];
  status?: BlogPostStatus;
  author?: string;
};

const RESERVED_SLUGS = new Set(["new", "edit", "api", "admin", "preview"]);

/** Lowercases, trims, and URL-slugs a title/branch into a unique route. */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "post";
  return RESERVED_SLUGS.has(slug) ? `${slug}-post` : slug;
}

function mapRow(row: Record<string, unknown>): BlogPost {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    excerpt: row.excerpt ? String(row.excerpt) : null,
    cover: row.cover ? String(row.cover) : null,
    body: String(row.body),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    status: row.status === "published" ? "published" : "draft",
    author: row.author ? String(row.author) : null,
    published_at: row.published_at ? String(row.published_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function client(): Promise<ReturnType<typeof createSupabaseClient>> {
  return createSupabaseClient();
}

/** Lists posts, optionally filtered by status and search. */
export async function listPosts(opts: { status?: BlogPostStatus; limit?: number } = {}): Promise<BlogPost[]> {
  try {
    const supabase = await client();
    let query = supabase.from(POSTS_TABLE).select("*").order("updated_at", { ascending: false });
    if (opts.status) query = query.eq("status", opts.status);
    query = query.limit(opts.limit ?? 100);
    const { data, error } = await query;
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[]).map(mapRow);
  } catch {
    return [];
  }
}

/** Fetches a single post by slug. */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  try {
    const supabase = await client();
    const { data, error } = await supabase.from(POSTS_TABLE).select("*").eq("slug", slug).maybeSingle();
    if (error || !data) return null;
    return mapRow(data as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Creates or updates a post. Returns the saved post. */
export async function upsertPost(input: BlogPostInput): Promise<BlogPost | null> {
  try {
    const supabase = await client();
    const now = new Date().toISOString();
    const payload = {
      slug: input.slug,
      title: input.title,
      body: input.body,
      excerpt: input.excerpt ?? null,
      cover: input.cover ?? null,
      tags: input.tags ?? [],
      status: input.status ?? "draft",
      author: input.author ?? null,
      published_at: input.status === "published" ? now : null,
      updated_at: now,
    };
    const { data, error } = await supabase
      .from(POSTS_TABLE)
      .upsert(payload, { onConflict: "slug" })
      .select("*")
      .single();
    if (error || !data) return null;
    return mapRow(data as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Deletes a post by slug. */
export async function deletePost(slug: string): Promise<boolean> {
  try {
    const supabase = await client();
    const { error } = await supabase.from(POSTS_TABLE).delete().eq("slug", slug);
    return !error;
  } catch {
    return false;
  }
}

/** Builds a canonical absolute URL for a post (uses the request origin). */
export function postUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/$/, "")}/blog/${encodeURIComponent(slug)}`;
}

/** Derives a pack of SEO metadata for a post. */
export function buildSeo(post: BlogPost, origin: string) {
  const url = postUrl(origin, post.slug);
  const description = post.excerpt ?? post.body.replace(/[#*`>\n]/g, " ").trim().slice(0, 155);
  const title = `${post.title} — Jyinx Blog`;
  return {
    title,
    description,
    url,
    ogTitle: post.title,
    ogDescription: description,
    ogImage: post.cover ?? undefined,
    canonical: url,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      datePublished: post.published_at ?? post.created_at,
      dateModified: post.updated_at,
      author: { "@type": "Person", name: post.author ?? "Jyinx" },
      description,
      mainEntityOfPage: url,
    },
    robots: post.status === "published" ? "index, follow" : "noindex, nofollow",
  };
}