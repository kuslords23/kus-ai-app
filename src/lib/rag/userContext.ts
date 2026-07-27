import type { User } from "@supabase/supabase-js";

/**
 * Lightweight userContext shape compatible with hub AIAssistantPanel.
 * Full hub context (wallet, dreamLeague, sportsPrefs) is enriched by hub RAG
 * from the shared session when available.
 */
export function buildUserContext(user: User | null) {
  const name =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split("@")[0] ||
    null;

  return {
    user: user
      ? {
          id: user.id,
          name,
          email: user.email ?? null,
        }
      : null,
    navigation: {
      activeTab: "sports",
      sportsSubTab: "scores",
      source: "kus-ai-app",
    },
    companion: {
      id: "ai",
      name: "Kus AI",
      surface: "standalone",
    },
  };
}

export type CompanionMemory = {
  userId: string;
  preferenceSummary?: string;
  episodicSummary?: string;
  toneNotes?: string;
  recentTopics?: string[];
  updatedAt?: string;
};

const MEMORY_KEY = "kus_companion_memory";
const HISTORY_KEY = "kus_ai_chat_history";

export function loadCompanionMemory(userId: string): CompanionMemory | null {
  try {
    const raw = localStorage.getItem(`${MEMORY_KEY}:${userId}`);
    return raw ? (JSON.parse(raw) as CompanionMemory) : null;
  } catch {
    return null;
  }
}

export function saveCompanionMemory(memory: CompanionMemory) {
  try {
    localStorage.setItem(`${MEMORY_KEY}:${memory.userId}`, JSON.stringify(memory));
  } catch {
    // ignore
  }
}

export type StoredChatMessage = {
  role: "user" | "assistant";
  content: string;
  at?: number;
};

export function loadChatHistory(userId: string | null): StoredChatMessage[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(`${HISTORY_KEY}:${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredChatMessage[];
    return Array.isArray(parsed) ? parsed.slice(-40) : [];
  } catch {
    return [];
  }
}

export function saveChatHistory(userId: string | null, messages: StoredChatMessage[]) {
  if (!userId) return;
  try {
    localStorage.setItem(
      `${HISTORY_KEY}:${userId}`,
      JSON.stringify(messages.slice(-40))
    );
  } catch {
    // ignore
  }
}
