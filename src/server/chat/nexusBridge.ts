"use strict";

/**
 * Shared Nexus Chat Backend Bridge.
 *
 * Connects the Jyinx chat mirror to the same database tables and real-time
 * channels used by Sports Clan Nexus, using the shared auth + bucket
 * ecosystem so messages and shared snippets sync instantly between platforms.
 */

import { createClient } from "@/lib/supabase/server";
import { NEXUS_CHAT_TABLE, NEXUS_CHAT_CHANNEL } from "@/lib/chat/nexus-constants";

export { NEXUS_CHAT_TABLE, NEXUS_CHAT_CHANNEL };

export interface NexusMessage {
  id?: string;
  room: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  content: string;
  codeSnippet?: Record<string, unknown> | null;
  platform?: string;
  createdAt?: string;
}

export interface NexusChatMessage {
  room: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  content: string;
  codeSnippet?: Record<string, unknown> | null;
  platform?: string;
  createdAt?: string;
}

/**
 * Publishes a message to the shared Nexus chat table so it appears in both
 * Jyinx and Sports Clan Nexus in real time.
 */
export async function publishNexusMessage(
  message: Omit<NexusChatMessage, "id">
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const client = await createClient();
    const payload: Record<string, unknown> = {
      room: message.room,
      user_id: message.userId,
      display_name: message.displayName,
      content: message.content,
      created_at: message.createdAt ?? new Date().toISOString(),
      platform: message.platform ?? "jyinx",
    };
    if (message.avatarUrl) payload.avatar_url = message.avatarUrl;
    if (message.codeSnippet) payload.code_snippet = JSON.stringify(message.codeSnippet);

    const { data, error } = await client.from(NEXUS_CHAT_TABLE).insert(payload).select("id").single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: String(data?.id ?? "") };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Publish failed." };
  }
}

/**
 * Fetches recent messages from a shared Nexus chat room.
 */
export async function fetchNexusMessages(
  room: string,
  limit = 50
): Promise<NexusChatMessage[]> {
  try {
    const client = await createClient();
    const { data } = await client
      .from(NEXUS_CHAT_TABLE)
      .select("*")
      .eq("room", room)
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []).reverse().map(mapRow);
  } catch {
    return [];
  }
}

/**
 * Builds the unique channel identifier shared by Jyinx and Nexus for a room.
 */
export function nexusChannelId(room: string): string {
  return `${NEXUS_CHAT_CHANNEL}-${room}`;
}

// ── Row mapping ──────────────────────────────────────────

function safeJson(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  try {
    return JSON.parse(String(raw)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function mapRow(row: Record<string, unknown>): NexusChatMessage {
  return {
    room: String(row.room ?? "general"),
    userId: String(row.user_id ?? ""),
    displayName: String(row.display_name ?? "Unknown"),
    avatarUrl: row.avatar_url as string | undefined,
    content: String(row.content ?? ""),
    codeSnippet: safeJson(row.code_snippet),
    platform: row.platform as string | undefined,
    createdAt: row.created_at as string | undefined,
  };
}