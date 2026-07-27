import type { User } from "@supabase/supabase-js";
import type { AppSettings } from "@/lib/settings";
import { buildRoyalPersonaContext } from "@/lib/persona/royal";
import { buildRetrievalContext } from "@/lib/rag/retrieval";
import {
  loadRoyalMemory,
  royalMemoryForRag,
  type RoyalMemory,
} from "@/lib/memory/royalMemory";
import type { AgentDefinition } from "@/lib/agents/registry";
import { buildAgentContext } from "@/lib/agents/registry";

/**
 * Lightweight userContext shape compatible with hub AIAssistantPanel.
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
      name: "Royal",
      surface: "standalone",
    },
  };
}

/** Full RAG context: user + Royal persona + agent + long-term memory. */
export function buildFullRagContext(opts: {
  user: User | null;
  settings: AppSettings;
  agent: AgentDefinition;
  royalMemory?: RoyalMemory | null;
  hasAttachments?: boolean;
  attachmentKinds?: string[];
}) {
  const base = buildUserContext(opts.user);
  const memory =
    opts.royalMemory ??
    (opts.user?.id ? loadRoyalMemory(opts.user.id) : null);

  const energy =
    opts.settings.energyLevel === "auto"
      ? memory?.emotionalHistory.at(-1)?.mood === "tired"
        ? "low"
        : memory?.emotionalHistory.at(-1)?.mood === "excited"
          ? "high"
          : "medium"
      : opts.settings.energyLevel;

  return {
    ...base,
    persona: buildRoyalPersonaContext({
      silentMode: opts.settings.silentMode,
      energyLevel: energy,
      creativeConstraints: opts.settings.creativeConstraints,
      memoryDecay: opts.settings.memoryDecay,
    }),
    agent: buildAgentContext(opts.agent),
    companionMemory: memory ? royalMemoryForRag(memory) : undefined,
    behaviors: {
      silentMode: opts.settings.silentMode,
      dailyBriefings: opts.settings.dailyBriefings,
      energyLevel: energy,
      memoryDecay: opts.settings.memoryDecay,
      creativeConstraints: opts.settings.creativeConstraints || null,
      skillShadowing: opts.settings.skillShadowing,
      conversationStyle: "adaptive",
    },
    retrieval: buildRetrievalContext({
      hasAttachments: opts.hasAttachments,
      attachmentKinds: opts.attachmentKinds,
    }),
  };
}

/** @deprecated Use Royal memory — kept for hub localStorage compat. */
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
