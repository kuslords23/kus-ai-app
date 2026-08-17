import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_VERSION = "2022-11-28";
const MAX_FILE_SIZE = 750_000;

type WorkspaceRequest = {
  repository?: unknown;
  baseBranch?: unknown;
  path?: unknown;
  content?: unknown;
  message?: unknown;
  branchName?: unknown;
  pullRequestTitle?: unknown;
  pullRequestBody?: unknown;
};

function githubHeaders(request: NextRequest): HeadersInit | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return {
    Authorization: authorization,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": API_VERSION,
  };
}

function validRepository(value: unknown): value is string {
  return typeof value === "string" && /^[\w.-]+\/[\w.-]+$/.test(value);
}

function validPath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length < 512 && !value.includes("..") && !value.startsWith("/");
}

async function githubJson<T>(url: string, headers: HeadersInit, init?: RequestInit): Promise<{ response: Response; data: T | null }> {
  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  const data = (await response.json().catch(() => null)) as T | null;
  return { response, data };
}

// File extensions considered source/code that Jyinx should index into context.
const CODE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "css", "scss", "sass", "less",
  "html", "htm", "md", "mdx", "py", "rs", "go", "rb", "php", "java", "kt", "swift",
  "vue", "svelte", "graphql", "sql", "yml", "yaml", "sh", "prisma",
]);
// Directories whose files are highly relevant for UI/component edits.
const PRIORITY_DIRS = [
  "components/", "app/", "views/", "pages/", "src/", "screens/", "ui/",
  "features/", "widgets/", "layouts/", "containers/",
];
const MAX_CONTEXT_FILES = 18;
const MAX_CONTEXT_BYTES = 600_000;

function contextPriority(path: string): number {
  const lower = path.toLowerCase();
  let score = 0;
  if (PRIORITY_DIRS.some((d) => lower.startsWith(d))) score += 20;
  const segments = lower.split("/");
  for (const seg of segments) {
    if (seg === "components" || seg === "views" || seg === "pages" || seg === "screens") score += 5;
  }
  if (segments.length <= 2) score += 2; // shallow files are cheap & relevant
  const base = lower.split("/").pop() ?? "";
  if (base === "app" || base === "app.") score += 3;
  return score;
}

function isCodePath(path: string): boolean {
  const name = (path.split("/").pop() ?? "").toLowerCase();
  if (!name.includes(".")) return false;
  const ext = name.split(".").pop() ?? "";
  return CODE_EXTENSIONS.has(ext);
}

