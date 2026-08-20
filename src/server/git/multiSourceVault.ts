"use strict";

/**
 * Multi-Platform Code Ingestion Engine.
 *
 * Extends the code vault to ingest public code from GitHub (repos + Gists),
 * GitLab (repos + snippets), Bitbucket, Gitea, and paste services into the
 * shared Supabase Cloud Storage buckets with automatic departmental
 * categorization. Uses the same AST/regex parsing pipeline as codeVault.ts.
 */

import { cloneAndIndexRepo, type SourcePlatform, type CloneResult } from "@/server/git/codeVault";
import { uploadToVault, type BucketFile } from "@/server/storage/bucketClient";

// ── Types ────────────────────────────────────────────────

export interface IngestRequest {
  url: string;
  userId: string;
  branch?: string;
  depth?: number;
  maxFiles?: number;
}

export interface MultiSourceResult {
  ok: boolean;
  platform: SourcePlatform | "paste";
  sourceUrl: string;
  repoSlug?: string;
  filesProcessed: number;
  entriesIndexed: number;
  error?: string;
}

// ── Platform detection ──────────────────────────────────

interface PlatformEntry { platform: SourcePlatform; pattern: RegExp; cloneUrl: (url: string) => string }

const PLATFORMS: PlatformEntry[] = [
  { platform: "github", pattern: /github\.com\/([\w.-]+)\/([\w.-]+)/, cloneUrl: (u) => `https://github.com/${u.match(/github\.com\/([\w.-]+\/[\w.-]+)/)?.[1] ?? ""}.git` },
  { platform: "gitlab", pattern: /gitlab\.com\/([\w.-]+)\/([\w.-]+)/, cloneUrl: (u) => `https://gitlab.com/${u.match(/gitlab\.com\/([\w.-]+\/[\w.-]+)/)?.[1] ?? ""}.git` },
  { platform: "bitbucket", pattern: /bitbucket\.org\/([\w.-]+)\/([\w.-]+)/, cloneUrl: (u) => `https://bitbucket.org/${u.match(/bitbucket\.org\/([\w.-]+\/[\w.-]+)/)?.[1] ?? ""}.git` },
  { platform: "gitea", pattern: /gitea\.com\/([\w.-]+)\/([\w.-]+)/, cloneUrl: (u) => `https://gitea.com/${u.match(/gitea\.com\/([\w.-]+\/[\w.-]+)/)?.[1] ?? ""}.git` },
];

const PASTE_SERVICES: Array<{ name: string; pattern: RegExp; rawUrl: (url: string) => string }> = [
  { name: "pastebin", pattern: /pastebin\.com\/(?:raw\/)?([\w]+)/, rawUrl: (u) => `https://pastebin.com/raw/${u.match(/pastebin\.com\/(?:raw\/)?([\w]+)/)?.[1] ?? ""}` },
  { name: "hastebin", pattern: /hastebin\.(?:com|su)\/(?:raw\/)?([\w]+)/, rawUrl: (u) => `https://hastebin.su/raw/${u.match(/hastebin\.(?:com|su)\/(?:raw\/)?([\w]+)/)?.[1] ?? ""}` },
  { name: "dpaste", pattern: /dpaste\.(?:com|org)\/([\w]+)/, rawUrl: (u) => `https://dpaste.com/${u.match(/dpaste\.(?:com|org)\/([\w]+)/)?.[1] ?? ""}.txt` },
];

/** Detect what kind of source a URL points to. */
export function detectSource(url: string): SourcePlatform | "paste" | null {
  for (const p of PLATFORMS) if (p.pattern.test(url)) return p.platform;
  for (const p of PASTE_SERVICES) if (p.pattern.test(url)) return "paste";
  if (url.endsWith(".git")) return "github";
  return null;
}

// ── Public API ──────────────────────────────────────────

/**
 * Ingests code from any supported platform URL.
 *   - Git repos (GitHub/GitLab/Bitbucket/Gitea) → cloned, parsed, indexed into vault.
 *   - Paste services → raw text fetched, categorized, uploaded.
 *   - Gists → fetched via GitHub API, each file uploaded.
 */
