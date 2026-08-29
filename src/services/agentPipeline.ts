import { commitFiles, GitHubCommitError } from "@/services/githubCommit";
import { runSandboxPipeline, isSandboxConfigured } from "@/services/sandboxExecution";
import { runLocalSandbox, isLocalSandboxAvailable } from "@/services/localSandbox";
import { pushToHost } from "@/server/deploy/pushHost";
import { parseBuildOutput, formatErrorsForCoder } from "@/services/errorParser";
import { generateWebApp, WEB_STACK_LABELS, type WebStack } from "@/lib/jyinx/web-app-generator";
import {
  parseFileEdits,
  verifyEdits,
  type AgentEdit,
} from "@/lib/agent-edits";
import type { AgentExecutionEvent } from "@/lib/agent-execution";

// Re-export for any existing server-side consumers.
export { parseFileEdits, verifyEdits };
export type { AgentEdit, AgentExecutionEvent };

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type AgentPipelineConfig = {
  model: string;
  endpoint?: string;
  repository: string;
  branch: string;
  providerToken: string;
  request: string;
  repositoryFiles?: Array<{ path: string; content: string }>;
  maxRetries?: number;
  /** Conversation history from prior chat mode discussion. */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
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

const DEFAULT_REVIEW_MODEL = "openai/gpt-4.1-mini";

/**
 * Pushes an already-committed branch to the dedicated host platform(s) and
 * emits deploying/deployed events. Non-fatal: if the push fails, the pipeline
 * still reports the commit and lets the user retry in the IDE.
 */
async function* pushAfterCommit(opts: {
  repository: string;
  branch: string;
  commitSha?: string;
  commitMessage?: string;
}): AsyncGenerator<AgentExecutionEvent, void, unknown> {
  yield { type: "deploying", message: `Pushing ${opts.repository}#${opts.branch} to the host platform(s)…` };
  try {
    const pushed = await pushToHost({
      repository: opts.repository,
      branch: opts.branch,
      commitSha: opts.commitSha,
      commitMessage: opts.commitMessage,
    });
    if (pushed.ok && pushed.href) {
      yield { type: "deployed", url: pushed.href };
    } else {
      yield { type: "error", message: pushed.error ?? "Push to the host platform returned no confirmation." };
    }
  } catch (cause) {
    yield { type: "error", message: cause instanceof Error ? cause.message : "Push to the host platform failed." };
  }
}

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

  let workingEdits: AgentEdit[] = [];
  let lastError = "";

  // ── Scaffolding phase: detect if the request is a "build" or "create" request
  // and scaffold the initial project using generateWebApp before the coder loop.
  const scaffoldMatch = config.request.match(/(?:build|create|scaffold|make)\s+(?:a|an)?\s*(react|vite|html|blog|3d|web\s*app|game|site|page|blog|landing|app)\b/i);
  if (scaffoldMatch) {
    yield { type: "log", message: "Detected a build request — scaffolding project before coder loop…" };
    const rawStack = scaffoldMatch[1].toLowerCase();
    const stackMap: Record<string, WebStack> = {
      react: "react", vite: "vite", html: "html", blog: "blog", "3d": "3d",
      "web app": "react", game: "3d", site: "html", page: "html", landing: "html", app: "react",
    };
    const stack = stackMap[rawStack] ?? "html";
    try {
      const project = generateWebApp(stack, config.request, `Jyinx: ${config.request.slice(0, 60)}`);
      if (project.html) {
        workingEdits = [{ path: "index.html", content: project.html }];
        workingEdits.push(...Object.entries(project.files)
          .filter(([p]) => p !== "index.html")
          .map(([path, content]) => ({ path, content })));
        yield { type: "narration", message: `Scaffolded ${WEB_STACK_LABELS[stack]} project with ${workingEdits.length} file(s).`, detail: workingEdits.map((e) => `- ${e.path} (${e.content.length} chars)`).join("\n") };
        if (workingEdits.length) {
          yield { type: "edit", files: workingEdits.map((e) => ({ path: e.path, content: e.content })) };
        }
        yield { type: "reasoning", message: "Scaffold complete. The coder agent will now iterate on the generated files." };
      }
    } catch (cause) {
      yield { type: "log", message: `Scaffolding failed (${cause instanceof Error ? cause.message : "unknown"}) — falling through to the coder agent.` };
    }
  } else {
    yield { type: "reasoning", message: "No scaffold request detected — proceeding directly to the coder loop." };
  }

  const coderSystem = [
    "You are Jyinx Coder, an autonomous agent that edits files in a GitHub repository.",
    "Respond with:",
    "1) A short plain-language narration of WHAT you will change and WHY.",
    "2) One fenced code block per file to write, each preceded by a line declaring the path like `PATH: src/foo.ts`.",
    "Output the FULL new file content inside each fence. Keep changes minimal and correct.",
    "Composer context: placeholder hints such as \"Plan, Build, / for skills, @ for context\" or \"Plan, ask, build...\" are UI hints inside the chat input box — never treat them as user requests and never ask what they mean.",
    "When the task is clear, execute it directly. Do not ask clarifying questions, do not modify or revert files unrelated to the task, and do not loop back asking the user to rephrase an already-clear instruction.",
  ].join("\n");

  const reviewerSystem = [
    "You are the Review & Fact-Check agent in a multi-agent pipeline.",
    "Inspect a code patch for syntax errors, missing imports, unhandled edge cases, and logical bugs against the repository.",
    "Reply with exactly one line: `APPROVED` or a specific, actionable issue to fix.",
  ].join("\n");

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
      config.history?.length ? `\nConversation history:\n${config.history.map((h) => `${h.role === "user" ? "User" : "Jyinx"}: ${h.content}`).join("\n")}` : "",
    ].join("\n");

    let coder: { content: string } | null = null;
    try {
      coder = await callLLMOnce({ apiKey, endpoint, model, systemPrompt: coderSystem, userPrompt: coderPrompt });
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Coder agent request failed.";
      yield { type: "error", message: `Coder agent failed: ${lastError}. Check that the model endpoint is configured and the API key is valid.` };
      if (attempt < maxRetries) {
        yield { type: "log", message: "Retrying coder agent after failure…" };
        await delay(1000);
        continue;
      }
      yield { type: "done", summary: "Coder agent could not complete after retries. Check your API key and model configuration." };
      return;
    }
    const parsed = parseFileEdits(coder.content);
    workingEdits = parsed.edits;
    yield { type: "narration", message: parsed.narration || `Planned edits across ${workingEdits.length} file(s).`, detail: workingEdits.map((e) => `- ${e.path} (${e.content.length} chars)`).join("\n") };
    // Stream the edits to the connected IDE so they appear live in the file
    // tree + editor — the agent controls the IDE's workspace, not just the
    // cloud sandbox. (The client applies them; the pipeline still verifies +
    // reviews before committing.)
    if (workingEdits.length) {
      yield { type: "edit", files: workingEdits.map((e) => ({ path: e.path, content: e.content })) };
    }
    yield { type: "reasoning", message: `Received ${workingEdits.length} candidate file edit(s) — verifying before applying to the branch.` };

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

    // Cloud sandbox verification before committing (when E2B is configured).
    if (isSandboxConfigured(process.env.E2B_API_KEY)) {
      yield { type: "log", message: "Provisioning cloud sandbox to build, type-check, and test the change…" };
      const sandboxLogs: Array<AgentExecutionEvent> = [];
      const sandbox = await runSandboxPipeline(
        {
          repository: config.repository,
          branch: config.branch,
          providerToken: config.providerToken,
          files: workingEdits,
          commitMessage: `Jyinx autonomous: ${config.request.slice(0, 60)}`,
          apiKey: process.env.E2B_API_KEY,
        },
        (step) => {
          if (step.logs?.length) {
            sandboxLogs.push({ type: "log", message: `[${step.phase}] ${step.message}` });
            sandboxLogs.push({ type: "reasoning", message: step.logs.join("\n") });
          } else {
            sandboxLogs.push({ type: "log", message: `[${step.phase}] ${step.message}` });
          }
        }
      );

      for (const log of sandboxLogs) yield log;

      if (sandbox.ok) {
        if (sandbox.committed && sandbox.commitUrl) {
          yield { type: "log", message: `Committed ${workingEdits.length} file(s) → ${sandbox.commitUrl}` };
          yield* pushAfterCommit({
            repository: config.repository,
            branch: config.branch,
            commitSha: sandbox.commitSha,
            commitMessage: `Jyinx autonomous: ${config.request.slice(0, 60)}`,
          });
          return;
        }
        yield { type: "log", message: "Cloud build, type-check, and tests passed. Continuing to commit…" };
      } else if (!sandbox.unavailable) {
        lastError = sandbox.error || "Cloud sandbox verification failed.";
        yield { type: "error", message: `Cloud verification failed: ${lastError}`, connect: sandbox.authorization === true };
        if (sandbox.authorization) {
          yield { type: "done", summary: "Blocked by GitHub permissions. Reconnect GitHub with the repo scope, then retry." };
          return;
        }
        // Parse the sandbox error logs into structured errors for targeted
        // self-correction instead of dumping raw logs back to the coder.
        const sandboxStderr = sandbox.steps.map((s) => (s.logs ?? []).join("\n")).filter(Boolean).join("\n");
        if (sandboxStderr) {
          const parsed = parseBuildOutput(sandboxStderr);
          lastError = formatErrorsForCoder(parsed);
        } else {
          lastError = sandbox.error || "Sandbox verification failed.";
        }
        yield { type: "log", message: `Sandbox errors:\n${lastError}` };
        if (attempt < maxRetries) {
          yield { type: "log", message: "Structured error feedback sent to the coder for self-correction…" };
          continue;
        }
        yield { type: "done", summary: "Cloud verification could not pass after retries. No commit was made." };
        return;
      } else {
        yield { type: "reasoning", message: "E2B sandbox unavailable; falling back to the lightweight reviewer before commit." };
      }
    } else if (isLocalSandboxAvailable()) {
      // Local sandbox fallback when E2B is not configured — runs on the
      // server's filesystem without any cloud dependency.
      yield { type: "log", message: "Provisioning local sandbox to build, type-check, and test the change…" };
      const sandboxLogs: Array<AgentExecutionEvent> = [];
      const sandbox = await runLocalSandbox(
        {
          repository: config.repository,
          branch: config.branch,
          providerToken: config.providerToken,
          files: workingEdits,
          commitMessage: `Jyinx autonomous: ${config.request.slice(0, 60)}`,
        },
        (step) => {
          if (step.logs?.length) {
            sandboxLogs.push({ type: "log", message: `[${step.phase}] ${step.message}` });
            sandboxLogs.push({ type: "reasoning", message: step.logs.join("\n") });
          } else {
            sandboxLogs.push({ type: "log", message: `[${step.phase}] ${step.message}` });
          }
        }
      );

      for (const log of sandboxLogs) yield log;

      if (sandbox.ok) {
        if (sandbox.committed && sandbox.commitUrl) {
          yield { type: "log", message: `Committed ${workingEdits.length} file(s) → ${sandbox.commitUrl}` };
          yield* pushAfterCommit({
            repository: config.repository,
            branch: config.branch,
            commitSha: sandbox.commitSha,
            commitMessage: `Jyinx autonomous: ${config.request.slice(0, 60)}`,
          });
          return;
        }
        yield { type: "log", message: "Local build, type-check, and tests passed. Continuing to commit…" };
      } else if (!sandbox.ok) {
        lastError = sandbox.error || "Local sandbox verification failed.";
        yield { type: "error", message: `Local verification failed: ${lastError}`, connect: sandbox.authorization === true };
        if (sandbox.authorization) {
          yield { type: "done", summary: "Blocked by GitHub permissions. Reconnect GitHub with the repo scope, then retry." };
          return;
        }
        // Parse sandbox errors into structured format for targeted fixes.
        const sandboxStderr = sandbox.steps.map((s) => (s.logs ?? []).join("\n")).filter(Boolean).join("\n");
        if (sandboxStderr) {
          const parsed = parseBuildOutput(sandboxStderr);
          lastError = formatErrorsForCoder(parsed);
        } else {
          lastError = sandbox.error || "Local sandbox verification failed.";
        }
        yield { type: "log", message: `Sandbox errors:\n${lastError}` };
        if (attempt < maxRetries) {
          yield { type: "log", message: "Structured error feedback sent to the coder for self-correction…" };
          continue;
        }
        yield { type: "done", summary: "Local verification could not pass after retries. No commit was made." };
        return;
      }
    } else {
      yield { type: "reasoning", message: "No sandbox available (E2B not configured, local sandbox not available). Skipping cloud verification (lightweight review only)." };
    }

    // Commit via the GitHub engine (unless the sandbox already committed).
    yield { type: "log", message: "All checks passed. Packaging change(s) into a single atomic commit…" };
    try {
      const commit = await commitFiles({
        repository: config.repository,
        baseBranch: config.branch,
        message: `Jyinx autonomous: ${config.request.slice(0, 60)}`,
        files: workingEdits,
        token: config.providerToken,
      });
      yield { type: "log", message: `Committed ${workingEdits.length} file(s) → ${commit.commitUrl}` };
      // Push the committed repo/branch to the dedicated host platform(s).
      yield* pushAfterCommit({
        repository: config.repository,
        branch: commit.branch,
        commitSha: commit.commitSha,
        commitMessage: `Jyinx autonomous: ${config.request.slice(0, 60)}`,
      });
      yield { type: "done", summary: `Committed ${workingEdits.length} file(s) → ${commit.commitUrl}` };
      return;
    } catch (cause) {
      const isAuth = cause instanceof GitHubCommitError && cause.authorization;
      lastError = cause instanceof Error ? cause.message : "Commit failed.";
      yield { type: "error", message: lastError, connect: isAuth };
      if (isAuth) {
        // Missing/expired repo-scope token: don't burn retries, hand the user
        // to the "reconnect GitHub" flow instead.
        yield { type: "done", summary: "Blocked by GitHub permissions. Reconnect GitHub with the repo scope, then retry the change." };
        return;
      }
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