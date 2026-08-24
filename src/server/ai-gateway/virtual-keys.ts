/**
 * Dynamic Virtual / Sub-Key management.
 *
 * Two modes:
 *  1. OpenRouter Management API — when `OPENROUTER_MANAGEMENT_KEY` is set,
 *     provision real per-user sub-keys with a USD budget ceiling and optional
 *     expiry / monthly reset, isolated from the platform master key. The raw
 *     key is returned ONCE at creation (OpenRouter never returns it again).
 *  2. Local budget keys — for providers without a management API, generate a
 *     scoped token and enforce the spending cap ourselves against the
 *     `ai_virtual_keys` table (used_up vs budget; exhausted/expired states).
 *
 * Raw keys are never logged/returned twice. `key_token` stores the raw token
 * ONLY for locally-enforced keys (needed to authenticate later calls); for
 * OpenRouter keys only a hash is stored and the caller receives the key once.
 */
import { createHash } from "node:crypto";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

const VK_TABLE = "ai_virtual_keys";
const OPENROUTER_KEYS_URL = "https://openrouter.ai/api/v1/keys";

export type VirtualKeyStatus = "active" | "exhausted" | "expired" | "revoked";

export interface VirtualKey {
  id: string;
  userId?: string;
  provider: string;
  label?: string;
  /** sha256 hash of the key (or OpenRouter external hash). */
  keyHash: string;
  /** Raw key — ONLY populated for locally-created keys and only at creation. */
  key?: string;
  budgetUsd: number | null;
  usedUsd: number;
  expiresAt: string | null;
  status: VirtualKeyStatus;
  createdAt: string;
}

export interface CreateVirtualKeyInput {
  userId: string;
  provider: string;
  label?: string;
  /** Spending ceiling (USD). Null = no cap. */
  budgetUsd?: number;
  /** ISO expiry (OpenRouter accepts UTC; local keys enforce it too). */
  expiresAt?: string;
  /** OpenRouter limit_reset: daily | weekly | monthly | null. */
  limitReset?: "daily" | "weekly" | "monthly" | null;
}

export type CreateVirtualKeyResult =
  | { ok: true; key: string; hash: string; id: string }
  | { ok: false; error: string };

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Local fallback when no management API exists for the provider. */
function generateLocalKey(): string {
  return `vk_live_${createHash("sha256")
    .update(`${Date.now()}_${Math.random().toString(36).slice(2)}${process.pid}`)
    .digest("hex")
    .slice(0, 32)}`;
}

async function db() {
  return createSupabaseServerClient();
}

function mapRow(row: Record<string, unknown>): Omit<VirtualKey, "key"> {
  return {
    id: String(row.id),
    userId: String(row.user_id ?? ""),
    provider: String(row.provider ?? "openai"),
    label: row.label ? String(row.label) : undefined,
    keyHash: String(row.key_hash ?? ""),
    budgetUsd: row.budget_usd === null || row.budget_usd === undefined ? null : Number(row.budget_usd),
    usedUsd: Number(row.used_usd ?? 0),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    status: (row.status as VirtualKeyStatus) ?? "active",
    createdAt: String(row.created_at),
  };
}

