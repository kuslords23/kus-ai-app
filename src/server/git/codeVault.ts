"use strict";

/**
 * Automated Code Cloning & Vault Engine.
 *
 * Background service that clones and indexes public GitHub repositories into
 * the shared code vault using local AST/regex parsing — zero LLM token
 * reliance for categorization.
 *
 * Pipeline:
 *   1. Clone public repo (git clone --depth 1)
 *   2. Walk file tree, filter for code files
 *   3. Categorize each file into a primary department + sub-department
 *   4. Parse file for imports/exports (lightweight AST via regex)
 *   5. Upload to shared cloud bucket (via bucketClient)
 *   6. Write index.json manifest
 */

import { exec } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import {
  batchUploadToVault,
  ensureVaultStructure,
  type BucketFile,
} from "@/server/storage/bucketClient";

// ── Types ────────────────────────────────────────────────

export type Department =
  | "frontend"
  | "backend"
  | "database"
  | "ai-agents"
  | "infrastructure";

export type SourcePlatform = "github" | "gitlab" | "bitbucket" | "gitea" | "paste";

export interface ClonedFile {
  relativePath: string;
  absolutePath: string;
  language: string;
  department: Department;
  subDepartment?: string;
  imports: string[];
  exports: string[];
  sizeBytes: number;
}

export interface CloneResult {
  ok: boolean;
  repoSlug: string;
  platform: SourcePlatform;
  filesProcessed: number;
  departments: Record<Department, number>;
  entriesIndexed: number;
  error?: string;
  cleanUpPath?: string;
}

export interface VaultIndexEntry {
  repoSlug: string;
  platform: SourcePlatform;
  clonedAt: string;
  totalFiles: number;
  departments: Record<Department, number>;
  topDependencies: string[];
}

// ── File filtering ──────────────────────────────────────

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rs", ".go", ".java", ".kt", ".kts",
  ".swift", ".rb", ".php", ".cs", ".fs",
  ".sql", ".prisma", ".graphql",
  ".html", ".css", ".scss", ".sass", ".less",
  ".vue", ".svelte", ".astro",
  ".json", ".yaml", ".yml", ".toml",
  ".md", ".mdx",
  ".sh", ".bash", ".zsh",
  ".tf", ".hcl",
  ".c", ".cpp", ".h", ".hpp",
  ".dockerfile", ".dockerignore",
]);

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build",
  ".turbo", ".cache", "__pycache__", ".venv", "venv",
  "target", ".idea", ".vscode", "coverage", ".nyc_output",
]);

const SKIP_PATTERNS = [
  /\.min\.(js|css)$/,
  /\.d\.ts$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
];

// ── Department classifier ────────────────────────────────

interface ClassifierRule {
  department: Department;
  sub: string;
  patterns: RegExp[];
}

