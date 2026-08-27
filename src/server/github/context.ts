/**
 * Server-side recursive repository context loader.
 *
 * Used by /api/github/workspace and /api/jyinx/agent so Jyinx can index the
 * whole project file tree (src/, components/, app/, views/, ...) — not just
 * top-level config files — to locate the UI/component files a request refers
 * to. Runs with the user's GitHub OAuth token, so private repos work.
 */

const API_VERSION = "2022-11-28";

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
const MAX_FILE_BYTES = 200_000;

export type ContextFile = { path: string; content: string };

export function githubApiHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": API_VERSION,
  };
}

export function validRepositoryName(value: unknown): value is string {
  return typeof value === "string" && /^[\w.-]+\/[\w.-]+$/.test(value);
}

async function githubJson<T>(url: string, headers: Record<string, string>): Promise<{ ok: boolean; data: T | null }> {
  const response = await fetch(url, { headers, cache: "no-store" });
  const data = (await response.json().catch(() => null)) as T | null;
  return { ok: response.ok, data };
}

function contextPriority(path: string): number {
  const lower = path.toLowerCase();
  let score = 0;
  if (PRIORITY_DIRS.some((d) => lower.startsWith(d))) score += 20;
  const segments = lower.split("/");
  for (const seg of segments) {
    if (seg === "components" || seg === "views" || seg === "pages" || seg === "screens") score += 5;
  }
  if (segments.length <= 2) score += 2;
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
  headers: Record<string, string>
): Promise<ContextFile | null> {
  const url = `https://api.github.com/repos/${repository}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const { ok, data } = await githubJson<{ type?: string; path?: string; content?: string; encoding?: string }>(url, headers);
  if (!ok || data?.type !== "file" || data.encoding !== "base64" || !data.content) return null;
  return { path: data.path ?? path, content: Buffer.from(data.content, "base64").toString("utf8") };
}

/**
 * Recursively index a repository's file tree for Jyinx. Uses the Git Trees API
 * (`recursive=1`) so files in components/, app/, views/, src/ etc. are found.
 * Files are ranked by component-directory relevance (optionally filtered to
 * keywords via `query`) and bounded by file count + total bytes, so context is
 * lean and targeted instead of dumping the whole repo.
 */
export async function loadRepositoryContextFiles(
  repository: string,
  branch: string,
  token: string,
  query?: string | null
): Promise<ContextFile[]> {
  if (!validRepositoryName(repository) || !token) return [];
  const headers = githubApiHeaders(token);
  const treeUrl = `https://api.github.com/repos/${repository}/git/trees/${encodeURIComponent(branch || "HEAD")}?recursive=1`;
  const { ok, data } = await githubJson<{ tree?: Array<{ path?: string; type?: string; size?: number }>; truncated?: boolean }>(treeUrl, headers);
  if (!ok || !data?.tree) return [];

  const needle = query?.trim().toLowerCase();
  const matches = data.tree
    .filter((node) => typeof node.path === "string" && node.type === "blob" && isCodePath(node.path))
    .map((node) => ({ path: node.path as string, size: typeof node.size === "number" ? node.size : 0 }))
    .filter((entry) => {
      const lower = entry.path.toLowerCase();
      if (lower.includes("/node_modules/") || lower.includes("/dist/") || lower.includes("/build/")) return false;
      if (lower.endsWith("package-lock.json") || lower.endsWith("yarn.lock") || lower.endsWith("pnpm-lock.yaml") || lower.endsWith("go.sum")) return false;
      return true;
    });

  const scored = [...matches]
    .map((entry) => ({ entry, priority: contextPriority(entry.path) }))
    .sort((a, b) => {
      if (needle) {
        const aHit = a.entry.path.toLowerCase().includes(needle) ? 1 : 0;
        const bHit = b.entry.path.toLowerCase().includes(needle) ? 1 : 0;
        if (aHit !== bHit) return bHit - aHit;
      }
      return b.priority - a.priority || b.entry.size - a.entry.size;
    });

  const files: ContextFile[] = [];
  let totalBytes = 0;
  for (const { entry } of scored) {
    if (files.length >= MAX_CONTEXT_FILES) break;
    if (entry.size > MAX_FILE_BYTES) continue;
    const fetched = await fetchRawFile(repository, entry.path, branch || "HEAD", headers);
    if (fetched) {
      files.push(fetched);
      totalBytes += entry.size || Buffer.byteLength(fetched.content);
      if (totalBytes >= MAX_CONTEXT_BYTES) break;
    }
  }
  return files;
}

export function formatContextFiles(files: ContextFile[]): string {
  return files.map((file) => `### ${file.path}\n${file.content}`).join("\n\n");
}