/**
 * Kingdom Knowledge Layer — fetchable memory from ~10k sub-agent swarm.
 * Separate from user-facing Royal agents; injected into RAG context.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { classifyDepartments } from "./classifier";

export type KingdomKnowledgeHit = {
  id: string;
  content: string;
  departmentId?: string;
  domain?: string;
  sourceUrl?: string;
  confidence: number;
  subAgentSlug?: string;
};

export type KingdomKnowledgeResult = {
  ok: boolean;
  query: string;
  departments: string[];
  hits: KingdomKnowledgeHit[];
  goldenQa: Array<{ question: string; answer: string; department?: string }>;
  subAgentsQueried: number;
  error?: string;
};

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function queryKingdomKnowledge(opts: {
  query: string;
  departments?: string[];
  limit?: number;
  userId?: string | null;
}): Promise<KingdomKnowledgeResult> {
  const limit = opts.limit ?? 8;
  const departments =
    opts.departments?.length
      ? opts.departments
      : classifyDepartments(opts.query, 5);

  const supabase = adminClient();
  if (!supabase) {
    return {
      ok: false,
      query: opts.query,
      departments,
      hits: [],
      goldenQa: [],
      subAgentsQueried: 0,
      error: "Supabase not configured",
    };
  }

  const needle = opts.query.trim().slice(0, 200);

  const { data: chunks } = await supabase
    .from("knowledge_chunks")
    .select("id, content, department_id, domain, source_url, confidence, sub_agent_id")
    .in("department_id", departments)
    .eq("verification_status", "verified")
    .order("confidence", { ascending: false })
    .limit(limit * 2);

  const filtered = (() => {
    const list = chunks ?? [];
    if (!needle) return list.slice(0, limit);
    const words = needle.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const matched = list.filter((c) => {
      const text = c.content.toLowerCase();
      return words.some((w) => text.includes(w));
    });
    return (matched.length ? matched : list).slice(0, limit);
  })();

  const { data: qa } = await supabase
    .from("golden_qa_pairs")
    .select("question, answer, department_id")
    .in("department_id", departments)
    .eq("verification_status", "verified")
    .order("confidence", { ascending: false })
    .limit(8);

  const qaFiltered = (() => {
    const list = qa ?? [];
    if (!needle) return list.slice(0, 3);
    const words = needle.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const matched = list.filter((q) => {
      const text = `${q.question} ${q.answer}`.toLowerCase();
      return words.some((w) => text.includes(w));
    });
    return (matched.length ? matched : list).slice(0, 3);
  })();

  const { data: agents } = await supabase
    .from("kingdom_sub_agents")
    .select("id")
    .in("department_id", departments)
    .eq("status", "active")
    .limit(50);

  const hits: KingdomKnowledgeHit[] = filtered.map((c) => ({
    id: c.id,
    content: c.content,
    departmentId: c.department_id ?? undefined,
    domain: c.domain ?? undefined,
    sourceUrl: c.source_url ?? undefined,
    confidence: c.confidence,
  }));

  if (opts.userId) {
    void supabase.from("kingdom_knowledge_queries").insert({
      user_id: opts.userId,
      query: needle,
      departments,
      sub_agents_used: agents?.map((a) => a.id) ?? [],
      chunk_count: hits.length,
    });
  }

  return {
    ok: true,
    query: opts.query,
    departments,
    hits,
    goldenQa: qaFiltered.map((q) => ({
      question: q.question,
      answer: q.answer,
      department: q.department_id ?? undefined,
    })),
    subAgentsQueried: agents?.length ?? 0,
  };
}

/** Format kingdom hits for injection into Hub RAG userContext */
export function formatKingdomContext(result: KingdomKnowledgeResult): string {
  if (!result.hits.length && !result.goldenQa.length) return "";

  const parts: string[] = [
    "## Kingdom Knowledge (sub-agent swarm memory)",
    `Departments: ${result.departments.join(", ")}`,
  ];

  for (const qa of result.goldenQa) {
    parts.push(`Q: ${qa.question}\nA: ${qa.answer}`);
  }

  for (const hit of result.hits.slice(0, 6)) {
    const label = [hit.departmentId, hit.subAgentSlug].filter(Boolean).join("/");
    parts.push(`[${label}]\n${hit.content.slice(0, 1200)}`);
  }

  return parts.join("\n\n");
}
