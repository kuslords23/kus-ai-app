import type { RagResult } from "@/lib/rag/client";

const FALLBACK_MARKERS = [
  "hiccuped",
  "catching its breath",
  "couldn't reach",
  "check your connection",
];

/** Heuristic: Hub vector memory likely missed — scout/harvest should run. */
export function isLikelyRetrievalMiss(
  result: RagResult,
  query: string
): boolean {
  if (!result.ok || !query.trim()) return false;

  const sources = result.sources ?? [];
  const ds = (result.dataSource ?? "").toLowerCase();
  const answer = (result.answer ?? "").toLowerCase();

  if (result.usedWebSearch && sources.length === 0) return true;
  if (ds.includes("web") && !ds.includes("hub")) return true;
  if (FALLBACK_MARKERS.some((m) => answer.includes(m))) return true;

  return false;
}
