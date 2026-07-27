import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { KINGDOM_DEPARTMENTS } from "@/lib/kingdom/domains";
import { generateSubAgentDefinitions } from "@/lib/training-plane/swarm";

/**
 * Phone-friendly seed for ~10k kingdom sub-agents.
 * Open in Safari/Chrome after setting SUPABASE_SERVICE_ROLE_KEY + CRON_SECRET on Vercel:
 *
 *   https://kus-ai-app.vercel.app/api/admin/seed-sub-agents?secret=YOUR_CRON_SECRET
 *
 * Auto-continues batch-by-batch until done (Vercel time limits).
 */
const BATCH = 250;

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function checkSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const q = request.nextUrl.searchParams.get("secret");
  return q === secret;
}

export async function GET(request: NextRequest) {
  if (!checkSecret(request)) return unauthorized();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL on Vercel",
      },
      { status: 503 }
    );
  }

  const offset = Math.max(
    0,
    Number(request.nextUrl.searchParams.get("offset") ?? "0") || 0
  );
  const html = request.nextUrl.searchParams.get("format") !== "json";

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Departments every time (cheap upsert)
  for (const dept of KINGDOM_DEPARTMENTS) {
    const { error } = await supabase.from("kingdom_departments").upsert(
      {
        id: dept.id,
        name: dept.name,
        description: dept.description,
        icon: dept.icon,
        priority: dept.priority,
      },
      { onConflict: "id" }
    );
    if (error) {
      return NextResponse.json(
        { ok: false, error: `department ${dept.id}: ${error.message}` },
        { status: 500 }
      );
    }
  }

  const agents = generateSubAgentDefinitions();
  const total = agents.length;
  const slice = agents.slice(offset, offset + BATCH);

  if (slice.length === 0) {
    const body = {
      ok: true,
      done: true,
      departments: KINGDOM_DEPARTMENTS.length,
      total,
      seeded: total,
      message: "All sub-agents seeded.",
    };
    if (!html) return NextResponse.json(body);
    return new NextResponse(doneHtml(body), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const rows = slice.map((a) => ({
    slug: a.slug,
    department_id: a.department_id,
    topic: a.topic,
    variant: a.variant,
    display_name: a.display_name,
    search_seeds: a.search_seeds,
    source_hints: a.source_hints,
    status: "active" as const,
    visibility: "system" as const,
  }));

  const { error } = await supabase.from("kingdom_sub_agents").upsert(rows, {
    onConflict: "slug",
    ignoreDuplicates: false,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, offset },
      { status: 500 }
    );
  }

  const nextOffset = offset + slice.length;
  const done = nextOffset >= total;
  const secret = request.nextUrl.searchParams.get("secret") ?? "";
  const continuePath = `/api/admin/seed-sub-agents?secret=${encodeURIComponent(secret)}&offset=${nextOffset}`;

  const body = {
    ok: true,
    done,
    departments: KINGDOM_DEPARTMENTS.length,
    total,
    seeded: nextOffset,
    nextOffset: done ? null : nextOffset,
    continueUrl: done ? null : continuePath,
  };

  if (!html) return NextResponse.json(body);

  return new NextResponse(progressHtml(body, continuePath), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function progressHtml(
  body: {
    seeded: number;
    total: number;
    departments: number;
    done: boolean;
  },
  continuePath: string
) {
  const pct = Math.min(100, Math.round((body.seeded / body.total) * 100));
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta http-equiv="refresh" content="1;url=${continuePath}"/>
<title>Seeding Kingdom Swarm</title>
<style>
  body{font-family:system-ui;background:#0b1220;color:#e8eefc;padding:24px;line-height:1.5}
  .bar{height:12px;background:#1e293b;border-radius:999px;overflow:hidden;margin:16px 0}
  .fill{height:100%;width:${pct}%;background:#38bdf8}
  a{color:#7dd3fc}
</style>
</head><body>
  <h1>Seeding Kingdom Swarm</h1>
  <p>${body.departments} departments · <strong>${body.seeded}</strong> / ${body.total} agents (${pct}%)</p>
  <div class="bar"><div class="fill"></div></div>
  <p>Keep this tab open — it continues automatically…</p>
  <p><a href="${continuePath}">Continue now</a></p>
</body></html>`;
}

function doneHtml(body: {
  seeded: number;
  total: number;
  departments: number;
  message: string;
}) {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Seed complete</title>
<style>
  body{font-family:system-ui;background:#0b1220;color:#e8eefc;padding:24px;line-height:1.5}
  .ok{color:#4ade80;font-size:1.25rem}
</style>
</head><body>
  <p class="ok">✓ ${body.message}</p>
  <p>${body.departments} departments · ${body.seeded} / ${body.total} sub-agents</p>
  <p>Next: set Hub harvest env vars on Vercel, then use the app normally.</p>
</body></html>`;
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
