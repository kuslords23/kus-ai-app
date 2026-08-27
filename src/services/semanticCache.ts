import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { createHash } from "node:crypto";

/**
 * Supabase Semantic Cache & Training Distillation pipeline.
 *
 * Uses a Supabase `jyinx_semantic_cache` table (with a pgvector `embedding`
 * column) to serve semantically-similar queries at $0 cost before hitting an
 * external LLM. Successful (query → response) pairs are logged to a separate
 * table in JSONL-compatible rows for later instruction-tuning distillation.
 *
 * Everything is best-effort: cache failures never block the caller.
 *
 * Suggested schema:
 *   create extension if not exists vector;
 *   create table jyinx_semantic_cache (
 *     id uuid primary key default gen_random_uuid(),
 *     query_hash text unique not null,
 *     query text not null,
 *     system text,
 *     response text not null,
 *     model text not null,
 *     embedding vector(1024),
 *     created_at timestamptz default now()
 *   );
 *   create table jyinx_distill_logs (
 *     id uuid primary key default gen_random_uuid(),
 *     instruction text not null,
 *     input text,
 *     output text not null,
 *     model text,
 *     source text,
 *     created_at timestamptz default now()
 *   );
 */

export const DISTILL_TABLE = "jyinx_distill_logs";
export const CACHE_TABLE = "jyinx_semantic_cache";

/**
 * Markers that identify stale refusal responses (the old prompt told the model
 * it "cannot modify files or commit"). These rows must never be served again.
 */
const REFUSAL_MARKERS = [
  "do not claim to modify files directly",
  "cannot modify files",
  "cannot modify code",
  "cannot commit",
  "can't modify files",
  "unable to modify",
  "no write access",
  "read-only",
];

type CacheRow = {
  query: string;
  system?: string | null;
  response: string;
  model: string;
  embedding?: string;
};

type DistillRow = {
  instruction: string;
  output: string;
  model?: string | null;
  source?: string | null;
  input?: string | null;
};

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Produces a deterministic local embedding so the cache is useful even without
 * an explicit embedding model / `ai` extension. Swap for a real embedder when
 * available for better semantic fidelity.
 */
