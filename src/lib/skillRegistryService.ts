/**
 * Dual-scope skill registry (workspace private vs marketplace public).
 * Uses in-memory + optional Supabase persistence when env is configured.
 */

import { ragFirewall, type SkillRecord, type SkillScope } from "@/utils/RagFirewall";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type { SkillRecord, SkillScope };

export type RegistrySnapshot = {
  workspace: SkillRecord[];
  marketplace: SkillRecord[];
};

function tryClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export class SkillRegistryService {
  private workspace: SkillRecord[] = [];
  private marketplace: SkillRecord[] = [];
  private supabase = tryClient();

  async refresh(userId?: string): Promise<RegistrySnapshot> {
    if (!this.supabase) return this.snapshot();

    const { data, error } = await this.supabase.from("workspace_skills").select("*").limit(200);
    if (!error && data) {
      this.workspace = data
        .filter((row) => !userId || row.owner_id === userId)
        .map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description ?? "",
          scope: "workspace" as const,
          ownerId: row.owner_id,
          content: row.content,
          tags: row.tags ?? [],
        }));
    }

    const { data: market } = await this.supabase.from("marketplace_skills").select("*").eq("is_active", true).limit(200);
    if (market) {
      this.marketplace = market.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? "",
        scope: "marketplace" as const,
        ownerId: row.creator_id,
        content: undefined, // never hydrate private bodies into client lists
        tags: row.tags ?? [],
      }));
    }

    return this.snapshot();
  }

  snapshot(): RegistrySnapshot {
    return {
      workspace: [...this.workspace],
      marketplace: [...this.marketplace],
    };
  }

  listForUser(userId: string, purpose: "runtime_assist" | "marketplace_list"): SkillRecord[] {
    const pool = purpose === "marketplace_list" ? this.marketplace : [...this.workspace, ...this.marketplace];
    return pool.filter((skill) => ragFirewall.checkAccess(skill, { userId, purpose }).allowed);
  }

  registerLocal(skill: SkillRecord): void {
    if (skill.scope === "workspace") {
      this.workspace = this.workspace.filter((s) => s.id !== skill.id).concat(skill);
    } else {
      this.marketplace = this.marketplace.filter((s) => s.id !== skill.id).concat(skill);
    }
  }
}

export const skillRegistryService = new SkillRegistryService();
