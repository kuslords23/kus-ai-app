/**
 * Jyinx Agent Tools API.
 *
 * Provides the autonomous agent with real-time access to Vercel deployments,
 * GitHub Actions, deploy hooks, and environment status.
 *
 * POST /api/jyinx/tools
 *   { tool: "vercel_status" | "github_actions" | "deploy_hooks" | "connectors", args: {} }
 *   Response: { ok: true, data: ... } or { ok: false, error: "..." }
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const VERCEL_TOKEN = process.env.VERCEL_TOKEN || "";
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || "";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const VERCEL_DEPLOY_HOOK_URL = process.env.VERCEL_DEPLOY_HOOK_URL || "";

async function vercelHeaders() {
  if (!VERCEL_TOKEN) return null;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${VERCEL_TOKEN}`,
    "Content-Type": "application/json",
  };
  if (VERCEL_TEAM_ID) headers["x-vercel-team-id"] = VERCEL_TEAM_ID;
  return headers;
}

async function getVercelDeployments(limit = 5) {
  const headers = await vercelHeaders();
  if (!headers) return { error: "VERCEL_TOKEN not configured" };
  try {
    const res = await fetch(`https://api.vercel.com/v6/deployments?limit=${limit}&order=desc`, { headers, cache: "no-store" });
    if (!res.ok) return { error: `Vercel API: ${res.status}` };
    const data = await res.json() as { deployments?: Array<{ uid?: string; name?: string; url?: string; state?: string; createdAt?: number; meta?: { githubCommitRef?: string; githubCommitMessage?: string } }> };
    return (data.deployments || []).map((d) => ({
      id: d.uid,
      project: d.name,
      url: d.url ? `https://${d.url}` : null,
      state: d.state,
      created: d.createdAt ? new Date(d.createdAt).toISOString().slice(0, 19).replace("T", " ") : null,
      branch: d.meta?.githubCommitRef || null,
      message: d.meta?.githubCommitMessage || null,
    }));
  } catch { return { error: "Failed to reach Vercel API" }; }
}

async function getDeployHookStatus() {
  if (!VERCEL_DEPLOY_HOOK_URL) return { error: "No deploy hook configured" };
  try {
    const res = await fetch(VERCEL_DEPLOY_HOOK_URL.replace("/hooks/", "/hooks//status"), {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return { error: `Deploy hook: ${res.status}` };
    const data = await res.json() as { status?: string; lastRun?: string; lastStatus?: string };
    return data;
  } catch { return { error: "Could not check deploy hook status" }; }
}

async function getGitHubActions(owner: string, repo: string, limit = 5) {
  if (!GITHUB_TOKEN) return { error: "GITHUB_TOKEN not configured" };
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=${limit}&page=1`, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!res.ok) return { error: `GitHub API: ${res.status}` };
    const data = await res.json() as { workflow_runs?: Array<{ id: number; name?: string; status?: string; conclusion?: string; head_branch?: string; html_url?: string; created_at?: string; updated_at?: string; display_title?: string }> };
    return (data.workflow_runs || []).map((r) => ({
      id: r.id,
      name: r.name || r.display_title,
      status: r.status,
      conclusion: r.conclusion,
      branch: r.head_branch,
      url: r.html_url,
      created: r.created_at?.slice(0, 19).replace("T", " "),
      updated: r.updated_at?.slice(0, 19).replace("T", " "),
    }));
  } catch { return { error: "Failed to reach GitHub API" }; }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { tool?: string; args?: Record<string, unknown> } | null;
  if (!body?.tool) return NextResponse.json({ ok: false, error: "Tool name required" }, { status: 400 });

  switch (body.tool) {
    case "vercel_deployments":
    case "vercel_status": {
    const data = await getVercelDeployments(Number(body.args?.limit) || 5);
    
    // Type narrow or safely check if data is an array or object
    const hasError = !Array.isArray(data) && data && 'error' in data ? (data as any).error : null;

    return NextResponse.json({ 
        ok: !hasError, 
        data: hasError ? null : data, 
        error: hasError 
    });
}


    case "deploy_hooks":
    case "deploy_hook_status": {
    const data = await getDeployHookStatus();
    const hasError = !Array.isArray(data) && data && 'error' in data ? (data as any).error : null;

    return NextResponse.json({ 
        ok: !hasError, 
        data: hasError ? null : data, 
        error: hasError 
    });
}
case "github_actions": {
    const owner = body.args?.owner;
    const repo = body.args?.repo;
    if (!owner || !repo) return NextResponse.json({ ok: false, error: "owner and repo required" });
    
    const data = await getGitHubActions(owner, repo, Number(body.args?.limit) || 5);
    const hasError = !Array.isArray(data) && data && 'error' in data ? (data as any).error : null;

    return NextResponse.json({ 
        ok: !hasError, 
        data: hasError ? null : data, 
        error: hasError 
    });
}



    default:
      return NextResponse.json({ ok: false, error: `Unknown tool: ${body.tool}` }, { status: 400 });
  }
}