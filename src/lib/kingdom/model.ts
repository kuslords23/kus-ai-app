/**
 * Kingdom Knowledge model — system-only layer backed by ~10k sub-agents.
 * Fetched via /api/kingdom-knowledge/query and injected into RAG userContext.
 * Never shown in the user agent picker.
 */

export const KINGDOM_KNOWLEDGE_MODEL = {
  id: "kingdom-knowledge",
  name: "Kingdom Knowledge",
  tagline: "~10,000 sub-agent swarm memory",
  visibility: "system" as const,
  provider: "kus-training-plane",
  departments: [
    "sports",
    "marketing",
    "business",
    "finance",
    "technology",
    "programming",
    "religion",
    "health",
    "education",
    "legal",
    "entertainment",
    "music",
    "science",
    "travel",
    "food",
    "fashion",
    "real-estate",
    "politics",
    "philosophy",
    "agriculture",
    "automotive",
    "parenting",
    "career",
    "news",
  ],
  systemHint:
    "You have access to Kingdom Knowledge — verified chunks harvested by headless sub-agents across all departments. Prefer this context when answering domain-specific questions. Cite department when relevant.",
};

export function buildKingdomModelContext(knowledgeContext?: string) {
  if (!knowledgeContext?.trim()) return undefined;
  return {
    modelId: KINGDOM_KNOWLEDGE_MODEL.id,
    modelName: KINGDOM_KNOWLEDGE_MODEL.name,
    departments: KINGDOM_KNOWLEDGE_MODEL.departments,
    memory: knowledgeContext,
  };
}
