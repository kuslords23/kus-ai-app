"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addSourceToNotebook,
  createNotebook,
  deleteNotebook,
  getNotebook,
  loadNotebooks,
  removeSourceFromNotebook,
  updateSourceInNotebook,
  upsertNotebook,
  type Notebook,
  type NotebookSourceKind,
} from "@/lib/jyinx/notebooks";

/** Reactive wrapper around the localStorage notebook store. */
export function useNotebooks() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);

  useEffect(() => {
    const sync = () => setNotebooks(loadNotebooks());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("jyinx:notebooks-changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("jyinx:notebooks-changed", sync);
    };
  }, []);

  const refresh = useCallback(() => {
    const next = loadNotebooks();
    setNotebooks(next);
    return next;
  }, []);

  const add = useCallback((name?: string, description?: string) => {
    const notebook = createNotebook(name ?? "", description);
    upsertNotebook(notebook);
    refresh();
    return notebook;
  }, [refresh]);

  const remove = useCallback((id: string) => {
    deleteNotebook(id);
    refresh();
  }, [refresh]);

  const rename = useCallback((id: string, name: string, description?: string) => {
    const current = getNotebook(id);
    if (!current) return;
    upsertNotebook({ ...current, name, description });
    refresh();
  }, [refresh]);

  const addSource = useCallback(
    (notebookId: string, source: { kind: NotebookSourceKind; title?: string; content: string; meta?: Record<string, unknown> }) => {
      addSourceToNotebook(notebookId, source);
      refresh();
    },
    [refresh]
  );

  const updateSource = useCallback(
    (notebookId: string, sourceId: string, patch: { title?: string; content?: string }) => {
      updateSourceInNotebook(notebookId, sourceId, patch);
      refresh();
    },
    [refresh]
  );

  const removeSource = useCallback(
    (notebookId: string, sourceId: string) => {
      removeSourceFromNotebook(notebookId, sourceId);
      refresh();
    },
    [refresh]
  );

  const active = useMemo(() => notebooks[0] ?? null, [notebooks]);

  return { notebooks, active, add, remove, rename, addSource, updateSource, removeSource, refresh };
}