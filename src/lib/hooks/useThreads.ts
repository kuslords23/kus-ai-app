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
import { fetchCloudThreads, mergeThreads } from "@/lib/threads/sync";

export function useThreads(userId: string | null) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const local = loadThreads(userId);
      let merged = local;

      if (userId) {
        setSyncing(true);
        try {
          const cloud = await fetchCloudThreads(userId);
          merged = mergeThreads(local, cloud);
          saveThreads(userId, merged);
        } catch {
          merged = local;
        } finally {
          if (!cancelled) setSyncing(false);
        }
      }

      if (cancelled) return;

      setThreads(merged);
      const savedActive = loadActiveThreadId(userId);
      const active =
        savedActive && merged.some((t) => t.id === savedActive)
          ? savedActive
          : merged[0]?.id ?? null;
      setActiveId(active);
      setReady(true);
    }

    boot();
    return () => {
      cancelled = true;
    };
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

  const refreshFromCloud = useCallback(async () => {
    if (!userId) return;
    setSyncing(true);
    try {
      const cloud = await fetchCloudThreads(userId);
      const merged = mergeThreads(loadThreads(userId), cloud);
      persist(merged);
    } finally {
      setSyncing(false);
    }
  }, [userId, persist]);

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
    syncing,
    setActive,
    newThread,
    deleteThread,
    updateThread,
    persist,
    search,
    refreshFromCloud,
  };
}
