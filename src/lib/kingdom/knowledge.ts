/**
 * Kingdom Knowledge Layer — fetchable memory from ~10k sub-agent swarm.
 * Separate from user-facing Royal agents; injected into RAG context.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { classifyDepartments } from "./classifier";
import { STARTER_PACKETS } from "./starterKnowledge";

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
  /** Best direct answer for the companion to use if Hub drifts */
  directAnswer?: string;
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

function matchStarterPackets(query: string) {
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  return STARTER_PACKETS.filter((p) => {
    const hay = `${p.question} ${p.answer} ${p.content}`.toLowerCase();
    if (q.includes("momo") && hay.includes("momo")) return true;
    const score = words.filter((w) => hay.includes(w)).length;
    return score >= 2;
  });
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

  const starters = matchStarterPackets(opts.query);
  const starterHits: KingdomKnowledgeHit[] = starters.map((p, i) => ({
    id: `starter-${i}`,
    content: p.content,
    departmentId: p.departmentId,
    domain: p.domain,
    confidence: 0.9,
  }));
  const starterQa = starters.map((p) => ({
    question: p.question,
    answer: p.answer,
    department: p.departmentId,
  }));

  const supabase = adminClient();
  if (!supabase) {
    return {
      ok: starterHits.length > 0,
      query: opts.query,
      departments,
      hits: starterHits,
      goldenQa: starterQa,
      directAnswer: starterQa[0]?.answer,
      subAgentsQueried: 0,
      error: "Supabase not configured",
    };
  }

  const needle = opts.query.trim().slice(0, 200);

  let chunks: Array<{
    id: string;
    content: string;
    department_id?: string | null;
    domain?: string | null;
    source_url?: string | null;
    confidence: number;
  }> | null = null;

  {
    const withDept = await supabase
      .from("knowledge_chunks")
      .select("id, content, department_id, domain, source_url, confidence")
      .in("department_id", departments)
      .eq("verification_status", "verified")
      .order("confidence", { ascending: false })
      .limit(limit * 2);
    if (!withDept.error) {
      chunks = withDept.data;
    } else {
      const withDomain = await supabase
        .from("knowledge_chunks")
        .select("id, content, department_id, domain, source_url, confidence")
        .in("domain", departments)
        .eq("verification_status", "verified")
        .order("confidence", { ascending: false })
        .limit(limit * 2);
      chunks = withDomain.data;
    }
  }

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

  let qa: Array<{
    question: string;
    answer: string;
    department_id?: string | null;
  }> | null = null;
  {
    const withDept = await supabase
      .from("golden_qa_pairs")
      .select("question, answer, department_id")
      .in("department_id", departments)
      .eq("verification_status", "verified")
      .order("confidence", { ascending: false })
      .limit(8);
    if (!withDept.error) qa = withDept.data;
    else {
      const withDomain = await supabase
        .from("golden_qa_pairs")
        .select("question, answer, department_id")
        .in("domain", departments)
        .eq("verification_status", "verified")
        .order("confidence", { ascending: false })
        .limit(8);
      qa = withDomain.data;
    }
  }

  const qaFiltered = (() => {
    const list = qa ?? [];
    if (!needle) return list.slice(0, 3);
    const words = needle.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const matched = list.filter((row) => {
      const text = `${row.question} ${row.answer}`.toLowerCase();
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

  const dbHits: KingdomKnowledgeHit[] = filtered.map((c) => ({
    id: c.id,
    content: c.content,
    departmentId: c.department_id ?? undefined,
    domain: c.domain ?? undefined,
    sourceUrl: c.source_url ?? undefined,
    confidence: c.confidence,
  }));

  const hits = [...starterHits, ...dbHits].slice(0, limit);
  const goldenQa = [...starterQa, ...qaFiltered.map((q) => ({
    question: q.question,
    answer: q.answer,
    department: q.department_id ?? undefined,
  }))].slice(0, 4);

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
    goldenQa,
    directAnswer: goldenQa[0]?.answer,
    subAgentsQueried: agents?.length ?? 0,
  };
}

/** Format kingdom hits for injection into Hub RAG userContext */
export function formatKingdomContext(result: KingdomKnowledgeResult): string {
  if (!result.hits.length && !result.goldenQa.length) return "";

  const parts: string[] = [
    "## Kingdom Knowledge (sub-agent swarm memory)",
    `Departments: ${result.departments.join(", ")}`,
    "Use this knowledge to answer the user. Do not open sports or marketplace unless asked.",
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
