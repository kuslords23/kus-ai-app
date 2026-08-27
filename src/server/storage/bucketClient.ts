"use strict";

/**
 * Shared Cloud Bucket & Code Vault Client.
 *
 * Routes all code uploads, categorized repository files, and cloned GitHub
 * modules through the shared Supabase cloud storage buckets used by Sports
 * Clan Nexus. Ensures universal accessibility across both apps.
 *
 * Bucket layout:
 *   code-vault/
 *     {userId}/
 *       departments/
 *         frontend/
 *         backend/
 *         database/
 *         ai-agents/
 *         infrastructure/
 *       repos/
 *         {repo-slug}/
 *           raw/          — original cloned files
 *           parsed/       — AST-parsed, deduplicated snippets
 *           index.json    — fast-lookup manifest
 */

import { createClient } from "@/lib/supabase/server";
import type { Department } from "@/server/git/codeVault";

export const CODE_VAULT_BUCKET = "code-vault";
export const NEXUS_BUCKET = "shared-assets";

export interface BucketFile {
  path: string;
  content: string | Uint8Array;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface VaultEntry {
  id: string;
  userId: string;
  department: Department;
  subDepartment?: string;
  fileName: string;
  filePath: string;
  sourceRepo?: string;
  sourcePlatform?: "github" | "gitlab" | "bitbucket" | "gitea" | "paste";
  language: string;
  sizeBytes: number;
  uploadedAt: string;
  storagePath: string;
  tags: string[];
}

const DEPARTMENTS: Department[] = [
  "frontend",
  "backend",
  "database",
  "ai-agents",
  "infrastructure",
];

/**
 * Ensures the base vault directory structure exists for a user.
 * Creates department folders if missing.
 */
export async function ensureVaultStructure(userId: string): Promise<void> {
  const client = await createClient();
  for (const dept of DEPARTMENTS) {
    const placeholder = `${CODE_VAULT_BUCKET}/${userId}/departments/${dept}/.keep`;
    await client.storage.from(CODE_VAULT_BUCKET).upload(placeholder, new TextEncoder().encode(""), {
      upsert: true,
      contentType: "text/plain",
    });
  }
  // Ensure repos root exists
  const reposPlaceholder = `${userId}/repos/.keep`;
  await client.storage.from(CODE_VAULT_BUCKET).upload(reposPlaceholder, new TextEncoder().encode(""), {
    upsert: true,
    contentType: "text/plain",
  });
}

/**
 * Uploads a single file into the user's code vault under the given department.
 * Returns the public or signed URL for downstream retrieval.
 */
export async function uploadToVault(
  userId: string,
  department: Department,
  file: BucketFile
): Promise<{ ok: true; entry: VaultEntry; url: string } | { ok: false; error: string }> {
  try {
    const client = await createClient();
    const normalizedPath = file.path.replace(/^\/+/, "").replace(/\\/g, "/");
    const storagePath = `${userId}/departments/${department}/${normalizedPath}`;

    const content =
      typeof file.content === "string"
        ? new TextEncoder().encode(file.content)
        : file.content;

    const { error } = await client.storage
      .from(CODE_VAULT_BUCKET)
      .upload(storagePath, content, {
        upsert: true,
        contentType: file.contentType ?? "text/plain",
      });

    if (error) return { ok: false, error: `Upload failed: ${error.message}` };

    const { data: urlData } = client.storage
      .from(CODE_VAULT_BUCKET)
      .getPublicUrl(storagePath);

    const entry: VaultEntry = {
      id: `${userId}/${normalizedPath}`,
      userId,
      department,
      subDepartment: deriveSubDepartment(department, normalizedPath),
      fileName: normalizedPath.split("/").pop() ?? normalizedPath,
      filePath: normalizedPath,
      sourceRepo: file.metadata?.repo ?? undefined,
      sourcePlatform: (file.metadata?.platform as VaultEntry["sourcePlatform"]) ?? undefined,
      language: detectLanguage(normalizedPath),
      sizeBytes: content.byteLength,
      uploadedAt: new Date().toISOString(),
      storagePath,
      tags: extractTags(department, normalizedPath),
    };

    return { ok: true, entry, url: urlData.publicUrl };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Upload failed." };
  }
}

/**
 * Batch-uploads multiple files (e.g. a cloned repository) to the vault.
 * Also writes a `index.json` manifest to the repo directory.
 */
export async function batchUploadToVault(
  userId: string,
  department: Department,
  files: BucketFile[],
  repoSlug?: string
): Promise<{ ok: true; entries: VaultEntry[]; manifestPath?: string } | { ok: false; error: string }> {
  const entries: VaultEntry[] = [];
  for (const file of files) {
    const result = await uploadToVault(userId, department, file);
    if (result.ok) {
      entries.push(result.entry);
    }
  }

  if (repoSlug && entries.length > 0) {
    const client = await createClient();
    const manifestPath = `${userId}/repos/${repoSlug}/index.json`;
    const manifest = {
      repoSlug,
      department,
      fileCount: entries.length,
      indexedAt: new Date().toISOString(),
      entries: entries.map((e) => ({
        path: e.filePath,
        language: e.language,
        sizeBytes: e.sizeBytes,
        tags: e.tags,
      })),
    };
    await client.storage
      .from(CODE_VAULT_BUCKET)
      .upload(manifestPath, new TextEncoder().encode(JSON.stringify(manifest, null, 2)), {
        upsert: true,
        contentType: "application/json",
      });
    return { ok: true, entries, manifestPath };
  }

  return { ok: true, entries };
}

/**
 * Lists files in a user's vault department.
 */
export async function listVaultDepartment(
  userId: string,
  department: Department,
  prefix = ""
): Promise<{ name: string; id: string; path: string; sizeBytes?: number; createdAt?: string }[]> {
  try {
    const client = await createClient();
    const folderPath = `${userId}/departments/${department}/${prefix}`.replace(/\/$/, "");
    const { data, error } = await client.storage
      .from(CODE_VAULT_BUCKET)
      .list(folderPath, { sortBy: { column: "created_at", order: "desc" } });

    if (error) return [];
    return (data ?? [])
      .filter((f) => f.name !== ".keep")
      .map((f) => ({
        name: f.name,
        id: f.id ?? `${folderPath}/${f.name}`,
        path: `${folderPath}/${f.name}`,
        sizeBytes: f.metadata?.size,
        createdAt: f.created_at ?? undefined,
      }));
  } catch {
    return [];
  }
}

/**
 * Downloads a file from the user's vault by storage path.
 */
export async function downloadFromVault(
  storagePath: string
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  try {
    const client = await createClient();
    const { data, error } = await client.storage
      .from(CODE_VAULT_BUCKET)
      .download(storagePath);

    if (error || !data) return { ok: false, error: error?.message ?? "Download failed." };
    return { ok: true, content: await data.text() };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Download failed." };
  }
}

/**
 * Uploads shared assets (images, previews) to the Nexus shared bucket.
 */
export async function uploadSharedAsset(
  userId: string,
  file: BucketFile
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const client = await createClient();
    const normalizedPath = file.path.replace(/^\/+/, "").replace(/\\/g, "/");
    const storagePath = `${userId}/${normalizedPath}`;

    const content =
      typeof file.content === "string"
        ? new TextEncoder().encode(file.content)
        : file.content;

    const { error } = await client.storage
      .from(NEXUS_BUCKET)
      .upload(storagePath, content, {
        upsert: true,
        contentType: file.contentType ?? "application/octet-stream",
      });

    if (error) return { ok: false, error: `Upload failed: ${error.message}` };

    const { data: urlData } = client.storage
      .from(NEXUS_BUCKET)
      .getPublicUrl(storagePath);

    return { ok: true, url: urlData.publicUrl };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Upload failed." };
  }
}

