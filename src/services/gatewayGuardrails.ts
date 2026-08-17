import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { createHash } from "node:crypto";

/**
 * Kus-AI gateway guardrails: exact-match response cache + daily fair-use
 * rate limiting.
 *
 * Both are best-effort — if Supabase is unreachable we degrade to local-only
 * caching and never fail the request. This is the shared guardrail both the
 * generic OpenRouter path and the Gemini path pass through.
 */

export const CACHE_TABLE = "ai_cache";
export const USAGE_TABLE = "ai_usage_logs";

/** Seconds a cached response is considered fresh. */
export const CACHE_TTL_SECONDS = Number(process.env.AI_CACHE_TTL_SECONDS) || 5 * 60;

/** Daily per-subject free-tier request cap when no user API key is in play. */
export const FREE_DAILY_QUOTA = Number(process.env.AI_FREE_DAILY_QUOTA) || 120;

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function cacheKey(prompt: string, model: string, system?: string): string {
  return sha256(
    [model, system ?? "", prompt.replace(/\s+/g, " ").trim().toLowerCase()].join("|")
  );
}

export type CacheCheck = { hit: boolean; response?: string; from?: "supabase" | "local"; error?: string };

/** Lightweight in-memory fallback cache so identical queries short-circuit even offline. */
const localCache = new Map<string, { response: string; born: number }>();

export async function lookupCache(key: string): Promise<CacheCheck> {
  // Local fallback (fast, tiny).
  const local = localCache.get(key);
  if (local && Date.now() - local.born < CACHE_TTL_SECONDS * 1000) {
    return { hit: true, response: local.response, from: "local" };
  }
  localCache.delete(key);

  try {
    const client = await createSupabaseClient();
    const { data, error } = await client
      .from(CACHE_TABLE)
      .select("response, created_at")
      .eq("cache_key", key)
      .maybeSingle();
    if (error || !data) return { hit: false };

    const createdAt = new Date(data.created_at as string).getTime();
    if (Date.now() - createdAt > CACHE_TTL_SECONDS * 1000) {
      return { hit: false };
    }
    localCache.set(key, { response: data.response as string, born: Date.now() });
    return { hit: true, response: data.response as string, from: "supabase" };
  } catch {
    return { hit: false };
  }
}

export interface StoreCacheInput {
  key: string;
  prompt: string;
  system?: string;
  model: string;
  response: string;
  usage?: unknown;
}

export async function storeCache(input: StoreCacheInput): Promise<void> {
  localCache.set(input.key, { response: input.response, born: Date.now() });
  try {
    const client = await createSupabaseClient();
    await client.from(CACHE_TABLE).upsert(
      {
        cache_key: input.key,
        prompt: input.prompt,
        system: input.system ?? null,
        model: input.model,
        response: input.response,
        usage: input.usage ?? null,
      },
      { onConflict: "cache_key" }
    );
  } catch {
    // best-effort
  }
}

export type UsageDecision =
  | { allowed: true }
  | { allowed: false; reason: "quota" | "load"; maxDaily: number };

export interface UsageSubject {
  scope: "user" | "ip";
  subject: string;
  /** True when the request is being served by the user's own BYOK key. */
  usingUserKey: boolean;
}

export async function checkUsage(sub: UsageSubject): Promise<UsageDecision> {
  // BYOK requests are billed to the user's own provider quota — never rate-limit.
  if (sub.usingUserKey) return { allowed: true };
  if (sub.scope === "user" && !sub.subject) return { allowed: true };

  try {
    const client = await createSupabaseClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await client
      .from(USAGE_TABLE)
      .select("request_count")
      .eq("scope", sub.scope)
      .eq("subject", sub.subject)
      .eq("day", today)
      .maybeSingle();
    const count = data?.request_count ?? 0;
    if (count >= FREE_DAILY_QUOTA) {
      return { allowed: false, reason: "quota", maxDaily: FREE_DAILY_QUOTA };
    }
  } catch {
    // best-effort — allow on infra failure
  }
  return { allowed: true };
}

export async function recordUsage(sub: UsageSubject, tokens = 0): Promise<void> {
  if (sub.usingUserKey) return;
  try {
    const client = await createSupabaseClient();
    const today = new Date().toISOString().slice(0, 10);
    await client.rpc("increment_usage_count", {
      p_scope: sub.scope,
      p_subject: sub.subject,
      p_day: today,
      p_tokens: tokens,
    });
  } catch {
    // best-effort (may be missing the SQL function; non-fatal)
  }
}

export function freshSelectionTTL(): number {
  return CACHE_TTL_SECONDS;
}