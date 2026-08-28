import { createClient } from "@/lib/supabase/server";

const API_VERSION = "2022-11-28";
const MAX_FILE_SIZE = 1_000_000;

export type CommitChange = {
  /** Repository path, e.g. "app/page.tsx". */
  path: string;
  /** Full UTF-8 content to write. */
  content: string;
};

export type CommitResult = {
  repository: string;
  branch: string;
  commitSha: string;
  commitUrl: string;
  files: string[];
};

export class GitHubCommitError extends Error {
  readonly status: number;
  /** true when the failure is a missing/expired/invalid token or missing `repo` scope. */
  readonly authorization: boolean;
  constructor(status: number, message: string, authorization = false) {
    super(message);
    this.status = status;
    this.authorization = authorization;
  }
}

const SCOPE_UNAUTHORIZED_MARKERS = [
  "must have push access",
  "not authorized",
  "not allowed",
  "missing the `repo` scope",
  "scope",
  "read-only",
  "archived so is read-only",
  "required authentication",
  "bad credentials",
  "not found",
];

function classifyCommitError(status: number, message: string): GitHubCommitError {
  const lowered = message.toLowerCase();
  const authorization =
    status === 401 ||
    status === 403 ||
    status === 404 ||
    SCOPE_UNAUTHORIZED_MARKERS.some((marker) => lowered.includes(marker));
  return new GitHubCommitError(status, message, authorization);
}

/** Throws GitHubCommitError marked `.authorization` when token/scope is the issue. */
function assertScopeAllowed(response: Response, data: unknown): void {
  if (response.ok) return;
  const message = extractMessage(data, "GitHub could not complete the request.");
  throw classifyCommitError(response.status, message);
}

/** Retrieves the active session's `provider_token` from Supabase (server
 *  cookies — this module is server-only and runs in Route Handlers). */
async function getProviderToken(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new GitHubCommitError(401, error.message, true);
  const token = data.session?.provider_token;
  if (!token) {
    throw new GitHubCommitError(401, "Connect GitHub first.", true);
  }
  return token;
}

function headersFor(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": API_VERSION,
  };
}

function validatePath(path: string): void {
  if (!path || path.length > 512 || path.includes("..") || path.startsWith("/")) {
    throw new GitHubCommitError(400, `Invalid file path: ${path}`);
  }
}

function validateContent(content: string): void {
  if (content.length > MAX_FILE_SIZE) {
    throw new GitHubCommitError(413, "File content exceeds the 1 MB limit.");
  }
}

function validateCommitMessage(message: string): void {
  if (typeof message !== "string" || !message.trim()) {
    throw new GitHubCommitError(400, "A commit message is required.");
  }
}

function validateFiles(files: CommitChange[]): void {
  if (!Array.isArray(files) || files.length === 0) {
    throw new GitHubCommitError(400, "At least one file is required.");
  }
  if (files.length > 50) {
    throw new GitHubCommitError(400, "Too many files in a single commit.");
  }
  const seen = new Set<string>();
  for (const file of files) {
    validatePath(file.path);
    validateContent(file.content);
    if (seen.has(file.path)) {
      throw new GitHubCommitError(400, `Duplicate file path: ${file.path}`);
    }
    seen.add(file.path);
  }
}

type GitHubErrorBody = { message?: string };

function extractMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as GitHubErrorBody).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function json<T>(url: string, headers: HeadersInit, init?: RequestInit): Promise<{ response: Response; data: T | null }> {
  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  const data = (await response.json().catch(() => null)) as T | null;
  return { response, data };
}

export type GitHubScopeStatus =
  | { ok: true; scopes: string[]; login: string }
  | { ok: false; error: string; status: number };

/**
 * Validates a GitHub token and confirms it carries the `repo` scope required to
 * write and commit. Uses the `/user` endpoint's `X-OAuth-Scopes` response
 * header (works for fine-grained PATs too — those respond with a verified
 * `X-OAuth-Scopes` header when created with repo access).
 */
export async function checkGitHubScope(token: string): Promise<GitHubScopeStatus> {
  if (!token) return { ok: false, error: "Connect GitHub first.", status: 401 };
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
      },
      cache: "no-store",
    });
    const scopesHeader = response.headers.get("x-oauth-scopes") ?? "";
    const scopes = scopesHeader.split(",").map((scope) => scope.trim()).filter(Boolean);
    const login = ((await response.json().catch(() => null)) as { login?: string } | null)?.login ?? "";
    if (!response.ok) {
      return { ok: false, error: response.status === 401 ? "GitHub connection expired. Reconnect GitHub." : `GitHub rejected this token (${response.status}).`, status: response.status };
    }
    return { ok: true, scopes, login };
  } catch {
    return { ok: false, error: "Could not reach GitHub to verify this token.", status: 502 };
  }
}

