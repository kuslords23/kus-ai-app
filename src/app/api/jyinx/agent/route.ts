import { NextRequest } from "next/server";
import { runAgentFlow, type AgentExecutionEvent } from "@/services/agentPipeline";
import { resolveApiKey } from "@/lib/kusai/apiKeysServer";
import { loadRepositoryContextFiles } from "@/server/github/context";

export const runtime = "nodejs";

const encoder = new TextEncoder();

type AgentBody = {
  prompt?: unknown;
  model?: unknown;
  endpoint?: unknown;
  repository?: unknown;
  branch?: unknown;
  repositoryFiles?: unknown;
};

// Stop words that would produce useless repository searches when deriving the
// request-time query keyword set for the server-side context loader.
const QUERY_STOPWORDS = new Set([
  "the", "a", "an", "to", "of", "in", "on", "at", "for", "and", "or", "is", "are",
  "i", "you", "me", "it", "this", "that", "these", "those", "my", "your", "we", "our",
  "please", "make", "add", "change", "edit", "update", "fix", "create", "with", "file", "code",
  "circle", "circles", "top", "bottom", "left", "right", "middle", "center", "small", "large", "button", "three",
]);

function promptKeywords(prompt: string): string | null {
  const words = prompt.toLowerCase().replace(/[^a-z0-9\s/_-]/g, " ").split(/\s+/).filter(Boolean);
  const meaningful = words.filter((word) => word.length >= 3 && !QUERY_STOPWORDS.has(word));
  return meaningful.slice(0, 4).join(" ") || null;
}

/**
 * Streams the autonomous multi-agent pipeline as Server-Sent Events.
 * Each `AgentExecutionEvent` is emitted as one `data:` line, terminated by a
 * `done` line consumed by the client to close the stream.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const resolved = resolveApiKey(request.headers);
  if (resolved.missing) {
    return Response.json({ error: "OpenRouter is not configured. Add OPENROUTER_API_KEY to the Vercel environment, or supply your own key in Settings." }, { status: 503 });
  }
  const apiKey = resolved.key as string;

  const token = (() => {
    const auth = request.headers.get("authorization");
    return auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
  })();
  if (!token) {
    return Response.json({ error: "Connect GitHub first." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as AgentBody | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const model = typeof body?.model === "string" && body.model ? body.model : "";
  const endpoint = typeof body?.endpoint === "string" && body.endpoint.startsWith("https://") ? body.endpoint : undefined;
  const repository = typeof body?.repository === "string" && /^[\w.-]+\/[\w.-]+$/.test(body.repository) ? body.repository : null;
  const branch = typeof body?.branch === "string" && body.branch ? body.branch : "main";
  const files =
    Array.isArray(body?.repositoryFiles)
      ? body.repositoryFiles.filter(
          (f): f is { path: string; content: string } =>
            Boolean(f) && typeof f === "object" && typeof (f as { path?: unknown }).path === "string" && typeof (f as { content?: unknown }).content === "string"
        )
      : [];

  if (!prompt) return Response.json({ error: "A prompt is required." }, { status: 400 });
  if (!model) return Response.json({ error: "A model is required." }, { status: 400 });
  if (!repository) return Response.json({ error: "A repository is required to commit to GitHub." }, { status: 400 });
  if (prompt.length > 24_000) return Response.json({ error: "Prompt is too large." }, { status: 413 });

  let cancelled = false;
  const controller = new AbortController();
  request.signal.addEventListener("abort", () => { cancelled = true; controller.abort(); });

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      let generator: ReturnType<typeof runAgentFlow> | null = null;
      const enqueueEvent = (event: AgentExecutionEvent) => {
        if (cancelled) return;
        try {
          streamController.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Client disconnect.
        }
      };

      try {
        // Recursively index the repository server-side (src/, components/,
        // app/, views/, ...) so the agent can locate the actual UI/component
        // files for the request — not just top-level config files. Client
        // preloaded files are merged in and deduped (server wins for hits).
        let mergedFiles = files;
        try {
          const scoped = await loadRepositoryContextFiles(repository, branch, token, promptKeywords(prompt));
          const seen = new Set(files.map((f) => f.path));
          mergedFiles = [
            ...scoped.filter((f) => !seen.has(f.path) && !f.path.includes("node_modules") && !f.path.includes("/dist/") && !f.path.includes("/build/")),
            ...files,
          ].slice(0, 30);
        } catch {
          // Context loading is best-effort; fall back to the passed files.
        }
        generator = runAgentFlow({
          apiKey,
          config: {
            model,
            endpoint,
            repository,
            branch,
            providerToken: token,
            request: prompt,
            repositoryFiles: mergedFiles,
          },
        });
        for await (const event of generator) {
          enqueueEvent(event);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Agent pipeline failed.";
        enqueueEvent({ type: "error", message });
      } finally {
        enqueueEvent({ type: "done", summary: "Stream ended." });
        try { streamController.close(); } catch { /* already closed */ }
      }
    },
    cancel() { cancelled = true; },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}