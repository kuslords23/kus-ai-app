import { NextRequest, NextResponse } from "next/server";
import { commitFiles, writeFile, editFile, GitHubCommitError, type CommitChange } from "@/services/githubCommit";

export const runtime = "nodejs";

type CommitBody = {
  repository?: unknown;
  baseBranch?: unknown;
  branch?: unknown;
  message?: unknown;
  action?: unknown;
  path?: unknown;
  content?: unknown;
};

function getToken(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim();
}

function validRepository(repository: unknown): repository is string {
  return typeof repository === "string" && /^[\w.-]+\/[\w.-]+$/.test(repository);
}

function validBranch(branch: unknown): branch is string {
  return typeof branch === "string" && /^[\w./-]{1,160}$/.test(branch);
}

function validPath(path: unknown): path is string {
  return typeof path === "string" && path.length > 0 && path.length < 512 && !path.includes("..") && !path.startsWith("/");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: "Connect GitHub first." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as CommitBody | null;
  if (!body) return NextResponse.json({ error: "Invalid commit request." }, { status: 400 });

  const { repository, baseBranch, branch, message } = body;
  if (!validRepository(repository) || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Repository and a commit message are required." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "commit-files";

  try {
    switch (action) {
      case "create": {
        const path = body.path;
        const content = body.content;
        if (!validPath(path) || typeof content !== "string") {
          return NextResponse.json({ error: "Path and content are required." }, { status: 400 });
        }
        const result = await writeFile({
          repository,
          path,
          content,
          message,
          branch: validBranch(branch) ? branch : (validBranch(baseBranch) ? baseBranch : "main"),
          token,
        });
        return NextResponse.json({ action: "create", ...result });
      }

      case "edit": {
        const path = body.path;
        const content = body.content;
        if (!validPath(path) || typeof content !== "string") {
          return NextResponse.json({ error: "Path and content are required." }, { status: 400 });
        }
        const result = await editFile({
          repository,
          path,
          apply: () => content,
          message,
          branch: validBranch(branch) ? branch : (validBranch(baseBranch) ? baseBranch : "HEAD"),
          token,
        });
        return NextResponse.json({ action: "edit", ...result });
      }

      case "commit-files": {
        const files = Array.isArray(body.content) ? (body.content as CommitChange[]) : null;
        if (!files || files.length === 0) {
          return NextResponse.json({ error: "files[] must be provided for a multi-file commit." }, { status: 400 });
        }
        const result = await commitFiles({
          repository,
          baseBranch: validBranch(baseBranch) ? baseBranch : "HEAD",
          branch: validBranch(branch) ? branch : undefined,
          message,
          files,
          token,
        });
        return NextResponse.json({ action: "commit-files", ...result });
      }

      default:
        return NextResponse.json({ error: "Unsupported commit action." }, { status: 400 });
    }
  } catch (cause) {
    if (cause instanceof GitHubCommitError) {
      const status = cause.status >= 400 && cause.status < 600 ? cause.status : 500;
      return NextResponse.json({ error: cause.message }, { status });
    }
    return NextResponse.json({ error: "GitHub commit failed." }, { status: 500 });
  }
}