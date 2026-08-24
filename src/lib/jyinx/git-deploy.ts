import { pushToHost, type PushToHostResult } from "@/server/deploy/pushHost";

export interface GitDeployResult {
  success: boolean;
  commitSha?: string;
  message?: string;
  error?: string;
  filesChanged?: number;
  href?: string;
}

export function generateCommitMessage(changes: string[], context?: string): string {
  const prefix = "feat(jyinx):";
  const details = changes.length > 0 ? changes.slice(0, 5).join(", ") : "autonomous update";
  return prefix + " " + details + (context ? " -- " + context : "");
}

/**
 * Push an already-committed repo/branch to the configured dedicated host
 * platform(s). Runs on the Node server via the push-to-host service (HTTP
 * build hooks / Supabase-tracked deployments) — NOT a fragile `git` CLI /
 * `child_process` shell-out, which crashes in browsers and is unreliable on
 * serverless.
 *
 * Used as the "Push" half of pull → edit → commit → push.
 */
export async function deployViaCli(commitMessage: string): Promise<GitDeployResult> {
  // No shell-outs here. Kept for API compatibility; prefers a configured repo.
  const message = commitMessage || generateCommitMessage([], "deploy");
  try {
    const result = await pushToHost({
      repository: "",
      branch: "main",
      commitMessage: message,
    });
    if (!result.ok) return { success: false, error: result.error };
    return { success: true, commitSha: result.deployment?.commitSha ?? undefined, message, href: result.href };
  } catch (cause) {
    return { success: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}

export async function deploy(repository: string, commitMessage?: string): Promise<GitDeployResult> {
  const msg = commitMessage ?? generateCommitMessage([], "deploy");
  if (!repository) {
    return { success: false, error: "A repository is required to push to a host platform." };
  }
  try {
    const result = await pushToHost({
      repository,
      branch: "main",
      commitMessage: msg,
    });
    if (!result.ok) return { success: false, error: result.error };
    return { success: true, commitSha: result.deployment?.commitSha ?? undefined, message: msg, href: result.href };
  } catch (cause) {
    return { success: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}

export type { PushToHostResult };