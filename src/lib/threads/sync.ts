import { createClient } from "@/lib/supabase/client";
import type { ChatThread, ThreadMessage } from "./types";
import { titleFromMessage } from "./storage";

const LEGACY_SESSION = "hub-legacy";
const HUB_HISTORY_KEY = "kus_ai_chat_history";

export type CloudMessageRow = {
  sender: string;
  content: string;
  created_at: string;
  session_id: string | null;
};

/** Hub-compatible flat history (same key as sport-clan-nexus). */
export function appendHubLocalHistory(
  userId: string,
  role: "user" | "assistant",
  content: string
) {
  try {
    const key = `${HUB_HISTORY_KEY}:${userId}`;
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(list) ? list : [];
    next.push({
      role,
      content: content.slice(0, 4000),
      at: new Date().toISOString(),
    });
    localStorage.setItem(key, JSON.stringify(next.slice(-80)));
  } catch {
    // ignore
  }
}

export async function persistMessageToCloud(
  userId: string,
  threadId: string,
  role: "user" | "assistant",
  content: string,
  agentsUsed?: string[]
): Promise<void> {
  if (!content.trim()) return;

  appendHubLocalHistory(userId, role, content);

  try {
    const supabase = createClient();
    await supabase.from("ai_chat_messages").insert({
      user_id: userId,
      sender: role === "user" ? "USER" : "AI",
      content: content.slice(0, 8000),
      session_id: threadId,
      agents_used: agentsUsed ?? [],
    });
  } catch {
    // Table/RLS may block — local + hub key still updated
  }
}

export async function fetchCloudThreads(userId: string): Promise<ChatThread[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("ai_chat_messages")
      .select("sender, content, created_at, session_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(500);

    if (error || !data?.length) return [];

    const bySession = new Map<string, ThreadMessage[]>();

    for (const row of data as CloudMessageRow[]) {
      const sessionId = row.session_id || LEGACY_SESSION;
      const role =
        String(row.sender).toUpperCase() === "USER" ? "user" : "assistant";
      const msg: ThreadMessage = {
        id: `cloud_${sessionId}_${bySession.get(sessionId)?.length ?? 0}`,
        role,
        content: String(row.content || ""),
        at: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      };
      const list = bySession.get(sessionId) ?? [];
      list.push(msg);
      bySession.set(sessionId, list);
    }

    const threads: ChatThread[] = [];
    for (const [sessionId, messages] of bySession) {
      const firstUser = messages.find((m) => m.role === "user");
      threads.push({
        id: sessionId,
        title:
          sessionId === LEGACY_SESSION
            ? "Kingdom chat"
            : sessionId === "ai-bubble"
              ? "Hub assistant"
              : titleFromMessage(firstUser?.content || "Chat"),
        updatedAt: messages[messages.length - 1]?.at ?? Date.now(),
        messages,
      });
    }

    return threads.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function mergeThreads(
  local: ChatThread[],
  cloud: ChatThread[]
): ChatThread[] {
  const map = new Map<string, ChatThread>();

  for (const t of local) {
    map.set(t.id, t);
  }

  for (const cloudThread of cloud) {
    const existing = map.get(cloudThread.id);
    if (!existing) {
      map.set(cloudThread.id, cloudThread);
      continue;
    }

    const mergedMessages = dedupeMessages([
      ...existing.messages,
      ...cloudThread.messages,
    ]).sort((a, b) => a.at - b.at);

    map.set(cloudThread.id, {
      ...existing,
      title:
        existing.title !== "New chat"
          ? existing.title
          : cloudThread.title,
      updatedAt: Math.max(existing.updatedAt, cloudThread.updatedAt),
      messages: mergedMessages.slice(-80),
    });
  }

  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

function dedupeMessages(messages: ThreadMessage[]): ThreadMessage[] {
  const seen = new Set<string>();
  const out: ThreadMessage[] = [];
  for (const m of messages) {
    const key = `${m.role}:${m.content.slice(0, 160)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}
