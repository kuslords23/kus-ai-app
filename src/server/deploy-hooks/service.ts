/**
 * Deploy hook configuration service.
 *
 * Stores and manages deploy hook URLs (Vercel, Netlify, Railway, custom)
 * in the Supabase `deploy_hooks` table so users can configure them directly
 * from the Jyinx Connectors Hub UI instead of requiring environment variables.
 */
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

const TABLE = "deploy_hooks";

export type DeployHookHost = "vercel" | "netlify" | "railway" | "custom";

export const HOST_LABELS: Record<DeployHookHost, string> = {
  vercel: "Vercel",
  netlify: "Netlify",
  railway: "Railway",
  custom: "Custom",
};

export const HOST_ICONS: Record<DeployHookHost, string> = {
  vercel: "▲",
  netlify: "🌐",
  railway: "🚂",
  custom: "🔗",
};

export interface DeployHook {
  id: string;
  userId: string;
  host: DeployHookHost;
  label: string | null;
  hookUrl: string;
  repoScope: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeployHookInput {
  host: DeployHookHost;
  label?: string;
  hookUrl: string;
  repoScope?: string[];
  isActive?: boolean;
}

async function db() {
  return createSupabaseServerClient();
}

function mapRow(row: Record<string, unknown>): DeployHook {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    host: row.host as DeployHookHost,
    label: row.label ? String(row.label) : null,
    hookUrl: String(row.hook_url),
    repoScope: Array.isArray(row.repo_scope) ? (row.repo_scope as string[]) : [],
    isActive: row.is_active !== false,
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** List all deploy hooks for a user. */
export async function listDeployHooks(userId: string): Promise<DeployHook[]> {
  try {
    const supabase = await db();
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[]).map(mapRow);
  } catch {
    return [];
  }
}

/** Get active deploy hooks, optionally filtered by host. */
export async function getActiveHooks(userId?: string, host?: DeployHookHost): Promise<DeployHook[]> {
  try {
    const supabase = await db();
    let query = supabase
      .from(TABLE)
      .select("*")
      .eq("is_active", true)
      .order("updated_at", { ascending: false });
    if (userId) query = query.eq("user_id", userId);
    if (host) query = query.eq("host", host);
    const { data, error } = await query;
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[]).map(mapRow);
  } catch {
    return [];
  }
}

/** Create a new deploy hook. */
export async function createDeployHook(userId: string, input: DeployHookInput): Promise<DeployHook | null> {
  try {
    const supabase = await db();
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        user_id: userId,
        host: input.host,
        label: input.label ?? null,
        hook_url: input.hookUrl,
        repo_scope: input.repoScope ?? [],
        is_active: input.isActive ?? true,
      })
      .select("*")
      .maybeSingle();
    if (error || !data) return null;
    return mapRow(data as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Update an existing deploy hook. */
export async function updateDeployHook(id: string, userId: string, input: Partial<DeployHookInput>): Promise<DeployHook | null> {
  try {
    const supabase = await db();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.hookUrl !== undefined) updates.hook_url = input.hookUrl;
    if (input.label !== undefined) updates.label = input.label;
    if (input.repoScope !== undefined) updates.repo_scope = input.repoScope;
    if (input.isActive !== undefined) updates.is_active = input.isActive;
    if (input.host !== undefined) updates.host = input.host;

    const { data, error } = await supabase
      .from(TABLE)
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error || !data) return null;
    return mapRow(data as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Delete a deploy hook. */
export async function deleteDeployHook(id: string, userId: string): Promise<boolean> {
  try {
    const supabase = await db();
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    return !error;
  } catch {
    return false;
  }
}

/** Record that a hook was used. */
export async function touchDeployHook(id: string): Promise<void> {
  try {
    const supabase = await db();
    await supabase
      .from(TABLE)
      .update({ last_used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id);
  } catch {
    // best-effort
  }
}