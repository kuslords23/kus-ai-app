import { NextRequest, NextResponse } from "next/server";
import { generate } from "@/services/modelGateway";
import { decodeTextFromBase64 } from "@/utils/fileHandler";
import { resolveApiKey } from "@/lib/kusai/apiKeysServer";

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
  /** Image data-URLs (e.g. data:image/png;base64,...) for vision. */
  images?: unknown;
  /** Attached docs/code as { name, data (base64) } to decode into context. */
  attachments?: unknown;
};

/**
 * Isolated Gemini endpoint for the Kus-AI-Royal interface only.
 * Routed through `modelGateway.generate` so the Google Gemini model is
 * bound exclusively to this Royal layer. Jyinx IDE and the background
 * builder never call this route, and they are not touched.
 *
 * Accepts image data-URLs (multimodal message parts) and document
 * attachments (decoded to text) so Royal can see the actual file bytes.
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
  const history = Array.isArray(body?.history) ? body.history as unknown[] : [];
  const images = Array.isArray(body?.images)
    ? (body.images as unknown[]).filter((i): i is string => typeof i === "string")
    : [];
  // Resolve server-side attachment references into inline data URLs so image
  // bytes reach the Gemini provider even when the client passed only a URL.
  const resolvedImages = [];
  for (const img of images) {
    const reg = img.match(/\/api\/kusai\/files\/([a-f0-9]{48})$/);
    if (reg) {
      try {
        const fileRes = await fetch(`${request.nextUrl.origin}/api/kusai/files/${reg[1]}`);
        if (fileRes.ok) {
          const buf = await fileRes.arrayBuffer();
          const type =
            fileRes.headers.get("content-type") || "image/png";
          const base64 = Buffer.from(buf).toString("base64");
          resolvedImages.push(`data:${type};base64,${base64}`);
          continue;
        }
      } catch {
        // fall through to the original URL
      }
    }
    resolvedImages.push(img);
  }
  const attachmentList = Array.isArray(body?.attachments)
    ? (body.attachments as unknown[])
    : [];

  if (!prompt) {
    return NextResponse.json({ error: "A prompt is required." }, { status: 400 });
  }
  if (prompt.length > 30_000) {
    return NextResponse.json({ error: "Prompt is too large." }, { status: 413 });
  }

  const resolved = resolveApiKey(request.headers);
  if (resolved.missing) {
    return NextResponse.json(
      {
        error:
          "Gemini provider is not configured. Add OPENROUTER_API_KEY to the Vercel project environment variables, or supply your own key in Settings.",
      },
      { status: 503 }
    );
  }
  const apiKey = resolved.key as string;

  // Compose conversation from prior history (bounded) for context continuity.
  const prior = (history.slice(-8) as Array<{ role?: string; content?: string }>)
    .filter((h) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
    .map((h) => ({ role: h.role as "user" | "assistant", content: h.content as string }));

  // Decode attached text/code docs into prompt context.
  const attachments = attachmentList
    .map((att) => {
      if (!att || typeof att !== "object") return null;
      const name = (att as { name?: unknown }).name;
      const data = (att as { data?: unknown }).data;
      if (typeof data !== "string" || !data) return null;
      return {
        name: typeof name === "string" ? name : "attachment",
        text: decodeTextFromBase64(data),
      };
    })
    .filter((a): a is { name: string; text: string } => !!a && a.text.trim().length > 0);

  try {
    const response = await generate(apiKey, {
      modality: "conversation",
      model,
      prompt,
      system,
      temperature,
      maxTokens,
      history: prior,
      images: resolvedImages,
      attachments,
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