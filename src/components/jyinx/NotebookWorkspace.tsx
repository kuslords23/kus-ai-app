"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNotebooks } from "./use-notebooks";
import { notebookToContext, stageNotebookHandoff } from "@/lib/jyinx/notebooks";
import type { Notebook, NotebookSource, NotebookSourceKind } from "@/lib/jyinx/notebooks";

const KIND_ICON: Record<NotebookSourceKind, string> = {
  note: "📝",
  snippet: "🧩",
  chat: "💬",
  file: "📎",
};

const KIND_LABEL: Record<NotebookSourceKind, string> = {
  note: "Note",
  snippet: "Code snippet",
  chat: "Chat exchange",
  file: "File",
};

function SourceEditor({
  source,
  onSave,
  onDelete,
}: {
  source: NotebookSource;
  onSave: (patch: { title: string; content: string }) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(source.title);
  const [content, setContent] = useState(source.content);
  const dirty = title !== source.title || content !== source.content;

  return (
    <div className="rounded-2xl border border-border bg-background/60 p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm">{KIND_ICON[source.kind]}</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => dirty && onSave({ title, content })}
          placeholder={KIND_LABEL[source.kind]}
          className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted"
        />
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted hover:bg-danger/10 hover:text-danger"
          aria-label="Delete source"
        >
          Delete
        </button>
      </div>
      {source.kind === "chat" && source.meta?.label && (
        <p className="mt-1 text-[10px] text-muted">{String(source.meta.label)}</p>
      )}
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        onBlur={() => dirty && onSave({ title, content })}
        rows={Math.min(12, Math.max(4, content.split("\n").length + 1))}
        placeholder={
          source.kind === "snippet"
            ? "Paste a code snippet here…"
            : source.kind === "chat"
              ? "Saved chat exchange…"
              : "Write your note or paste file contents…"
        }
        className="mt-2 w-full resize-y rounded-xl border border-border/70 bg-surface/40 p-2.5 text-[13px] leading-relaxed outline-none focus:border-gold/40 placeholder:text-muted"
      />
      {dirty && <p className="mt-1 text-right text-[10px] text-muted">Edits save on blur</p>}
    </div>
  );
}