/**
 * Creates or updates a single file via the GitHub Contents API.
 * When `sha` is provided the existing file is edited; otherwise a new file is created.
 */
export async function writeFile(opts: {
  repository: string;
  path: string;
  content: string;
  message: string;
  branch: string;
  sha?: string;
  token?: string;
}): Promise<{ commitSha: string; commitUrl: string; path: string }> {
  const token = opts.token ?? (await getProviderToken());
  validatePath(opts.path);
  validateContent(opts.content);
  validateCommitMessage(opts.message);
  const headers = headersFor(token);

  const url = `https://api.github.com/repos/${opts.repository}/contents/${opts.path}`;
  const body: Record<string, unknown> = {
    message: opts.message.trim().slice(0, 200),
    content: Buffer.from(opts.content, "utf8").toString("base64"),
    branch: opts.branch,
  };
  if (opts.sha) body.sha = opts.sha;

  const { response, data } = await json<{ content?: { sha?: string; path?: string }; commit?: { html_url?: string } }>(url, headers, { method: "PUT", body: JSON.stringify(body) });
  if (!response.ok) {
    throw classifyCommitError(response.status, extractMessage(data, "GitHub could not save this file."));
  }
  return {
    commitSha: data?.content?.sha ?? "",
    commitUrl: data?.commit?.html_url ?? "",
    path: data?.content?.path ?? opts.path,
  };
}

/** Fetches the current content and SHA of a file from the Contents API. */
export async function readFile(opts: {
  repository: string;
  path: string;
  branch?: string;
  token?: string;
}): Promise<{ content: string; sha: string }> {
  const token = opts.token ?? (await getProviderToken());
  validatePath(opts.path);
  const ref = opts.branch ? `?ref=${encodeURIComponent(opts.branch)}` : "";
  const { response, data } = await json<{ content?: string; sha?: string; encoding?: string }>(
    `https://api.github.com/repos/${opts.repository}/contents/${opts.path}${ref}`,
    headersFor(token)
  );
  if (!response.ok) {
    throw classifyCommitError(response.status, extractMessage(data, "GitHub could not read this file."));
  }
  if (!data?.content || data.encoding !== "base64" || !data.sha) {
    throw new GitHubCommitError(415, "This file cannot be read as text.");
  }
  return { content: Buffer.from(data.content, "base64").toString("utf8"), sha: data.sha };
}

/**
 * Loads a file, applies an edit function, and commits it back to the same branch as a single edit.
 */
export async function editFile(opts: {
  repository: string;
  path: string;
  apply: (current: string) => string;
  message: string;
  branch: string;
  token?: string;
}): Promise<{ content: string; sha: string; commitUrl: string }> {
  const token = opts.token ?? (await getProviderToken());
  const { content, sha } = await readFile({
    repository: opts.repository,
    path: opts.path,
    branch: opts.branch,
    token,
  });
  const next = opts.apply(content);
  const written = await writeFile({
    repository: opts.repository,
    path: opts.path,
    content: next,
    message: opts.message,
    branch: opts.branch,
    sha,
    token,
  });
  return { content: next, sha: written.commitSha, commitUrl: written.commitUrl };
}

/**
 * Atomic multi-file commit via the Git Data API:
 * 1. Resolve the tip SHA of the target branch (and its tree) to use as `base_tree`.
 * 2. Create a blob for every changed file.
 * 3. POST a new tree with the base current tree and the changed entries (GitHub
 *    merges these into the correct nested paths preserving untouched files).
 * 4. Create a commit pointing at the new tree with the old tip as parent.
 * 5. Create the target branch (new) or fast-forward it (existing).
 *
 * Returns once all operations succeed; a failed step never partially commits.
 */
