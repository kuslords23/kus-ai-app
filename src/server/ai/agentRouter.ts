"use strict";

/**
 * Kus AI Sub-Agent Router.
 *
 * This module scopes sub-agent choices exclusively to Kus AI, preserving its
 * custom configuration, specialized prompt behaviors, and orchestration
 * designed for the Kus-Lords production workflow.
 *
 * Unlike the general `ai/router.ts` (which handles Gemini, OpenRouter, etc.
 * for casual chat), this router only dispatches to Kus AI endpoints with
 * agent-specific routing (reviewer, coder, tester, or general).
 */

export type KusAgentRole =
  | "general"
  | "coder"
  | "reviewer"
  | "tester"
  | "planner"
  | "builder";

export interface AgentRequest {
  role: KusAgentRole;
  prompt: string;
  context?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  userId?: string;
  /** Optional file paths / repo context to inject. */
  files?: Array<{ path: string; content: string }>;
}

export interface AgentResult {
  content: string;
  role: KusAgentRole;
  model: string;
  error?: string;
}

// ── Role-specific system prompts ────────────────────────

const ROLE_SYSTEMS: Record<KusAgentRole, string> = {
  general:
    "You are Kus AI, a general-purpose agent in the Kus-Lords ecosystem. Answer concisely with technical precision. " +
    "Prefer TypeScript/React if code is requested. Reference workspace context when available.",
  coder:
    "You are Kus AI (Coder Agent). You write production-grade TypeScript/React code. " +
    "Follow clean architecture patterns. Write compilable, well-typed code with inline comments where appropriate. " +
    "Only output the code block and a brief explanation.",
  reviewer:
    "You are Kus AI (Reviewer Agent). Your job is to inspect code for bugs, missing imports, " +
    "edge cases, and logical flaws. Output a structured review: bullet list of issues found, " +
    "severity (critical/warning/info), and suggested fixes. Do NOT rewrite the code unless asked.",
  tester:
    "You are Kus AI (Tester Agent). You write and evaluate test scenarios for the given code. " +
    "List test cases with expected behavior. Note missing coverage areas. Output test scripts when applicable.",
  planner:
    "You are Kus AI (Planner Agent). Break down the task into sequential steps with estimated effort. " +
    "Identify dependencies, risks, and architecture decisions. Output a structured plan.",
  builder:
    "You are Kus AI (Builder Agent). Build complete, runnable applications from specifications. " +
    "Scaffold the project structure, write all necessary files, and provide build/run instructions. " +
    "Output a full workspace snapshot.",
};

const KUS_AI_ENDPOINT = process.env.KUS_AI_ENDPOINT ?? "https://api.kus-ai.app/v1/chat/completions";
const KUS_AI_KEY = process.env.KUS_AI_API_KEY ?? process.env.KUSAI_API_KEY ?? "";

/**
 * Routes a request to the Kus AI sub-agent system.
 * Falls back gracefully if the endpoint is not configured.
 */
export async function routeToKusAgent(req: AgentRequest): Promise<AgentResult> {
  if (!KUS_AI_KEY) {
    return {
      content: "",
      role: req.role,
      model: "kus-ai",
      error: "Kus AI is not configured. Add KUS_AI_API_KEY in environment variables.",
    };
  }

  const systemMessage = ROLE_SYSTEMS[req.role] ?? ROLE_SYSTEMS.general;

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemMessage },
    ...(req.history ?? []),
  ];

  // Inject file context as a system note.
  if (req.files && req.files.length > 0) {
    const ctx = req.files
      .map((f) => `FILE: ${f.path}\n\`\`\`\n${f.content.slice(0, 3000)}\n\`\`\``)
      .join("\n\n");
    messages.push({ role: "system", content: `Workspace files for context:\n${ctx}` });
  }

  if (req.context) {
    messages.push({ role: "system", content: `Additional context: ${req.context}` });
  }

  messages.push({ role: "user", content: req.prompt });

  try {
    const response = await fetch(KUS_AI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KUS_AI_KEY}`,
      },
      body: JSON.stringify({
        model: `kus-ai/${req.role}`,
        messages,
        temperature: 0.3,
        max_tokens: 4096,
      }),
      cache: "no-store",
    });

    const data = (await response.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    } | null;

    if (!response.ok) {
      return { content: "", role: req.role, model: "kus-ai", error: data?.error?.message ?? `Kus AI returned ${response.status}` };
    }

    return {
      content: data?.choices?.[0]?.message?.content ?? "",
      role: req.role,
      model: "kus-ai",
    };
  } catch (cause) {
    return { content: "", role: req.role, model: "kus-ai", error: cause instanceof Error ? cause.message : "Kus AI request failed." };
  }
}

/**
 * Multi-agent orchestration pipeline: coder → reviewer → tester.
 * Each step receives the output of the previous step as context.
 */
export async function runKusMultiAgentPipeline(
  prompt: string,
  files?: Array<{ path: string; content: string }>,
  userId?: string
): Promise<{ coder: AgentResult; reviewer: AgentResult; tester: AgentResult }> {
  const coder = await routeToKusAgent({
    role: "coder",
    prompt: `Implement the following:\n${prompt}`,
    files,
    userId,
  });

  const reviewer = await routeToKusAgent({
    role: "reviewer",
    prompt: `Review this code:\n\`\`\`\n${coder.content.slice(0, 6000)}\n\`\`\``,
    context: coder.error ? `Coder agent error: ${coder.error}` : undefined,
    userId,
  });

  const tester = await routeToKusAgent({
    role: "tester",
    prompt: `Write tests for this implementation:\n\`\`\`\n${coder.content.slice(0, 4000)}\n\`\`\`\n\nReview feedback:\n${reviewer.content.slice(0, 2000)}`,
    userId,
  });

  return { coder, reviewer, tester };
}

/**
 * Checks if Kus AI is configured and reachable.
 */
export async function kusAiHealthCheck(): Promise<{ ok: boolean; error?: string }> {
  if (!KUS_AI_KEY) return { ok: false, error: "KUS_AI_API_KEY not set." };
  try {
    const res = await fetch(KUS_AI_ENDPOINT.replace("/chat/completions", "/health"), {
      headers: { Authorization: `Bearer ${KUS_AI_KEY}` },
      cache: "no-store",
    });
    return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Unreachable." };
  }
}

/** Re-export the general model router for convenience. */
export { routeAi } from "@/server/ai/router";