import type { Metadata } from "next";
import { BlogEditor } from "@/components/jyinx/BlogEditor";
import { listPosts } from "@/lib/jyinx/blog-engine";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Jyinx Blog & CMS",
  description: "Create, edit, and publish blog posts on the Jyinx creator platform.",
};

export default async function JyinxBlogPage() {
  const posts = await listPosts();
  return <BlogEditor posts={posts.map((p) => ({ slug: p.slug, title: p.title, excerpt: p.excerpt, cover: p.cover, body: p.body, tags: p.tags, status: p.status, author: p.author }))} />;
}