export async function ingestFromUrl(req: IngestRequest): Promise<MultiSourceResult> {
  const source = detectSource(req.url);
  if (!source) {
    return { ok: false, platform: "github", sourceUrl: req.url, filesProcessed: 0, entriesIndexed: 0, error: "Unsupported URL — not a recognized git host or paste service." };
  }

  // Paste / snippet ingestion
  if (source === "paste") return ingestPaste(req.url, req.userId);

  // Git repo clone+index
  const platform = source;
  const cloneUrl = PLATFORMS.find((p) => p.platform === platform)?.cloneUrl(req.url) ?? req.url;
  const result: CloneResult = await cloneAndIndexRepo(cloneUrl, req.userId, platform, {
    branch: req.branch,
    depth: req.depth,
    maxFiles: req.maxFiles,
  });

  return {
    ok: result.ok,
    platform,
    sourceUrl: req.url,
    repoSlug: result.repoSlug,
    filesProcessed: result.filesProcessed,
    entriesIndexed: result.entriesIndexed,
    error: result.error,
  };
}

/**
 * Batch-ingests multiple URLs in sequence.
 */
export async function batchIngest(requests: IngestRequest[]): Promise<MultiSourceResult[]> {
  const results: MultiSourceResult[] = [];
  for (const req of requests) {
    results.push(await ingestFromUrl(req));
  }
  return results;
}

// ── Paste ingestion ─────────────────────────────────────

async function ingestPaste(url: string, userId: string): Promise<MultiSourceResult> {
  let rawUrl = "";
  for (const svc of PASTE_SERVICES) {
    if (svc.pattern.test(url)) {
      rawUrl = svc.rawUrl(url);
      break;
    }
  }
  // Gist detection
  if (!rawUrl && /gist\.github\.com\/([\w-]+)\/([\w]+)/.test(url)) {
    return ingestGist(url, userId);
  }
  // GitLab snippet
  if (!rawUrl && isGitLabSnippet(url)) {
    return ingestGitLabSnippet(url, userId);
  }
  if (!rawUrl) {
    return { ok: false, platform: "paste", sourceUrl: url, filesProcessed: 0, entriesIndexed: 0, error: "Could not resolve raw content URL for paste." };
  }

  try {
    const res = await fetch(rawUrl, { cache: "no-store" });
    if (!res.ok) return { ok: false, platform: "paste", sourceUrl: url, filesProcessed: 0, entriesIndexed: 0, error: `Paste fetch failed: HTTP ${res.status}` };
    const content = await res.text();
    if (!content.trim()) return { ok: false, platform: "paste", sourceUrl: url, filesProcessed: 1, entriesIndexed: 0, error: "Paste is empty." };

    const lang = guessLanguage(url, content);
    const dept = classifyLanguage(lang);

    const upload = await uploadToVault(userId, dept, {
      path: `paste/${sanitizeFilename(url)}.${lang}`,
      content,
      contentType: "text/plain",
      metadata: { platform: "paste", sourceUrl: url },
    });

    return {
      ok: upload.ok,
      platform: "paste",
      sourceUrl: url,
      filesProcessed: 1,
      entriesIndexed: upload.ok ? 1 : 0,
      error: upload.ok ? undefined : upload.error,
    };
  } catch (cause) {
    return { ok: false, platform: "paste", sourceUrl: url, filesProcessed: 0, entriesIndexed: 0, error: cause instanceof Error ? cause.message : "Paste ingestion failed." };
  }
}

// ── Gist ingestion ──────────────────────────────────────

