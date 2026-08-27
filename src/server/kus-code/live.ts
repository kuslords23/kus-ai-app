/**
 * Kus Code — LIVE variant router.
 *
 * The Kus Code family is three distinct engines, not three labels on one
 * endpoint. This module is the single dispatcher that maps a selected model id
 * to the correct engine + per-version backend model id:
 *
 *   kus-ai/kus-code-1  → Kus Code 1.0  — lightweight 5-phase multi-agent
 *                        (src/services/agentEngine.ts runFullPipeline) for rapid
 *                        snippets / quick code generation. Backend: kus-code/ai-1.
 *   kus-ai/kus-code-2  → Kus Code 2.0  — the 6-layer expert runtime with
 *                        structured AgentResult contracts, execution verification
 *                        and Git time-travel (src/lib/kus-code-2.0).
 *                        Backend: kus-code/ai-2.
 *   kus-ai/kus-code-3  → Kus Code 3.0  — high-context general LLM routed to the
 *                        dedicated Kus Code endpoint ("Kus AI 3" in the Royal
 *                        environment; same backend id kus-code/ai-3).
 *                        Backend: kus-code/ai-3.
 *   kus-ai/royal       → Kus AI (Royal) — KEEP the app protocol: the brain stays
 *                        on the hub (POST {HUB}/api/ai/rag). We do NOT invent a
 *                        new bot here.
 */
import { resolveBackendModel } from "@/lib/models/catalog";
import { runFullPipeline, type PipelineRequest } from "@/services/agentEngine";
import { routeToKusAgent, type AgentRequest } from "@/server/ai/agentRouter";

export type KusCodeVariant = "royal" | "kus-code-1" | "kus-code-2" | "kus-code-3" | "other";

export interface KusCodeContext {
  intent: string;
  repository: string;
  branch: string;
  contextFiles: Array<{ path: string; content: string }>;
  providerToken?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface KusCodeDispatchResult {
  /** Which engine served the request. */
  engine: KusCodeVariant;
  /** Backend model id actually sent upstream. */
  backendModel: string;
  content: string;
  /** Structured pipeline output (Kus Code 1.0) when applicable. */
  pipeline?: Awaited<ReturnType<typeof runFullPipeline>>;
  error?: string;
}

/** Maps a Jyinx model id to its Kus Code engine variant. */
export function resolveKusCodeVariant(modelId: string): KusCodeVariant {
  if (modelId === "kus-ai/royal") return "royal";
  if (modelId === "kus-ai/kus-code-1") return "kus-code-1";
  if (modelId === "kus-ai/kus-code-2") return "kus-code-2";
  if (modelId === "kus-ai/kus-code-3") return "kus-code-3";
  return "other";
}

/** Per-version backend model id (authoritative mapping, delegated to catalog). */
export function backendModelFor(modelId: string): string {
  return resolveBackendModel(modelId);
}

/** True when the id is one of the Kus Code engines (not Royal, not other). */
export function isKusCodeEngine(modelId: string): boolean {
  const variant = resolveKusCodeVariant(modelId);
  return variant === "kus-code-1" || variant === "kus-code-2" || variant === "kus-code-3";
}

/**
 * Resolve a Kus Code variant to an actual routable model for the autonomous
 * agent pipeline (which talks to OpenRouter). Each variant keeps its own
 * personality/tier while remaining a real OpenRouter-capable model:
 *   kus-code-1 (lightweight) → openrouter/free
 *   kus-code-2 (expert)      → openai/gpt-4.1-mini
 *   kus-code-3 (flagship)    → openai/gpt-4.1 (Kus AI 3 / high-context general)
 * Non-KusCode models pass through unchanged.
 */
export function resolveRoutableAgentModel(modelId: string): string {
  switch (resolveKusCodeVariant(modelId)) {
    case "kus-code-1":
      return "openrouter/free";
    case "kus-code-2":
      return "openai/gpt-4.1-mini";
    case "kus-code-3":
      return "openai/gpt-4.1";
    default:
      return modelId;
  }
}

/**
 * Live dispatch: route a request to the correct Kus Code engine.
 *
 *  - Kus Code 1.0 → runFullPipeline (lightweight 5-phase; real structured
 *    output incl. time-travel snapshots).
 *  - Kus Code 2.0 / 3.0 → the dedicated Kus Code endpoint via agentRouter with
 *    the per-version backend id (kus-code/ai-2 / kus-code/ai-3).
 *  - Royal → returns engine:"royal" with no content; callers must keep routing
 *    to the hub RAG brain (app protocol).
 */
export async function routeKusCode(
  modelId: string,
  ctx: KusCodeContext
): Promise<KusCodeDispatchResult> {
  const variant = resolveKusCodeVariant(modelId);
  const backendModel = backendModelFor(modelId);

  switch (variant) {
    case "kus-code-1": {
      try {
        const pipeline = await runFullPipeline({
          intent: ctx.intent,
          repository: ctx.repository,
          branch: ctx.branch,
          contextFiles: ctx.contextFiles,
          providerToken: ctx.providerToken,
        } satisfies PipelineRequest);
        return {
          engine: "kus-code-1",
          backendModel,
          content: pipeline.summary,
          pipeline,
          error: pipeline.error,
        };
      } catch (cause) {
        return {
          engine: "kus-code-1",
          backendModel,
          content: "",
          error: cause instanceof Error ? cause.message : "Kus Code 1.0 pipeline failed.",
        };
      }
    }

    case "kus-code-2":
    case "kus-code-3": {
      const agent: AgentRequest = {
        role: "general",
        prompt: ctx.intent,
        files: ctx.contextFiles,
        history: ctx.history,
        model: modelId,
      };
      const result = await routeToKusAgent(agent);
      return {
        engine: variant,
        backendModel,
        content: result.content,
        error: result.error,
      };
    }

    case "royal":
      // App protocol: Royal must route through the hub RAG brain. Return a
      // marker so the caller does NOT fabricate a bot response here.
      return { engine: "royal", backendModel, content: "" };

    case "other":
      return {
        engine: "other",
        backendModel: modelId,
        content: "",
        error: `"${modelId}" is not a Kus Code engine model.`,
      };
  }
}