export async function commitFiles(opts: {
  repository: string;
  baseBranch: string;
  /** When provided the commit is written to this branch (created if missing). */
  branch?: string;
  message: string;
  files: CommitChange[];
  token?: string;
}): Promise<CommitResult> {
  const token = opts.token ?? (await getProviderToken());
  validateFiles(opts.files);
  validateCommitMessage(opts.message);
  const headers = headersFor(token);
  const repoUrl = `https://api.github.com/repos/${opts.repository}`;
  const targetBranch = opts.branch || opts.baseBranch;

  let baseSha: string | undefined;
  let baseTree: string | undefined;

  const refResponse = await fetch(`${repoUrl}/git/ref/heads/${encodeURIComponent(targetBranch)}`, { headers, cache: "no-store" });
  if (refResponse.ok) {
    const ref = (await refResponse.json()) as { object?: { sha?: string } };
    baseSha = ref.object?.sha;
  } else if (refResponse.status !== 404) {
    throw classifyCommitError(refResponse.status, "Could not resolve the target branch.");
  }

  if (baseSha) {
    const commitResponse = await fetch(`${repoUrl}/git/commits/${baseSha}`, { headers, cache: "no-store" });
    if (commitResponse.ok) {
      const commit = (await commitResponse.json()) as { tree?: { sha?: string } };
      baseTree = commit.tree?.sha;
    }
  }

  const entries: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];
  for (const file of opts.files) {
    const { response: blobResponse, data: blob } = await json<{ sha?: string }>(`${repoUrl}/git/blobs`, headers, {
      method: "POST",
      body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
    });
    if (!blobResponse.ok || !blob?.sha) {
      throw classifyCommitError(blobResponse.status, `Could not stage ${file.path}.`);
    }
    entries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const treeBody: { base_tree?: string; tree: typeof entries } = { tree: entries };
  if (baseTree) treeBody.base_tree = baseTree;

  const { response: treeResponse, data: tree } = await json<{ sha?: string }>(`${repoUrl}/git/trees`, headers, {
    method: "POST",
    body: JSON.stringify(treeBody),
  });
  if (!treeResponse.ok || !tree?.sha) {
    throw classifyCommitError(treeResponse.status, "Could not build the commit tree.");
  }

  const commitBody: { message: string; tree: string; parents?: string[] } = { message: opts.message.trim().slice(0, 200), tree: tree.sha };
  if (baseSha) commitBody.parents = [baseSha];

  const { response: commitResponse, data: commit } = await json<{ sha?: string }>(`${repoUrl}/git/commits`, headers, {
    method: "POST",
    body: JSON.stringify(commitBody),
  });
  if (!commitResponse.ok || !commit?.sha) {
    throw classifyCommitError(commitResponse.status, "Could not create the commit.");
  }
  const commitSha = commit.sha;

  const branchRef = `heads/${targetBranch}`;
  const refPayload = { sha: commitSha } as const;
  const patchRef = (force: boolean) =>
    json<{ object?: { sha?: string } }>(`${repoUrl}/git/ref/${branchRef}`, headers, {
      method: "PATCH",
      body: JSON.stringify({ ...refPayload, force }),
    });
  const createRef = () =>
    json<{ object?: { sha?: string } }>(`${repoUrl}/git/refs`, headers, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${targetBranch}`, sha: commitSha }),
    });

  // Resolve the target reference idempotently:
  //  - branch exists  → fast-forward PATCH; if the existing ref is not a
  //    direct ancestor, retry the same PATCH with `force: true` so Jyinx
  //    switches the existing review branch to the new commit instead of
  //    failing with "Reference already exists" / non-fast-forward.
  //  - branch missing  → POST to create it; if a concurrent process created
  //    the ref first (422), fall back to the PATCH path above.
  let updateResponse: Awaited<ReturnType<typeof patchRef>>;
  try {
    if ((refResponse.ok || baseSha) && refResponse.status !== 404) {
      updateResponse = await patchRef(false);
      if (!updateResponse.response.ok && (updateResponse.response.status === 422 || updateResponse.response.status === 409)) {
        updateResponse = await patchRef(true);
      }
    } else {
      updateResponse = await createRef();
      if (!updateResponse.response.ok && updateResponse.response.status === 422) {
        // The branch appeared between our check and the create — update it.
        updateResponse = await patchRef(false);
        if (!updateResponse.response.ok && (updateResponse.response.status === 422 || updateResponse.response.status === 409)) {
          updateResponse = await patchRef(true);
        }
      }
    }
  } catch {
    throw new GitHubCommitError(500, "The commit was created but the branch could not be updated.");
  }
  if (!updateResponse.response.ok) {
    const message = extractMessage(updateResponse.data, "The commit was created but the branch could not be updated.");
    throw classifyCommitError(updateResponse.response.status, message);
  }

  return {
    repository: opts.repository,
    branch: targetBranch,
    commitSha,
    commitUrl: `https://github.com/${opts.repository}/commit/${commitSha}`,
    files: opts.files.map((file) => file.path),
  };
}