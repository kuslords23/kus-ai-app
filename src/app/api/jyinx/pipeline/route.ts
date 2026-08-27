import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scoutAgent } from "@/lib/jyinx/orchestrator/agents/ScoutAgent";
import { stackingBoxEngine, validateBlock } from "@/lib/jyinx/pipeline/StackingBoxEngine";
import { executeFreeToAuto } from "@/lib/jyinx/pipeline/FreeToAutoPipeline";
import { redTeamAgent } from "@/lib/jyinx/security/RedTeamAgent";
import { gatewayExecute } from "@/server/ai/gateway";
import { kusOrchestrator } from "@/lib/jyinx/orchestrator/KusOrchestrator";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (action === "scout") {
    const report = await scoutAgent.scout({
      query: String(body.query ?? ""),
      repository: body.repository,
      providerToken: body.providerToken,
      sources: body.sources,
      maxResults: body.maxResults,
    });
    return NextResponse.json({ report, promptContext: scoutAgent.formatForPrompt(report) });
  }

  if (action === "validate_block") {
    const result = validateBlock(body.block);
    return NextResponse.json(result);
  }

  if (action === "push_block") {
    const outcome = await stackingBoxEngine.pushBlock(body.block, {
      intent: String(body.intent ?? ""),
      files: body.files,
    });
    return NextResponse.json(outcome);
  }

  if (action === "heal_block") {
    const route = await executeFreeToAuto(
      {
        intent: String(body.intent ?? ""),
        block: body.block,
        validationFailed: true,
        errorLog: String(body.errorLog ?? ""),
        userId: user?.id,
        forcePrecision: true,
      },
      async ({ model, system, prompt, forcePaid }) => {
        const r = await gatewayExecute({
          provider: "openrouter",
          model,
          system,
          prompt,
          userId: user?.id,
          forcePaid,
        });
        return { content: r.content, model: r.model, error: r.error };
      }
    );

    if (route.content && body.block?.id) {
      const applied = await stackingBoxEngine.applyHealPatch(body.block.id, route.content, {
        intent: String(body.intent ?? ""),
        files: body.files,
      });
      return NextResponse.json({ route, applied });
    }
    return NextResponse.json({ route });
  }

  if (action === "draft") {
    const route = await executeFreeToAuto(
      {
        intent: String(body.intent ?? ""),
        block: body.block,
        userId: user?.id,
        forcePrecision: Boolean(body.forcePrecision),
      },
      async ({ model, system, prompt, forcePaid }) => {
        const r = await gatewayExecute({
          provider: "openrouter",
          model,
          system,
          prompt,
          userId: user?.id,
          forcePaid,
        });
        return { content: r.content, model: r.model, error: r.error };
      }
    );
    return NextResponse.json(route);
  }

  if (action === "red_team") {
    const result = redTeamAgent.auditFiles(body.files ?? {}, String(body.target ?? "workspace"));
    return NextResponse.json({
      result,
      patchBrief: redTeamAgent.formatPatchBrief(result),
    });
  }

  if (action === "orchestrate") {
    kusOrchestrator.setUserIntent(String(body.intent ?? ""), String(body.repository ?? ""));
    const tasks = await kusOrchestrator.decompose(String(body.intent ?? ""));
    // Fire-and-forget sequential plan (UI subscribes via client singleton in browser contexts)
    void kusOrchestrator.executePlan(tasks);
    return NextResponse.json({ tasks, state: kusOrchestrator.getState() });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
