/**
 * Training Plane orchestrator — processes learning_events into ingestion jobs.
 * Runs on cron (Vercel) or as `node training-worker/run.mjs`.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dispatchSwarmForQuery } from "@/lib/training-plane/swarmDispatch";
import {
  callHubHarvest,
  isHubHarvestEnabled,
} from "@/lib/training-plane/hubHarvest";

export type ProcessResult = {
  processed: number;
  jobsCreated: number;
  errors: string[];
};

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function processLearningBatch(
  limit = 25
): Promise<ProcessResult> {
  const supabase = adminClient();
  const result: ProcessResult = { processed: 0, jobsCreated: 0, errors: [] };
  if (!supabase) {
    result.errors.push("Missing SUPABASE_SERVICE_ROLE_KEY");
    return result;
  }

  const { data: events, error } = await supabase
    .from("learning_events")
    .select("id, event_type, payload, session_id, user_id, source")
    .is("processed_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  for (const event of events ?? []) {
    try {
      await handleEvent(supabase, event);
      await supabase
        .from("learning_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", event.id);
      result.processed++;
    } catch (e) {
      result.errors.push(
        `${event.id}: ${e instanceof Error ? e.message : "unknown"}`
      );
    }
  }

  return result;
}

async function handleEvent(
  supabase: SupabaseClient,
  event: {
    id: string;
    event_type: string;
    payload: Record<string, unknown>;
    session_id: string | null;
    user_id: string | null;
    source: string;
  }
) {
  switch (event.event_type) {
    case "retrieval_miss":
    case "harvest_request": {
      const query = String(
        event.payload.query ?? event.payload.sourceUrl ?? ""
      );
      const sourceUrl =
        (event.payload.sourceUrl as string) ||
        (query.startsWith("http") ? query : null);

      const { error } = await supabase.from("ingestion_jobs").insert({
        agent:
          event.event_type === "retrieval_miss"
            ? "auto-search-scout"
            : "data-harvester",
        source_type:
          (event.payload.sourceType as string) ||
          (event.event_type === "retrieval_miss" ? "web" : "web"),
        source_url: sourceUrl,
        status: "queued",
        metadata: {
          trigger: event.event_type,
          learning_event_id: event.id,
          query: event.payload.query,
          session_id: event.session_id,
          user_id: event.user_id,
          source: event.source,
        },
      });
      if (error) throw error;

      // Also dispatch sub-agent swarm for faster parallel scraping
      if (event.event_type === "retrieval_miss" && query) {
        await dispatchSwarmForQuery(supabase, query);
      }
      break;
    }
    case "correction": {
      await supabase.from("ingestion_jobs").insert({
        agent: "fact-checker-style",
        source_type: "correction",
        status: "queued",
        metadata: {
          learning_event_id: event.id,
          user_query: event.payload.userQuery,
          assistant_reply: event.payload.assistantReply,
          note: event.payload.note,
        },
      });
      break;
    }
    case "helpful": {
      const answer = String(event.payload.assistantReply ?? "");
      if (answer.length < 20) break;
      await supabase.from("golden_qa_pairs").insert({
        question: String(event.payload.userQuery ?? "User question"),
        answer: answer.slice(0, 4000),
        style_tags: ["verified-helpful", event.source],
        verification_status: "verified",
        confidence: 0.85,
        domain: "general",
      });
      break;
    }
    case "rag_error":
    case "style_sample":
    case "memory_export":
      // Logged only — processed_at marks consumed; extend in Hub worker
      break;
    default:
      break;
  }
}

/** Process queued ingestion jobs — deepen via Hub /api/ai/harvest when enabled. */
export async function processIngestionJobs(limit = 10): Promise<ProcessResult> {
  const supabase = adminClient();
  const result: ProcessResult = { processed: 0, jobsCreated: 0, errors: [] };
  if (!supabase) {
    result.errors.push("Missing SUPABASE_SERVICE_ROLE_KEY");
    return result;
  }

  const { data: jobs } = await supabase
    .from("ingestion_jobs")
    .select("id, agent, source_type, source_url, metadata")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);

  for (const job of jobs ?? []) {
    try {
      const meta = (job.metadata ?? {}) as Record<string, unknown>;
      const query = String(meta.query ?? job.source_url ?? "");

      if (isHubHarvestEnabled() && query) {
        const harvested = await callHubHarvest({
          query,
          sourceUrl: job.source_url,
          agent: job.agent,
          department: String(meta.department ?? "general"),
          topic: String(meta.topic ?? query.slice(0, 64)),
          metadata: meta,
        });

        if (harvested.ok) {
          let chunkId: string | undefined;
          if (harvested.markdown) {
            const content = harvested.markdown;
            const contentHash = await hashContent(content);
            const { data: chunk } = await supabase
              .from("knowledge_chunks")
              .upsert(
                {
                  content,
                  content_hash: contentHash,
                  domain: String(meta.department ?? "general"),
                  department_id: String(meta.department ?? "general"),
                  verification_status: "verified",
                  confidence: 0.8,
                  token_count: Math.ceil(content.length / 4),
                  source_url:
                    job.source_url ||
                    harvested.sources?.[0] ||
                    `hub-harvest://${job.id}`,
                },
                { onConflict: "content_hash", ignoreDuplicates: false }
              )
              .select("id")
              .single();
            chunkId = chunk?.id;
          }

          await supabase
            .from("ingestion_jobs")
            .update({
              status: "embedded",
              updated_at: new Date().toISOString(),
              metadata: {
                ...meta,
                hubHarvest: true,
                chunkId,
                hubChunkIds: harvested.chunkIds,
                sources: harvested.sources,
              },
            })
            .eq("id", job.id);
          result.processed++;
          continue;
        }

        result.errors.push(`${job.id}: ${harvested.error ?? "harvest failed"}`);
      }

      await supabase
        .from("ingestion_jobs")
        .update({
          status: "gated",
          updated_at: new Date().toISOString(),
          metadata: {
            ...meta,
            message: isHubHarvestEnabled()
              ? "Hub harvest failed or returned empty — queued for retry"
              : "Set HUB_HARVEST_ENABLED=true + HUB_HARVEST_SECRET to deepen via Hub",
          },
        })
        .eq("id", job.id);
      result.processed++;
    } catch (e) {
      result.errors.push(
        `${job.id}: ${e instanceof Error ? e.message : "unknown"}`
      );
    }
  }

  return result;
}

async function hashContent(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.slice(0, 4000));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function runTrainingTick(): Promise<{
  events: ProcessResult;
  jobs: ProcessResult;
}> {
  const events = await processLearningBatch();
  const jobs = await processIngestionJobs();

  // Run sub-agent swarm in same tick when service role available
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { runSwarmTick } = await import("@/lib/training-plane/swarm");
      await runSwarmTick();
    } catch {
      // swarm optional if tables not migrated yet
    }
  }

  return { events, jobs };
}
