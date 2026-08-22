/**
 * RAG Firewall — Zero-Training Guard
 *
 * Private workspace skills may be retrieved at runtime for the owning user,
 * but must never be exported into marketplace listings, training datasets,
 * or semantic caches shared across tenants.
 */

export type SkillScope = "workspace" | "marketplace" | "system";

export type SkillRecord = {
  id: string;
  name: string;
  description: string;
  scope: SkillScope;
  ownerId?: string;
  content?: string;
  tags?: string[];
};

export type FirewallDecision = {
  allowed: boolean;
  reason: string;
  skill?: SkillRecord;
  /** When true, downstream caches must skip logging this interaction for training. */
  forbidTrainingExport: boolean;
};

export type RetrievalContext = {
  userId: string;
  purpose: "runtime_assist" | "marketplace_list" | "training_export" | "peer_share";
};

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export class RagFirewall {
  private readonly similarityThreshold = 0.82;

  /**
   * Decide whether a skill may be used for the given purpose.
   */
  checkAccess(skill: SkillRecord, ctx: RetrievalContext): FirewallDecision {
    if (ctx.purpose === "training_export") {
      if (skill.scope === "workspace" || skill.scope === "system") {
        return {
          allowed: false,
          reason: "Private/system skills are blocked from training export",
          skill,
          forbidTrainingExport: true,
        };
      }
    }

    if (skill.scope === "workspace") {
      if (ctx.purpose === "marketplace_list" || ctx.purpose === "peer_share") {
        return {
          allowed: false,
          reason: "Workspace skills cannot leave the owner workspace",
          skill,
          forbidTrainingExport: true,
        };
      }
      if (skill.ownerId && skill.ownerId !== ctx.userId) {
        return {
          allowed: false,
          reason: "Workspace skill owned by another user",
          skill,
          forbidTrainingExport: true,
        };
      }
      return {
        allowed: ctx.purpose === "runtime_assist",
        reason: "Runtime-only retrieval of private skill",
        skill,
        forbidTrainingExport: true,
      };
    }

    return {
      allowed: true,
      reason: "Public/marketplace skill",
      skill,
      forbidTrainingExport: false,
    };
  }

  /**
   * Block marketplace publish if embedding is too close to a private skill.
   */
  detectPrivateLeak(
    candidateEmbedding: number[],
    privateEmbeddings: Array<{ skillId: string; embedding: number[] }>
  ): { leak: boolean; matchedSkillId?: string; score: number } {
    let best = 0;
    let matched: string | undefined;
    for (const row of privateEmbeddings) {
      const score = cosineSimilarity(candidateEmbedding, row.embedding);
      if (score > best) {
        best = score;
        matched = row.skillId;
      }
    }
    if (best >= this.similarityThreshold) {
      return { leak: true, matchedSkillId: matched, score: best };
    }
    return { leak: false, score: best };
  }

  /** Guard for semantic cache writers — never persist private skill text. */
  shouldCacheInteraction(decision: FirewallDecision): boolean {
    return decision.allowed && !decision.forbidTrainingExport;
  }
}

export const ragFirewall = new RagFirewall();
