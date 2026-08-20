"use strict";

/**
 * Shared code categorization helpers used by the code vault, multi-source
 * ingestion, and auto-ingest pipelines. Local regex/AST analysis only — no
 * LLM token cost for everyday mapping.
 */

export type Department =
  | "frontend"
  | "backend"
  | "database"
  | "ai-agents"
  | "infrastructure";

const EXT_LANGUAGE: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
  mjs: "javascript", cjs: "javascript",
  py: "python", rs: "rust", go: "go", java: "java",
  kt: "kotlin", kts: "kotlin", swift: "swift", rb: "ruby",
  php: "php", cs: "csharp", fs: "fsharp",
  sql: "sql", prisma: "prisma", graphql: "graphql",
  html: "html", css: "css", scss: "scss", sass: "sass", less: "less",
  vue: "vue", svelte: "svelte", astro: "astro",
  json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
  md: "markdown", mdx: "mdx",
  sh: "shell", bash: "shell", zsh: "shell",
  tf: "terraform", hcl: "hcl",
  c: "c", cpp: "cpp", h: "c-header", hpp: "c-header",
};

const FRONTEND_LANGS = new Set(["typescript", "tsx", "javascript", "jsx", "html", "css", "scss", "sass", "less", "vue", "svelte", "astro"]);
const DATABASE_LANGS = new Set(["sql", "prisma", "graphql"]);
const INFRA_LANGS = new Set(["terraform", "hcl", "dockerfile", "yaml", "toml", "shell", "bash", "json"]);
const AI_LANGS = new Set(["python"]);

/** Detects language from a filename/URL extension. */
export function detectLanguageFromExt(name: string): string {
  const base = name.toLowerCase();
  if (base === "dockerfile") return "dockerfile";
  const ext = base.split(".").pop() ?? "";
  return EXT_LANGUAGE[ext] ?? "text";
}

/** Lightweight content-based language sniffing. */
export function detectLanguageFromContent(content: string): string | null {
  const c = content.trimStart().slice(0, 2000);
  if (c.includes("def ") || c.includes("import ") || c.includes("class ") && /\bdef\s+\w+/.test(c)) return "python";
  if (c.startsWith("import React") || c.includes("function ") || c.includes("const ") || c.includes("export default")) return "typescript";
  if (c.includes("FROM ") && c.includes("RUN ")) return "dockerfile";
  if (c.includes("SELECT ") && c.includes("FROM ")) return "sql";
  if (c.startsWith("{") && (c.includes('"') )) return "json";
  return null;
}

/** Resolves a language for a snippet/markdown fence. */
export function detectLanguage(name: string, content?: string, declared?: string): string {
  if (declared) return declared;
  const fromPath = detectLanguageFromExt(name);
  if (fromPath !== "text") return fromPath;
  if (content) {
    const sniffed = detectLanguageFromContent(content);
    if (sniffed) return sniffed;
  }
  return "text";
}

/** Maps a language to its primary department. */
export function departmentForLanguage(language: string): Department {
  if (FRONTEND_LANGS.has(language)) return "frontend";
  if (DATABASE_LANGS.has(language)) return "database";
  if (INFRA_LANGS.has(language)) return "infrastructure";
  if (AI_LANGS.has(language)) return "ai-agents";
  return "backend";
}

const SUB_MARKERS: Record<Department, Array<{ sub: string; patterns: string[] }>> = {
  frontend: [
    { sub: "components", patterns: ["components", "ui", "widgets", "views"] },
    { sub: "pages", patterns: ["pages", "routes", "screens", "page."] },
    { sub: "styles", patterns: ["styles", "css"] },
    { sub: "hooks", patterns: ["hooks", "use"] },
    { sub: "state", patterns: ["store", "redux", "context", "zustand"] },
  ],
  backend: [
    { sub: "routes", patterns: ["routes", "controllers", "handlers"] },
    { sub: "services", patterns: ["services", "domain"] },
    { sub: "middleware", patterns: ["middleware"] },
    { sub: "models", patterns: ["models", "entities"] },
  ],
  database: [
    { sub: "migrations", patterns: ["migration"] },
    { sub: "schemas", patterns: ["schema", "prisma", "drizzle"] },
    { sub: "queries", patterns: ["query", "queries"] },
  ],
  "ai-agents": [
    { sub: "prompts", patterns: ["prompt", "system"] },
    { sub: "tools", patterns: ["tool", "function"] },
    { sub: "chains", patterns: ["chain", "pipeline"] },
  ],
  infrastructure: [
    { sub: "ci", patterns: [".github", "workflow", "ci"] },
    { sub: "docker", patterns: ["docker"] },
    { sub: "terraform", patterns: ["tf", "terraform"] },
    { sub: "config", patterns: ["config", "env"] },
  ],
};

/** Derives a sub-department from a file path. */
export function subDepartmentFor(path: string, department: Department): string | undefined {
  const lower = path.toLowerCase();
  const markers = SUB_MARKERS[department];
  if (!markers) return undefined;
  for (const group of markers) {
    if (group.patterns.some((p) => lower.includes(p))) return group.sub;
  }
  return undefined;
}

/** Convenience: return department + sub + language for a snippet/file. */
export function guessLanguageAndDepartment(
  name: string,
  content?: string,
  declared?: string
): { department: Department; subDepartment?: string; language: string } {
  const language = detectLanguage(name, content, declared);
  const department = departmentForLanguage(language);
  return {
    department,
    subDepartment: subDepartmentFor(name, department),
    language,
  };
}