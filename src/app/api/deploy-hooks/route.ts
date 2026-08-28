/**
 * Deploy hooks API — manage deploy hook URLs from the Connectors Hub.
 *
 * GET    /api/deploy-hooks          — list hooks for the current user
 * POST   /api/deploy-hooks          — create a new hook
 * PUT    /api/deploy-hooks?id=xxx   — update an existing hook
 * DELETE /api/deploy-hooks?id=xxx   — delete a hook
 */
import { NextRequest, NextResponse } from "next/server";
import {
  listDeployHooks,
  createDeployHook,
  updateDeployHook,
  deleteDeployHook,
  type DeployHookHost,
  type DeployHookInput,
} from "@/server/deploy-hooks/service";

export const runtime = "nodejs";

async function getUserId(request: NextRequest): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const hooks = await listDeployHooks(userId);
  return NextResponse.json({ hooks });
}

export async function POST(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    host?: unknown;
    label?: unknown;
    hookUrl?: unknown;
    repoScope?: unknown;
  } | null;

  const host = typeof body?.host === "string" ? body.host : "";
  const hookUrl = typeof body?.hookUrl === "string" ? body.hookUrl.trim() : "";

  if (!host || !hookUrl) {
    return NextResponse.json({ error: "host and hookUrl are required." }, { status: 400 });
  }
  if (!hookUrl.startsWith("https://")) {
    return NextResponse.json({ error: "hookUrl must be an HTTPS URL." }, { status: 400 });
  }

  const validHosts = ["vercel", "netlify", "railway", "custom"];
  if (!validHosts.includes(host)) {
    return NextResponse.json({ error: `Invalid host. Must be one of: ${validHosts.join(", ")}` }, { status: 400 });
  }

  const input: DeployHookInput = {
    host: host as DeployHookHost,
    hookUrl,
    label: typeof body?.label === "string" ? body.label : undefined,
    repoScope: Array.isArray(body?.repoScope) ? (body.repoScope as string[]) : undefined,
  };

  const hook = await createDeployHook(userId, input);
  if (!hook) return NextResponse.json({ error: "Could not create deploy hook." }, { status: 500 });

  return NextResponse.json({ ok: true, hook });
}

export async function PUT(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const body = (await request.json().catch(() => null)) as {
    host?: unknown;
    label?: unknown;
    hookUrl?: unknown;
    repoScope?: unknown;
    isActive?: unknown;
  } | null;

  if (!body) return NextResponse.json({ error: "Request body is required." }, { status: 400 });

  const input: Partial<DeployHookInput> = {};
  if (typeof body.host === "string") input.host = body.host as DeployHookHost;
  if (typeof body.label === "string") input.label = body.label;
  if (typeof body.hookUrl === "string") input.hookUrl = body.hookUrl.trim();
  if (Array.isArray(body.repoScope)) input.repoScope = body.repoScope as string[];
  if (typeof body.isActive === "boolean") input.isActive = body.isActive;

  const hook = await updateDeployHook(id, userId, input);
  if (!hook) return NextResponse.json({ error: "Deploy hook not found or not owned by user." }, { status: 404 });

  return NextResponse.json({ ok: true, hook });
}

export async function DELETE(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const ok = await deleteDeployHook(id, userId);
  if (!ok) return NextResponse.json({ error: "Deploy hook not found or not owned by user." }, { status: 404 });

  return NextResponse.json({ ok: true });
}