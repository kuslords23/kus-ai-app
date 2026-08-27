import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/demo/setup
 * GET  /api/demo/session
 *
 * Sandbox demo account provisioning for store reviewers.
 *
 * Enabled only when NEXT_PUBLIC_DEMO_MODE="true" (never in production).
 * Provisions a demo Supabase auth user + pre-loaded workspace template
 * files, then returns credentials that can be auto-signed-in client-side.
 */
export async function GET() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    return NextResponse.json({ error: "Demo mode is disabled" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, demo: true });
}

export async function POST(_req: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    return NextResponse.json({ error: "Demo mode is disabled" }, { status: 404 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const demoEmail = `demo-${Math.random().toString(36).slice(2, 8)}@kus-ai.app`;
  const demoPassword = `Demo-${Math.random().toString(36).slice(2, 12)}-!`;

  try {
    // 1. Create the demo user
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: demoEmail,
      password: demoPassword,
      email_confirm: true,
      user_metadata: { role: "demo_reviewer", name: "Demo Reviewer" },
    });

    if (authErr || !authData.user) {
      console.error("[demo] Failed creating demo user:", authErr);
      return NextResponse.json({ error: "Failed to provision demo account" }, { status: 500 });
    }

    const userId = authData.user.id;

    // 2. Preload a starter workspace template into the code vault
    const templates: Record<string, string> = {
      "next-app/README.md": "# Welcome to Jyinx Demo Workspace\n\nThis sandbox workspace is preloaded for store review.\n\n- Create projects, chat with Jyinx, and commit to GitHub.\n- Explore connectors, billing, and the Nexus chat bridge.\n",
      "next-app/src/App.tsx": `export function App() {\n  return (\n    <main>\n      <h1>Hello from Jyinx</h1>\n      <p>Preloaded demo workspace template.</p>\n    </main>\n  );\n}\n`,
      "next-app/package.json": JSON.stringify(
        {
          name: "jyinx-demo-workspace",
          version: "1.0.0",
          private: true,
          scripts: { dev: "vite", build: "tsc && vite build", typecheck: "tsc --noEmit" },
          dependencies: {},
          devDependencies: { typescript: "^5.6.0", vite: "^5.4.0" },
        },
        null,
        2
      ),
      "README.md": "# Kus AI Reviewer Sandbox\n\nEverything is already wired up - no onboarding required.\n\n## What to test\n- Royal chat (Hub brain, memory)\n- Jyinx IDE (file explorer, commit engine, sandbox)\n- Code vault (auto-categorized snippets)\n- Nexus chat bridge (real-time community)\n- Billing (Stripe / Hubtel flows)",
    };

    const uploaded: string[] = [];
    for (const [path, content] of Object.entries(templates)) {
      const { error: upErr } = await admin.storage
        .from("code-vault")
        .upload(`${userId}/${path}`, new Blob([content], { type: "text/plain" }), {
          upsert: true,
          contentType: "text/plain",
        });
      if (!upErr) uploaded.push(path);
    }

    // 3. Insert a starter chat message
    const { error: msgErr } = await admin.from("jyinx_chat_messages").insert({
      user_id: userId,
      role: "assistant",
      content:
        "Welcome to the Kus AI demo workspace, reviewer! This sandbox is pre-loaded with a starter Jyinx template, code vault categories, and the Nexus chat bridge. Ask me to build something, or open Jyinx to explore the IDE.",
    });
    if (msgErr && msgErr.message) {
      console.warn("[demo] Starter message insert failed (table may not exist):", msgErr.message);
    }

    return NextResponse.json({
      ok: true,
      email: demoEmail,
      password: demoPassword,
      userId,
      preloadedFiles: uploaded,
    });
  } catch (err) {
    console.error("[demo] Provisioning error:", err);
    return NextResponse.json({ error: "Demo provisioning failed" }, { status: 500 });
  }
}