async function ingestGist(url: string, userId: string): Promise<MultiSourceResult> {
  const m = url.match(/gist\.github\.com\/([\w-]+)\/([\w]+)/);
  if (!m) return { ok: false, platform: "paste", sourceUrl: url, filesProcessed: 0, entriesIndexed: 0, error: "Invalid Gist URL." };
  const gistId = m[2];

  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, platform: "paste", sourceUrl: url, filesProcessed: 0, entriesIndexed: 0, error: `Gist fetch failed: HTTP ${res.status}` };
    const data = (await res.json()) as { files?: Record<string, { filename?: string; language?: string; content?: string }> };
    if (!data.files) return { ok: false, platform: "paste", sourceUrl: url, filesProcessed: 0, entriesIndexed: 0, error: "No files in gist." };

    let indexed = 0;
    for (const [name, file] of Object.entries(data.files)) {
      if (!file?.content) continue;
      const lang = (file.language ?? guessLanguage(name, file.content)).toLowerCase();
      const dept = classifyLanguage(lang);
      const upload = await uploadToVault(userId, dept, {
        path: `paste/gist-${gistId}/${name}`,
        content: file.content,
        contentType: "text/plain",
        metadata: { platform: "github", sourceUrl: url, snippetType: "gist" },
      });
      if (upload.ok) indexed++;
    }

    return { ok: indexed > 0, platform: "paste", sourceUrl: url, filesProcessed: Object.keys(data.files).length, entriesIndexed: indexed, error: indexed === 0 ? "No files indexed." : undefined };
  } catch (cause) {
    return { ok: false, platform: "paste", sourceUrl: url, filesProcessed: 0, entriesIndexed: 0, error: cause instanceof Error ? cause.message : "Gist ingestion failed." };
  }
}

// ── GitLab snippet ingestion ────────────────────────────

function isGitLabSnippet(url: string): boolean {
  return /gitlab\.com\/[\w.-]+\/[\w.-]+\/-\/snippets\/\d+/.test(url);
}

async function ingestGitLabSnippet(url: string, userId: string): Promise<MultiSourceResult> {
  try {
    const rawUrl = url.replace(/\/-\/snippets\/(\d+)/, "/-/snippets/$1/raw");
    const res = await fetch(rawUrl, { cache: "no-store" });
    if (!res.ok) return { ok: false, platform: "paste", sourceUrl: url, filesProcessed: 0, entriesIndexed: 0, error: `GitLab snippet fetch failed: HTTP ${res.status}` };
    const content = await res.text();
    if (!content.trim()) return { ok: false, platform: "paste", sourceUrl: url, filesProcessed: 1, entriesIndexed: 0, error: "Snippet is empty." };

    const lang = guessLanguage(url, content);
    const dept = classifyLanguage(lang);
    const upload = await uploadToVault(userId, dept, {
      path: `paste/gl-snippet-${Date.now()}.${lang}`,
      content,
      contentType: "text/plain",
      metadata: { platform: "gitlab", sourceUrl: url, snippetType: "gitlab-snippet" },
    });

    return { ok: upload.ok, platform: "paste", sourceUrl: url, filesProcessed: 1, entriesIndexed: upload.ok ? 1 : 0, error: upload.ok ? undefined : upload.error };
  } catch (cause) {
    return { ok: false, platform: "paste", sourceUrl: url, filesProcessed: 0, entriesIndexed: 0, error: cause instanceof Error ? cause.message : "GitLab snippet ingestion failed." };
  }
}

// ── Helpers ──────────────────────────────────────────────

function guessLanguage(url: string, content: string): string {
  const ext = url.split(".").pop()?.toLowerCase() ?? "";
  const extMap: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", rs: "rust", go: "go", java: "java", rb: "ruby",
    php: "php", cs: "csharp", swift: "swift", kt: "kotlin",
    sql: "sql", html: "html", css: "css", scss: "scss",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
    sh: "shell", bash: "shell", md: "markdown",
  };
  if (extMap[ext]) return extMap[ext];
  // Heuristic: Python-style
  if (content.includes("def ") || content.includes("import ")) return "python";
  if (content.includes("function ") || content.includes("const ")) return "javascript";
  return "text";
}

function classifyLanguage(lang: string): "frontend" | "backend" | "database" | "ai-agents" | "infrastructure" {
  const frontend = ["tsx", "jsx", "vue", "svelte", "astro", "html", "css", "scss", "sass"];
  const database = ["sql", "prisma", "graphql"];
  const infra = ["dockerfile", "hcl", "tf", "yaml", "toml", "shell", "sh", "bash"];
  if (frontend.includes(lang)) return "frontend";
  if (database.includes(lang)) return "database";
  if (infra.includes(lang)) return "infrastructure";
  if (["python", "rs", "go", "java"].includes(lang) && lang === "python") return "ai-agents";
  return "backend";
}

function sanitizeFilename(url: string): string {
  return url.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}