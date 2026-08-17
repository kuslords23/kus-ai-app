import type { Metadata } from "next";
import Link from "next/link";
import { listPosts } from "@/lib/jyinx/blog-engine";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Jyinx Blog",
  description: "Docs, guides, and product notes published from the Jyinx creator platform.",
};

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default async function BlogIndexPage() {
  const posts = await listPosts({ status: "published" });

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 text-foreground">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Jyinx Blog</p>
        <h1 className="mt-2 text-3xl font-bold">The creator platform journal</h1>
        <p className="mt-2 text-sm text-muted">Guides and updates from the Jyinx web-building &amp; hosting platform.</p>
      </header>

      {posts.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface/50 p-6 text-sm text-muted">
          No published posts yet. Create one from the Jyinx blog editor.
        </p>
      ) : (
        <div className="grid gap-4">
          {posts.map((post) => (
            <article key={post.slug} className="rounded-2xl border border-border bg-surface/40 p-5">
              <time className="text-xs text-muted">{formatDate(post.published_at ?? post.created_at)}</time>
              <h2 className="mt-1 text-xl font-semibold">
                <Link href={`/blog/${post.slug}`} className="hover:text-gold">{post.title}</Link>
              </h2>
              {post.excerpt && <p className="mt-2 text-sm text-muted">{post.excerpt}</p>}
              {post.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {post.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-border bg-background/50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gold">{tag}</span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}