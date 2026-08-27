"use client";

import { useCallback, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type BlogBuilderDraft = {
  slug: string;
  title: string;
  excerpt: string;
  cover: string;
  body: string;
  tags: string[];
  status: "draft" | "published";
  author: string;
  id?: string;
};

type BlogBuilderProps = {
  /** Existing posts loaded from the CMS (for the gallery/arena). */
  posts?: BlogBuilderDraft[];
  initial?: BlogBuilderDraft | null;
};

const emptyDraftBody = "# Title\n\nWrite your post…";

const EMPTY_DRAFT: BlogBuilderDraft = {
  slug: "",
  title: "",
  excerpt: "",
  cover: "",
  body: emptyDraftBody,
  tags: [],
  status: "draft",
  author: "Jyinx",
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

/**
 * Jyinx Blog creation arena.
 *
 * A responsive markdown + headless-CMS compose screen with live-bound handlers
 * for every control: title, slug, excerpt, cover, tags, and markdown body with
 * an instant live preview. Save as draft or publish directly to `/api/blog`.
 * Includes a back button to return to the blog dashboard on mobile and desktop.
 */
export function BlogBuilder({ posts = [], initial = null }: BlogBuilderProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<BlogBuilderDraft>(initial ?? { ...EMPTY_DRAFT });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const update = useCallback((patch: Partial<BlogBuilderDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
    setMessage(null);
  }, []);

  const save = async (status: "draft" | "published") => {
    if (!draft.title.trim()) return setMessage("A title is required.");
    if (!draft.body.trim()) return setMessage("A body is required.");
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          slug: draft.slug || slugify(draft.title),
          status,
          tags: draft.tags.map((t) => t.trim()).filter(Boolean),
        }),
      });
      const data = (await response.json()) as { post?: BlogBuilderDraft; error?: string };
      if (!response.ok || !data.post) throw new Error(data.error || "Unable to save.");
      const saved = data.post;
      setDraft({ ...saved, tags: saved.tags ?? [] });
      setDirty(false);
      setMessage(status === "published" ? `Published — ${saved.slug}` : `Saved draft — ${saved.slug}`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to save the post.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft.slug) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/blog?id=${encodeURIComponent(draft.slug)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed.");
      setDraft({ ...EMPTY_DRAFT });
      setDirty(false);
      setMessage("Post deleted.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to delete.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Arena header bar */}
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => router.push("/jyinx/blog")}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-gold/30 bg-gold/10 px-2.5 py-1.5 text-xs font-medium text-gold"
          aria-label="Back to blog dashboard"
        >
          ← Back
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Blog creation arena</p>
          <p className="truncate text-[10px] text-muted">{dirty ? "Unsaved changes" : "Compose &amp; publish"}</p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/blog")}
          className="sm:ml-auto rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
        >
          View live site
        </button>
      </header>

      <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
        {message && (
          <p className={`mb-4 rounded-lg border px-3 py-2 text-xs ${message.includes("Unable") || message.includes("required") ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-success/30 bg-success/10 text-success"}`}>
            {message}
          </p>
        )}

        {/* Meta fields — responsive 1-col mobile, 2-col sm, 3-col lg */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block lg:col-span-3">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Title *</span>
            <input value={draft.title} onChange={(event) => update({ title: event.target.value })} className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Slug (URL)</span>
            <input value={draft.slug} onChange={(event) => update({ slug: event.target.value })} placeholder="auto" className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Author</span>
            <input value={draft.author} onChange={(event) => update({ author: event.target.value })} className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Cover image URL</span>
            <input value={draft.cover} onChange={(event) => update({ cover: event.target.value })} className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Excerpt (SEO description)</span>
            <input value={draft.excerpt} onChange={(event) => update({ excerpt: event.target.value })} className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Tags (comma-separated)</span>
            <input value={draft.tags.join(", ")} onChange={(event) => update({ tags: event.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold" />
          </label>
        </div>

        {/* Markdown + live preview — side-by-side on lg */}
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">Markdown</div>
            <textarea value={draft.body} onChange={(event) => update({ body: event.target.value })} spellCheck={false} className="min-h-[46vh] w-full resize-none rounded-xl border border-border bg-[#0d0917] p-3 font-mono text-xs leading-6 text-purple-soft outline-none focus:border-gold" />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">Live preview</div>
            <div className="max-h-[46vh] min-h-[46vh] overflow-y-auto rounded-xl border border-border bg-surface/40 p-4 text-sm">
              {draft.cover && <img src={draft.cover} alt="" className="mb-3 w-full rounded-lg border border-border" />}
              <h1 className="text-2xl font-bold">{draft.title}</h1>
              <p className="mt-1 text-xs text-muted">{draft.author} · {new Date().toLocaleDateString()}</p>
              {draft.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {draft.tags.map((tag) => <span key={tag} className="rounded-full border border-border bg-background/50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gold">{tag}</span>)}
                </div>
              )}
              <div className="prose prose-invert mt-4 max-w-none prose-a:text-gold prose-code:text-purple-soft prose-blockquote:border-gold/40">
                <Markdown remarkPlugins={[remarkGfm]}>{draft.body}</Markdown>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void save("draft")} disabled={saving} className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground disabled:opacity-50">Save draft</button>
          <button type="button" onClick={() => void save("published")} disabled={saving} className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">{saving ? "Saving…" : "Publish ↗"}</button>
          {draft.slug && (
            <button type="button" onClick={() => void remove()} disabled={saving} className="ml-auto rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400 disabled:opacity-50">Delete</button>
          )}
          {dirty && <span className="ml-auto text-xs text-muted">Unsaved changes</span>}
        </div>
      </div>
    </div>
  );
}