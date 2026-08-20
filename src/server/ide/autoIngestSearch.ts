"use strict";

/**
 * Automatic Ingestion for In-IDE Online Code Search.
 *
 * Captures code snippets / repository results viewed through the online code
 * search tool and saves them into the Jyinx shared code library. Runs local
 * background categorization (regex/AST) sorting snippets into primary
 * departments and sub-departments via the shared vault pipeline.
 */

import { uploadToVault, ensureVaultStructure, type BucketFile } from "@/server/storage/bucketClient";
import { guessLanguageAndDepartment } from "@/server/git/categorize";

export interface AutoIngestEntry {
  sourceUrl?: string;
  title?: string;
  language?: string;
  repo?: string;
  platform?: string;
  snippet: string;
  filename?: string;
}

export interface AutoIngestResult {
  ok: boolean;
  department: string;
  storagePath?: string;
  error?: string;
}

/**
 * Auto-ingests a single viewed code snippet into the shared vault.
 */
export async function autoIngestSearchSnippet(
  userId: string,
  entry: AutoIngestEntry
): Promise<AutoIngestResult> {
  if (!entry.snippet?.trim()) return { ok: false, department: "unknown", error: "Empty snippet." };
  if (!userId) return { ok: false, department: "unknown", error: "No user context." };

  try {
    await ensureVaultStructure(userId);

    const { department, subDepartment, language } = guessLanguageAndDepartment(
      entry.filename ?? (entry.title ? entry.title : `snippet.${extFor(entry.language ?? "text")}`),
      entry.snippet,
      entry.language
    );

    const safeName = sanitizeFilename(entry.filename ?? (entry.title ? `${entry.title}.${extFor(language)}` : `code-${Date.now()}.${extFor(language)}`));

    const file: BucketFile = {
      path: `snippets/${department}/${safeName}`,
      content: entry.snippet,
      contentType: "text/plain",
      metadata: {
        platform: entry.platform ?? "online-search",
        sourceUrl: entry.sourceUrl ?? "",
        repo: entry.repo ?? "",
        department,
        subDepartment: subDepartment ?? "",
        language,
        title: entry.title ?? "",
      },
    };

    const result = await uploadToVault(userId, department, file);
    if (!result.ok) return { ok: false, department, error: result.error };

    return { ok: true, department, storagePath: result.entry.storagePath };
  } catch (cause) {
    return { ok: false, department: "unknown", error: cause instanceof Error ? cause.message : "Auto-ingest failed." };
  }
}

/**
 * Batch auto-ingest for a search results page.
 */
export async function autoIngestSearchResults(
  userId: string,
  entries: AutoIngestEntry[]
): Promise<AutoIngestResult[]> {
  const results: AutoIngestResult[] = [];
  for (const entry of entries) {
    results.push(await autoIngestSearchSnippet(userId, entry));
  }
  return results;
}

// ── Helpers ──────────────────────────────────────────────

const EXT: Record<string, string> = {
  typescript: "ts", tsx: "tsx", javascript: "js", jsx: "jsx",
  python: "py", rust: "rs", go: "go", html: "html", css: "css",
  sql: "sql", json: "json", yaml: "yaml", shell: "sh", markdown: "md",
};

function extFor(language: string): string {
  return EXT[language] ?? "txt";
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.\./g, "");
}