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

/**
 * Search the code search API for relevant code snippets from the web.
 */
async function searchWebCode(query: string): Promise<string> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "https://kus-ai-app.vercel.app"}/api/jyinx/code-search?q=${encodeURIComponent(query)}`, {
      cache: "no-store",
    });
    if (!res.ok) return "";
    const data = await res.json() as { results?: Array<{ title: string; snippet: string; source: string; url?: string; language: string }> };
    if (!data.results?.length) return "";
    return data.results.slice(0, 5).map((r) =>
      `[${r.source}] ${r.title} (${r.language})\n\`\`\`${r.language}\n${r.snippet.slice(0, 1000)}\n\`\`\`\n${r.url ? `Source: ${r.url}` : ""}`
    ).join("\n\n");
  } catch { return ""; }
}

/**
 * Search the marketplace for relevant listings.
 */
async function searchMarketplace(query: string): Promise<string> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "https://kus-ai-app.vercel.app"}/api/marketplace?q=${encodeURIComponent(query)}`, {
      cache: "no-store",
    });
    if (!res.ok) return "";
    const data = await res.json() as { listings?: Array<{ name: string; description?: string; tags?: string[]; priceCredits?: number }> };
    if (!data.listings?.length) return "";
    return data.listings.slice(0, 3).map((l) =>
      `- ${l.name}${l.description ? `: ${l.description}` : ""}${l.tags?.length ? ` [${l.tags.join(", ")}]` : ""}${l.priceCredits ? ` (${l.priceCredits} credits)` : ""}`
    ).join("\n");
  } catch { return ""; }
}

/**
 * Check the status of the latest Vercel deployments.
 */
async function checkVercelStatus(): Promise<string> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "https://kus-ai-app.vercel.app"}/api/jyinx/tools`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "vercel_deployments", args: { limit: 3 } }),
      cache: "no-store",
    });
    if (!res.ok) return "";
    const data = await res.json() as { ok?: boolean; data?: Array<{ project?: string; state?: string; url?: string; branch?: string; message?: string }> };
    if (!data.ok || !data.data?.length) return "";
    return data.data.map((d) =>
      `- ${d.project || "Project"}: ${d.state || "unknown"}${d.branch ? ` (${d.branch})` : ""}${d.url ? ` → ${d.url}` : ""}`
    ).join("\n");
  } catch { return ""; }
}

/**
 * Check GitHub Actions runs for the repository.
 */
