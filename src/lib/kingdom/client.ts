/**
 * Client helper — fetch Kingdom Knowledge layer before Hub RAG.
 * Separate from user-facing agents; not shown in agent picker.
 */

export type KingdomFetchResult = {
  ok: boolean;
  context: string;
  departments: string[];
  hitCount: number;
  subAgentsQueried: number;
};

export async function fetchKingdomKnowledge(
  query: string,
  opts?: { departments?: string[]; limit?: number }
): Promise<KingdomFetchResult> {
  const empty: KingdomFetchResult = {
    ok: false,
    context: "",
    departments: [],
    hitCount: 0,
    subAgentsQueried: 0,
  };

  try {
    const res = await fetch("/api/kingdom-knowledge/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        departments: opts?.departments,
        limit: opts?.limit ?? 8,
      }),
    });

    if (!res.ok) return empty;

    const data = await res.json();
    return {
      ok: Boolean(data.ok),
      context: String(data.context ?? ""),
      departments: Array.isArray(data.departments) ? data.departments : [],
      hitCount: Array.isArray(data.hits) ? data.hits.length : 0,
      subAgentsQueried: Number(data.subAgentsQueried ?? 0),
    };
  } catch {
    return empty;
  }
}
