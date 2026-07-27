/**
 * Royal long-term memory — emotional state, decisions, regrets, decay control.
 * Stored locally per user; synced to hub via userContext.companionMemory.
 */

export type EmotionalMood =
  | "positive"
  | "neutral"
  | "stressed"
  | "excited"
  | "tired";

export type EmotionalSnapshot = {
  mood: EmotionalMood;
  note?: string;
  at: string;
};

export type DecisionEntry = {
  id: string;
  title: string;
  summary: string;
  outcome?: string;
  retained: boolean;
  at: string;
};

export type RegrettedAction = {
  id: string;
  pattern: string;
  context?: string;
  at: string;
};

export type RoyalMemory = {
  userId: string;
  preferenceSummary?: string;
  episodicSummary?: string;
  toneNotes?: string;
  recentTopics?: string[];
  emotionalHistory: EmotionalSnapshot[];
  decisions: DecisionEntry[];
  regrettedActions: RegrettedAction[];
  pinnedTopics: string[];
  fadingTopics: string[];
  lastBriefingAt?: string;
  updatedAt: string;
};

const KEY = "kus_royal_memory";

export function emptyRoyalMemory(userId: string): RoyalMemory {
  return {
    userId,
    emotionalHistory: [],
    decisions: [],
    regrettedActions: [],
    pinnedTopics: [],
    fadingTopics: [],
    updatedAt: new Date().toISOString(),
  };
}

export function loadRoyalMemory(userId: string): RoyalMemory {
  try {
    const raw = localStorage.getItem(`${KEY}:${userId}`);
    if (!raw) return emptyRoyalMemory(userId);
    const parsed = JSON.parse(raw) as Partial<RoyalMemory>;
    return {
      ...emptyRoyalMemory(userId),
      ...parsed,
      userId,
      emotionalHistory: parsed.emotionalHistory ?? [],
      decisions: parsed.decisions ?? [],
      regrettedActions: parsed.regrettedActions ?? [],
      pinnedTopics: parsed.pinnedTopics ?? [],
      fadingTopics: parsed.fadingTopics ?? [],
    };
  } catch {
    return emptyRoyalMemory(userId);
  }
}

export function saveRoyalMemory(memory: RoyalMemory) {
  try {
    localStorage.setItem(
      `${KEY}:${memory.userId}`,
      JSON.stringify({ ...memory, updatedAt: new Date().toISOString() })
    );
  } catch {
    // ignore quota
  }
}