export async function embedText(text: string, dimensions = 1024): Promise<number[]> {
  const tokens = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const vector = new Array<number>(dimensions).fill(0);
  for (const token of tokens.slice(0, 512)) {
    const hash = createHash("sha256").update(token).digest();
    const idx = hash.readUInt32BE(0) % dimensions;
    vector[idx] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function parseEmbedding(row: CacheRow): number[] | null {
  if (typeof row.embedding !== "string") return null;
  try {
    // pgvector returns a value like `[0.1,0.2,...]`.
    return JSON.parse(row.embedding) as number[];
  } catch {
    return null;
  }
}

export type CacheHit = { query: string; response: string; model: string; similarity: number };

export type CacheLookupResult = { hit: true; value: CacheHit } | { hit: false; value: null };

/**
 * Checks the semantic cache for a similar query. Threshold is 0.9 cosine
 * similarity. On a hit the caller serves the cached response at $0 cost.
 */
export async function lookup(query: string): Promise<CacheLookupResult> {
  const trimmed = query.trim();
  if (trimmed.length < 8) return { hit: false, value: null };
  try {
    const client = await createSupabaseClient();
    const queryEmbedding = await embedText(trimmed);
    const { data, error } = await client.from(CACHE_TABLE).select("query, response, model, embedding").limit(200);
    if (error || !data) return { hit: false, value: null };
    const cacheRows = data as unknown as CacheRow[];
    const matches = cacheRows
      .map((row) => {
        const vec = parseEmbedding(row);
        if (!vec) return null;
        return { row, similarity: cosine(queryEmbedding, vec) };
      })
      .filter((m): m is { row: CacheRow; similarity: number } => m !== null)
      .sort((a, b) => b.similarity - a.similarity);

    const best = matches[0];
    if (best && best.similarity >= 0.9) {
      await logDistill({
        instruction: trimmed,
        output: best.row.response,
        model: best.row.model,
        source: "cache",
      });
      return {
        hit: true,
        value: { query: best.row.query, response: best.row.response, model: best.row.model, similarity: best.similarity },
      };
    }
    return { hit: false, value: null };
  } catch {
    return { hit: false, value: null };
  }
}

/**
 * Stores a generated (query → response) pair and its embedding into the cache,
 * and records it into the distillation log.
 */
export async function store(opts: {
  query: string;
  system?: string;
  response: string;
  model: string;
}): Promise<void> {
  try {
    const client = await createSupabaseClient();
    const embedding = await embedText(opts.query);
    const queryHash = sha256(opts.query);
    await client
      .from(CACHE_TABLE)
      .upsert(
        {
          query_hash: queryHash,
          query: opts.query,
          system: opts.system ?? null,
          response: opts.response,
          model: opts.model,
          embedding: `[${embedding.join(",")}]`,
        },
        { onConflict: "query_hash" }
      );
    await logDistill({ instruction: opts.query, input: opts.system, output: opts.response, model: opts.model, source: "store" });
  } catch {
    // best-effort
  }
}

async function logDistill(row: DistillRow): Promise<void> {
  try {
    const client = await createSupabaseClient();
    await client.from(DISTILL_TABLE).insert({
      instruction: row.instruction,
      input: row.input ?? null,
      output: row.output,
      model: row.model ?? null,
      source: row.source ?? null,
    });
  } catch {
    // best-effort
  }
}

/**
 * Deletes cached rows that still contain stale refusal language (the old
 * "cannot modify / cannot commit" responses), so they are never served to
 * users again after the capability restoration. Returns the number of rows
 * removed. Best-effort: failures never break the caller.
 */
export async function purgeRefusals(): Promise<number> {
  try {
    const client = await createSupabaseClient();
    const { data, error } = await client.from(CACHE_TABLE).select("query").limit(500);
    if (error || !data) return 0;
    const queries = data as unknown as Array<{ query?: string; response?: string }>;
    const stale = queries.filter((row) => row && (REFUSAL_MARKERS.some((marker) => (row.query ?? "").toLowerCase().includes(marker))));
    if (stale.length === 0) return 0;
    for (const row of stale) {
      await client.from(CACHE_TABLE).delete().eq("query", row.query);
    }
    return stale.length;
  } catch {
    return 0;
  }
}

/**
 * Because `lookup` only stores the prompt's query text, the cached *response*
 * on the row we stored may hold a refusal. Fetch candidate rows and delete the
 * ones whose stored response looks like a refusal (this catches rows the exact
 * query-marker scan would miss).
 */
export async function purgeRefusalResponses(): Promise<number> {
  try {
    const client = await createSupabaseClient();
    const { data, error } = await client.from(CACHE_TABLE).select("query, response");
    if (error || !data) return 0;
    const rows = data as unknown as Array<{ query: string; response: string }>;
    const stale = rows.filter((row) =>
      (row.response || "").toLowerCase().includes("cannot modify") ||
      (row.response || "").toLowerCase().includes("cannot commit") ||
      (row.response || "").toLowerCase().includes("do not claim to modify") ||
      (row.response || "").toLowerCase().includes("unable to modify")
    );
    if (!stale.length) return 0;
    for (const row of stale) {
      await client.from(CACHE_TABLE).delete().eq("query", row.query);
    }
    return stale.length;
  } catch {
    return 0;
  }
}

/**
 * Wipes the entire `jyinx_semantic_cache` table (returns rows removed).
 * Useful for a manual "clear cache" control in settings.
 */
export async function clearAllCache(): Promise<number> {
  try {
    const client = await createSupabaseClient();
    const { error, count } = await client.from(CACHE_TABLE).delete().neq("query_hash", "0000000000000000000000000000000000000000000000000000000000000000");
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Whether a prompt should bypass the semantic cache (write/action intent).
 * Commit-style prompts must always execute fresh — never serve a cached reply.
 */
export function isActionPrompt(prompt: string): boolean {
  return /(^|\s)(commit|save|push|write|update|apply|edit|change|create|upload|delete)\b/i.test(prompt.trim());
}

/**
 * Exports distillation rows (today by default) as a JSONL string ready for
 * fine-tuning datasets.
 */
export async function exportDistillJsonl(days = 1): Promise<string> {
  try {
    const client = await createSupabaseClient();
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data, error } = await client
      .from(DISTILL_TABLE)
      .select("instruction, input, output, model")
      .gte("created_at", since)
      .order("created_at", { ascending: true });
    if (error || !data) return "";
    const rows = data as unknown as Array<Record<string, unknown>>;
    return rows
      .map((row) =>
        JSON.stringify({
          instruction: row.instruction,
          input: row.input ?? "",
          output: row.output,
          system: "You are the Kus AI companion.",
        })
      )
      .join("\n");
  } catch {
    return "";
  }
}