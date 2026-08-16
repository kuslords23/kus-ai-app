import { Sandbox } from "@e2b/code-interpreter";
import { commitFiles } from "@/services/githubCommit";

/**
 * Cloud sandbox execution engine for Jyinx.
 *
 * Uses the E2B code-interpreter SDK to provision a secure microVM that clones
 * the target repository, writes the agent's edits into its filesystem, runs the
 * verification pipeline (`tsc --noEmit`, tests), and — only after everything
 * passes — hands the files to the GitHub commit engine.
 *
 * The service degrades gracefully: when no E2B_API_KEY is configured it reports
 * `unavailable`, letting the app keep working via the lightweight structural
 * reviewer.
 */

export type SandboxPhase =
  | "connecting"
  | "cloning"
  | "applying-edits"
  | "installing"
  | "typecheck"
  | "testing"
  | "committing"
  | "done"
  | "error";

export type SandboxStep = { phase: SandboxPhase; message: string; exitCode?: number; logs?: string[] };

export type SandboxOutcome =
  | { ok: true; commitUrl?: string; steps: SandboxStep[] }
  | { ok: false; error: string; steps: SandboxStep[] };

type SandboxOptions = {
  repository: string;
  branch: string;
  providerToken: string;
  files: Array<{ path: string; content: string }>;
  commitMessage: string;
  apiKey?: string;
};

export type SandboxReporter = (step: SandboxStep) => void;

/** Whether the E2B cloud sandbox runtime is configured. */
export function isSandboxConfigured(apiKey?: string): boolean {
  const key = apiKey || process.env.E2B_API_KEY;
  return Boolean(key);
}

type RunResult = { stdout: string; stderr: string; exitCode: number };

/** Runs a command inside the sandbox and normalizes the result. */
async function cmd(sandbox: Sandbox, cwd: string, command: string): Promise<RunResult> {
  try {
    const result = await sandbox.commands.run(command, { cwd });
    return {
      stdout: String(result?.stdout ?? ""),
      stderr: String(result?.stderr ?? ""),
      exitCode: typeof result?.exitCode === "number" ? result.exitCode : 1,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Command failed.";
    return { stdout: "", stderr: message, exitCode: 1 };
  }
}

/** Skims the package.json (if present) to decide which package manager to use. */
async function detectManager(sandbox: Sandbox, cwd: string): Promise<"none" | "npm" | "pnpm" | "yarn"> {
  const manifest = await cmd(sandbox, cwd, "test -f package.json && echo yes || echo no");
  if (manifest.exitCode !== 0 || !/yes/.test(manifest.stdout)) return "none";
  const lock = await cmd(sandbox, cwd, "test -f pnpm-lock.yaml && echo pnpm || test -f yarn.lock && echo yarn || echo npm");
  if (/pnpm/.test(lock.stdout)) return "pnpm";
  if (/yarn/.test(lock.stdout)) return "yarn";
  return "npm";
}

function tail(s: string, lines = 12): string {
  const trimmed = s.trim();
  if (!trimmed) return "Command completed with no output.";
  const parts = trimmed.split("\n");
  return parts.length > lines ? parts.slice(-lines).join("\n") : trimmed;
}

/**
 * Provisions an E2B sandbox and runs the full cloud verification pipeline.
 * Emits a status report to `report` for each phase so the UI can stream it live.
 */
export async function runSandboxPipeline(
  opts: SandboxOptions,
  report: SandboxReporter
): Promise<SandboxOutcome & { unavailable?: boolean }> {
  const key = (opts.apiKey || process.env.E2B_API_KEY);
  if (!key) {
    return { ok: false, unavailable: true, error: "E2B_API_KEY is not configured.", steps: [] };
  }

  const steps: SandboxStep[] = [];
  const emit = (step: SandboxStep) => { steps.push(step); report(step); };
  let sandbox: Sandbox | null = null;

  try {
    emit({ phase: "connecting", message: "Provisioning secure cloud sandbox…" });
    sandbox = await Sandbox.create({ apiKey: key });
    emit({ phase: "connecting", message: `Sandbox online · ${sandbox.sandboxId}` });

    const { repository, branch, providerToken, files, commitMessage } = opts;
    const repoDir = `/${repository.split("/")[1] ?? "repo"}`;

    // Clone the repository into the sandbox using the token-embedded URL.
    emit({ phase: "cloning", message: `Cloning ${repository}…` });
    const cloneUrl = `https://x-access-token:${providerToken}@github.com/${repository}.git`;
    await sandbox.git.clone(cloneUrl, { path: repoDir, branch });
    emit({ phase: "cloning", message: "Repository cloned into the sandbox." });

    // Write the edited files into the sandbox filesystem (creates parent dirs).
    emit({ phase: "applying-edits", message: `Writing ${files.length} file edit(s) into the sandbox…` });
    await sandbox.files.write(files.map((f) => ({ path: `${repoDir}/${f.path}`, data: f.content })));
    emit({ phase: "applying-edits", message: "Edits applied to the sandbox filesystem." });

    // Dependency install (only when a manifest is present).
    const manager = await detectManager(sandbox, repoDir);
    if (manager !== "none") {
      emit({ phase: "installing", message: `Installing dependencies (${manager})…` });
      const install = await cmd(sandbox, repoDir, manager === "npm" ? "npm install" : manager === "pnpm" ? "pnpm install" : "yarn install");
      emit({ phase: "installing", message: install.exitCode === 0 ? "Dependencies installed." : "Dependency install produced non-zero exit.", exitCode: install.exitCode, logs: [install.stdout, install.stderr].filter(Boolean) });
      if (install.exitCode !== 0) {
        return { ok: false, error: tail(install.stderr || install.stdout), steps };
      }
    } else {
      emit({ phase: "installing", message: "No package manifest; skipping dependency install." });
    }

    // TypeScript build check.
    emit({ phase: "typecheck", message: "Running tsc --noEmit…" });
    const tsc = await cmd(sandbox, repoDir, "npx tsc --noEmit");
    emit({ phase: "typecheck", message: tsc.exitCode === 0 ? "tsc --noEmit passed with zero errors." : "tsc --noEmit reported errors.", exitCode: tsc.exitCode, logs: [tsc.stdout, tsc.stderr].filter(Boolean) });
    if (tsc.exitCode !== 0) {
      return { ok: false, error: tail(tsc.stderr || tsc.stdout), steps };
    }

    // Test suite (best-effort; tolerate repos without test scripts).
    emit({ phase: "testing", message: "Running the test suite…" });
    const tests = await cmd(sandbox, repoDir, "npm test -- --passWithNoTests");
    emit({ phase: "testing", message: tests.exitCode === 0 ? "Tests passed." : "Tests failed.", exitCode: tests.exitCode, logs: [tests.stdout, tests.stderr].filter(Boolean) });
    if (tests.exitCode !== 0 && !/no test/i.test(tests.stderr)) {
      return { ok: false, error: tail(tests.stderr || tests.stdout), steps };
    }

    // All checks passed — hand off to the GitHub commit engine.
    emit({ phase: "committing", message: "All cloud checks passed. Committing to GitHub…" });
    const commit = await commitFiles({ repository, baseBranch: branch, message: commitMessage, files, token: providerToken });
    emit({ phase: "committing", message: `Committed ${files.length} file(s) → ${commit.commitUrl}` });
    emit({ phase: "done", message: "Autonomous sandbox pipeline completed." });
    return { ok: true, steps };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Sandbox execution failed.";
    emit({ phase: "error", message });
    return { ok: false, error: message, steps };
  } finally {
    if (sandbox) {
      sandbox.kill().catch(() => undefined);
    }
  }
}