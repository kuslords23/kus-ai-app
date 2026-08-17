import { NextRequest, NextResponse } from "next/server";
import { getJyinxModel } from "@/lib/jyinx/model-registry";
import { lookup as semanticLookup, store as semanticStore } from "@/services/semanticCache";
import { resolveApiKey, openRouterUrl } from "@/lib/kusai/apiKeysServer";

export const runtime = "nodejs";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_PROMPT_LENGTH = 24_000;

type ChatRequest = {
  prompt?: unknown;
  model?: unknown;
  code?: unknown;
  repositoryContext?: unknown;
  file?: unknown;
  repository?: unknown;
  agent?: { modelId?: unknown; endpoint?: unknown; systemPrompt?: unknown; tag?: unknown } | null;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as ChatRequest | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const modelId = typeof body?.model === "string" ? body.model : "";
  const code = typeof body?.code === "string" ? body.code : "";
  const repositoryContext = typeof body?.repositoryContext === "string" ? body.repositoryContext.slice(0, 240_000) : "";
  const file = typeof body?.file === "string" ? body.file : "untitled.ts";
  const repository = typeof body?.repository === "string" ? body.repository : "local";
  const agent = body?.agent && typeof body.agent === "object" ? body.agent : null;
  const agentModelId = typeof agent?.modelId === "string" ? agent.modelId : modelId;
  const agentEndpoint = typeof agent?.endpoint === "string" && agent.endpoint.startsWith("https://") ? agent.endpoint : OPENROUTER_URL;
  const agentSystemPrompt = typeof agent?.systemPrompt === "string" && agent.systemPrompt.length <= 4_000 ? agent.systemPrompt : "You are Jyinx, a careful coding assistant. Return a concise implementation response. Do not claim to modify files directly; explain proposed edits and provide code where useful.";

  if (!prompt) {
    return NextResponse.json({ error: "A prompt is required." }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT_LENGTH || code.length > MAX_PROMPT_LENGTH || repositoryContext.length > 240_000) {
    return NextResponse.json({ error: "Prompt or workspace context is too large." }, { status: 413 });
  }
  if (!getJyinxModel(modelId) && !agent) {
    return NextResponse.json({ error: "The selected model is not available." }, { status: 400 });
  }

  const resolved = resolveApiKey(request.headers);
  if (resolved.missing) {
    return NextResponse.json(
      {
        error: "OpenRouter is not configured. Add OPENROUTER_API_KEY to the Vercel project environment variables, or supply your own key in Settings.",
      },
      { status: 503 }
    );
  }
  const apiKey = resolved.key as string;
  const endpoint = agentEndpoint === OPENROUTER_URL ? openRouterUrl() : agentEndpoint;
  const isKusAi = modelId.startsWith("kus-ai/");

  try {
    // Semantic cache: serve matching queries instantly at $0 cost.
    try {
      const cached = await semanticLookup(prompt);
      if (cached.hit && cached.value?.response?.length >= 4) {
        return NextResponse.json({ content: cached.value.response, cache: true, cachedModel: cached.value.model, usage: null });
      }
    } catch {
      // cache is best-effort
    }

    // Kus AI model → route through the internal RAG brain (same runner as Royal
    // "Kus AI"), giving Jyinx a first-class Kus AI choice alongside OpenRouter.
    if (isKusAi) {
      const brainPrompt = `Repository: ${repository}\nFile: ${file}\n\nActive file:\n\`\`\`\n${code}\n\`\`\`\n\nLoaded repository files:\n${repositoryContext || "No repository files were loaded."}\n\nRequest: ${prompt}`;
      const brainRes = await fetch(`${request.nextUrl.origin}/api/ai/rag`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(request.headers.get("authorization")
            ? { Authorization: request.headers.get("authorization") as string }
            : {}),
          ...(request.headers.get("x-custom-api-key")
            ? { "x-custom-api-key": request.headers.get("x-custom-api-key") as string }
            : {}),
        },
        body: JSON.stringify({
          query: brainPrompt,
          stream: false,
        }),
        cache: "no-store",
      });
      const brainData = (await brainRes.json().catch(() => null)) as {
        ok?: boolean;
        answer?: string;
        error?: string;
      } | null;
      const content = brainData?.answer?.trim();
      if (!brainData?.ok || !content) {
        return NextResponse.json(
          { error: brainData?.error || "Kus AI could not complete the request." },
          { status: brainRes.ok ? 502 : brainRes.status }
        );
      }
      void semanticStore({ query: prompt, system: agentSystemPrompt, response: content, model: "kus-ai/royal" });
      return NextResponse.json({ content, usage: null });
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": request.nextUrl.origin,
        "X-Title": "Kus AI Jyinx",
      },
      body: JSON.stringify({
        model: agentModelId,
        messages: [
          {
            role: "system",
            content:
              agentSystemPrompt,
          },
          {
            role: "user",
            content: `Repository: ${repository}\nFile: ${file}\n\nActive file:\n\`\`\`\n${code}\n\`\`\`\n\nLoaded repository files:\n${repositoryContext || "No repository files were loaded."}\n\nRequest: ${prompt}`,
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

    // Store the successful pair into the semantic cache + distillation log.
    void semanticStore({ query: prompt, system: agentSystemPrompt, response: content, model: agentModelId });

    return NextResponse.json({ content, usage: data?.usage ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Model request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
