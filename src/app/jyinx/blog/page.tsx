import type { Metadata } from "next";
import { BlogBuilder } from "@/components/jyinx/BlogBuilder";
import { listPosts } from "@/lib/jyinx/blog-engine";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Jyinx Blog Creation Arena",
  description: "Create, edit, and publish blog posts on the Jyinx creator platform.",
};

export default async function JyinxBlogPage() {
  const posts = await listPosts();
  return (
    <BlogBuilder
      posts={posts.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        excerpt: p.excerpt ?? "",
        cover: p.cover ?? "",
        body: p.body,
        tags: p.tags,
        status: p.status,
        author: p.author ?? "Jyinx",
      }))}
    />
  );
}