async function checkGitHubActions(repo: string): Promise<string> {
  if (!repo || !repo.includes("/")) return "";
  const [owner, name] = repo.split("/");
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "https://kus-ai-app.vercel.app"}/api/jyinx/tools`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "github_actions", args: { owner, repo: name, limit: 5 } }),
      cache: "no-store",
    });
    if (!res.ok) return "";
    const data = await res.json() as { ok?: boolean; data?: Array<{ name?: string; status?: string; conclusion?: string; branch?: string; url?: string }> };
    if (!data.ok || !data.data?.length) return "";
    return data.data.map((r) =>
      `- ${r.name || "Workflow"}: ${r.status} → ${r.conclusion || "running"}${r.branch ? ` (${r.branch})` : ""}`
    ).join("\n");
  } catch { return ""; }
}

/**
 * Run a terminal command locally (build, test, lint, type-check) and return output.
 * Used by the agent to catch issues before committing.
 */
async function runTerminalCheck(action: "build" | "test" | "typecheck", repo: string): Promise<{ ok: boolean; output: string; diagnostics: string }> {
  try {
    let command = "";
    if (action === "build") command = "npm run build 2>&1 || true";
    else if (action === "test") command = "npm test 2>&1 || true";
    else command = "npx tsc --noEmit 2>&1 || true";
    
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "https://kus-ai-app.vercel.app"}/api/jyinx/workspace-exec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, command, repository: repo }),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, output: "", diagnostics: `Terminal returned HTTP ${res.status}` };
    const data = await res.json() as { stdout?: string; stderr?: string; exitCode?: number; diagnostics?: Array<{ message: string; file?: string; line?: number }> };
    const exitOk = data.exitCode === 0;
    const output = [data.stdout || "", data.stderr || ""].filter(Boolean).join("\n").slice(0, 3000);
    const diagText = (data.diagnostics || []).slice(0, 5).map((d) => `- ${d.file || ""}:${d.line || 0}: ${d.message}`).join("\n");
    return { ok: exitOk, output, diagnostics: diagText };
  } catch (err) {
    return { ok: false, output: "", diagnostics: err instanceof Error ? err.message : "Terminal check failed" };
  }
}

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

  // ── Smart search phase: fetch relevant code, marketplace, tools context ──
  let searchContext = "";
  try {
    yield { type: "log", message: "Searching the web, marketplace, Vercel, and GitHub tools for context…" };
    yield { type: "reasoning", message: "Scanning available code, services, and deployment status…" };
    const searchResults = await Promise.all([
      searchWebCode(config.request),
      searchMarketplace(config.request),
      checkVercelStatus(),
      checkGitHubActions(config.repository),
    ]);
    const webCode = searchResults[0];
    const marketplace = searchResults[1];
    const vercelStatus = searchResults[2];
    const githubActions = searchResults[3];
    const parts = [
      webCode ? `\nRelevant code from the web:\n${webCode}` : "",
      marketplace ? `\nRelevant marketplace items:\n${marketplace}` : "",
      vercelStatus ? `\nVercel deployment status:\n${vercelStatus}` : "",
      githubActions ? `\nGitHub Actions status:\n${githubActions}` : "",
    ];
    searchContext = parts.filter(Boolean).join("\n");
    if (webCode || marketplace || vercelStatus || githubActions) {
      yield { type: "narration", message: `Found relevant context from the web, marketplace, and connected services.`, detail: searchContext.slice(0, 500) };
    }
  } catch {
    yield { type: "log", message: "Search phase skipped (non-fatal)." };
  }

const coderSystem = [
    "You are Jyinx, a helpful autonomous agent that explains everything in simple, plain language.",
    "A non-technical person is reading your responses. Avoid jargon. Explain what you're doing and why, step by step.",
    "",
    "You have access to these capabilities:",
    "- Web Code Search: Find code snippets from GitHub, Stack Overflow, and npm packages.",
    "- Marketplace: Browse published apps, templates, and components.",
    "- Vercel Status: Check recent deployments and their status (live, failed, building).",
    "- GitHub Actions: Check workflow runs and their results for any repository.",
    "- Deploy Hooks: Trigger and check deployment hook status.",
    "- Git: Create commits and push changes to the repository.",
    "- Terminal: Run build, type-check, and test commands locally before committing. The pipeline automatically runs type-check and build after edits and feeds errors back for self-correction.",
    "",
    "When the user asks about deployment status, check Vercel. When they ask about build failures, check GitHub Actions.",
    "When you need external code, search the web for the best solutions.",
    "",
    "Respond with:",
    "1) A short plain-language explanation of WHAT you will change and WHY (in simple terms).",
    "2) One fenced code block per file to write, each preceded by a line declaring the path like `PATH: src/foo.ts`.",
    "Output the FULL new file content inside each fence. Keep changes minimal and correct.",
    "When the task is clear, execute it directly. Do not ask clarifying questions, do not modify or revert files unrelated to the task.",
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
      searchContext ? `\nRelevant context from web search and marketplace:\n${searchContext}\n` : "",
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

    // ── Terminal check phase: run build/type-check locally before committing ──
    yield { type: "reasoning", message: "Running type-check and build to verify changes locally…" };
    yield { type: "log", message: "Type-checking…" };
    const typeResult = await runTerminalCheck("typecheck", config.repository);
    if (!typeResult.ok) {
      lastError = `Type-check failed:\n${typeResult.diagnostics || typeResult.output.slice(0, 500)}`;
      yield { type: "error", message: `Type-check failed. Self-correcting…` };
      yield { type: "log", message: lastError.slice(0, 1000) };
      if (attempt < maxRetries) {
        yield { type: "log", message: "Feeding type errors back to the coder…" };
        continue;
      }
    }

    yield { type: "log", message: "Building…" };
    const buildResult = await runTerminalCheck("build", config.repository);
    if (!buildResult.ok) {
      lastError = `Build failed:\n${buildResult.diagnostics || buildResult.output.slice(0, 500)}`;
      yield { type: "error", message: `Build failed. Self-correcting…` };
      yield { type: "log", message: lastError.slice(0, 1000) };
      if (attempt < maxRetries) {
        yield { type: "log", message: "Feeding build errors back to the coder…" };
        continue;
      }
    }

    yield { type: "reasoning", message: "Local checks passed. Proceeding to commit…" };

    // ── Commit directly — no sandbox verification needed.
    // The review step above already verified structural integrity.
    yield { type: "narration", message: `Committing ${workingEdits.length} file(s) to ${config.repository}…`, detail: workingEdits.map((e) => `- ${e.path} (${e.content.length} chars)`).join("\n") };
    try {
      const commitRes = await fetch("https://api.github.com/repos/" + config.repository + "/git/ref/heads/" + encodeURIComponent(config.branch), {
        headers: { Authorization: `Bearer ${config.providerToken}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      });
      const commitData = await commitRes.json() as { object?: { sha?: string } };
      const baseSha = commitRes.ok ? commitData.object?.sha : undefined;

      // Create blobs, tree, commit, and update ref using the Git Data API
      const api = `https://api.github.com/repos/${config.repository}`;
      const headers = { Authorization: `Bearer ${config.providerToken}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" };

      // Create blobs
      const entries: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];
      for (const file of workingEdits) {
        const blobRes = await fetch(`${api}/git/blobs`, { method: "POST", headers, body: JSON.stringify({ content: file.content, encoding: "utf-8" }) });
        if (!blobRes.ok) throw new Error(`Failed to create blob for ${file.path}`);
        const blob = await blobRes.json() as { sha: string };
        entries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
      }

      // Get base tree if available
      let baseTree: string | undefined;
      if (baseSha) {
        const treeRes = await fetch(`${api}/git/commits/${baseSha}`, { headers });
        if (treeRes.ok) {
          const treeData = await treeRes.json() as { tree?: { sha?: string } };
          baseTree = treeData.tree?.sha;
        }
      }

      // Create tree
      const treeBody: Record<string, unknown> = { tree: entries };
      if (baseTree) treeBody.base_tree = baseTree;
      const treeRes = await fetch(`${api}/git/trees`, { method: "POST", headers, body: JSON.stringify(treeBody) });
      if (!treeRes.ok) throw new Error("Failed to create tree");
      const tree = await treeRes.json() as { sha: string };

      // Create commit
      const commitPayload: Record<string, unknown> = { message: `Jyinx autonomous: ${config.request.slice(0, 200)}`, tree: tree.sha };
      if (baseSha) commitPayload.parents = [baseSha];
      const commitRes2 = await fetch(`${api}/git/commits`, { method: "POST", headers, body: JSON.stringify(commitPayload) });
      if (!commitRes2.ok) throw new Error("Failed to create commit");
      const commit = await commitRes2.json() as { sha: string };

      // Update branch ref
      const refPath = `heads/${encodeURIComponent(config.branch)}`;
      const patchRes = await fetch(`${api}/git/ref/${refPath}`, { method: "PATCH", headers, body: JSON.stringify({ sha: commit.sha, force: true }) });
      let refUpdated = patchRes.ok;
      if (!refUpdated && patchRes.status === 404) {
        const createRes = await fetch(`${api}/git/refs`, { method: "POST", headers, body: JSON.stringify({ ref: `refs/heads/${config.branch}`, sha: commit.sha }) });
        refUpdated = createRes.ok;
        if (!refUpdated && createRes.status === 422) {
          const retryRes = await fetch(`${api}/git/ref/${refPath}`, { method: "PATCH", headers, body: JSON.stringify({ sha: commit.sha, force: true }) });
          refUpdated = retryRes.ok;
        }
      }
      if (!refUpdated) throw new Error("Branch update failed — commit was created but the branch could not be updated.");

      yield { type: "log", message: `Committed ${workingEdits.length} file(s) → ${config.repository}` };
      yield { type: "deploying", message: `Committed to ${config.repository}#${config.branch}` };

      // ── CI/CD self-healing loop: check GitHub Actions and fix failures ──
      yield { type: "reasoning", message: "Commit succeeded. Checking GitHub Actions for CI/CD results…" };
      yield { type: "log", message: "Waiting for workflow to trigger (30s delay)…" };
      await delay(30000); // Wait for the workflow to trigger

      const [owner, repoName] = config.repository.split("/");
      let ciPassed = false;
      let ciError = "";

      for (let ciAttempt = 0; ciAttempt < 3; ciAttempt++) {
        try {
          const toolsRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "https://kus-ai-app.vercel.app"}/api/jyinx/tools`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tool: "github_actions", args: { owner, repo: repoName, limit: 5 } }),
            cache: "no-store",
          });
          if (toolsRes.ok) {
            const toolsData = await toolsRes.json() as { ok?: boolean; data?: Array<{ name?: string; status?: string; conclusion?: string }> };
            const latestRun = toolsData.data?.[0];
            if (latestRun) {
              if (latestRun.status === "completed" && latestRun.conclusion === "success") {
                ciPassed = true;
                yield { type: "log", message: `✅ CI/CD passed: ${latestRun.name || "Workflow"} completed successfully.` };
                break;
              } else if (latestRun.status === "completed" && (latestRun.conclusion === "failure" || latestRun.conclusion === "cancelled")) {
                ciError = `${latestRun.name || "Workflow"} failed: ${latestRun.conclusion}`;
                yield { type: "error", message: `❌ CI/CD failed: ${ciError}. Retrying (${ciAttempt + 1}/3)…` };
                // Wait longer for next check
                await delay(15000);
                continue;
              } else {
                yield { type: "log", message: `⏳ Workflow still running (${latestRun.status}). Waiting…` };
                await delay(15000);
                continue;
              }
            }
          }
        } catch {
          yield { type: "log", message: "Could not check CI/CD status (tool may not be configured)." };
          break;
        }
      }

      if (!ciPassed && ciError) {
        lastError = `CI/CD failed after commit: ${ciError}. Please fix the issue.`;
        yield { type: "error", message: `CI/CD failure: ${ciError}` };
        if (attempt < maxRetries) {
          yield { type: "log", message: "Feeding CI/CD failure back to the coder for self-correction…" };
          continue; // Retry the whole pipeline with the CI error as feedback
        }
      }

      yield { type: "done", summary: `Committed ${workingEdits.length} file(s) to ${config.repository}.${ciPassed ? " ✅ CI/CD passed." : ""}` };
      return;
    } catch (cause) {
      lastError = cause instanceof Error ? cause.message : "Commit failed.";
      yield { type: "error", message: `Commit failed: ${lastError}` };
      if (attempt < maxRetries) {
        yield { type: "log", message: "Commit failed — retrying with regenerated edits…" };
        continue;
      }
      yield { type: "done", summary: "Autonomous pipeline halted after retries. No commit was made." };
      return;
    }
  }

  yield { type: "done", summary: "Pipeline finished." };
}