const DEPARTMENT_RULES: ClassifierRule[] = [
  // Frontend
  { department: "frontend", sub: "components", patterns: [/(?:^|\/)components?\//, /\.(tsx|jsx|vue|svelte|astro)$/] },
  { department: "frontend", sub: "pages", patterns: [/(?:^|\/)pages?\//, /(?:^|\/)app\/.*page\.(tsx|jsx)$/, /(?:^|\/)routes?\//] },
  { department: "frontend", sub: "styles", patterns: [/\.(css|scss|sass|less)$/, /(?:^|\/)styles?\//, /tailwind/] },
  { department: "frontend", sub: "hooks", patterns: [/use[A-Z]\w+\.(ts|tsx|js|jsx)$/, /(?:^|\/)hooks?\//] },
  { department: "frontend", sub: "state", patterns: [/store\/.*\.(ts|tsx|js|jsx)$/, /(?:^|\/)store\//, /(?:^|\/)context\//] },
  { department: "frontend", sub: "layouts", patterns: [/(?:^|\/)layouts?\//, /app\/layout\.(tsx|jsx)$/] },

  // Backend
  { department: "backend", sub: "routes", patterns: [/(?:^|\/)routes?\//, /(?:^|\/)controllers?\//, /(?:^|\/)handlers?\//] },
  { department: "backend", sub: "middleware", patterns: [/(?:^|\/)middleware\.(ts|js)$/, /(?:^|\/)middlewares?\//] },
  { department: "backend", sub: "services", patterns: [/(?:^|\/)services?\//, /(?:^|\/)domain\//, /(?:^|\/)usecases?\//] },
  { department: "backend", sub: "models", patterns: [/(?:^|\/)models?\//, /(?:^|\/)entities?\//, /(?:^|\/)schemas?\//] },
  { department: "backend", sub: "utils", patterns: [/(?:^|\/)utils?\//, /(?:^|\/)helpers?\//, /(?:^|\/)lib\//] },
  { department: "backend", sub: "api", patterns: [/(?:^|\/)api\//, /server\.(ts|js)$/] },

  // Database
  { department: "database", sub: "migrations", patterns: [/migration/, /\.sql$/, /prisma\/migrations/] },
  { department: "database", sub: "schemas", patterns: [/schema\.(prisma|ts|js)$/, /drizzle\//] },
  { department: "database", sub: "seeds", patterns: [/(?:^|\/)seeds?\//, /seed\.(ts|js)$/] },
  { department: "database", sub: "queries", patterns: [/(?:^|\/)queries?\//, /query\.(ts|js|sql)$/] },

  // AI / Agents
  { department: "ai-agents", sub: "prompts", patterns: [/prompt/, /system-prompt/, /chat\.(ts|js|py)$/] },
  { department: "ai-agents", sub: "tools", patterns: [/tools?\//, /agent\.(ts|js|py)$/, /\.agent\./] },
  { department: "ai-agents", sub: "chains", patterns: [/chains?\//, /pipeline\.(ts|js|py)$/] },
  { department: "ai-agents", sub: "embeddings", patterns: [/embeddings?\//, /vectors?\//, /rag\//] },

  // Infrastructure
  { department: "infrastructure", sub: "ci", patterns: [/\.github\/workflows/, /\.gitlab-ci\.yml/, /jenkins/, /circleci/] },
  { department: "infrastructure", sub: "docker", patterns: [/docker/i, /Dockerfile/, /docker-compose/] },
  { department: "infrastructure", sub: "terraform", patterns: [/\.tf$/, /terraform\//] },
  { department: "infrastructure", sub: "config", patterns: [/config\//, /\.env\./, /nginx\.conf$/, /\.ini$/] },
];

function classifyFile(filePath: string, language: string): { department: Department; subDepartment?: string } {
  for (const rule of DEPARTMENT_RULES) {
    if (rule.patterns.some((p) => p.test(filePath))) {
      return { department: rule.department, subDepartment: rule.sub };
    }
  }
  // Broad fallback by language
  if (["ts", "tsx", "js", "jsx", "html", "css", "scss", "vue", "svelte", "astro"].includes(language)) {
    return { department: "frontend" };
  }
  if (["py", "go", "rs", "java", "kt", "swift", "rb", "php", "cs"].includes(language)) {
    return { department: "backend" };
  }
  if (["sql", "prisma", "graphql"].includes(language)) {
    return { department: "database" };
  }
  if (["tf", "hcl", "sh", "yaml", "dockerfile"].includes(language)) {
    return { department: "infrastructure" };
  }
  return { department: "backend" }; // safe default
}

// ── Lightweight AST via regex ───────────────────────────

const IMPORT_RE = /^(?:import\s+(?:{[\s\S]*?}|[\w*]+)\s+from\s+['"]([^'"]+)['"]|const\s+\w+\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:from|import)\s+['"]([^'"]+)['"])/gm;
const EXPORT_RE = /^export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/gm;
const DEPENDENCY_RE = /['"]((?:@[\w-]+\/)?[\w.-]+)['"]/g;

function parseImports(filePath: string, content: string): string[] {
  const imports: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = IMPORT_RE.exec(content)) !== null) {
    const mod = m[1] ?? m[2] ?? m[3];
    if (mod && !mod.startsWith(".")) imports.push(mod);
  }
  // Also add Python imports
  if (filePath.endsWith(".py")) {
    const pyImport = /^(?:from\s+(\S+)\s+import|import\s+(\S+))/gm;
    while ((m = pyImport.exec(content)) !== null) {
      const mod = (m[1] ?? m[2] ?? "").split(".")[0];
      if (mod) imports.push(mod);
    }
  }
  return [...new Set(imports)];
}

function parseExports(content: string): string[] {
  const exports: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = EXPORT_RE.exec(content)) !== null) {
    if (m[1]) exports.push(m[1]);
  }
  return [...new Set(exports)];
}

function extractDependencies(content: string): string[] {
  const deps: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = DEPENDENCY_RE.exec(content)) !== null) {
    const dep = m[1];
    if (dep && !dep.startsWith(".") && !dep.startsWith("/")) deps.push(dep);
  }
  return [...new Set(deps)];
}

// ── File walker ─────────────────────────────────────────

async function walkFiles(dir: string, baseDir: string, files: ClonedFile[]): Promise<void> {
  let entries: { name: string; isDirectory: () => boolean }[];
  try {
    const raw = await fs.readdir(dir, { withFileTypes: true });
    entries = raw;
  } catch {
    return;
  }

  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(baseDir, abs).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      await walkFiles(abs, baseDir, files);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    const baseFile = entry.name.toLowerCase();
    if (!CODE_EXTENSIONS.has(ext) && !CODE_EXTENSIONS.has(baseFile)) continue;
    if (SKIP_PATTERNS.some((p) => p.test(rel))) continue;

    let content = "";
    try {
      content = await fs.readFile(abs, "utf-8");
    } catch {
      continue;
    }

    const language = detectLanguageExt(ext, baseFile);
    const { department, subDepartment } = classifyFile(rel, language);

    files.push({
      relativePath: rel,
      absolutePath: abs,
      language,
      department,
      subDepartment,
      imports: parseImports(rel, content),
      exports: parseExports(content),
      sizeBytes: Buffer.byteLength(content, "utf-8"),
    });
  }
}

function detectLanguageExt(ext: string, baseName: string): string {
  if (baseName === "dockerfile") return "dockerfile";
  const map: Record<string, string> = {
    ".ts": "ts", ".tsx": "tsx", ".js": "js", ".jsx": "jsx",
    ".mjs": "js", ".cjs": "js",
    ".py": "py", ".rs": "rs", ".go": "go", ".java": "java",
    ".kt": "kt", ".kts": "kt",
    ".swift": "swift", ".rb": "rb", ".php": "php", ".cs": "cs",
    ".sql": "sql", ".prisma": "prisma", ".graphql": "graphql",
    ".html": "html", ".css": "css", ".scss": "scss", ".sass": "sass",
    ".vue": "vue", ".svelte": "svelte", ".astro": "astro",
    ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
    ".md": "md", ".mdx": "mdx",
    ".sh": "sh", ".bash": "sh",
    ".tf": "tf", ".hcl": "hcl",
    ".c": "c", ".cpp": "cpp", ".h": "c-header",
    ".dockerfile": "dockerfile",
  };
  return map[ext] ?? ext.slice(1);
}

// ── Public API ──────────────────────────────────────────

/**
 * Clones a public GitHub (or other git-hosted) repository into a temp
 * directory, walks its file tree, categorizes every code file, and uploads
 * them into the shared Supabase code vault.
 *
 * @param repoUrl  Full HTTPS clone URL, e.g. https://github.com/vercel/ai.git
 * @param userId   The vault owner
 * @param platform Source platform identifier
 * @param options  Optional branch, depth, max files limit
 */
export async function cloneAndIndexRepo(
  repoUrl: string,
  userId: string,
  platform: SourcePlatform = "github",
  options: { branch?: string; depth?: number; maxFiles?: number } = {}
): Promise<CloneResult> {
  const branch = options.branch ?? "main";
  const depth = options.depth ?? 1;
  const maxFiles = options.maxFiles ?? 5000;
  const repoSlug = deriveSlug(repoUrl);
  const workDir = path.join(os.tmpdir(), `jyinx-vault-${randomUUID()}`);

  try {
    await fs.mkdir(workDir, { recursive: true });
  } catch {
    return errorResult(repoSlug, platform, "Failed to create temp directory.");
  }

  // Clone
  const cloneCmd = `git clone --depth ${depth} --single-branch --branch "${branch}" "${repoUrl}" "${workDir}"`;
  try {
    await execAsync(cloneCmd, 120_000);
  } catch (cause: unknown) {
    const errMsg = cause instanceof Error ? cause.message : String(cause);
    return errorResult(repoSlug, platform, `Clone failed: ${errMsg}`, workDir);
  }

  // Walk & classify
  const files: ClonedFile[] = [];
  await walkFiles(workDir, workDir, files);
  if (files.length === 0) {
    return errorResult(repoSlug, platform, "No code files found in repository.", workDir);
  }

  const sliced = files.slice(0, maxFiles);

  // Group by department
  const deptGroups: Record<Department, ClonedFile[]> = {
    frontend: [],
    backend: [],
    database: [],
    "ai-agents": [],
    infrastructure: [],
  };
  const allDeps: string[] = [];

  for (const f of sliced) {
    deptGroups[f.department].push(f);
    allDeps.push(...f.imports);
  }

  const depCounts = countDeps(allDeps);

  // Ensure vault structure
  await ensureVaultStructure(userId);

  // Upload each department batch
  let totalIndexed = 0;
  const deptCounts: Record<Department, number> = {
    frontend: 0, backend: 0, database: 0, "ai-agents": 0, infrastructure: 0,
  };

  for (const [dept, group] of Object.entries(deptGroups) as Array<[Department, ClonedFile[]]>) {
    if (group.length === 0) continue;

    const bucketFiles: BucketFile[] = group.map((f) => ({
      path: `repos/${repoSlug}/${f.relativePath}`,
      content: "", // We'll read lazily below
      contentType: "text/plain",
      metadata: {
        repo: repoSlug,
        platform,
        department: dept,
        subDepartment: f.subDepartment ?? "",
        language: f.language,
        imports: f.imports.join(","),
        exports: f.exports.join(","),
      },
    }));

    // Read file contents
    for (let i = 0; i < bucketFiles.length; i++) {
      const f = group[i];
      let content = "";
      try {
        content = await fs.readFile(f.absolutePath, "utf-8");
      } catch {
        continue;
      }
      bucketFiles[i].content = content;
    }

    const uploadResult = await batchUploadToVault(userId, dept, bucketFiles, repoSlug);
    if (uploadResult.ok) {
      deptCounts[dept] = uploadResult.entries.length;
      totalIndexed += uploadResult.entries.length;
    }
  }

  // Cleanup
  await cleanup(workDir);

  return {
    ok: true,
    repoSlug,
    platform,
    filesProcessed: sliced.length,
    departments: deptCounts,
    entriesIndexed: totalIndexed,
    cleanUpPath: workDir,
  };
}

/**
 * Index-only mode: categorizes and returns the vault entries without
 * actually cloning (useful for already-cloned repos or dry-runs).
 */
export async function indexLocalDirectory(
  dirPath: string,
  userId: string,
  repoSlug: string,
  platform: SourcePlatform = "github"
): Promise<CloneResult> {
  const files: ClonedFile[] = [];
  await walkFiles(dirPath, dirPath, files);

  const deptCounts: Record<Department, number> = {
    frontend: 0, backend: 0, database: 0, "ai-agents": 0, infrastructure: 0,
  };

  const deptGroups: Record<Department, ClonedFile[]> = {
    frontend: [], backend: [], database: [], "ai-agents": [], infrastructure: [],
  };

  for (const f of files) {
    deptGroups[f.department].push(f);
  }

  await ensureVaultStructure(userId);

  let indexed = 0;
  for (const [dept, group] of Object.entries(deptGroups) as Array<[Department, ClonedFile[]]>) {
    if (group.length === 0) continue;

    const bucketFiles: BucketFile[] = [];
    for (const f of group) {
      let content = "";
      try { content = await fs.readFile(f.absolutePath, "utf-8"); } catch { continue; }
      bucketFiles.push({
        path: `repos/${repoSlug}/${f.relativePath}`,
        content,
        contentType: "text/plain",
        metadata: {
          repo: repoSlug,
          platform,
          department: dept,
          subDepartment: f.subDepartment ?? "",
          language: f.language,
        },
      });
    }

    const res = await batchUploadToVault(userId, dept, bucketFiles, repoSlug);
    if (res.ok) {
      deptCounts[dept] = res.entries.length;
      indexed += res.entries.length;
    }
  }

  return {
    ok: true,
    repoSlug,
    platform,
    filesProcessed: files.length,
    departments: deptCounts,
    entriesIndexed: indexed,
  };
}

// ── Helpers ──────────────────────────────────────────────

function deriveSlug(url: string): string {
  // https://github.com/owner/repo.git → owner/repo
  const cleaned = url.replace(/\.git$/, "").replace(/\/$/, "");
  const parts = cleaned.split("/");
  return parts.slice(-2).join("/");
}

function execAsync(cmd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

function countDeps(deps: string[]): string[] {
  const freq: Record<string, number> = {};
  for (const d of deps) freq[d] = (freq[d] ?? 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([name]) => name);
}

function errorResult(
  slug: string,
  platform: SourcePlatform,
  error: string,
  cleanUpPath?: string
): CloneResult {
  if (cleanUpPath) cleanup(cleanUpPath);
  return {
    ok: false,
    repoSlug: slug,
    platform,
    filesProcessed: 0,
    departments: { frontend: 0, backend: 0, database: 0, "ai-agents": 0, infrastructure: 0 },
    entriesIndexed: 0,
    error,
  };
}

async function cleanup(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch { /* best-effort */ }
}

/** Re-export for convenience. */
export { CODE_EXTENSIONS, IGNORE_DIRS };