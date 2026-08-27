/**
 * Notebook data layer — a local, Gemini/NotebookLM-style workspace for notes,
 * code snippets, files, and saved Royal chat exchanges. Sources inside a
 * notebook are aggregated into a structured context payload that can be handed
 * off to Jyinx ("Open in Jyinx").
 *
 * Persistence is localStorage to keep the notebook fully offline & zero-cloud,
 * matching the app's other client-side stores.
 */

export type NotebookSourceKind = "note" | "snippet" | "chat" | "file";

export type NotebookSource = {
  id: string;
  kind: NotebookSourceKind;
  title: string;
  content: string;
  /** Optional meta for chat/file sources (e.g. model used, mimetype). */
  meta?: { label?: string; language?: string; mimeType?: string; createdAt?: number } & Record<string, unknown>;
  createdAt: number;
};

export type Notebook = {
  id: string;
  name: string;
  description?: string;
  sources: NotebookSource[];
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "jyinx:notebooks";
const MAX_SOURCES = 24;
const MAX_SOURCE_CHARS = 60_000;

/** Hydrate notebooks from localStorage with a defensive shape check. */
export function loadNotebooks(): Notebook[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isNotebook);
  } catch {
    return [];
  }
}

function isNotebook(value: unknown): value is Notebook {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    Array.isArray(record.sources)
  );
}

function saveNotebooks(notebooks: Notebook[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notebooks));
  } catch {
    // storage full / private mode — notebook stays in memory only
  }
}

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createNotebook(name: string, description?: string): Notebook {
  return {
    id: uid(),
    name: name.trim() || "Untitled notebook",
    description: description?.trim() || undefined,
    sources: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function getNotebooks(): Notebook[] {
  return loadNotebooks();
}

export function getNotebook(id: string): Notebook | undefined {
  return loadNotebooks().find((notebook) => notebook.id === id);
}

export function upsertNotebook(notebook: Notebook): Notebook[] {
  const notebooks = loadNotebooks();
  const index = notebooks.findIndex((item) => item.id === notebook.id);
  if (index >= 0) {
    notebooks[index] = { ...notebook, updatedAt: Date.now() };
  } else {
    notebooks.unshift(notebook);
  }
  saveNotebooks(notebooks);
  return notebooks;
}

export function deleteNotebook(id: string): Notebook[] {
  const notebooks = loadNotebooks().filter((notebook) => notebook.id !== id);
  saveNotebooks(notebooks);
  return notebooks;
}

export function addSourceToNotebook(
  notebookId: string,
  source: { id?: string; kind: NotebookSourceKind; title?: string; content: string; meta?: Record<string, unknown> }
): Notebook[] {
  const notebooks = loadNotebooks();
  const notebook = notebooks.find((item) => item.id === notebookId);
  if (!notebook) return notebooks;
  if (notebook.sources.length >= MAX_SOURCES) return notebooks;
  const nextSource: NotebookSource = {
    id: source.id ?? uid(),
    kind: source.kind,
    title: source.title?.trim() || source.kind,
    content: source.content.slice(0, MAX_SOURCE_CHARS),
    meta: source.meta,
    createdAt: Date.now(),
  };
  notebooks[notebooks.indexOf(notebook)] = {
    ...notebook,
    sources: [...notebook.sources, nextSource],
    updatedAt: Date.now(),
  };
  saveNotebooks(notebooks);
  return notebooks;
}

export function updateSourceInNotebook(
  notebookId: string,
  sourceId: string,
  patch: Partial<Pick<NotebookSource, "title" | "content" | "kind" | "meta">>
): Notebook[] {
  const notebooks = loadNotebooks();
  const notebook = notebooks.find((item) => item.id === notebookId);
  if (!notebook) return notebooks;
  notebooks[notebooks.indexOf(notebook)] = {
    ...notebook,
    sources: notebook.sources.map((source) =>
      source.id === sourceId ? { ...source, ...patch } : source
    ),
    updatedAt: Date.now(),
  };
  saveNotebooks(notebooks);
  return notebooks;
}

export function removeSourceFromNotebook(notebookId: string, sourceId: string): Notebook[] {
  const notebooks = loadNotebooks();
  const notebook = notebooks.find((item) => item.id === notebookId);
  if (!notebook) return notebooks;
  notebooks[notebooks.indexOf(notebook)] = {
    ...notebook,
    sources: notebook.sources.filter((source) => source.id !== sourceId),
    updatedAt: Date.now(),
  };
  saveNotebooks(notebooks);
  return notebooks;
}

/** Append a chat exchange from Royal (or any persona) into a notebook. */
export function saveChatExchangeToNotebook(
  notebookId: string,
  exchange: { role: "user" | "assistant"; content: string; title?: string }
): Notebook[] {
  const roleLabel = exchange.role === "user" ? "You" : "Royal";
  const title = exchange.title || `${roleLabel} · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const content = exchange.content.slice(0, MAX_SOURCE_CHARS);
  return addSourceToNotebook(notebookId, {
    kind: "chat",
    title,
    content,
    meta: { label: "Saved from Royal chat", createdAt: new Date().toISOString() },
  });
}

/**
 * Aggregate a notebook's sources into a structured context payload that is
 * handed to Jyinx (agent chat + IDE composer) when the user taps
 * "Open in Jyinx".
 */
export function notebookToContext(notebook: Notebook, instruction?: string): string {
  const parts = notebook.sources.map((source) => {
    const filename = typeof source.meta?.filename === "string" ? source.meta.filename : undefined;
    const label = filename || source.title || source.kind;
    switch (source.kind) {
      case "snippet":
        return `## Code snippet: ${label}\n\`\`\`\n${source.content}\n\`\`\``;
      case "chat":
        return `## Chat exchange: ${label}\n${source.content}`;
      case "file":
        return `## File: ${filename ?? label}\n${source.content}`;
      case "note":
      default:
        return `## Note: ${label}\n${source.content}`;
    }
  });

  const heading = `Notebook "${notebook.name}"${instruction ? ` — ${instruction}` : ""}`;
  const body = parts.length
    ? parts.join("\n\n---\n\n")
    : "(this notebook has no sources yet)";
  return `${heading}\n\n${body}`.slice(0, 180_000);
}

/** Store the pending hand-off payload for the Jyinx dashboard/IDE to consume. */
export function stageNotebookHandoff(payload: { notebookId: string; notebookName: string; context: string }) {
  try {
    window.localStorage.setItem("jyinx:pending-notebook", JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function consumeNotebookHand(): { notebookId: string; notebookName: string; context: string } | null {
  try {
    const raw = window.localStorage.getItem("jyinx:pending-notebook");
    if (!raw) return null;
    window.localStorage.removeItem("jyinx:pending-notebook");
    const parsed = JSON.parse(raw) as { notebookId?: unknown; notebookName?: unknown; context?: unknown };
    if (
      typeof parsed.notebookId === "string" &&
      typeof parsed.notebookName === "string" &&
      typeof parsed.context === "string"
    ) {
      return {
        notebookId: parsed.notebookId,
        notebookName: parsed.notebookName,
        context: parsed.context,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export const NOTEBOOK_CONSTANTS = { MAX_SOURCES, MAX_SOURCE_CHARS };