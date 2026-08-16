import { commitFiles } from "@/services/githubCommit";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type AgentExecutionEvent =
  | { type: "narration"; message: string; detail?: string }
  | { type: "log"; message: string }
  | { type: "reasoning"; message: string }
  | { type: "rejected"; file: string; reason: string }
  | { type: "whitespace"; message: string }
  | { type: "error"; message: string }
  | { type: "done"; summary: string };

export type AgentEdit = { path: string; content: string };

export type AgentPipelineConfig = {
  model: string;
  endpoint?: string;
  repository: string;
  branch: string;
  providerToken: string;
  request: string;
  repositoryFiles?: Array<{ path: string; content: string }>;
  maxRetries?: number;
};

type AgentRun = {
  config: AgentPipelineConfig;
  apiKey: string;
};

const DEFAULT_MAX_RETRIES = 2;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Calls an OpenRouter-compatible chat completion (non-streaming). */
async function callLLM(opts: {
  apiKey: string;
  endpoint: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<{ content: string }> {
  const res = await fetch(opts.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "X-Title": "Kus AI Jyinx Agent",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userPrompt },
      ],
      stream: false,
    }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }
    | null;
  if (!res.ok || !data) {
    throw new Error(data?.error?.message || `Model request failed (${res.status}).`);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("The model returned no response.");
  return { content };
}

