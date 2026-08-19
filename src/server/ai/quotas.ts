/**
 * New-user free-tier quota & fallback buffer.
 *
 * A lightweight per-subject allowance tracker (Supabase-backed with a local
 * memory fallback) that manages the free-tier buffer across OpenRouter and
 * Google Gemini so brand-new users can explore without abrupt failures. When a
 * cap or a resource-exhausted/rate-limit (429) / deprecated-model error is hit,
 * the caller pivots to an active fallback endpoint; this module reports
 * elapsed allowance so the UI can nudge the user toward adding their own key.
 */

import { createClient as createSupabaseClient } from "@/lib/supabase/server";

export const QUOTA_TABLE = "ai_usage_logs";

const FREE_DAILY_HARD_CAP = Number(process.env.AI_FREE_DAILY_QUOTA) || 120;
const NEW_USER_BUFFER = Number(process.env.AI_NEW_USER_BUFFER) || 6;

export interface QuotaSubject {
  scope: "user" | "ip";
  subject: string;
  /** True when billed to the user's own BYOK key (never limited). */
  usingUserKey: boolean;
  /** Marks a subject as newly onboarded for the buffer window. */
  isNewUser?: boolean;
}

export interface QuotaDecision {
  allowed: boolean;
  remaining: number;
  hardCap: number;
  onBuffer: boolean; // consuming the new-user allowance
  notice?: {
    level: "info" | "warn";
    message: string;
  };
}

/** In-memory fallback so the app never fails when Supabase is unreachable. */
const memQuota = new Map<string, number>();

function subjectKey(sub: QuotaSubject): string {
  return `${sub.scope}:${sub.subject}`;
}

/** Lower-bound daily count from Supabase (best-effort) + fresh local cache. */
export async function getUsedCount(sub: QuotaSubject): Promise<number> {
  const key = subjectKey(sub);
  try {
    const client = await createSupabaseClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await client
      .from(QUOTA_TABLE)
      .select("request_count")
      .eq("scope", sub.scope)
      .eq("subject", sub.subject)
      .eq("day", today)
      .maybeSingle();
    const count = data?.request_count ?? memQuota.get(key) ?? 0;
    memQuota.set(key, count);
    return count;
  } catch {
    return memQuota.get(key) ?? 0;
  }
}

/**
 * Evaluates the current allowance. Buffer (new-user) requests first, then the
 * hard daily cap. BYOK is always allowed.
 */
export async function evaluateQuota(sub: QuotaSubject): Promise<QuotaDecision> {
  if (sub.usingUserKey) {
    return { allowed: true, remaining: Infinity, hardCap: Infinity, onBuffer: false };
  }

  const used = await getUsedCount(sub);

  // New users get a short zero-cost buffer before the daily cap applies.
  if (sub.isNewUser) {
    const bufferRemaining = Math.max(0, NEW_USER_BUFFER - used);
    if (bufferRemaining > 0) {
      const notice: QuotaDecision["notice"] = {
        level: bufferRemaining <= 2 ? "warn" : "info",
        message: `You're on a free trial buffer (${bufferRemaining} left). Add your own API key in Settings to keep unlimited access.`,
      };
      return { allowed: true, remaining: bufferRemaining, hardCap: NEW_USER_BUFFER, onBuffer: true, notice };
    }
  }

  if (used >= FREE_DAILY_HARD_CAP) {
    return {
      allowed: false,
      remaining: 0,
      hardCap: FREE_DAILY_HARD_CAP,
      onBuffer: false,
      notice: {
        level: "warn",
        message: `Daily free quota reached (${FREE_DAILY_HARD_CAP} requests). Add your own API key in Settings to keep going.`,
      },
    };
  }

  return { allowed: true, remaining: FREE_DAILY_HARD_CAP - used, hardCap: FREE_DAILY_HARD_CAP, onBuffer: false };
}

export async function recordConsumption(sub: QuotaSubject, tokens = 0): Promise<void> {
  if (sub.usingUserKey) return;
  const key = subjectKey(sub);
  const next = (memQuota.get(key) ?? 0) + 1;
  memQuota.set(key, next);
  try {
    const client = await createSupabaseClient();
    await client.rpc("increment_usage_count", {
      p_scope: sub.scope,
      p_subject: sub.subject,
      p_day: new Date().toISOString().slice(0, 10),
      p_tokens: tokens,
    });
  } catch {
    // best-effort (function may be missing; non-fatal)
  }
}

/** Auto-pivot mapping used when a free-tier cap or model error is hit. */
export function fallbackBufferModels(): { openrouter: string; gemini: string } {
  return { openrouter: "openrouter/free", gemini: "gemini-2.5-flash" };
}