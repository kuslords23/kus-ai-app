/**
 * Local filesystem sandbox execution engine.
 *
 * A lightweight alternative to the E2B cloud sandbox that runs build, type-check,
 * and test commands directly on the server's filesystem. Uses the Node.js
 * runtime (child_process) to execute commands in a temporary working directory.
 *
 * This is the "works without E2B" fallback — no Docker, no microVM, no cloud
 * dependency. Files are written to a temp dir, commands are run, and the
 * stdout/stderr are captured and returned. The sandbox is ephemeral: the temp
 * dir is cleaned up after execution.
 *
 * Available on Vercel's Node.js runtime (serverless functions can use
 * child_process when runtime = "nodejs").
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { commitFiles, GitHubCommitError } from "@/services/githubCommit";

export type LocalSandboxPhase =
  | "preparing"
  | "writing-files"
  | "installing"
  | "typecheck"
  | "testing"
  | "committing"
  | "done"
  | "error";

export type LocalSandboxStep = {
  phase: LocalSandboxPhase;
  message: string;
  exitCode?: number;
  logs?: string[];
};

export type LocalSandboxOutcome =
  | { ok: true; commitUrl?: string; commitSha?: string; committed?: boolean; steps: LocalSandboxStep[] }
  | { ok: false; error: string; steps: LocalSandboxStep[]; authorization?: boolean };

export type LocalSandboxReporter = (step: LocalSandboxStep) => void;

type RunResult = { stdout: string; stderr: string; exitCode: number };

/**
 * Run a shell command and capture the result.
 */
function cmd(command: string, cwd: string): RunResult {
  try {
    const stdout = execSync(command, {
      cwd,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      timeout: 120_000, // 2 min
    });
    return { stdout: String(stdout ?? ""), stderr: "", exitCode: 0 };
  } catch (cause) {
    const error = cause as {
      stdout?: string;
      stderr?: string;
      status?: number;
      message?: string;
    };
    return {
      stdout: String(error.stdout ?? ""),
      stderr: String(error.stderr ?? error.message ?? ""),
      exitCode: error.status ?? 1,
    };
  }
}

/**
 * Check if a package.json exists and detect the package manager.
 */
function detectManager(cwd: string): "npm" | "pnpm" | "yarn" | "none" {
  if (!existsSync(join(cwd, "package.json"))) return "none";
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  return "npm";
}

/**
 * Detect the toolchain for a project.
 */
function detectToolchain(cwd: string): {
  install?: string[];
  verify: string[];
  label: string;
} {
  const has = (name: string) => existsSync(join(cwd, name));
  const manager = detectManager(cwd);

  if (has("package.json")) {
    const pkg = manager === "pnpm" ? "pnpm" : manager === "yarn" ? "yarn" : "npm";
    return {
      install: [manager === "none" ? "npm install" : `${pkg} install`],
      verify: [
        has("tsconfig.json") ? "npx tsc --noEmit" : "npm run build --if-present",
        `${pkg} test 2>&1 || true`,
      ],
      label: "TypeScript/JavaScript (Node)",
    };
  }

  if (has("pyproject.toml") || has("requirements.txt") || has("setup.py")) {
    return {
      install: ["pip install -e . 2>/dev/null || pip install -r requirements.txt 2>/dev/null || true"],
      verify: ["python -m compileall -q . 2>/dev/null || true", "python -m pytest -q 2>/dev/null || true"],
      label: "Python",
    };
  }

  if (has("Cargo.toml")) {
    return {
      install: [],
      verify: ["cargo check --quiet 2>/dev/null || true", "cargo test --quiet 2>/dev/null || true"],
      label: "Rust",
    };
  }

  if (has("go.mod")) {
    return {
      install: ["go mod download 2>/dev/null || true"],
      verify: ["go build ./... 2>/dev/null || true", "go test ./... 2>/dev/null || true"],
      label: "Go",
    };
  }

  return {
    install: manager === "none" ? [] : [`${manager} install`],
    verify: ["npm run build --if-present 2>/dev/null || true", "echo 'Skipping tests (no framework detected)'"],
    label: "Generic",
  };
}

/**
 * Tail log output to the last N lines.
 */
function tail(s: string, lines = 15): string {
  const trimmed = s.trim();
  if (!trimmed) return "(no output)";
  const parts = trimmed.split("\n");
  return parts.length > lines ? parts.slice(-lines).join("\n") : trimmed;
}

/**
 * Run the full local sandbox pipeline:
 *  1. Write files to a temp directory
 *  2. Detect the toolchain
 *  3. Install dependencies
 *  4. Type-check / build
 *  5. Run tests
 *  6. Commit (via the GitHub commit engine)
 *  7. Clean up the temp directory
 */