async function fetchRawFile(
  repository: string,
  path: string,
  branch: string,
  headers: HeadersInit
): Promise<{ path: string; content: string } | null> {
  const url = `https://api.github.com/repos/${repository}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const { response, data } = await githubJson<{ type?: string; path?: string; content?: string; encoding?: string; size?: number }>(url, headers);
  if (!response.ok || data?.type !== "file" || data.encoding !== "base64" || !data.content) return null;
  return { path: data.path ?? path, content: Buffer.from(data.content, "base64").toString("utf8") };
}

/**
 * Recursively index the project file tree for Jyinx context. Uses the Git
 * Trees API (`recursive=1`) so files inside components/, app/, views/, etc. are
 * discovered — not just root configuration files. Results are ranked by
 * relevance (component/service directories first), optionally filtered to paths
 * matching `q`, and bounded by file count + total bytes.
 */
async function loadContextFiles(
  repository: string,
  branch: string,
  headers: HeadersInit,
  query?: string | null
): Promise<Array<{ path: string; content: string }>> {
  const treeUrl = `https://api.github.com/repos/${repository}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const { response, data } = await githubJson<{ tree?: Array<{ path?: string; type?: string; size?: number }>; truncated?: boolean }>(treeUrl, headers);
  if (!response.ok || !data?.tree) return [];

  const needle = query?.trim().toLowerCase();
  const matches = data.tree
    .filter((node) => typeof node.path === "string" && node.type === "blob" && isCodePath(node.path))
    .map((node) => ({ path: node.path as string, size: typeof node.size === "number" ? node.size : 0 }))
    // Skip lockfiles/binaries/coverage noise and vendored deps for context.
    .filter((entry) => {
      const lower = entry.path.toLowerCase();
      if (lower.includes("/node_modules/") || lower.includes("/dist/") || lower.includes("/build/")) return false;
      if (lower.endsWith("package-lock.json") || lower.endsWith("yarn.lock") || lower.endsWith("pnpm-lock.yaml") || lower.endsWith("go.sum")) return false;
      return true;
    });

  const scored = matches
    .map((entry) => ({ entry, priority: contextPriority(entry.path) }))
    .sort((a, b) => {
      // Search keyword takes precedence when present.
      if (needle) {
        const aHit = a.entry.path.toLowerCase().includes(needle) ? 1 : 0;
        const bHit = b.entry.path.toLowerCase().includes(needle) ? 1 : 0;
        if (aHit !== bHit) return bHit - aHit;
      }
      return b.priority - a.priority || b.entry.size - a.entry.size;
    });

  const files: Array<{ path: string; content: string }> = [];
  let totalBytes = 0;
  for (const { entry } of scored) {
    if (files.length >= MAX_CONTEXT_FILES) break;
    if (entry.size > 200_000) continue; // keep context lean
    const fetched = await fetchRawFile(repository, entry.path, branch, headers);
    if (fetched) {
      files.push(fetched);
      totalBytes += typeof entry.size === "number" ? entry.size : Buffer.byteLength(fetched.content);
      if (totalBytes >= MAX_CONTEXT_BYTES) break;
    }
  }
  return files;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const headers = githubHeaders(request);
  if (!headers) return NextResponse.json({ error: "Connect GitHub first." }, { status: 401 });

  const repository = request.nextUrl.searchParams.get("repository");
  const branch = request.nextUrl.searchParams.get("branch") || "HEAD";
  const path = request.nextUrl.searchParams.get("path");
  const wantsContext = request.nextUrl.searchParams.get("context") === "1";
  if (!validRepository(repository)) return NextResponse.json({ error: "Invalid repository." }, { status: 400 });

  const baseUrl = `https://api.github.com/repos/${repository}/contents`;
  const url = path && validPath(path) ? `${baseUrl}/${path}?ref=${encodeURIComponent(branch)}` : `${baseUrl}?ref=${encodeURIComponent(branch)}`;
  const { response, data } = await githubJson<unknown>(url, headers);
  if (!response.ok) return NextResponse.json({ error: response.status === 404 ? "File or directory not found." : "GitHub could not load this workspace." }, { status: response.status });

  if (Array.isArray(data)) {
    const entries = data
      .filter((entry): entry is { name: string; path: string; type: "file" | "dir"; size?: number } => Boolean(entry && typeof entry === "object"))
      .map((entry) => ({ name: entry.name, path: entry.path, type: entry.type, size: entry.size ?? 0 }))
      .filter((entry) => entry.type === "file" || entry.type === "dir");
    if (wantsContext) {
      const files = await loadContextFiles(repository, branch, headers, request.nextUrl.searchParams.get("q"));
      return NextResponse.json({ type: "context", entries, files });
    }
    return NextResponse.json({ type: "directory", entries });
  }

  const file = data as { type?: string; path?: string; name?: string; content?: string; encoding?: string; sha?: string; size?: number } | null;
  if (!file || file.type !== "file" || !file.content || file.encoding !== "base64") return NextResponse.json({ error: "This item cannot be opened as a text file." }, { status: 415 });
  if ((file.size ?? 0) > MAX_FILE_SIZE) return NextResponse.json({ error: "This file is too large to open in Jyinx." }, { status: 413 });

  return NextResponse.json({
    type: "file",
    file: { path: file.path, name: file.name, sha: file.sha, content: Buffer.from(file.content, "base64").toString("utf8") },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const headers = githubHeaders(request);
  if (!headers) return NextResponse.json({ error: "Connect GitHub first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as WorkspaceRequest | null;
  if (!body) return NextResponse.json({ error: "Invalid workspace change." }, { status: 400 });
  const repository = body.repository;
  const baseBranch = body?.baseBranch;
  const path = body?.path;
  const content = body?.content;
  const message = body?.message;
  const branchName = body?.branchName;
  if (!validRepository(repository) || typeof baseBranch !== "string" || !validPath(path) || typeof content !== "string" || typeof message !== "string" || typeof branchName !== "string") {
    return NextResponse.json({ error: "Invalid workspace change." }, { status: 400 });
  }
  if (content.length > MAX_FILE_SIZE || !/^[a-zA-Z0-9][\w./-]{2,100}$/.test(branchName)) {
    return NextResponse.json({ error: "The file content or branch name is invalid." }, { status: 400 });
  }

  const repoUrl = `https://api.github.com/repos/${repository}`;
  const baseRef = await githubJson<{ object?: { sha?: string } }>(`${repoUrl}/git/ref/heads/${encodeURIComponent(baseBranch)}`, headers);
  const baseSha = baseRef.data?.object?.sha;
  if (!baseRef.response.ok || !baseSha) return NextResponse.json({ error: "Could not resolve the base branch." }, { status: 409 });

  const existingRef = await fetch(`${repoUrl}/git/ref/heads/${encodeURIComponent(branchName)}`, { headers, cache: "no-store" });
  if (existingRef.status === 404) {
    const createRef = await fetch(`${repoUrl}/git/refs`, { method: "POST", headers, body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }) });
    // A concurrent Jyinx run may have created the ref first (422
    // "Reference already exists") — that is fine; continue writing to it.
    if (!createRef.ok && createRef.status !== 422) return NextResponse.json({ error: "Could not create a review branch." }, { status: 502 });
  } else if (!existingRef.ok) {
    return NextResponse.json({ error: "Could not access the review branch." }, { status: 502 });
  }

  const current = await githubJson<{ sha?: string }>(`${repoUrl}/contents/${path}?ref=${encodeURIComponent(branchName)}`, headers);
  const putBody: { message: string; content: string; branch: string; sha?: string } = { message: message.slice(0, 200), content: Buffer.from(content, "utf8").toString("base64"), branch: branchName };
  if (current.response.ok && current.data?.sha) putBody.sha = current.data.sha;
  else if (current.response.status !== 404) return NextResponse.json({ error: "Could not prepare this file for saving." }, { status: 502 });

  const saved = await fetch(`${repoUrl}/contents/${path}`, { method: "PUT", headers, body: JSON.stringify(putBody) });
  if (!saved.ok) return NextResponse.json({ error: "GitHub could not save this change." }, { status: saved.status });

  const title = typeof body.pullRequestTitle === "string" && body.pullRequestTitle.trim() ? body.pullRequestTitle.trim().slice(0, 200) : message.slice(0, 200);
  const pr = await githubJson<{ html_url?: string; number?: number }>(`${repoUrl}/pulls`, headers, { method: "POST", body: JSON.stringify({ title, head: branchName, base: baseBranch, body: typeof body.pullRequestBody === "string" ? body.pullRequestBody.slice(0, 10_000) : "Created from Jyinx workspace." }) });
  if (pr.response.status === 422) return NextResponse.json({ branch: branchName, saved: true, pullRequest: null, message: "Change saved to the review branch. A pull request may already exist." });
  if (!pr.response.ok) return NextResponse.json({ error: "Change saved, but Jyinx could not create a pull request." }, { status: 502 });
  return NextResponse.json({ branch: branchName, saved: true, pullRequest: { number: pr.data?.number, url: pr.data?.html_url } });
}
