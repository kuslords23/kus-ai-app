/**
 * Minimal GitHub commit API.
 *
 * POST /api/commit
 *   { repository: "owner/repo", branch: "main", message: "...", files: [{ path: "src/file.ts", content: "..." }] }
 *   Headers: { Authorization: "Bearer github_pat_..." }
 *
 * Uses the GitHub Git Data API directly — no SDK, no services, no dependencies.
 * Returns { sha, url } on success, or { error } on failure.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type CommitBody = {
  repository?: unknown;
  branch?: unknown;
  message?: unknown;
  files?: unknown;
};

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: "No GitHub token." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as CommitBody | null;
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  const repository = typeof body.repository === "string" && /^[\w.-]+\/[\w.-]+$/.test(body.repository) ? body.repository : null;
  const branch = typeof body.branch === "string" && body.branch.length > 0 ? body.branch : "main";
  const message = typeof body.message === "string" && body.message.trim().length > 0 ? body.message.trim() : null;
  const files: Array<{ path: string; content: string }> | null = Array.isArray(body.files) ? (body.files as Array<Record<string, unknown>>).filter(
    (f): f is { path: string; content: string } => f && typeof f === "object" && typeof f.path === "string" && typeof f.content === "string"
  ) : null;

  if (!repository) return NextResponse.json({ error: "Invalid repository (use owner/repo format)." }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Commit message is required." }, { status: 400 });
  if (!files || files.length === 0) return NextResponse.json({ error: "At least one file is required." }, { status: 400 });

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const api = `https://api.github.com/repos/${repository}`;

  try {
    // 1. Try to get the latest commit SHA on the branch
    let baseSha: string | undefined;
    let baseTree: string | undefined;

    const refRes = await fetch(`${api}/git/ref/heads/${encodeURIComponent(branch)}`, { headers });
    if (refRes.ok) {
      const ref = await refRes.json();
      baseSha = ref.object?.sha;
      if (baseSha) {
        // Get the tree SHA from the base commit
        const commitRes = await fetch(`${api}/git/commits/${baseSha}`, { headers });
        if (commitRes.ok) {
          const commitData = await commitRes.json();
          baseTree = commitData.tree?.sha;
        }
      }
    } else if (refRes.status !== 404) {
      const err = await refRes.json().catch(() => ({ message: "Branch check failed" }));
      return NextResponse.json({ error: err.message || `GitHub: ${refRes.status}` }, { status: refRes.status });
    }
    // If 404, branch doesn't exist — proceed without base (first commit)

    // 3. Create blobs for each file
    const entries: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];
    for (const file of files) {
      const blobRes = await fetch(`${api}/git/blobs`, {
        method: "POST",
        headers,
        body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
      });
      if (!blobRes.ok) {
        const err = await blobRes.json().catch(() => ({ message: "Blob creation failed" }));
        return NextResponse.json({ error: `Failed to create blob for ${file.path}: ${err.message}` }, { status: 500 });
      }
      const blob = await blobRes.json();
      entries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
    }

    // 4. Create a new tree (with or without base tree)
    const treeBody: Record<string, unknown> = { tree: entries };
    if (baseTree) treeBody.base_tree = baseTree;
    const treeRes = await fetch(`${api}/git/trees`, {
      method: "POST",
      headers,
      body: JSON.stringify(treeBody),
    });
    if (!treeRes.ok) {
      const err = await treeRes.json().catch(() => ({ message: "Tree creation failed" }));
      return NextResponse.json({ error: `Failed to create tree: ${err.message}` }, { status: 500 });
    }
    const tree = await treeRes.json();

    // 5. Create a commit (with or without parent)
    const commitPayload: { message: string; tree: string; parents?: string[] } = { message: message.slice(0, 200), tree: tree.sha };
    if (baseSha) commitPayload.parents = [baseSha];
    const createRes = await fetch(`${api}/git/commits`, {
      method: "POST",
      headers,
      body: JSON.stringify(commitPayload),
    });
    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({ message: "Commit creation failed" }));
      return NextResponse.json({ error: `Failed to create commit: ${err.message}` }, { status: 500 });
    }
    const commit = await createRes.json();

    // 6. Update the branch ref
    // Try PATCH first (existing branch), fall back to POST (new branch)
    const refPath = `heads/${encodeURIComponent(branch)}`;
    let refUpdated = false;
    let lastRefError = "";

    // Try PATCH with `ref` path (matching the GET endpoint)
    const patchUrl = `${api}/git/ref/${refPath}`;
    const patchRes = await fetch(patchUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ sha: commit.sha, force: true }),
    });
    if (patchRes.ok) {
      refUpdated = true;
    } else {
      const errBody = await patchRes.text().catch(() => "");
      lastRefError = `PATCH ${patchRes.status}: ${errBody.slice(0, 150)}`;

      // If PATCH returned 404, try POST to create the ref
      if (patchRes.status === 404) {
        const createRes = await fetch(`${api}/git/refs`, {
          method: "POST",
          headers,
          body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
        });
        if (createRes.ok) {
          refUpdated = true;
        } else if (createRes.status === 422) {
          // "Reference already exists" — concurrent creation, force PATCH retry
          const retryRes = await fetch(patchUrl, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ sha: commit.sha, force: true }),
          });
          if (retryRes.ok) {
            refUpdated = true;
          } else {
            const retryErr = await retryRes.text().catch(() => "");
            lastRefError = `PATCH retry ${retryRes.status}: ${retryErr.slice(0, 150)}`;
          }
        } else {
          const createErr = await createRes.text().catch(() => "");
          lastRefError = `POST ${createRes.status}: ${createErr.slice(0, 150)}`;
        }
      }
    }

    // Also try alternative URL format with `refs` in the path
    if (!refUpdated) {
      const altUrl = `${api}/git/refs/${refPath}`;
      const altRes = await fetch(altUrl, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ sha: commit.sha, force: true }),
      });
      if (altRes.ok) {
        refUpdated = true;
      } else {
        const altErr = await altRes.text().catch(() => "");
        lastRefError = `ALT ${altRes.status}: ${altErr.slice(0, 150)}`;
      }
    }

    if (!refUpdated) {
      return NextResponse.json({
        error: `Commit created (${commit.sha}) but branch update failed. Last error: ${lastRefError}`,
        partial: { sha: commit.sha },
      }, { status: 500 });
    }

    return NextResponse.json({
      sha: commit.sha,
      url: `https://github.com/${repository}/commit/${commit.sha}`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}