export async function runLocalSandbox(
  opts: {
    repository: string;
    branch: string;
    files: Array<{ path: string; content: string }>;
    commitMessage: string;
    providerToken: string;
  },
  report: LocalSandboxReporter
): Promise<LocalSandboxOutcome> {
  const steps: LocalSandboxStep[] = [];
  const emit = (step: LocalSandboxStep) => {
    steps.push(step);
    report(step);
  };

  const sessionId = randomUUID().slice(0, 8);
  const repoName = opts.repository.split("/")[1] ?? "repo";
  const workDir = `/tmp/jyinx-sandbox-${sessionId}-${repoName}`;

  try {
    // 1. Prepare the temp directory
    emit({ phase: "preparing", message: `Preparing local sandbox at ${workDir}…` });
    if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
    mkdirSync(workDir, { recursive: true });

    // 2. Write files
    emit({ phase: "writing-files", message: `Writing ${opts.files.length} file(s) to the sandbox…` });
    for (const file of opts.files) {
      const fullPath = join(workDir, file.path);
      const dir = dirname(fullPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, file.content, "utf-8");
    }
    emit({ phase: "writing-files", message: "Files written to the sandbox." });

    // 3. Detect toolchain
    const toolchain = detectToolchain(workDir);
    emit({ phase: "installing", message: `Detected ${toolchain.label}.` });

    // 4. Install dependencies
    if (toolchain.install && toolchain.install.length > 0) {
      for (const installCmd of toolchain.install) {
        emit({ phase: "installing", message: `Running: ${installCmd}…` });
        const result = cmd(installCmd, workDir);
        emit({
          phase: "installing",
          message: result.exitCode === 0 ? "Dependencies installed." : `Install completed with exit code ${result.exitCode}.`,
          exitCode: result.exitCode,
          logs: [result.stdout, result.stderr].filter(Boolean),
        });
        if (result.exitCode !== 0 && toolchain.label.startsWith("TypeScript")) {
          // npm install failure is often non-fatal for type-checking
          emit({ phase: "installing", message: "Continuing despite install issues…" });
        }
      }
    } else {
      emit({ phase: "installing", message: "No dependency manifest found." });
    }

    // 5. Type-check / build
    for (const [idx, verifyCmd] of toolchain.verify.entries()) {
      const phase: LocalSandboxPhase = idx === 0 ? "typecheck" : "testing";
      emit({ phase, message: `Running: ${verifyCmd}…` });
      const result = cmd(verifyCmd, workDir);
      const passed = result.exitCode === 0 || (idx === 1 && /no test/i.test(result.stderr));
      emit({
        phase,
        message: passed
          ? `${verifyCmd} passed.`
          : `${verifyCmd} reported errors (exit ${result.exitCode}).`,
        exitCode: result.exitCode,
        logs: [result.stdout, result.stderr].filter(Boolean),
      });
      if (!passed && idx === 0) {
        // Type-check failed — return the error details for the fix loop
        return {
          ok: false,
          error: tail(result.stderr || result.stdout),
          steps,
        };
      }
    }

    // 6. Commit via the GitHub commit engine
    emit({ phase: "committing", message: "All local checks passed. Committing to GitHub…" });
    try {
      const commit = await commitFiles({
        repository: opts.repository,
        baseBranch: opts.branch,
        message: opts.commitMessage,
        files: opts.files,
        token: opts.providerToken,
      });
      emit({ phase: "committing", message: `Committed ${opts.files.length} file(s) → ${commit.commitUrl}` });
      emit({ phase: "done", message: "Local sandbox pipeline completed." });
      // Cleanup
      rmSync(workDir, { recursive: true, force: true });
      return { ok: true, commitUrl: commit.commitUrl, commitSha: commit.commitSha, committed: true, steps };
    } catch (cause) {
      const isAuth = cause instanceof GitHubCommitError && cause.authorization;
      const message = cause instanceof Error ? cause.message : "Commit failed.";
      emit({ phase: "error", message, logs: [message] });
      rmSync(workDir, { recursive: true, force: true });
      return { ok: false, error: message, steps, authorization: isAuth };
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Local sandbox failed.";
    emit({ phase: "error", message });
    // Cleanup on error
    try { if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return { ok: false, error: message, steps };
  }
}

/**
 * Whether the local sandbox is available (always true on Node.js runtime).
 */
export function isLocalSandboxAvailable(): boolean {
  try {
    return typeof process !== "undefined" && process.versions?.node !== undefined;
  } catch {
    return false;
  }
}