import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getPostBySlug, buildSeo } from "@/lib/jyinx/blog-engine";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function getPost(paramsValue: Props["params"]) {
  const { slug } = await paramsValue;
  const safeSlug = slug.replace(/\.html$/, "");
  return getPostBySlug(safeSlug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost(params);
  if (!post || post.status !== "published") {
    return { title: "Not found", robots: { index: false } };
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kus-ai-app.vercel.app";
  const seo = buildSeo(post, origin);
  return {
    title: post.title,
    description: seo.description,
    alternates: { canonical: seo.canonical },
    openGraph: { title: seo.ogTitle, description: seo.ogDescription, url: seo.canonical, type: "article", images: seo.ogImage ? [{ url: seo.ogImage }] : undefined },
    robots: seo.robots,
    other: { "application/ld+json": JSON.stringify(seo.jsonLd) },
  };
}

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default async function BlogPostPage({ params }: Props) {
  const post = await getPost(params);
  if (!post || post.status !== "published") notFound();

  return (
    <article className="mx-auto w-full max-w-2xl px-5 py-10 text-foreground">
      <header className="mb-6">
        {post.tags.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-border bg-background/50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gold">{tag}</span>
            ))}
          </div>
        )}
        <h1 className="text-3xl font-bold leading-tight">{post.title}</h1>
        <p className="mt-3 text-sm text-muted">
          {post.author ? `${post.author} · ` : ""}{formatDate(post.published_at ?? post.created_at)}
        </p>
      </header>

      {post.cover && <Image src={post.cover} alt="" unoptimized width={1200} height={400} className="mb-6 w-full rounded-xl border border-border" />}

      <div className="prose prose-invert max-w-none prose-headings:mt-8 prose-h2:text-xl prose-h3:text-lg prose-p:leading-7 prose-a:text-gold prose-li:marker:text-gold prose-code:text-purple-soft prose-blockquote:border-gold/40">
        <Markdown remarkPlugins={[remarkGfm]}>{post.body}</Markdown>
      </div>
    </article>
  );
}