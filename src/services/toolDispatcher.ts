"use client";

/**
 * Native Tool-Calling Dispatcher
 *
 * Strict function-calling schemas allowing coding agents to dynamically invoke
 * tools (readFile, writeFile, runTerminalCommand, queryVectorDB, snapshotTimeline)
 * with parameter validation and secure execution.
 *
 * Every tool definition includes:
 *   - name & description
 *   - JSON Schema parameters (strict typing)
 *   - handler function (execution logic)
 *   - required permissions
 */

import type { StateNode } from "@/lib/jyinx/orchestrator/StateNode";
import { timeTravelEngine } from "@/lib/jyinx/orchestrator/TimeTravelEngine";

// ── Types ────────────────────────────────────────────────

export type ToolParameter = {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  items?: ToolParameter;
  properties?: Record<string, ToolParameter>;
  required?: boolean;
};

export type ToolSchema = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required: string[];
  };
  permissions: string[];
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
};

export type ToolResult = {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
};

export type ToolCallRequest = {
  toolName: string;
  args: Record<string, unknown>;
  correlationId: string;
};

export type ToolCallResponse = {
  correlationId: string;
  result: ToolResult;
  executionTimeMs: number;
};

// ── Tool Definitions ─────────────────────────────────────

const tools: Map<string, ToolSchema> = new Map();

