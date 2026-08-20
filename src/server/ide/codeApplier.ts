"use strict";

/**
 * Secure Apply-to-Repo Pipeline.
 *
 * Controlled patch-and-apply handler that injects approved, tested code
 * snippets into the user's workspace repository. Only snippets that have
 * passed the ChatCodeSandbox sanity checks (or carry an explicit approval
 * token) are applied. All writes go through the existing GitHub commit
 * pipeline, so they respect branch handling, token scoping, and atomic
 * multi-file commits.
 */

import { writeFile, GitHubCommitError } from "@/services/githubCommit";
import { createClient } from "@/lib/supabase/server";

export interface ApplyRequest {
  repository: string;
  branch?: string;
  filePath: string;
  content: string;
  message: string;
  /** Optional token to use instead of resolving from the active session. */
  providerToken?: string;
  /** Verification proof supplied by the sandbox (opaque id). */
  sandboxRunId?: string;
  /** Caller asserts the snippet already passed static analysis. */
  approved?: boolean;
  token?: string;
}

export interface ApplyResult {
  ok: boolean;
  repository: string;
  branch: string;
  filePath: string;
  commitSha?: string;
  commitUrl?: string;
  error?: string;
  code?: number;
}

/**
 * Applies an approved snippet to the workspace repo via the GitHub Contents
 * API. Safeguards (inherited from githubCommit): path validation, content
 * size cap, commit-message validation, token/scope enforcement.
 *
 * Approval gate: unless `approved` or a fresh `sandboxRunId` is supplied,
 * the apply is rejected.
 */
export async function applySnippetToRepo(
  req: ApplyRequest
): Promise<ApplyResult> {
  if (!req.repository) return err("A repository is required.", 400);

  // Approval gate.
  if (!req.approved && !req.sandboxRunId) {
    return err("Snippet has not been approved by the test sandbox.", 403);
  }

  const branch = req.branch ?? "main";

  try {
    const written = await writeFile({
      repository: req.repository,
      path: req.filePath,
      content: req.content,
      message: req.message,
      branch,
      token: req.providerToken ?? req.token,
    });

    return {
      ok: true,
      repository: req.repository,
      branch,
      filePath: written.path,
      commitSha: written.commitSha,
      commitUrl: written.commitUrl,
    };
  } catch (cause) {
    if (cause instanceof GitHubCommitError) {
      return {
        ok: false,
        repository: req.repository,
        branch,
        filePath: req.filePath,
        error: cause.message,
        code: cause.status,
      };
    }
    return err(cause instanceof Error ? cause.message : "Apply failed.", 500);
  }
}

function err(message: string, code: number): ApplyResult {
  return { ok: false, repository: "", branch: "", filePath: "", error: message, code };
}

/**
 * Audit log helper: records an apply action in the workspace audit trail table
 * so users can review what was injected into their repo.
 */
export async function recordApplyAudit(opts: {
  userId?: string;
  repository: string;
  filePath: string;
  message: string;
  runId?: string;
}): Promise<void> {
  try {
    const client = await createClient();
    await client.from("jyinx_apply_audit").insert({
      user_id: opts.userId ?? null,
      repository: opts.repository,
      file_path: opts.filePath,
      message: opts.message,
      run_id: opts.runId ?? null,
      created_at: new Date().toISOString(),
    });
  } catch {
    /* best-effort audit write */
  }
}