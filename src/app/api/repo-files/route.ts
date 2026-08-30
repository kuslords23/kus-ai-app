/**
 * Fetch files from any GitHub repository the user has access to.
 *
 * GET /api/repo-files?repo=owner/name&path=src/&q=search+term
 *
 * Returns the file tree and/or file contents from the repo.
 * Uses the user's PAT from the Authorization header.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 500_000;
const MAX_FILES = 15;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: "No GitHub token." }, { status: 401 });

  const repo = request.nextUrl.searchParams.get("repo");
  const path = request.nextUrl.searchParams.get("path") || "";
  const q = request.nextUrl.searchParams.get("q") || "";
  const branch = request.nextUrl.searchParams.get("branch") || "main";

  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return NextResponse.json({ error: "Invalid repo format (use owner/name)." }, { status: 400 });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const api = `https://api.github.com/repos/${repo}`;

  try {
    // If a search query is provided, search the repo for relevant files
    if (q) {
      const searchRes = await fetch(
        `https://api.github.com/search/code?q=${encodeURIComponent(q)}+repo:${encodeURIComponent(repo)}&per_page=${MAX_FILES}`,
        { headers: { ...headers, Accept: "application/vnd.github.text-match+json" } }
      );
      if (!searchRes.ok) {
        const err = await searchRes.json().catch(() => ({ message: "Search failed" }));
        return NextResponse.json({ error: err.message || `GitHub: ${searchRes.status}` }, { status: searchRes.status });
      }
      const searchData = await searchRes.json() as { items?: Array<{ path: string; name: string; html_url: string }> };
      const items = (searchData.items || []).slice(0, MAX_FILES);
      // Fetch content for each found file
      const files: Array<{ path: string; content: string | null }> = [];
      for (const item of items) {
        try {
          const contentRes = await fetch(`${api}/contents/${item.path}?ref=${encodeURIComponent(branch)}`, { headers });
          if (contentRes.ok) {
            const data = await contentRes.json() as { content?: string; encoding?: string; size?: number };
            if (data.content && data.encoding === "base64" && (data.size || 0) < MAX_FILE_SIZE) {
              files.push({ path: item.path, content: Buffer.from(data.content, "base64").toString("utf8") });
            }
          }
        } catch { /* skip files that fail */ }
      }
      return NextResponse.json({ repo, files, total: searchData.items?.length || 0 });
    }

    // If no search query, list the root directory or a specific path
    const url = path
      ? `${api}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`
      : `${api}/contents?ref=${encodeURIComponent(branch)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      return NextResponse.json({ error: `GitHub: ${res.status}` }, { status: res.status });
    }
    const data = await res.json();
    if (Array.isArray(data)) {
      const entries = data
        .filter((e: unknown): e is { name: string; path: string; type: string } =>
          Boolean(e && typeof e === "object" && "name" in (e as Record<string, unknown>) && "path" in (e as Record<string, unknown>))
        )
        .map((e) => ({ name: e.name, path: e.path, type: e.type }));
      return NextResponse.json({ repo, path: path || "/", entries });
    }

    // Single file
    const file = data as { content?: string; encoding?: string; name?: string; path?: string; size?: number };
    if (file.content && file.encoding === "base64" && (file.size || 0) < MAX_FILE_SIZE) {
      return NextResponse.json({
        repo,
        file: { path: file.path || "", name: file.name || "", content: Buffer.from(file.content, "base64").toString("utf8") },
      });
    }
    return NextResponse.json({ error: "File too large or not readable." }, { status: 415 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}