/** Lightweight mood inference from user text. */
export function inferEmotionalMood(text: string): EmotionalMood {
  const t = text.toLowerCase();
  if (/\b(stressed|anxious|worried|frustrated|angry|upset)\b/.test(t))
    return "stressed";
  if (/\b(tired|exhausted|sleepy|burnt out)\b/.test(t)) return "tired";
  if (/\b(excited|hyped|let's go|amazing|love)\b/.test(t)) return "excited";
  if (/\b(thanks|great|good|happy|nice)\b/.test(t)) return "positive";
  return "neutral";
}

export function recordEmotionalSnapshot(
  memory: RoyalMemory,
  mood: EmotionalMood,
  note?: string
): RoyalMemory {
  const next = {
    ...memory,
    emotionalHistory: [
      ...memory.emotionalHistory,
      { mood, note, at: new Date().toISOString() },
    ].slice(-20),
  };
  saveRoyalMemory(next);
  return next;
}

export function addDecision(
  memory: RoyalMemory,
  title: string,
  summary: string,
  retained = true
): RoyalMemory {
  const next = {
    ...memory,
    decisions: [
      {
        id: `dec_${Date.now()}`,
        title,
        summary,
        retained,
        at: new Date().toISOString(),
      },
      ...memory.decisions,
    ].slice(0, 50),
  };
  saveRoyalMemory(next);
  return next;
}

export function addRegrettedAction(
  memory: RoyalMemory,
  pattern: string,
  context?: string
): RoyalMemory {
  const next = {
    ...memory,
    regrettedActions: [
      {
        id: `reg_${Date.now()}`,
        pattern,
        context,
        at: new Date().toISOString(),
      },
      ...memory.regrettedActions,
    ].slice(0, 30),
  };
  saveRoyalMemory(next);
  return next;
}

export function pinTopic(memory: RoyalMemory, topic: string): RoyalMemory {
  const t = topic.trim().slice(0, 64);
  if (!t) return memory;
  const next = {
    ...memory,
    pinnedTopics: [...new Set([...memory.pinnedTopics, t])].slice(0, 20),
    fadingTopics: memory.fadingTopics.filter((x) => x !== t),
  };
  saveRoyalMemory(next);
  return next;
}

export function fadeTopic(memory: RoyalMemory, topic: string): RoyalMemory {
  const t = topic.trim().slice(0, 64);
  if (!t) return memory;
  const next = {
    ...memory,
    fadingTopics: [...new Set([...memory.fadingTopics, t])].slice(0, 20),
    pinnedTopics: memory.pinnedTopics.filter((x) => x !== t),
  };
  saveRoyalMemory(next);
  return next;
}

/** Check if an action summary matches a past regret pattern. */
export function findRegretWarning(
  memory: RoyalMemory,
  actionSummary: string
): RegrettedAction | null {
  const s = actionSummary.toLowerCase();
  return (
    memory.regrettedActions.find((r) => {
      const p = r.pattern.toLowerCase();
      return s.includes(p) || p.split(" ").some((w) => w.length > 4 && s.includes(w));
    }) ?? null
  );
}

/** Apply memory decay — drop old non-retained decisions when mode is minimal. */
export function applyMemoryDecay(
  memory: RoyalMemory,
  mode: "balanced" | "keep-all" | "minimal"
): RoyalMemory {
  if (mode === "keep-all") return memory;
  const cutoff =
    mode === "minimal"
      ? Date.now() - 7 * 24 * 60 * 60 * 1000
      : Date.now() - 90 * 24 * 60 * 60 * 1000;
  const next = {
    ...memory,
    decisions: memory.decisions.filter(
      (d) => d.retained || new Date(d.at).getTime() > cutoff
    ),
    recentTopics: memory.recentTopics?.filter(
      (t) =>
        memory.pinnedTopics.includes(t) ||
        !memory.fadingTopics.includes(t) ||
        mode !== "minimal"
    ),
  };
  saveRoyalMemory(next);
  return next;
}

export function markBriefingShown(memory: RoyalMemory): RoyalMemory {
  const next = {
    ...memory,
    lastBriefingAt: new Date().toISOString(),
  };
  saveRoyalMemory(next);
  return next;
}

export function shouldShowDailyBriefing(
  memory: RoyalMemory,
  enabled: boolean
): boolean {
  if (!enabled) return false;
  if (!memory.lastBriefingAt) return true;
  const last = new Date(memory.lastBriefingAt);
  const now = new Date();
  return (
    last.getDate() !== now.getDate() ||
    last.getMonth() !== now.getMonth() ||
    last.getFullYear() !== now.getFullYear()
  );
}

/** Shape sent to hub RAG inside userContext. */
export function royalMemoryForRag(memory: RoyalMemory) {
  return {
    preferenceSummary: memory.preferenceSummary,
    episodicSummary: memory.episodicSummary,
    toneNotes: memory.toneNotes,
    recentTopics: memory.recentTopics,
    emotionalHistory: memory.emotionalHistory.slice(-5),
    recentDecisions: memory.decisions.filter((d) => d.retained).slice(0, 8),
    regrettedPatterns: memory.regrettedActions.slice(0, 8).map((r) => r.pattern),
    pinnedTopics: memory.pinnedTopics,
    fadingTopics: memory.fadingTopics,
  };
}
