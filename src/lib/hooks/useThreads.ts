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
import { fetchCloudThreads, mergeThreads, deleteCloudThread } from "@/lib/threads/sync";
import { notifyError, notifySuccess, notifyWarning } from "@/lib/errors/notify";

function pickActiveThreadId(
  merged: ChatThread[],
  savedActive: string | null
): string | null {
  if (
    savedActive &&
    merged.some((t) => t.id === savedActive && t.messages.length > 0)
  ) {
    return savedActive;
  }
  const withMessages = merged.find((t) => t.messages.length > 0);
  if (withMessages) return withMessages.id;
  if (savedActive && merged.some((t) => t.id === savedActive)) {
    return savedActive;
  }
  return merged[0]?.id ?? null;
}

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
          notifyWarning("Could not sync conversations from cloud");
        } finally {
          if (!cancelled) setSyncing(false);
        }
      }

      if (cancelled) return;

      setThreads(merged);
      const savedActive = loadActiveThreadId(userId);
      setActiveId(pickActiveThreadId(merged, savedActive));
      setReady(true);
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persist = useCallback(
    (next: ChatThread[] | ((prev: ChatThread[]) => ChatThread[])) => {
      setThreads((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        saveThreads(userId, resolved);
        return resolved;
      });
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
    persist((prev) => [t, ...prev]);
    setActive(t.id);
    return t;
  }, [persist, setActive]);

  const deleteThread = useCallback(
    async (id: string) => {
      if (userId) {
        try {
          await deleteCloudThread(userId, id);
        } catch {
          notifyWarning(
            "Deleted locally",
            "Cloud copy may reappear on next sync"
          );
        }
      }

      setThreads((prev) => {
        const next = prev.filter((t) => t.id !== id);
        saveThreads(userId, next);
        setActiveId((current) => {
          if (current !== id) return current;
          const newActive = next[0]?.id ?? null;
          saveActiveThreadId(userId, newActive);
          return newActive;
        });
        return next;
      });

      notifySuccess("Conversation deleted");
    },
    [userId]
  );

  const updateThread = useCallback(
    (id: string, updater: (t: ChatThread) => ChatThread) => {
      persist((prev) =>
        prev.map((t) => (t.id === id ? updater(t) : t))
      );
    },
    [persist]
  );

  const refreshFromCloud = useCallback(async () => {
    if (!userId) return;
    setSyncing(true);
    try {
      const cloud = await fetchCloudThreads(userId);
      const merged = mergeThreads(loadThreads(userId), cloud);
      persist(merged);
    } catch {
      notifyError("Could not refresh conversations");
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
