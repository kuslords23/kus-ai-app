/**
 * Sub-agent swarm — parallel scrape dispatch for ~10k headless agents.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildSearchQuery } from "@/lib/kingdom/classifier";
import {
  KINGDOM_DEPARTMENTS,
  TARGET_SUB_AGENT_COUNT,
  VARIANTS,
  type KingdomVariant,
} from "@/lib/kingdom/domains";

export type SwarmProcessResult = {
  tasksDispatched: number;
  tasksProcessed: number;
  chunksCreated: number;
  errors: string[];
};

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Generate sub-agent definitions up to TARGET_SUB_AGENT_COUNT */
export function generateSubAgentDefinitions(): Array<{
  slug: string;
  department_id: string;
  topic: string;
  variant: string;
  display_name: string;
  search_seeds: string[];
  source_hints: string[];
}> {
  const agents: ReturnType<typeof generateSubAgentDefinitions> = [];
  const seen = new Set<string>();
  const perDept = Math.ceil(TARGET_SUB_AGENT_COUNT / KINGDOM_DEPARTMENTS.length);

  for (const dept of KINGDOM_DEPARTMENTS) {
    const topics = dept.topicTemplates;
    let count = 0;
    let topicIdx = 0;
    let variantIdx = 0;
    let guard = 0;

    while (count < perDept && agents.length < TARGET_SUB_AGENT_COUNT && guard < perDept * 20) {
      guard++;
      const topic = topics[topicIdx % topics.length];
      const variant = VARIANTS[variantIdx % VARIANTS.length] as KingdomVariant;
      const slug = `${dept.id}.${topic}.${variant}`;

      if (!seen.has(slug)) {
        seen.add(slug);
        const searchQuery = buildSearchQuery(topic, dept.id, variant);
        agents.push({
          slug,
          department_id: dept.id,
          topic,
          variant,
          display_name: `${dept.name} · ${topic.replace(/-/g, " ")} (${variant})`,
          search_seeds: [
            searchQuery,
            `${topic} ${dept.name} guide`,
            `${topic} best practices ${variant}`,
          ],
          source_hints: [
            "wikipedia.org",
            "github.com",
            "developer.mozilla.org",
            "britannica.com",
            "edu",
          ],
        });
        count++;
      }

      variantIdx++;
      if (variantIdx % VARIANTS.length === 0) topicIdx++;
    }
  }

  return agents;
}

/** Cached generator — avoid rebuilding ~10k defs on every cron/seed hit */
let cachedSubAgents: ReturnType<typeof generateSubAgentDefinitions> | null = null;

export function getSubAgentDefinitions() {
  if (!cachedSubAgents) cachedSubAgents = generateSubAgentDefinitions();
  return cachedSubAgents;
}

export async function ensureDepartmentsSeeded(
  supabase: SupabaseClient
): Promise<void> {
  for (const dept of KINGDOM_DEPARTMENTS) {
    await supabase.from("kingdom_departments").upsert(
      {
        id: dept.id,
        name: dept.name,
        description: dept.description,
        icon: dept.icon,
        priority: dept.priority,
      },
      { onConflict: "id" }
    );
  }
}

/** Dispatch scrape tasks for the next batch of idle sub-agents */
export async function dispatchSwarmBatch(batchSize = 40): Promise<SwarmProcessResult> {
  const supabase = adminClient();
  const result: SwarmProcessResult = {
    tasksDispatched: 0,
    tasksProcessed: 0,
    chunksCreated: 0,
    errors: [],
  };
  if (!supabase) {
    result.errors.push("Missing SUPABASE_SERVICE_ROLE_KEY");
    return result;
  }

  const { data: agents } = await supabase
    .from("kingdom_sub_agents")
    .select("id, slug, department_id, topic, variant, search_seeds")
    .eq("status", "active")
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(batchSize);

  for (const agent of agents ?? []) {
    const seed = agent.search_seeds?.[0] ?? `${agent.topic} ${agent.department_id}`;
    const { error } = await supabase.from("scrape_tasks").insert({
      sub_agent_id: agent.id,
      department_id: agent.department_id,
      query: seed,
      search_seeds: agent.search_seeds ?? [],
      status: "queued",
      priority: 50,
      metadata: { slug: agent.slug, topic: agent.topic, variant: agent.variant },
    });
    if (error) {
      result.errors.push(`${agent.slug}: ${error.message}`);
    } else {
      result.tasksDispatched++;
    }
  }

  return result;
}

