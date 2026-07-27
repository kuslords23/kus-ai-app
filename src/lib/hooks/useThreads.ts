"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChatThread } from "@/lib/threads/types";
import {
  createThread,
  loadActiveThreadId,
  loadThreads,
  saveActiveThreadId,
  saveThreads,
} from "@/lib/threads/storage";

export function useThreads(userId: string | null) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loaded = loadThreads(userId);
    const savedActive = loadActiveThreadId(userId);
    const active =
      savedActive && loaded.some((t) => t.id === savedActive)
        ? savedActive
        : loaded[0]?.id ?? null;

    setThreads(loaded);
    setActiveId(active);
    setReady(true);
  }, [userId]);

  const persist = useCallback(
    (next: ChatThread[]) => {
      setThreads(next);
      saveThreads(userId, next);
    },
    [userId]
  );

  const setActive = useCallback(
    (id: string | null) => {
      setActiveId(id);
      saveActiveThreadId(userId, id);
    },
    [userId]
  );

  const newThread = useCallback(() => {
    const t = createThread();
    persist([t, ...threads]);
    setActive(t.id);
    return t;
  }, [persist, setActive, threads]);

  const deleteThread = useCallback(
    (id: string) => {
      const next = threads.filter((t) => t.id !== id);
      persist(next);
      if (activeId === id) {
        setActive(next[0]?.id ?? null);
      }
    },
    [activeId, persist, setActive, threads]
  );

  const updateThread = useCallback(
    (id: string, updater: (t: ChatThread) => ChatThread) => {
      persist(threads.map((t) => (t.id === id ? updater(t) : t)));
    },
    [persist, threads]
  );

  const activeThread = threads.find((t) => t.id === activeId) ?? null;

  const search = useCallback(
    (q: string) => {
      const needle = q.trim().toLowerCase();
      if (!needle) return threads;
      return threads.filter(
        (t) =>
          t.title.toLowerCase().includes(needle) ||
          t.messages.some((m) => m.content.toLowerCase().includes(needle))
      );
    },
    [threads]
  );

  return {
    threads,
    activeThread,
    activeId,
    ready,
    setActive,
    newThread,
    deleteThread,
    updateThread,
    persist,
    search,
  };
}
