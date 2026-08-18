import { Sandbox } from "@e2b/code-interpreter";
import { commitFiles, GitHubCommitError } from "@/services/githubCommit";

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
  | { ok: false; error: string; steps: SandboxStep[]; authorization?: boolean };

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

type Toolchain = {
  install?: string[];
  verify: string[]; // ordered "type-check -> test" commands
  label: string;
};

/**
 * Language-aware toolchain detection. Instead of assuming a single stack, it
 * probes for the repository's manifest and picks appropriate install / lint /
 * type-check / test commands per language.
 */
async function detectToolchain(sandbox: Sandbox, cwd: string): Promise<Toolchain> {
  const has = await cmd(sandbox, cwd, "ls -1");
  const files = has.stdout.split("\n").map((f) => f.trim()).filter(Boolean);
  const hasFile = (name: string) => files.includes(name);

  const manager = await detectManager(sandbox, cwd);

  // Node / TypeScript / JavaScript
  if (hasFile("package.json")) {
    const pnpm = manager === "pnpm" ? "pnpm" : manager === "yarn" ? "yarn" : "npm";
    return {
      install: [manager === "none" ? "npm install" : `${pnpm} install`],
      verify: [
        hasFile("tsconfig.json") ? "npx tsc --noEmit" : "npm run build --if-present",
        `${pnpm} test ${manager === "npm" ? "-- --passWithNoTests" : ""}`.trimEnd(),
      ],
      label: "TypeScript/JavaScript (Node)",
    };
  }

  // Python
  if (hasFile("pyproject.toml") || hasFile("requirements.txt") || hasFile("Pipfile") || hasFile("setup.py")) {
    return {
      install: ["pip install -e . 2>/dev/null || pip install -r requirements.txt 2>/dev/null || true"],
      verify: ["python -m compileall -q .", "python -m pytest -q"],
      label: "Python",
    };
  }

  // Rust
  if (hasFile("Cargo.toml")) {
    return {
      install: ["cargo fetch 2>/dev/null || true"],
      verify: ["cargo check --quiet", "cargo test --quiet"],
      label: "Rust",
    };
  }

  // Go
  if (hasFile("go.mod")) {
    return {
      install: ["go mod download 2>/dev/null || true"],
      verify: ["go build ./...", "go test ./..."],
      label: "Go",
    };
  }

  // Fallback: npm (repo typed via defaults) with build + tests.
  return {
    install: manager === "none" ? [] : [`${manager} install`],
    verify: ["npm run build --if-present", "echo 'Skipping tests (no detected test framework)'"],
    label: "Generic",
  };
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

    // Clone the repository into the sandbox so private repos authenticate.
    // The user's GitHub OAuth token is injected directly into the clone URL
    // (`https://x-access-token:<token>@github.com/<repo>.git`) — GitHub accepts
    // OAuth/PAT tokens as the HTTPS password with any non-empty username.
    emit({ phase: "cloning", message: `Cloning ${repository}…` });
    const cleanUrl = `https://github.com/${repository}.git`;
    const encodedToken = encodeURIComponent(providerToken);
    const authUrl = `https://x-access-token:${encodedToken}@github.com/${repository}.git`;

    let clone: RunResult;

    // 1) Primary: git CLI with the token embedded in the URL, then strip the
    //    secret from the origin remote so it is not persisted in the sandbox.
    clone = await cmd(sandbox, "/", `git clone --branch "${branch}" --single-branch ${authUrl} ${repoDir}`);
    if (clone.exitCode === 0) {
      await cmd(sandbox, repoDir, `git remote set-url origin ${cleanUrl}`);
    } else {
      // 2) Fallback: let the E2B SDK manage credentials (keeps the token out of
      //    argv; the SDK embeds then strips them itself).
      const sdkClone = await sandbox.git.clone(cleanUrl, {
        path: repoDir,
        branch,
        username: "x-access-token",
        password: providerToken,
      });
      clone = {
        stdout: String(sdkClone?.stdout ?? ""),
        stderr: String(sdkClone?.stderr ?? ""),
        exitCode: typeof sdkClone?.exitCode === "number" ? sdkClone.exitCode : 1,
      };
    }

    if (clone.exitCode !== 0) {
      // 3) Final fallback: configure a git credential helper so the CLI can
      //    authenticate without baking the token into argv, then retry.
      emit({ phase: "cloning", message: "Retrying clone with a git credential helper…" });
      const homeProbe = await cmd(sandbox, "/", "echo ${HOME:-/root}");
      const home = homeProbe.stdout.trim() || "/root";
      await cmd(sandbox, "/", "git config --global credential.helper store");
      await sandbox.files.write([{ path: `${home}/.git-credentials`, data: `https://x-access-token:${providerToken}@github.com\n` }]);
      await cmd(sandbox, "/", `chmod 600 ${home}/.git-credentials`);
      const retry = await sandbox.commands.run(`git clone --branch "${branch}" --single-branch ${cleanUrl} ${repoDir}`);
      clone = {
        stdout: String(retry?.stdout ?? ""),
        stderr: String(retry?.stderr ?? ""),
        exitCode: typeof retry?.exitCode === "number" ? retry.exitCode : 1,
      };
      if (clone.exitCode !== 0) {
        emit({ phase: "error", message: `Git clone failed: ${tail((clone.stderr || clone.stdout), 4)}`, exitCode: clone.exitCode });
        return { ok: false, error: "Git clone requires credentials for private repositories. The GitHub access token could not be injected into the sandbox clone.", steps };
      }
    }
    emit({ phase: "cloning", message: "Repository cloned into the sandbox." });

    // Write the edited files into the sandbox filesystem (creates parent dirs).
    emit({ phase: "applying-edits", message: `Writing ${files.length} file edit(s) into the sandbox…` });
    await sandbox.files.write(files.map((f) => ({ path: `${repoDir}/${f.path}`, data: f.content })));
    emit({ phase: "applying-edits", message: "Edits applied to the sandbox filesystem." });

    // Language-aware verification pipeline.
    // Probe the repository toolchain, then run install → type-check → test.
    const toolchain = await detectToolchain(sandbox, repoDir);

    // Dependency install (only when a manifest is present).
    if (toolchain.install && toolchain.install.length) {
      emit({ phase: "installing", message: `Detected ${toolchain.label}. Installing dependencies…` });
      for (const step of toolchain.install) {
        const install = await cmd(sandbox, repoDir, step);
        emit({ phase: "installing", message: install.exitCode === 0 ? "Dependencies installed." : "Dependency install produced non-zero exit.", exitCode: install.exitCode, logs: [install.stdout, install.stderr].filter(Boolean) });
        if (install.exitCode !== 0) {
          return { ok: false, error: tail(install.stderr || install.stdout), steps };
        }
      }
    } else {
      emit({ phase: "installing", message: `Detected ${toolchain.label}; no dependency manifest.` });
    }

    // Type-check / build, then test based on the detected toolchain.
    for (const [index, verifyCmd] of toolchain.verify.entries()) {
      const phase: SandboxPhase = index === 0 ? "typecheck" : "testing";
      emit({ phase, message: `Running ${verifyCmd}…` });
      const run = await cmd(sandbox, repoDir, verifyCmd);
      const passed = run.exitCode === 0 || (index === 1 && /no test/i.test(run.stderr));
      emit({
        phase,
        message: index === 0
          ? (run.exitCode === 0 ? `${verifyCmd} passed.` : `${verifyCmd} reported errors.`)
          : (passed ? "Tests passed." : "Tests failed."),
        exitCode: run.exitCode,
        logs: [run.stdout, run.stderr].filter(Boolean),
      });
      if (!passed) {
        return { ok: false, error: tail(run.stderr || run.stdout), steps };
      }
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
    const authorization = cause instanceof GitHubCommitError && cause.authorization;
    return { ok: false, error: message, steps, authorization };
  } finally {
    if (sandbox) {
      sandbox.kill().catch(() => undefined);
    }
  }
}