/**
 * Call Hub harvest/scout to deepen Training Plane + Kingdom Swarm memory.
 * Hub live endpoint: POST /api/ai/harvest (auth required).
 */

const HUB_URL =
  process.env.NEXT_PUBLIC_HUB_URL || "https://sport-clan-nexus.vercel.app";

export type HubHarvestResult = {
  ok: boolean;
  markdown?: string;
  chunkIds?: string[];
  sources?: string[];
  error?: string;
  status?: number;
};

function harvestAuthHeaders(): HeadersInit {
  const secret =
    process.env.HUB_HARVEST_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    "Content-Type": "application/json",
    ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
  };
}

/** True when companion should hit live Hub harvest (not stubs). */
export function isHubHarvestEnabled(): boolean {
  return (
    process.env.KINGDOM_SCOUT_ENABLED === "true" ||
    process.env.HUB_HARVEST_ENABLED === "true"
  );
}

/**
 * Request Hub to harvest public knowledge for a query.
 * Tries /api/ai/harvest first, then /api/ai/scout for older Hub builds.
 */
export async function callHubHarvest(opts: {
  query: string;
  department?: string;
  topic?: string;
  sourceUrl?: string | null;
  agent?: string;
  metadata?: Record<string, unknown>;
}): Promise<HubHarvestResult> {
  if (!isHubHarvestEnabled()) {
    return { ok: false, error: "Hub harvest disabled (set HUB_HARVEST_ENABLED=true)" };
  }

  const body = {
    query: opts.query,
    department: opts.department,
    topic: opts.topic,
    sourceUrl: opts.sourceUrl ?? undefined,
    agent: opts.agent,
    metadata: opts.metadata,
  };

  const paths = ["/api/ai/harvest", "/api/ai/scout"];
  let last: HubHarvestResult = { ok: false, error: "No Hub harvest endpoint" };

  for (const path of paths) {
    try {
      const res = await fetch(`${HUB_URL}${path}`, {
        method: "POST",
        headers: harvestAuthHeaders(),
        body: JSON.stringify(body),
      });

      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (res.status === 404) {
        last = { ok: false, status: 404, error: `${path} not found` };
        continue;
      }

      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          error: String(data.error ?? `Hub ${path} failed (${res.status})`),
        };
      }

      const markdown =
        (data.markdown as string) ||
        (data.content as string) ||
        (data.text as string) ||
        undefined;

      return {
        ok: true,
        status: res.status,
        markdown: markdown ? String(markdown).slice(0, 8000) : undefined,
        chunkIds: Array.isArray(data.chunkIds)
          ? (data.chunkIds as string[])
          : Array.isArray(data.chunk_ids)
            ? (data.chunk_ids as string[])
            : undefined,
        sources: Array.isArray(data.sources)
          ? (data.sources as string[])
          : undefined,
      };
    } catch (e) {
      last = {
        ok: false,
        error: e instanceof Error ? e.message : "Hub harvest network error",
      };
    }
  }

  return last;
}
