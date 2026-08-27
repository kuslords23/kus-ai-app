"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";

export type BlogEditorPost = {
  slug: string;
  title: string;
  excerpt?: string | null;
  cover?: string | null;
  body: string;
  tags: string[];
  status: "draft" | "published";
  author?: string | null;
};

type BlogEditorProps = {
  posts: BlogEditorPost[];
};

/**
 * Jyinx Blog editor & headless CMS.
 *
 * Lets users spin up, edit, and publish blog posts instantly. Compose in
 * markdown with a live preview, set SEO metadata, and publish (or save as
 * draft). Uses the `/api/blog` route (Supabase-backed).
 */
export function BlogEditor({ posts }: BlogEditorProps) {
  const [selected, setSelected] = useState<BlogEditorPost | null>(posts[0] ?? null);
  const [editing, setEditing] = useState<BlogEditorPost>(() => ({
    slug: posts[0]?.slug ?? "",
    title: posts[0]?.title ?? "",
    excerpt: posts[0]?.excerpt ?? "",
    cover: posts[0]?.cover ?? "",
    body: posts[0]?.body ?? "",
    tags: posts[0]?.tags ?? [],
    status: posts[0]?.status ?? "draft",
    author: posts[0]?.author ?? "",
  }));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const slugify = (value: string) =>
    value.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-");

  const startNew = () => {
    setSelected(null);
    setEditing({ slug: "", title: "", excerpt: "", cover: "", body: "# Title\n\nWrite your post…", tags: [], status: "draft", author: "Jyinx" });
    setDirty(false);
    setMessage(null);
  };

  const open = (post: BlogEditorPost) => {
    setSelected(post);
    setEditing({ ...post, tags: [...post.tags] });
    setDirty(false);
    setMessage(null);
  };

  const update = (patch: Partial<BlogEditorPost>) => {
    setEditing((current) => ({ ...current, ...patch, slug: patch.slug ?? current.slug }));
    setDirty(true);
    setMessage(null);
  };

  const save = async (status: "draft" | "published") => {
    if (!editing.title.trim()) return setMessage("Title is required.");
    if (!editing.body.trim()) return setMessage("Body is required.");
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editing, slug: editing.slug || slugify(editing.title), status, tags: editing.tags.map((t) => t.trim()).filter(Boolean) }),
      });
      const data = (await response.json()) as { post?: BlogEditorPost; error?: string };
      if (!response.ok || !data.post) throw new Error(data.error || "Save failed.");
      setEditing(data.post);
      setSelected(data.post);
      setDirty(false);
      setMessage(`${status === "published" ? "Published" : "Saved"} — ${data.post.slug}`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to save the post.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing.slug) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/blog?id=${encodeURIComponent(editing.slug)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed.");
      setEditing({ slug: "", title: "", excerpt: "", cover: "", body: "# Title\n\nWrite…", tags: [], status: "draft", author: "Jyinx" });
      setSelected(null);
      setDirty(false);
      setMessage("Post deleted.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to delete.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl p-4 text-foreground">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold">Blog &amp; CMS</h1>
        <Link href="/blog" className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground">View site</Link>
        <button type="button" onClick={startNew} className="ml-auto rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-background">+ New post</button>
      </div>

      {message && <p className={`mb-4 rounded-lg border px-3 py-2 text-xs ${message.includes("Unable") || message.includes("required") ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-success/30 bg-success/10 text-success"}`}>{message}</p>}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        {/* Post list */}
        <aside className="overflow-hidden rounded-xl border border-border bg-surface/40">
          <div className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-wider text-muted">Posts</div>
          <div className="max-h-[70vh] overflow-y-auto p-2">
            {posts.map((post) => (
              <button
                key={post.slug}
                type="button"
                onClick={() => open(post)}
                className={`mb-1 block w-full truncate rounded-lg px-3 py-2 text-left text-xs ${selected?.slug === post.slug ? "bg-gold/15 text-gold" : "text-foreground hover:bg-surface"}`}
              >
                {post.title}
                <span className="ml-2 text-[10px] text-muted">{post.status === "published" ? "● published" : "○ draft"}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Editor */}
        <section className="min-w-0">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Title *</span>
              <input value={editing.title} onChange={(event) => update({ title: event.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Slug (URL)</span>
              <input value={editing.slug} onChange={(event) => update({ slug: event.target.value })} placeholder="auto" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold" />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Excerpt (SEO description)</span>
              <input value={editing.excerpt ?? ""} onChange={(event) => update({ excerpt: event.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Cover image URL</span>
              <input value={editing.cover ?? ""} onChange={(event) => update({ cover: event.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Tags (comma-separated)</span>
              <input value={editing.tags.join(", ")} onChange={(event) => update({ tags: event.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold" />
            </label>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted">Markdown</span>
              </div>
              <textarea value={editing.body} onChange={(event) => update({ body: event.target.value })} spellCheck={false} className="min-h-[42vh] w-full resize-none rounded-lg border border-border bg-[#0d0917] p-3 font-mono text-xs leading-6 text-purple-soft outline-none focus:border-gold" />
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">Preview</div>
              <div className="max-h-[42vh] overflow-y-auto rounded-lg border border-border bg-surface/40 p-3 text-sm prose prose-invert prose-a:text-gold prose-code:text-purple-soft prose-blockquote:border-gold/40">
                <Markdown remarkPlugins={[remarkGfm]}>{editing.body}</Markdown>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void save("draft")} disabled={saving} className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground disabled:opacity-50">Save draft</button>
            <button type="button" onClick={() => void save("published")} disabled={saving} className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">{saving ? "Saving…" : "Publish"}</button>
            {selected && (
              <button type="button" onClick={() => void remove()} disabled={saving} className="ml-auto rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400 disabled:opacity-50">Delete</button>
            )}
            {dirty && <span className="text-xs text-muted">Unsaved changes</span>}
          </div>
        </section>
      </div>
    </div>
  );
}