// ── readFile ──
tools.set("readFile", {
  name: "readFile",
  description: "Read the contents of a file from the workspace or repository.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path to the file (e.g., src/foo.ts)", required: true },
      maxLength: { type: "number", description: "Maximum characters to read (default 50000)", required: false },
    },
    required: ["path"],
  },
  permissions: ["read"],
  handler: async (args) => {
    const path = String(args.path ?? "");
    const maxLength = Number(args.maxLength ?? 50000);
    if (!path) return { success: false, error: "path is required." };
    try {
      const response = await fetch(`/api/jyinx/workspace/read?path=${encodeURIComponent(path)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        return { success: false, error: (error as { error?: string }).error ?? `Failed to read ${path}` };
      }
      const data = (await response.json()) as { content?: string; error?: string };
      if (data.error) return { success: false, error: data.error };
      const content = (data.content ?? "").slice(0, maxLength);
      return { success: true, data: { path, content, truncated: (data.content ?? "").length > maxLength } };
    } catch (cause) {
      return { success: false, error: cause instanceof Error ? cause.message : "readFile failed." };
    }
  },
});

// ── writeFile ──
tools.set("writeFile", {
  name: "writeFile",
  description: "Write content to a file in the workspace. Creates the file if it doesn't exist.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path to the file", required: true },
      content: { type: "string", description: "Full file content to write", required: true },
      append: { type: "boolean", description: "If true, append instead of overwrite", required: false },
    },
    required: ["path", "content"],
  },
  permissions: ["write"],
  handler: async (args) => {
    const path = String(args.path ?? "");
    const content = String(args.content ?? "");
    const append = Boolean(args.append);
    if (!path) return { success: false, error: "path is required." };
    try {
      const response = await fetch("/api/jyinx/workspace/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content, append }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || data.error) return { success: false, error: data.error ?? `HTTP ${response.status}` };
      return { success: true, data: { path, size: content.length, append } };
    } catch (cause) {
      return { success: false, error: cause instanceof Error ? cause.message : "writeFile failed." };
    }
  },
});

// ── runTerminalCommand ──
tools.set("runTerminalCommand", {
  name: "runTerminalCommand",
  description: "Execute a terminal command in the workspace sandbox. Returns stdout, stderr, and exit code.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to execute", required: true },
      cwd: { type: "string", description: "Working directory (default: repository root)", required: false },
      timeout: { type: "number", description: "Timeout in milliseconds (default 30000)", required: false },
    },
    required: ["command"],
  },
  permissions: ["execute"],
  handler: async (args) => {
    const command = String(args.command ?? "");
    const cwd = args.cwd ? String(args.cwd) : undefined;
    const timeout = Number(args.timeout ?? 30000);
    if (!command) return { success: false, error: "command is required." };
    try {
      const response = await fetch("/api/jyinx/workspace/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, cwd, timeout }),
      });
      const data = (await response.json()) as {
        stdout?: string; stderr?: string; exitCode?: number; error?: string;
      };
      if (!response.ok) return { success: false, error: data.error ?? `HTTP ${response.status}` };
      return {
        success: data.exitCode === 0,
        data: { stdout: data.stdout ?? "", stderr: data.stderr ?? "", exitCode: data.exitCode ?? 1 },
        error: data.exitCode !== 0 ? `Exit code ${data.exitCode}: ${data.stderr ?? ""}` : undefined,
      };
    } catch (cause) {
      return { success: false, error: cause instanceof Error ? cause.message : "runTerminalCommand failed." };
    }
  },
});

// ── queryVectorDB ──
tools.set("queryVectorDB", {
  name: "queryVectorDB",
  description: "Query the Supabase vector database for semantically similar content.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Natural language query to search for", required: true },
      table: {
        type: "string",
        description: "Table to search (code_embeddings, docs_embeddings, distill_logs)",
        enum: ["code_embeddings", "docs_embeddings", "distill_logs"],
        required: true,
      },
      limit: { type: "number", description: "Max results (default 10)", required: false },
      threshold: { type: "number", description: "Minimum similarity threshold (0-1, default 0.7)", required: false },
    },
    required: ["query", "table"],
  },
  permissions: ["read"],
  handler: async (args) => {
    const query = String(args.query ?? "");
    const table = String(args.table ?? "code_embeddings");
    const limit = Number(args.limit ?? 10);
    const threshold = Number(args.threshold ?? 0.7);
    if (!query) return { success: false, error: "query is required." };
    if (!["code_embeddings", "docs_embeddings", "distill_logs"].includes(table)) {
      return { success: false, error: `Invalid table: ${table}` };
    }
    try {
      const response = await fetch("/api/jyinx/vector/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, table, limit, threshold }),
      });
      const data = (await response.json()) as { results?: unknown[]; error?: string };
      if (!response.ok || data.error) return { success: false, error: data.error ?? `HTTP ${response.status}` };
      return { success: true, data: { results: data.results ?? [], count: (data.results ?? []).length } };
    } catch (cause) {
      return { success: false, error: cause instanceof Error ? cause.message : "queryVectorDB failed." };
    }
  },
});

// ── snapshotTimeline ──
tools.set("snapshotTimeline", {
  name: "snapshotTimeline",
  description: "Take a time-travel snapshot of the current execution state for later review, rollback, or branching.",
  parameters: {
    type: "object",
    properties: {
      label: { type: "string", description: "Human-readable label for this snapshot", required: true },
      phase: {
        type: "string",
        description: "Current execution phase",
        enum: ["idle", "planning", "executing", "testing", "committing", "completed", "failed"],
        required: false,
      },
      metadata: { type: "object", description: "Arbitrary metadata to store with the snapshot", required: false },
    },
    required: ["label"],
  },
  permissions: ["write"],
  handler: async (args) => {
    const label = String(args.label ?? "");
    const phase = String(args.phase ?? "executing") as StateNode["phase"];
    const metadata = args.metadata ? (args.metadata as Record<string, unknown>) : {};
    if (!label) return { success: false, error: "label is required." };
    try {
      const currentState = timeTravelEngine.getCurrentState();
      const snapshotNodeId = timeTravelEngine.snapshot(
        currentState
          ? { ...currentState, phase, label, metadata: { ...currentState.metadata, ...metadata } }
          : {
              id: `snap_${Date.now()}`,
              parentId: null,
              branch: "main",
              timestamp: new Date(),
              phase,
              userIntent: "",
              repository: "",
              tasks: [],
              logs: [],
              files: {},
              metadata,
              label,
            },
        label
      );
      return { success: true, data: { snapshotNodeId: snapshotNodeId, label, timestamp: new Date().toISOString() } };
    } catch (cause) {
      return { success: false, error: cause instanceof Error ? cause.message : "snapshotTimeline failed." };
    }
  },
});

// ── getTimeline ──
tools.set("getTimeline", {
  name: "getTimeline",
  description: "Retrieve the time-travel timeline for a given branch, or all branches.",
  parameters: {
    type: "object",
    properties: {
      branchId: { type: "string", description: "Branch ID to query (omit for active branch)", required: false },
    },
    required: [],
  },
  permissions: ["read"],
  handler: async (args) => {
    const branchId = args.branchId ? String(args.branchId) : undefined;
    try {
      const effectiveBranchId = branchId ?? timeTravelEngine.getActiveBranch()?.id ?? "main";
      const timeline = timeTravelEngine.getTimeline(effectiveBranchId);
      const snapshots = timeTravelEngine.getSnapshots(effectiveBranchId);
      return {
        success: true,
        data: {
          nodes: timeline.map((n) => ({
            id: n.id,
            phase: n.phase,
            label: n.label,
            timestamp: n.timestamp.toISOString(),
            userIntent: n.userIntent,
            tasks: n.tasks.length,
          })),
          snapshots: snapshots.map((s) => ({
            id: s.id,
            label: s.label,
            timestamp: s.timestamp.toISOString(),
          })),
          count: timeline.length,
        },
      };
    } catch (cause) {
      return { success: false, error: cause instanceof Error ? cause.message : "getTimeline failed." };
    }
  },
});

// ── Public API ───────────────────────────────────────────

/**
 * Get all registered tool schemas (for LLM function-calling definitions).
 */
export function getToolDefinitions(): Array<Omit<ToolSchema, "handler" | "permissions">> {
  const defs: Array<Omit<ToolSchema, "handler" | "permissions">> = [];
  for (const [, tool] of tools) {
    defs.push({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    });
  }
  return defs;
}

/**
 * Get tool schemas as OpenAI-compatible function definitions.
 */
export function getOpenAIToolDefinitions(): Array<{
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return getToolDefinitions().map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as unknown as Record<string, unknown>,
    },
  }));
}

/**
 * Check if a tool call has the required permissions.
 */
export function checkToolPermissions(toolName: string, grantedPermissions: string[]): { allowed: boolean; missing: string[] } {
  const tool = tools.get(toolName);
  if (!tool) return { allowed: false, missing: ["tool_not_found"] };
  const missing = tool.permissions.filter((p) => !grantedPermissions.includes(p));
  return { allowed: missing.length === 0, missing };
}

/**
 * Execute a single tool call with validation.
 */
export async function dispatchToolCall(request: ToolCallRequest, grantedPermissions: string[] = ["read", "write", "execute"]): Promise<ToolCallResponse> {
  const startTime = Date.now();
  const tool = tools.get(request.toolName);
  if (!tool) {
    return {
      correlationId: request.correlationId,
      result: { success: false, error: `Unknown tool: ${request.toolName}. Available: ${Array.from(tools.keys()).join(", ")}` },
      executionTimeMs: Date.now() - startTime,
    };
  }
  const permCheck = checkToolPermissions(request.toolName, grantedPermissions);
  if (!permCheck.allowed) {
    return {
      correlationId: request.correlationId,
      result: { success: false, error: `Missing permissions: ${permCheck.missing.join(", ")}` },
      executionTimeMs: Date.now() - startTime,
    };
  }
  try {
    const result = await tool.handler(request.args);
    return { correlationId: request.correlationId, result, executionTimeMs: Date.now() - startTime };
  } catch (cause) {
    return {
      correlationId: request.correlationId,
      result: { success: false, error: cause instanceof Error ? cause.message : "Tool execution failed." },
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Execute multiple tool calls in parallel or sequentially.
 */
export async function dispatchToolCalls(
  requests: ToolCallRequest[],
  grantedPermissions?: string[],
  parallel = false
): Promise<ToolCallResponse[]> {
  if (parallel) {
    return await Promise.all(requests.map((r) => dispatchToolCall(r, grantedPermissions)));
  }
  const results: ToolCallResponse[] = [];
  for (const request of requests) {
    results.push(await dispatchToolCall(request, grantedPermissions));
  }
  return results;
}

/**
 * Format tool results into a prompt-injection block for the LLM.
 */
export function formatToolResultsForPrompt(results: ToolCallResponse[]): string {
  if (results.length === 0) return "## Tool Results\nNo tools were called.";
  const lines = ["## Tool Results"];
  for (const r of results) {
    const status = r.result.success ? "✅" : "❌";
    const data = r.result.data ? JSON.stringify(r.result.data).slice(0, 500) : "";
    const error = r.result.error ? `Error: ${r.result.error}` : "";
    lines.push(`- ${status} [${r.correlationId.slice(0, 8)}] ${r.executionTimeMs}ms`);
    if (data) lines.push(`  Data: ${data}`);
    if (error) lines.push(`  ${error}`);
  }
  return lines.join("\n");
}
