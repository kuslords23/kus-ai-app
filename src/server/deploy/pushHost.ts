/**
 * Push-to-host deployment service (server-only, Node runtime).
 *
 * "Push" means the agent's commit has already been written to GitHub (via
 * `commitFiles`). This service performs the second, distinct half of "push":
 * pushing the committed repo/branch out to a dedicated host platform so the
 * change is live.
 *
 * Host platforms are the git-aware build-hook / deploy-hook platforms the app
 * integrates with (Vercel, Netlify, Railway, Custom). Hooks can be configured
 * either through environment variables (VERCEL_DEPLOY_HOOK_URL, etc.) or via
 * the Connectors Hub UI (stored in the `deploy_hooks` table). User-configured
 * hooks take priority over env-var hooks. Every push is recorded in the
 * `jyinx_deployments` table so the IDE + pipeline can surface deploy logs,
 * status, and live URLs.
 *
 * This runs on the Node server (Vercel serverless) and deliberately does NOT
 * shell out to a `git` CLI — unreliable on serverless, and unnecessary:
 * the commit already lives on GitHub, and host platforms build straight from
 * the branch. No `child_process`, no browser crashes.
 */
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveHooks } from "@/server/deploy-hooks/service";

export type DeploymentStatus = "queued" | "deploying" | "live" | "failed";

export type Deployment = {
  id: string;
  repository: string;
  branch: string;
  commitSha?: string | null;
  commitMessage?: string | null;
  host: string;
  status: DeploymentStatus;
  deployUrl?: string | null;
  log?: string | null;
  owner?: string | null;
  created_at: string;
  updated_at: string;
};

export type PushToHostInput = {
  repository: string;
  branch: string;
  commitSha?: string;
  commitMessage?: string;
  owner?: string;
  origin?: string;
};

export type PushToHostResult = {
  ok: boolean;
  deployment?: Deployment;
  href?: string;
  error?: string;
};

const DEPLOY_TABLE = "jyinx_deployments";

/** Ordered host platforms to trigger. Each env var configures a build hook URL. */
const HOST_HOOKS: Array<{ host: string; url: string | undefined }> = [
  { host: "vercel", url: process.env.VERCEL_DEPLOY_HOOK_URL },
  { host: "netlify", url: process.env.NETLIFY_BUILD_HOOK },
  { host: "railway", url: process.env.RAILWAY_DEPLOY_HOOK },
  { host: "custom", url: process.env.HOST_DEPLOY_HOOK_URL },
];

/** Preview URL for an app-published site (`/l/:slug`) served by this platform. */
function previewUrl(origin: string | undefined, repository: string, branch: string): string {
  const base = (origin ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://kus-ai-app.vercel.app").replace(/\/$/, "");
  const slug = `${(repository.split("/")[1] ?? "site")}-${branch}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base}/l/${encodeURIComponent(slug)}`;
}

async function upsertDeployment(
  row: Partial<Deployment> & { repository: string; branch: string; host: string }
): Promise<Deployment | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const key = `${row.repository}#${row.branch}#${row.host}`;
    const { data, error } = await supabase
      .from(DEPLOY_TABLE)
      .upsert(
        {
          key,
          repository: row.repository,
          branch: row.branch,
          host: row.host,
          commit_sha: row.commitSha ?? null,
          commit_message: row.commitMessage ?? null,
          status: row.status ?? "queued",
          deploy_url: row.deployUrl ?? null,
          log: row.log ?? null,
          owner: row.owner ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      )
      .select("*")
      .maybeSingle();
    if (error || !data) return null;
    return mapRow(data as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

function mapRow(row: Record<string, unknown>): Deployment {
  return {
    id: String(row.id),
    repository: String(row.repository),
    branch: String(row.branch),
    commitSha: row.commit_sha ? String(row.commit_sha) : null,
    commitMessage: row.commit_message ? String(row.commit_message) : null,
    host: String(row.host),
    status: (row.status as DeploymentStatus) ?? "queued",
    deployUrl: row.deploy_url ? String(row.deploy_url) : null,
    log: row.log ? String(row.log) : null,
    owner: row.owner ? String(row.owner) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** Lists tracked deployments, optionally scoped to an owner or repository. */
export async function listDeployments(opts: { owner?: string; repository?: string; limit?: number } = {}): Promise<Deployment[]> {
  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from(DEPLOY_TABLE).select("*").order("updated_at", { ascending: false });
    if (opts.owner) query = query.eq("owner", opts.owner);
    if (opts.repository) query = query.eq("repository", opts.repository);
    query = query.limit(opts.limit ?? 50);
    const { data, error } = await query;
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[]).map(mapRow);
  } catch {
    return [];
  }
}

async function triggerHook(url: string, payload: PushToHostInput): Promise<{ ok: boolean; location?: string | null; status: number }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Jyinx-Push": "1" },
      body: JSON.stringify({
        repository: payload.repository,
        branch: payload.branch,
        commitSha: payload.commitSha,
        commitMessage: payload.commitMessage,
        ref: `refs/heads/${payload.branch}`,
      }),
      cache: "no-store",
      // Some build hooks are slow to ack but well under the default — keep tight.
      signal: AbortSignal.timeout(20_000),
    });
    return { ok: response.ok, location: response.headers.get("location"), status: response.status };
  } catch (cause) {
    return { ok: false, location: null, status: 0 };
  }
}