export function NotebookWorkspace() {
  const router = useRouter();
  const { notebooks, add, remove, rename, addSource, updateSource, removeSource } = useNotebooks();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-select a notebook: ?notebook=<id> or the most recently updated.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("notebook");
    if (target && notebooks.some((item) => item.id === target)) {
      setSelectedId(target);
    } else if (notebooks.length > 0) {
      setSelectedId(notebooks[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active: Notebook | null = selectedId
    ? notebooks.find((item) => item.id === selectedId) ?? notebooks[0] ?? null
    : notebooks[0] ?? null;

  const createNew = () => {
    const notebook = add("Untitled notebook");
    setSelectedId(notebook.id);
    setNotice(`Created "${notebook.name}". Add notes, snippets, files, or saved chats.`);
  };

  const openInJyinx = () => {
    if (!active) return;
    const context = notebookToContext(active);
    stageNotebookHandoff({ notebookId: active.id, notebookName: active.name, context });
    router.push(`/jyinx?notebook=${encodeURIComponent(active.id)}`);
  };

  const ensureNotebook = () => {
    if (active) return active;
    const notebook = add("Untitled notebook");
    setSelectedId(notebook.id);
    return notebook;
  };

  const addKindSource = (kind: NotebookSourceKind) => {
    if (kind === "file") {
      fileInputRef.current?.click();
      return;
    }
    const notebook = ensureNotebook();
    addSource(notebook.id, {
      kind,
      title: KIND_LABEL[kind],
      content: kind === "snippet" ? "// paste code here\n" : "",
    });
    setNotice(`Added a ${KIND_LABEL[kind].toLowerCase()} to "${notebook.name}".`);
  };

  const ingestFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const notebook = ensureNotebook();
    let added = 0;
    for (const file of Array.from(files).slice(0, 4)) {
      const text = await file.text().catch(() => "");
      addSource(notebook.id, {
        kind: "file",
        title: file.name,
        content: text,
        meta: { filename: file.name, mimeType: file.type || "text/plain" },
      });
      added += 1;
    }
    setNotice(`Added ${added} file${added === 1 ? "" : "s"} to "${notebook.name}".`);
  };

  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/jyinx"
            className="shrink-0 rounded-lg border border-border bg-surface/70 px-2.5 py-2 text-xs font-medium text-muted hover:border-gold/40 hover:text-gold"
            aria-label="Back to Jyinx"
          >
            ← Jyinx
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">Notebooks</h1>
            <p className="truncate text-[11px] text-muted">Notes · snippets · saved chats</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {active && (
            <button
              type="button"
              onClick={openInJyinx}
              className="rounded-lg border border-gold/40 bg-gold px-3 py-2 text-xs font-semibold text-background hover:bg-gold/90"
            >
              Open in Jyinx
            </button>
          )}
          <button
            type="button"
            onClick={createNew}
            className="rounded-lg border border-border bg-surface/70 px-3 py-2 text-xs font-medium hover:border-gold/40 hover:text-gold"
          >
            + Notebook
          </button>
        </div>
      </header>

      {!notebooks.length ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
          <div className="mb-3 text-4xl">📓</div>
          <h2 className="text-lg font-semibold">Create your first notebook</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
            Collect notes, code snippets, files, and Royal chat exchanges, then
            hand the whole notebook to Jyinx to build or refactor code from it.
          </p>
          <button
            type="button"
            onClick={createNew}
            className="mt-6 rounded-xl border border-gold/35 bg-gold/10 px-5 py-2.5 text-sm font-medium text-gold hover:bg-gold/20"
          >
            New notebook
          </button>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 pb-32 pt-5 lg:flex-row">
          <aside className="flex shrink-0 flex-col gap-2 lg:w-60 lg:border-r lg:border-border lg:pr-4">
            <div className="flex items-center justify-between px-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Notebooks</p>
              <button type="button" onClick={createNew} className="text-xs text-gold hover:underline">
                + New
              </button>
            </div>
            {notebooks.map((notebook) => (
              <button
                key={notebook.id}
                type="button"
                onClick={() => setSelectedId(notebook.id)}
                className={`rounded-xl border px-3 py-2.5 text-left transition ${
                  active?.id === notebook.id
                    ? "border-gold/40 bg-gold/10"
                    : "border-border bg-surface/50 hover:border-gold/25"
                }`}
              >
                <span className="block truncate text-sm font-medium">{notebook.name}</span>
                <span className="mt-0.5 block text-[10px] text-muted">
                  {notebook.sources.length} source{notebook.sources.length === 1 ? "" : "s"} ·{" "}
                  {new Date(notebook.updatedAt).toLocaleDateString()}
                </span>
              </button>
            ))}
          </aside>

          {active && (
            <section className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <input
                  value={active.name}
                  onChange={(event) => rename(active.id, event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-xl font-semibold outline-none"
                  aria-label="Notebook name"
                />
                <button
                  type="button"
                  onClick={() => {
                    remove(active.id);
                    setSelectedId(notebooks.find((item) => item.id !== active.id)?.id ?? null);
                  }}
                  className="rounded-lg border border-border px-2 py-1 text-[11px] text-muted hover:border-danger/40 hover:text-danger"
                >
                  Delete notebook
                </button>
              </div>

              {notice && (
                <p className="mt-2 rounded-xl border border-gold/25 bg-gold/5 px-3 py-2 text-xs text-gold">{notice}</p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {(["note", "snippet", "chat", "file"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => addKindSource(kind)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/70 px-2.5 py-2 text-xs font-medium hover:border-gold/30 hover:text-gold"
                  >
                    <span>{KIND_ICON[kind]}</span>
                    {KIND_LABEL[kind]}
                  </button>
                ))}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(event) => void ingestFiles(event.target.files)}
                />
              </div>

              <div className="mt-4 flex flex-col gap-3">
                {active.sources.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs text-muted">
                    No sources yet. Add a note, paste a code snippet, attach a file, or save a Royal chat exchange.
                  </div>
                ) : (
                  active.sources.map((source) => (
                    <SourceEditor
                      key={source.id}
                      source={source}
                      onSave={(patch) => updateSource(active.id, source.id, patch)}
                      onDelete={() => {
                        removeSource(active.id, source.id);
                        setNotice(`Removed "${source.title}".`);
                      }}
                    />
                  ))
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}