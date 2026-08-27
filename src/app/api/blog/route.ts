import { NextRequest, NextResponse } from "next/server";
import { listPosts, getPostBySlug, upsertPost, deletePost, slugify, type BlogPostInput } from "@/lib/jyinx/blog-engine";

export const runtime = "nodejs";

/** GET /api/blog — list posts, optionally ?status=published | draft, ?q=search */
export async function GET(request: NextRequest) {
  const statusParam = request.nextUrl.searchParams.get("status");
  const status = statusParam === "published" || statusParam === "draft" ? statusParam : undefined;
  const posts = await listPosts({ status });
  return NextResponse.json({ posts });
}

/** POST /api/blog — create/update a post (headless CMS write). */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Partial<BlogPostInput> | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const bodyMarkdown = typeof body?.body === "string" ? body.body.trim() : "";
  if (!title || !bodyMarkdown) {
    return NextResponse.json({ error: "title and body are required." }, { status: 400 });
  }

  const slug = typeof body?.slug === "string" && body.slug.trim() ? slugify(body.slug) : slugify(title);

  // Reuse slug for uniqueness on create; allow edit via matching existing slug.
  const existing = await getPostBySlug(slug);
  const input: BlogPostInput = {
    slug,
    title,
    body: bodyMarkdown,
    excerpt: typeof body?.excerpt === "string" ? body.excerpt : undefined,
    cover: typeof body?.cover === "string" ? body.cover : undefined,
    tags: Array.isArray(body?.tags) ? body.tags.map(String).slice(0, 8) : undefined,
    status: body?.status === "published" ? "published" : existing?.status ?? "draft",
    author: typeof body?.author === "string" ? body.author : undefined,
  };
  const saved = await upsertPost(input);
  if (!saved) {
    return NextResponse.json({ error: "Unable to save the post." }, { status: 500 });
  }
  return NextResponse.json({ post: saved });
}

/** DELETE /api/blog?id=:slug — delete a post. */
export async function DELETE(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("id") ?? "";
  if (!slug) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const ok = await deletePost(slug);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Unable to delete the post." }, { status: 500 });
}