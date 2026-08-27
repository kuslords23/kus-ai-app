import type { ChatThread, ThreadMessage } from "./types";

const THREADS_KEY = "kus_ai_threads";
const ACTIVE_KEY = "kus_ai_active_thread";

function storageKey(userId: string | null) {
  return `${THREADS_KEY}:${userId || "guest"}`;
}

export function loadThreads(userId: string | null): ChatThread[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return migrateLegacyHistory(userId);
    const parsed = JSON.parse(raw) as ChatThread[];
    return Array.isArray(parsed)
      ? parsed.sort((a, b) => b.updatedAt - a.updatedAt)
      : [];
  } catch {
    return [];
  }
}

export function saveThreads(userId: string | null, threads: ChatThread[]) {
  try {
    localStorage.setItem(
      storageKey(userId),
      JSON.stringify(threads.slice(0, 50))
    );
  } catch {
    // ignore
  }
}

export function loadActiveThreadId(userId: string | null): string | null {
  try {
    return localStorage.getItem(`${ACTIVE_KEY}:${userId || "guest"}`);
  } catch {
    return null;
  }
}

export function saveActiveThreadId(userId: string | null, threadId: string | null) {
  try {
    const key = `${ACTIVE_KEY}:${userId || "guest"}`;
    if (threadId) localStorage.setItem(key, threadId);
    else localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function createThread(title = "New chat"): ChatThread {
  return {
    id: crypto.randomUUID(),
    title,
    updatedAt: Date.now(),
    messages: [],
  };
}

export function titleFromMessage(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "New chat";
  return t.length > 42 ? `${t.slice(0, 42)}…` : t;
}

export function persistThreadMessage(
  threads: ChatThread[],
  threadId: string,
  message: ThreadMessage
): ChatThread[] {
  return threads.map((t) => {
    if (t.id !== threadId) return t;
    const msgs = [...t.messages, message];
    const title =
      t.title === "New chat" && message.role === "user"
        ? titleFromMessage(message.content)
        : t.title;
    return {
      ...t,
      title,
      updatedAt: Date.now(),
      messages: msgs.slice(-80),
    };
  });
}

export function updateThreadMessage(
  threads: ChatThread[],
  threadId: string,
  messageId: string,
  patch: Partial<ThreadMessage>
): ChatThread[] {
  return threads.map((t) => {
    if (t.id !== threadId) return t;
    return {
      ...t,
      updatedAt: Date.now(),
      messages: t.messages.map((m) =>
        m.id === messageId ? { ...m, ...patch } : m
      ),
    };
  });
}

function migrateLegacyHistory(userId: string | null): ChatThread[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(`kus_ai_chat_history:${userId}`);
    if (!raw) return [];
    const legacy = JSON.parse(raw) as Array<{
      role: "user" | "assistant";
      content: string;
      at?: number;
    }>;
    if (!Array.isArray(legacy) || legacy.length === 0) return [];
    const thread: ChatThread = {
      id: crypto.randomUUID(),
      title: titleFromMessage(
        legacy.find((m) => m.role === "user")?.content || "Previous chat"
      ),
      updatedAt: Date.now(),
      messages: legacy.map((m, i) => ({
        id: `migrated_${i}`,
        role: m.role,
        content: m.content,
        at: m.at || Date.now(),
      })),
    };
    saveThreads(userId, [thread]);
    return [thread];
  } catch {
    return [];
  }
}
