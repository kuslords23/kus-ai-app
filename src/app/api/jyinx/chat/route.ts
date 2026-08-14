import { NextRequest, NextResponse } from "next/server";
import { getJyinxModel } from "@/lib/jyinx/model-registry";

export const runtime = "nodejs";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_PROMPT_LENGTH = 24_000;

type ChatRequest = {
  prompt?: unknown;
  model?: unknown;
  code?: unknown;
  file?: unknown;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as ChatRequest | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const modelId = typeof body?.model === "string" ? body.model : "";
  const code = typeof body?.code === "string" ? body.code : "";
  const file = typeof body?.file === "string" ? body.file : "untitled.ts";

  if (!prompt) {
    return NextResponse.json({ error: "A prompt is required." }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT_LENGTH || code.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json({ error: "Prompt or workspace context is too large." }, { status: 413 });
  }
  if (!getJyinxModel(modelId)) {
    return NextResponse.json({ error: "The selected model is not available." }, { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "OpenRouter is not configured. Add OPENROUTER_API_KEY to the Vercel project environment variables.",
      },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": request.nextUrl.origin,
        "X-Title": "Kus AI Jyinx",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          {
            role: "system",
            content:
              "You are Jyinx, a careful coding assistant. Return a concise implementation response. Do not claim to modify files directly; explain proposed edits and provide code where useful.",
          },
          {
            role: "user",
            content: `File: ${file}\n\nWorkspace:\n\`\`\`\n${code}\n\`\`\`\n\nRequest: ${prompt}`,
          },
        ],
        stream: false,
      }),
      cache: "no-store",
    });

    const data = (await response.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    } | null;

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "OpenRouter could not complete the request." },
        { status: response.status }
      );
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "The selected model returned no response." }, { status: 502 });
    }

    return NextResponse.json({ content, usage: data?.usage ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Model request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