async function insertRow(row: {
  userId: string;
  provider: string;
  label?: string;
  keyHash: string;
  keyToken?: string;
  budgetUsd?: number | null;
  expiresAt?: string;
  status?: VirtualKeyStatus;
}): Promise<Omit<VirtualKey, "key"> | null> {
  try {
    const supabase = await db();
    const { data, error } = await supabase
      .from(VK_TABLE)
      .insert({
        user_id: row.userId,
        provider: row.provider,
        label: row.label ?? null,
        key_hash: row.keyHash,
        key_token: row.keyToken ?? null,
        budget_usd: row.budgetUsd ?? null,
        used_usd: 0,
        expires_at: row.expiresAt ?? null,
        status: row.status ?? "active",
      })
      .select("*")
      .maybeSingle();
    if (error || !data) return null;
    return mapRow(data as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Provisions a new virtual/sub-key and persists its reference. */
export async function createVirtualKey(input: CreateVirtualKeyInput): Promise<CreateVirtualKeyResult> {
  const provider = input.provider.toLowerCase();

  // ── OpenRouter Management API path ────────────────────────────────────────
  if (provider === "openrouter") {
    const mgmtKey = process.env.OPENROUTER_MANAGEMENT_KEY;
    if (mgmtKey) {
      try {
        const response = await fetch(OPENROUTER_KEYS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${mgmtKey}`,
          },
          body: JSON.stringify({
            name: input.label ?? `kus-user-${input.userId.slice(0, 8)}`,
            limit: input.budgetUsd ?? null,
            expires_at: input.expiresAt ?? null,
            limit_reset: input.limitReset ?? null,
          }),
          cache: "no-store",
        });
        const data = (await response.json().catch(() => null)) as
          | { data?: { hash?: string; usage?: number }; key?: string; error?: { message?: string } }
          | null;
        if (!response.ok || !data?.key || !data.data?.hash) {
          return { ok: false, error: data?.error?.message || `OpenRouter key creation failed (${response.status}).` };
        }
        const hash = data.data.hash;
        const row = await insertRow({
          userId: input.userId,
          provider: "openrouter",
          label: input.label ?? hash.slice(0, 12),
          keyHash: hash,
          budgetUsd: input.budgetUsd ?? null,
          expiresAt: input.expiresAt,
        });
        if (!row) return { ok: false, error: "Generated the key but could not record it." };
        return { ok: true, key: data.key, hash, id: row.id };
      } catch (cause) {
        return { ok: false, error: cause instanceof Error ? cause.message : "OpenRouter key creation failed." };
      }
    }
  }

  // ── Local budgeted key fallback ───────────────────────────────────────────
  const raw = generateLocalKey();
  const hash = sha256(raw);
  const row = await insertRow({
    userId: input.userId,
    provider,
    label: input.label ?? `local-${provider}`,
    keyHash: hash,
    keyToken: raw,
    budgetUsd: input.budgetUsd ?? null,
    expiresAt: input.expiresAt,
  });
  if (!row) return { ok: false, error: "Could not persist the virtual key." };
  return { ok: true, key: raw, hash, id: row.id };
}

/** Lists keys for a user (raw key only at creation; here returns metadata). */
export async function listVirtualKeys(userId: string): Promise<VirtualKey[]> {
  try {
    const supabase = await db();
    const { data, error } = await supabase
      .from(VK_TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[]).map(mapRow);
  } catch {
    return [];
  }
}

/**
 * Resolves a usable key for a gateway call.
 * - Local keys: returns the raw token when within budget & not expired.
 * - OpenRouter keys: returns the external sub-key ONLY if we hold it (we don't
 *   store it; callers pass it via `GatewayCallOptions.virtualKey`).
 */
export async function getVirtualKeyForCall(userId: string, provider: string): Promise<string | null> {
  try {
    const supabase = await db();
    const { data } = await supabase
      .from(VK_TABLE)
      .select("*")
      .eq("user_id", userId)
      .eq("provider", provider)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (!data) return null;
    const row = data as unknown as Record<string, unknown>;
    const used = Number(row.used_usd ?? 0);
    const budget = row.budget_usd != null ? Number(row.budget_usd) : null;
    const expires = row.expires_at ? new Date(String(row.expires_at)).getTime() : null;
    if (expires && expires < Date.now()) return null;
    if (budget !== null && used >= budget) {
      await supabase.from(VK_TABLE).update({ status: "exhausted" }).eq("id", String(row.id));
      return null;
    }
    return typeof row.key_token === "string" && row.key_token ? row.key_token : null;
  } catch {
    return null;
  }
}

/** Records spend against a keyHash and flips it to exhausted at the cap. */
export async function recordVirtualKeyUsage(keyHash: string, costUsd: number): Promise<void> {
  if (!(costUsd > 0)) return;
  try {
    const supabase = await db();
    const { data } = await supabase.from(VK_TABLE).select("*").eq("key_hash", keyHash).maybeSingle();
    if (!data) return;
    const row = data as unknown as Record<string, unknown>;
    const used = Number(row.used_usd ?? 0) + costUsd;
    const budget = row.budget_usd != null ? Number(row.budget_usd) : null;
    const next: Record<string, unknown> = { used_usd: used };
    if (budget !== null && used >= budget) next.status = "exhausted";
    await supabase.from(VK_TABLE).update(next).eq("id", String(row.id));
  } catch {
    // best-effort accounting
  }
}

/** Revokes / deletes a key (OpenRouter delete when external). */
export async function revokeVirtualKey(id: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await db();
    const { data: existing } = await supabase.from(VK_TABLE).select("*").eq("id", id).eq("user_id", userId).maybeSingle();
    if (!existing) return { ok: false, error: "Key not found." };
    const row = existing as unknown as Record<string, unknown>;
    if (row.provider === "openrouter" && process.env.OPENROUTER_MANAGEMENT_KEY) {
      try {
        await fetch(`${OPENROUTER_KEYS_URL}/${encodeURIComponent(String(row.key_hash))}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${process.env.OPENROUTER_MANAGEMENT_KEY}` },
          cache: "no-store",
        });
      } catch {
        // continue with local revoke
      }
    }
    await supabase.from(VK_TABLE).update({ status: "revoked" }).eq("id", id);
    return { ok: true };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Revoke failed." };
  }
}