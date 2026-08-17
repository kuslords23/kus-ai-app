import { NextRequest, NextResponse } from "next/server";
import { generate } from "@/services/modelGateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_GEMINI_MODEL = "google/gemini-2.5-pro";

type RoyalGeminiRequest = {
  prompt?: unknown;
  system?: unknown;
  model?: unknown;
  temperature?: unknown;
  maxTokens?: unknown;
  history?: unknown;
};

/**
 * Isolated Gemini endpoint for the Kus-AI-Royal interface only.
 * Routed through `modelGateway.generate` so the Google Gemini model is
 * bound exclusively to this Royal layer. Jyinx IDE and the background
 * builder never call this route, and they are not touched.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as RoyalGeminiRequest | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const system = typeof body?.system === "string" ? body.system : undefined;
  const model = typeof body?.model === "string" ? body.model : DEFAULT_GEMINI_MODEL;
  const temperature =
    typeof body?.temperature === "number" ? body.temperature : undefined;
  const maxTokens =
    typeof body?.maxTokens === "number" ? body.maxTokens : undefined;
  const history = Array.isArray(body?.history) ? (body.history as unknown[]) : [];

  if (!prompt) {
    return NextResponse.json({ error: "A prompt is required." }, { status: 400 });
  }
  if (prompt.length > 30_000) {
    return NextResponse.json({ error: "Prompt is too large." }, { status: 413 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Gemini provider is not configured. Add OPENROUTER_API_KEY to the Vercel project environment variables.",
      },
      { status: 503 }
    );
  }

  // Compose conversation from prior history (bounded) for context continuity.
  const prior = (history.slice(-8) as Array<{ role?: string; content?: string }>)
    .filter((h) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
    .map((h) => ({ role: h.role as "user" | "assistant", content: h.content as string }));

  try {
    const response = await generate(apiKey, {
      modality: "conversation",
      model,
      prompt,
      system,
      temperature,
      maxTokens,
      history: prior,
    });

    if (response.source === "error" || !response.content) {
      return NextResponse.json(
        { error: response.error || "Gemini could not complete the request." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      content: response.content,
      model: response.model,
      usage: response.usage,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gemini request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}