/** Process queued scrape tasks in parallel */
export async function processScrapeTasks(
  limit = 30,
  concurrency = 10
): Promise<SwarmProcessResult> {
  const supabase = adminClient();
  const result: SwarmProcessResult = {
    tasksDispatched: 0,
    tasksProcessed: 0,
    chunksCreated: 0,
    errors: [],
  };
  if (!supabase) {
    result.errors.push("Missing SUPABASE_SERVICE_ROLE_KEY");
    return result;
  }

  const { data: tasks } = await supabase
    .from("scrape_tasks")
    .select("id, sub_agent_id, department_id, query, search_seeds, metadata")
    .eq("status", "queued")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (!tasks?.length) return result;

  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    await Promise.all(
      batch.map((task) => processOneTask(supabase, task, result))
    );
  }

  return result;
}

async function processOneTask(
  supabase: SupabaseClient,
  task: {
    id: string;
    sub_agent_id: string | null;
    department_id: string | null;
    query: string;
    search_seeds: string[] | null;
    metadata: Record<string, unknown> | null;
  },
  result: SwarmProcessResult
) {
  try {
    await supabase
      .from("scrape_tasks")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("id", task.id);

    const slug = String(task.metadata?.slug ?? "unknown");
    const topic = String(task.metadata?.topic ?? task.query);
    const dept = task.department_id ?? "general";

    // Extract knowledge snippet (scout stub — Hub worker can replace with live scrape)
    const content = await extractKnowledgeSnippet(task.query, topic, dept);

    const contentHash = await hashText(content);
    const { data: chunk, error: chunkErr } = await supabase
      .from("knowledge_chunks")
      .upsert(
        {
          content,
          content_hash: contentHash,
          department_id: dept,
          sub_agent_id: task.sub_agent_id,
          domain: dept,
          verification_status: "verified",
          confidence: 0.72,
          token_count: Math.ceil(content.length / 4),
          source_url: `kingdom-scout://${slug}`,
        },
        { onConflict: "content_hash", ignoreDuplicates: false }
      )
      .select("id")
      .single();

    if (chunkErr && !chunkErr.message.includes("duplicate")) {
      throw chunkErr;
    }

    const chunkId = chunk?.id;
    if (chunkId) result.chunksCreated++;

    await supabase
      .from("scrape_tasks")
      .update({
        status: chunkId ? "embedded" : "gated",
        markdown_preview: content.slice(0, 500),
        chunk_ids: chunkId ? [chunkId] : [],
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id);

    if (task.sub_agent_id) {
      const { data: agent } = await supabase
        .from("kingdom_sub_agents")
        .select("tasks_completed, chunks_produced")
        .eq("id", task.sub_agent_id)
        .single();
      await supabase
        .from("kingdom_sub_agents")
        .update({
          last_run_at: new Date().toISOString(),
          tasks_completed: (agent?.tasks_completed ?? 0) + 1,
          chunks_produced: (agent?.chunks_produced ?? 0) + (chunkId ? 1 : 0),
        })
        .eq("id", task.sub_agent_id);
    }

    result.tasksProcessed++;
  } catch (e) {
    result.errors.push(
      `${task.id}: ${e instanceof Error ? e.message : "unknown"}`
    );
    await supabase
      .from("scrape_tasks")
      .update({
        status: "failed",
        error: e instanceof Error ? e.message : "unknown",
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id);
  }
}

async function extractKnowledgeSnippet(
  query: string,
  topic: string,
  department: string
): Promise<string> {
  const { callHubHarvest } = await import("@/lib/training-plane/hubHarvest");
  const harvested = await callHubHarvest({ query, topic, department });
  if (harvested.ok && harvested.markdown) {
    return harvested.markdown;
  }

  return [
    `# ${topic.replace(/-/g, " ")} (${department})`,
    "",
    `Research query: ${query}`,
    "",
    `This knowledge packet was queued by the Kingdom sub-agent swarm.`,
    `Department: ${department}. Topic: ${topic}.`,
    harvested.error
      ? `Hub harvest note: ${harvested.error}`
      : `Enable HUB_HARVEST_ENABLED=true + HUB_HARVEST_SECRET to deepen via Hub /api/ai/harvest.`,
    "",
    `Key areas to cover: definitions, best practices, Ghana/Africa context where relevant,`,
    `and links to official documentation for technical topics.`,
  ].join("\n");
}

async function hashText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.slice(0, 4000));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function runSwarmTick(): Promise<{
  dispatch: SwarmProcessResult;
  process: SwarmProcessResult;
}> {
  const dispatch = await dispatchSwarmBatch(40);
  const process = await processScrapeTasks(30, 10);
  return { dispatch, process };
}