// ── Helpers ──────────────────────────────────────────────

const EXT_LANGUAGE: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
  py: "python", rs: "rust", go: "go", java: "java", kt: "kotlin",
  swift: "swift", rb: "ruby", php: "php", cs: "csharp",
  sql: "sql", graphql: "graphql", prisma: "prisma",
  html: "html", css: "css", scss: "scss", sass: "sass",
  vue: "vue", svelte: "svelte", astro: "astro",
  json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
  md: "markdown", mdx: "mdx", dockerfile: "dockerfile",
  sh: "shell", bash: "shell", zsh: "shell",
  tf: "terraform", hcl: "hcl",
  c: "c", cpp: "cpp", h: "c-header",
};

function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (path.toLowerCase().endsWith("dockerfile")) return "dockerfile";
  return EXT_LANGUAGE[ext] ?? "unknown";
}

const SUB_DEPARTMENT_MAP: Record<Department, Record<string, string[]>> = {
  frontend: {
    components: ["components", "ui", "widgets", "views"],
    pages: ["pages", "routes", "screens"],
    styles: ["styles", "css", "scss", "themes"],
    hooks: ["hooks", "composables"],
    state: ["store", "redux", "zustand", "context"],
  },
  backend: {
    routes: ["routes", "controllers", "handlers"],
    middleware: ["middleware", "middlewares", "guards"],
    services: ["services", "domain", "usecases"],
    models: ["models", "entities", "schemas"],
    utils: ["utils", "helpers", "lib"],
  },
  database: {
    migrations: ["migrations", "migrate"],
    seeds: ["seeds", "seeders"],
    queries: ["queries", "sql"],
    schemas: ["schemas", "prisma", "drizzle"],
  },
  "ai-agents": {
    prompts: ["prompts", "system-prompts"],
    chains: ["chains", "pipelines"],
    tools: ["tools", "functions"],
    embeddings: ["embeddings", "vectors"],
  },
  infrastructure: {
    ci: [".github/workflows", "ci", ".gitlab-ci.yml"],
    docker: ["docker", "Dockerfile", "docker-compose"],
    terraform: ["terraform", ".tf"],
    config: ["config", "env", ".env"],
  },
};

function deriveSubDepartment(department: Department, path: string): string | undefined {
  const map = SUB_DEPARTMENT_MAP[department];
  if (!map) return undefined;
  const lower = path.toLowerCase();
  for (const [sub, markers] of Object.entries(map)) {
    if (markers.some((m) => lower.includes(m))) return sub;
  }
  return undefined;
}

function extractTags(_department: Department, path: string): string[] {
  const tags: string[] = [detectLanguage(path)];
  const lower = path.toLowerCase();
  if (lower.includes("test") || lower.includes("spec") || lower.includes("__tests__")) tags.push("test");
  if (lower.includes(".d.ts")) tags.push("declaration");
  if (lower.includes("node_modules")) tags.push("vendor");
  return tags;
}