/**
 * Pushes an already-committed repo/branch to every configured dedicated host
 * platform, records the deployment, and returns the first live/tracked URL.
 *
 * Always at least records the deployment on this platform's preview domain so
 * the push is observable even when no external host is configured yet.
 *
 * Resolution order:
 *   1. User-configured hooks from the `deploy_hooks` table (Connectors Hub UI)
 *   2. Environment variable hooks (VERCEL_DEPLOY_HOOK_URL, etc.)
 *   3. Preview URL fallback
 */
export async function pushToHost(input: PushToHostInput): Promise<PushToHostResult> {
  const repository = input.repository;
  const branch = input.branch;
  if (!repository || !branch) {
    return { ok: false, error: "repository and branch are required to push." };
  }

  // 1. Resolve hooks from the database (user-configured via Connectors Hub)
  const dbHooks = input.owner ? await getActiveHooks(input.owner).catch(() => []) : [];

  // 2. Resolve hooks from environment variables (legacy/admin fallback)
  const envHooks = HOST_HOOKS.filter((h) => Boolean(h.url)).map((h) => ({
    id: null as string | null,
    host: h.host,
    url: h.url!,
    label: null as string | null,
  }));

  // 3. Merge: DB hooks take priority over env hooks
  const seenHosts = new Set<string>();
  const allHooks: Array<{ id: string | null; host: string; url: string; label: string | null }> = [];

  for (const hook of dbHooks) {
    if (!seenHosts.has(hook.host)) {
      allHooks.push({ id: hook.id, host: hook.host, url: hook.hookUrl, label: hook.label });
      seenHosts.add(hook.host);
    }
  }
  for (const hook of envHooks) {
    if (!seenHosts.has(hook.host)) {
      allHooks.push(hook);
      seenHosts.add(hook.host);
    }
  }

  if (allHooks.length === 0) {
    const fallback = await upsertDeployment({
      repository,
      branch,
      host: "preview",
      status: "queued",
      commitSha: input.commitSha,
      commitMessage: input.commitMessage,
      deployUrl: previewUrl(input.origin, repository, branch),
      owner: input.owner,
      log: "No deploy hook configured. Add one in Settings → Connectors → Hosting.",
    });
    return {
      ok: true,
      deployment: fallback ?? undefined,
      href: fallback?.deployUrl ?? undefined,
    };
  }

  const results: Array<{ host: string; ok: boolean; location?: string | null }> = [];
  const logs: string[] = [];
  for (const hook of allHooks) {
    const start = await upsertDeployment({
      repository,
      branch,
      host: hook.host,
      status: "deploying",
      commitSha: input.commitSha,
      commitMessage: input.commitMessage,
      owner: input.owner,
      log: `Pushing ${repository}#${branch} to ${hook.host}${hook.label ? ` (${hook.label})` : ""}…`,
    });
    const triggered = await triggerHook(hook.url, input);
    results.push({ host: hook.host, ok: triggered.ok, location: triggered.location });
    logs.push(`${hook.host}: ${triggered.ok ? "triggered" : `failed (${triggered.status})`}`);

    const href = triggered.location ?? previewUrl(input.origin, repository, branch);
    await upsertDeployment({
      repository,
      branch,
      host: hook.host,
      status: triggered.ok ? "live" : "failed",
      commitSha: input.commitSha,
      commitMessage: input.commitMessage,
      deployUrl: href,
      owner: input.owner,
      log: logs[logs.length - 1],
    });
    void start;

    // Touch the DB hook so we know when it was last used
    if (hook.id) {
      const { touchDeployHook } = await import("@/server/deploy-hooks/service");
      void touchDeployHook(hook.id);
    }
  }

  const firstLive = results.find((r) => r.ok);
  if (firstLive) {
    return {
      ok: true,
      href: firstLive.location ?? previewUrl(input.origin, repository, branch),
    };
  }

  return {
    ok: false,
    href: previewUrl(input.origin, repository, branch),
    error: `Push triggered to ${configured.length} host platform(s) but none confirmed. Logs: ${logs.join(" | ")}`,
  };
}

export { DEPLOY_TABLE };