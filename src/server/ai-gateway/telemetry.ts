/**
 * Telemetry, cost attribution & usage logging.
 *
 * Every request passing through the gateway is written to the
 * `ai_usage_requests` table (Supabase/PostgreSQL) recording token consumption,
 * calculated cost, latency (total / time-to-first-token), the responding model,
 * and who made the call — for usage auditing and user billing.
 *
 * Best-effort: a failure to persist telemetry must NEVER break the user-facing
 * AI call, so every write is wrapped and swallowed.
 */
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type { UsageTelemetry } from "./types";

const REQUESTS_TABLE = "ai_usage_requests";

export interface TelemetryWriter {
  enabled: boolean;
  record: (entry: UsageTelemetry) => Promise<void>;
}

/** Internal send with its own try/catch — never throws. */
async function insert(entry: UsageTelemetry): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from(REQUESTS_TABLE).insert({
      user_id: entry.userId?.trim() ? entry.userId : null,
      ip: entry.ip?.trim() ? entry.ip : null,
      gateway: entry.gateway,
      provider: entry.provider,
      model: entry.model,
      request_model: entry.requestedModel,
      status: entry.status,
      prompt_tokens: entry.promptTokens,
      completion_tokens: entry.completionTokens,
      total_tokens: entry.totalTokens,
      cost: entry.cost,
      latency_ms: entry.latencyMs,
      ttft_ms: entry.ttftMs ?? null,
      retries: entry.retries,
      error: entry.error?.slice(0, 2000) ?? null,
      metadata: entry.metadata ?? null,
    });
    if (error) {
      // Surface nothing to the caller; keep telemetry best-effort.
    }
  } catch {
    // Ignore — telemetry must not break requests.
  }
}

export function createTelemetry(enabled: boolean): TelemetryWriter {
  return {
    enabled,
    record: (entry) => {
      if (!enabled) return Promise.resolve();
      return insert(entry);
    },
  };
}
