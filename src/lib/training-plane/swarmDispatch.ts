/**
 * Dispatch scrape tasks to sub-agents matching a user query (on retrieval miss).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyDepartments } from "@/lib/kingdom/classifier";

const AGENTS_PER_MISS = 8;

export async function dispatchSwarmForQuery(
  supabase: SupabaseClient,
  query: string
): Promise<number> {
  const departments = classifyDepartments(query, 3);
  let dispatched = 0;

  for (const deptId of departments) {
    const { data: agents } = await supabase
      .from("kingdom_sub_agents")
      .select("id, slug, department_id, search_seeds")
      .eq("department_id", deptId)
      .eq("status", "active")
      .order("last_run_at", { ascending: true, nullsFirst: true })
      .limit(Math.ceil(AGENTS_PER_MISS / departments.length));

    for (const agent of agents ?? []) {
      const { error } = await supabase.from("scrape_tasks").insert({
        sub_agent_id: agent.id,
        department_id: agent.department_id,
        query: `${query} — ${agent.slug}`,
        search_seeds: agent.search_seeds ?? [],
        status: "queued",
        priority: 90,
        metadata: { trigger: "retrieval_miss", slug: agent.slug },
      });
      if (!error) dispatched++;
    }
  }

  return dispatched;
}
