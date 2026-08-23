export interface GitDeployResult {
  success: boolean;
  commitSha?: string;
  message?: string;
  error?: string;
  filesChanged?: number;
}

export function generateCommitMessage(changes: string[], context?: string): string {
  const prefix = "feat(jyinx):";
  const details = changes.length > 0 ? changes.slice(0, 5).join(", ") : "autonomous update";
  return prefix + " " + details + (context ? " -- " + context : "");
}

export async function deployViaCli(commitMessage: string): Promise<GitDeployResult> {
  try {
    const { execSync } = await import("child_process") as typeof import("child_process");
    execSync("git add .", { stdio: "pipe", encoding: "utf-8" });
    const sha = execSync("git rev-parse HEAD", { encoding: "utf-8" }).toString().trim();
    execSync("git commit -m " + JSON.stringify(commitMessage), { stdio: "pipe", encoding: "utf-8" });
    execSync("git push origin main 2>&1", { encoding: "utf-8" });
    return { success: true, commitSha: sha, message: commitMessage };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deploy(repository: string, commitMessage?: string): Promise<GitDeployResult> {
  const msg = commitMessage ?? generateCommitMessage([], "deploy");
  return deployViaCli(msg);
}