/** Retries a model call once on transient 5xx/timeout errors. */
async function callLLMOnce(opts: {
  apiKey: string;
  endpoint: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<{ content: string }> {
  try {
    return await callLLM(opts);
  } catch (error) {
    if (error instanceof Error && /5\d\d|timeout/i.test(error.message)) {
      await delay(400);
      return await callLLM(opts);
    }
    throw error;
  }
}

/**
 * Parses a coder reply containing prose narration plus fenced code blocks into
 * `(edits, narration)`. Each fenced block is treated as the full content of its
 * target file, using the nearest `PATH:`/`file:` header line as the path.
 */
export function parseFileEdits(reply: string): { edits: AgentEdit[]; narration: string } {
  const fence = /```[^\n]*\n([\s\S]*?)```/g;
  const narrationParts: string[] = [];
  const edits: AgentEdit[] = [];
  const pathHeader = /(?:path|file)\s*["':=]\s*["']?([A-Za-z0-9_./-]+(?:\.\w+)?)/i;
  let pendingPath: string | null = null;
  let cursor = 0;
  let match;

  while ((match = fence.exec(reply)) !== null) {
    const prose = reply.slice(cursor, match.index);
    narrationParts.push(prose);
    const header = prose.match(pathHeader);
    if (header?.[1]) pendingPath = header[1];
    edits.push({ path: pendingPath ?? "untitled.txt", content: match[1].replace(/\n+$/, "") });
    cursor = match.index + match[0].length;
  }
  narrationParts.push(reply.slice(cursor));
  return { edits, narration: narrationParts.join(" ").replace(/\s+/g, " ").trim() };
}

/**
 * Lightweight structural verification usable in browser/edge where no local
 * checkout exists to run tsc. Detects empty edits and unbalanced delimiters on
 * TS/TSX/JS/JSX files.
 */
export async function verifyEdits(files: AgentEdit[]): Promise<{ pass: boolean; errors: string[] }> {
  const errors: string[] = [];
  for (const file of files) {
    if (!file.content.trim()) {
      errors.push(`${file.path}: file content is empty.`);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/i.test(file.path)) continue;
    const count = (char: string): number => (file.content.match(new RegExp(`\\${char}`, "g")) ?? []).length;
    if (count("(") !== count(")")) errors.push(`${file.path}: unbalanced parentheses.`);
    if (count("[") !== count("]")) errors.push(`${file.path}: unbalanced brackets.`);
    if (count("{") !== count("}")) errors.push(`${file.path}: unbalanced braces.`);
  }
  return { pass: errors.length === 0, errors };
}

const DEFAULT_REVIEW_MODEL = "openai/gpt-4.1-mini";

/**
 * Runs the full multi-agent execution flow: coder edits, structural + multi-agent
 * review/fact-check, self-correction retries, then an atomic commit via the
 * GitHub engine. Emits narration/verification events as an async generator.
 */
export async function* runAgentFlow(cfg: AgentRun): AsyncGenerator<AgentExecutionEvent, void, unknown> {
  const { config, apiKey } = cfg;
  const model = config.model;
  const endpoint = config.endpoint?.startsWith("https://") ? config.endpoint : OPENROUTER_URL;
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  const repoFiles = config.repositoryFiles ?? [];

  yield { type: "narration", message: `Planning: ${config.request}`, detail: "Reading the active workspace and building an execution plan…" };
  yield { type: "log", message: `Loaded ${repoFiles.length} repository file(s) into context.` };
  yield { type: "reasoning", message: repoFiles.length ? "Analyzing repository structure to shape a minimal, consistent change." : "No repository files preloaded; reasoning from the request only." };

  const coderSystem = [
    "You are Jyinx Coder, an autonomous agent that edits files in a GitHub repository.",
    "Respond with:",
    "1) A short plain-language narration of WHAT you will change and WHY.",
    "2) One fenced code block per file to write, each preceded by a line declaring the path like `PATH: src/foo.ts`.",
    "Output the FULL new file content inside each fence. Keep changes minimal and correct.",
  ].join("\n");

  const reviewerSystem = [
    "You are the Review & Fact-Check agent in a multi-agent pipeline.",
    "Inspect a code patch for syntax errors, missing imports, unhandled edge cases, and logical bugs against the repository.",
    "Reply with exactly one line: `APPROVED` or a specific, actionable issue to fix.",
  ].join("\n");

  let workingEdits: AgentEdit[] = [];
  let lastError = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    yield {
      type: "log",
      message: attempt === 0 ? "Coder agent: shaping the change…" : `Coder agent: retrying after self-correction (${attempt}/${maxRetries})…`,
    };
    yield { type: "reasoning", message: "Coder is inspecting context and drafting file edits…" };
    await delay(600);

    const coderPrompt = [
      `Repository: ${config.repository}\nBranch: ${config.branch}`,
      `Task: ${config.request}`,
      "",
      `Loaded repository files:\n${repoFiles.length ? repoFiles.map((f) => `### ${f.path}\n${f.content}`).join("\n\n") : "(none)"}`,
      lastError ? `\nFeedback from the previous iteration to incorporate:\n${lastError}` : "",
    ].join("\n");

    const coder = await callLLMOnce({ apiKey, endpoint, model, systemPrompt: coderSystem, userPrompt: coderPrompt });
    const parsed = parseFileEdits(coder.content);
    workingEdits = parsed.edits;
    yield { type: "narration", message: parsed.narration || `Planned edits across ${workingEdits.length} file(s).`, detail: workingEdits.map((e) => `- ${e.path} (${e.content.length} chars)`).join("\n") };

    if (workingEdits.length === 0) {
      lastError = "The coder produced no file edits. Please output explicit code blocks with full file content.";
      yield { type: "error", message: lastError };
      if (attempt < maxRetries) continue;
      yield { type: "done", summary: "No file edits produced." };
      return;
    }

    // Structural verification.
    yield { type: "log", message: `Verification: checking ${workingEdits.length} file(s) for structural integrity…` };
    const verdict = await verifyEdits(workingEdits);
    if (!verdict.pass) {
      lastError = verdict.errors.join(" ");
      yield { type: "error", message: `Verification failed: ${lastError}` };
      if (attempt < maxRetries) {
        yield { type: "log", message: "Self-correcting from structural issues…" };
        continue;
      }
      yield { type: "done", summary: "Verification could not pass after retries. No commit was made." };
      return;
    }
    yield { type: "reasoning", message: "Structural checks passed (non-empty files, balanced delimiters)." };

    // Multi-agent review & fact-check.
    yield { type: "log", message: "Multi-agent review: fact-checking edits against the repository…" };
    const review = await callLLMOnce({
      apiKey,
      endpoint,
      model: DEFAULT_REVIEW_MODEL,
      systemPrompt: reviewerSystem,
      userPrompt: `Repository: ${config.repository}\n\nPatch:\n${workingEdits.map((e) => `### ${e.path}\n\`\`\`\n${e.content}\n\`\`\``).join("\n")}\n\nRequest: ${config.request}`,
    });

    const approved = /^\s*approved\b/i.test(review.content);
    if (!approved) {
      lastError = review.content.trim() || "Reviewer flagged an issue.";
      yield { type: "rejected", file: "", reason: lastError };
      if (attempt < maxRetries) {
        yield { type: "log", message: "Feeding reviewer feedback back to the coder for self-correction…" };
        continue;
      }
      yield { type: "done", summary: "Reviewer could not reach a clean verdict after retries. No commit was made." };
      return;
    }
    yield { type: "reasoning", message: "Review & fact-check PASSED." };

    // Whitespace-only guard.
    const whitespaceOnly = workingEdits.filter((e) => !/\S/.test(e.content));
    if (whitespaceOnly.length) {
      yield { type: "whitespace", message: `${whitespaceOnly.map((e) => e.path).join(", ")}: whitespace-only content. Skipping commit.` };
      yield { type: "done", summary: "Whitespace-only changes detected; nothing committed." };
      return;
    }

    // Commit via the GitHub engine.
    yield { type: "log", message: "All checks passed. Packaging change(s) into a single atomic commit…" };
    try {
      const commit = await commitFiles({
        repository: config.repository,
        baseBranch: config.branch,
        message: `Jyinx autonomous: ${config.request.slice(0, 60)}`,
        files: workingEdits,
        token: config.providerToken,
      });
      yield { type: "done", summary: `Committed ${workingEdits.length} file(s) → ${commit.commitUrl}` };
      return;
    } catch (cause) {
      lastError = cause instanceof Error ? cause.message : "Commit failed.";
      yield { type: "error", message: lastError };
      if (attempt < maxRetries) {
        yield { type: "log", message: "Commit failed — regenerating edits with the returned error fed back…" };
        continue;
      }
      yield { type: "done", summary: "Autonomous pipeline halted after retries. No commit was made." };
      return;
    }
  }

  yield { type: "done", summary: "Pipeline finished." };
}