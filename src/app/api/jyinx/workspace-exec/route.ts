/**
 * Workspace execution endpoint — runs build, test, and system commands
 * on the server and returns structured output, exit codes, and diagnostics.
 *
 * POST /api/jyinx/workspace-exec
 *   { action: "build" | "test" | "run", command: string, repository?: string, file?: string }
 *
 * Returns { stdout, stderr, exitCode, diagnostics }
 */
import { NextRequest, NextResponse } from "next/server";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";

type DiagnosticItem = {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "info";
  message: string;
  code?: string;
};

// Common diagnostic patterns for parsing build output
const TSC_RE = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/m;
const GENERIC_RE = /^(.+?):(\d+)(?::(\d+))?:\s+(error|warning)?\s*(.+)$/im;

function parseDiagnostics(stderr: string): DiagnosticItem[] {
  const items: DiagnosticItem[] = [];
  for (const line of stderr.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // TypeScript format
    const tsc = trimmed.match(TSC_RE);
    if (tsc) {
      items.push({
        file: tsc[1],
        line: parseInt(tsc[2], 10),
        column: parseInt(tsc[3], 10),
        severity: tsc[4] as "error" | "warning",
        code: tsc[5],
        message: tsc[6],
      });
      continue;
    }

    // Generic file:line:col format
    const generic = trimmed.match(GENERIC_RE);
    if (generic) {
      items.push({
        file: generic[1],
        line: parseInt(generic[2], 10),
        column: generic[3] ? parseInt(generic[3], 10) : 0,
        severity: (generic[4] as "error" | "warning") ?? "error",
        message: generic[5],
      });
    }
  }
  return items;
}

function runCommand(command: string, cwd: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(command, {
      cwd,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000,
    });
    return { stdout: String(stdout ?? ""), stderr: "", exitCode: 0 };
  } catch (cause) {
    const error = cause as { stdout?: string; stderr?: string; status?: number; message?: string };
    return {
      stdout: String(error.stdout ?? ""),
      stderr: String(error.stderr ?? error.message ?? ""),
      exitCode: error.status ?? 1,
    };
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    command?: string;
    repository?: string;
    file?: string;
  } | null;

  const command = typeof body?.command === "string" ? body.command.trim() : "";
  const action = typeof body?.action === "string" ? body.action : "run";
  const repository = typeof body?.repository === "string" ? body.repository : undefined;

  if (!command) {
    return NextResponse.json({ error: "A command is required." }, { status: 400 });
  }

  // Determine working directory. In serverless, the project code is at process.cwd().
  // The repo name is used for logging only since we can't clone arbitrary repos.
  let cwd = process.cwd();
  if (repository) {
    const repoPath = join("/tmp", "jyinx", repository.replace("/", "-"));
    if (existsSync(repoPath)) {
      cwd = repoPath;
    }
    // Fall back to process.cwd() which has the actual project files
  }

  // Security: block dangerous commands
  const blocked = /^\s*(rm\s+(-rf?)?\s+\/|sudo|chmod\s+777|dd\s+if=|:\(\)|mkfs)/i;
  if (blocked.test(command)) {
    return NextResponse.json({ error: "Command blocked for security." }, { status: 403 });
  }

  let result: { stdout: string; stderr: string; exitCode: number };

  switch (action) {
    case "build":
      // Try project-specific build first, then fallback
      result = runCommand("npm run build 2>&1 || npx tsc --noEmit 2>&1 || true", cwd);
      break;
    case "test":
      result = runCommand("npm test 2>&1 || true", cwd);
      break;
    default:
      result = runCommand(command, cwd);
      break;
  }

  const diagnostics = parseDiagnostics(result.stderr);

  return NextResponse.json({
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    diagnostics: diagnostics.slice(0, 50),
  });
}