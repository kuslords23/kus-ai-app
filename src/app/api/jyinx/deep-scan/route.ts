import { NextResponse } from "next/server";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const MAX_FILE_SIZE = 500_000;
const MAX_TOTAL_BYTES = 10_000_000;
const IGNORE = /node_modules|\.git|\.next|\.cache|dist|\.turbo|coverage|\.env|vendor|\.DS_Store|build|__pycache__/i;

function getLang(path: string): string {
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", rs: "rust", go: "go", css: "css",
    html: "html", json: "json", md: "markdown", sql: "sql",
    yaml: "yaml", yml: "yaml", sh: "shell", bash: "shell",
    prisma: "prisma",
  };
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  if (name === "dockerfile") return "dockerfile";
  return map[name.split(".").pop() ?? ""] ?? "text";
}

function scanDir(dir: string, base: string): Array<{
  path: string;
  content: string;
  size: number;
  language: string;
  lastModified: number;
}> {
  const files: Array<{
    path: string;
    content: string;
    size: number;
    language: string;
    lastModified: number;
  }> = [];
  let totalBytes = 0;

  try {
    for (const entry of readdirSync(dir)) {
      if (IGNORE.test(entry)) continue;
      const full = join(dir, entry);
      const rel = relative(base, full).replace(/\\/g, "/");

      try {
        const stats = statSync(full);
        if (stats.isDirectory()) {
          const sub = scanDir(full, base);
          files.push(...sub);
          totalBytes += sub.reduce((s, f) => s + f.size, 0);
          if (totalBytes > MAX_TOTAL_BYTES) break;
        } else if (stats.isFile() && stats.size <= MAX_FILE_SIZE) {
          const content = readFileSync(full, "utf-8");
          files.push({ path: rel, content, size: stats.size, language: getLang(rel), lastModified: stats.mtimeMs });
          totalBytes += stats.size;
        }
      } catch { /* skip unreadable */ }

      if (totalBytes > MAX_TOTAL_BYTES) break;
    }
  } catch { /* permission denied */ }

  return files;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rootPath = searchParams.get("path");
  const single = searchParams.get("single") === "true";

  if (!rootPath) return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
  if (rootPath.includes("..") || rootPath.includes("~") || rootPath.length > 500) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    if (single) {
      const stats = statSync(rootPath);
      if (stats.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "File too large" }, { status: 413 });
      }
      const content = readFileSync(rootPath, "utf-8");
      return NextResponse.json({
        file: { path: rootPath, content, size: stats.size, language: getLang(rootPath), lastModified: stats.mtimeMs },
      });
    }

    const files = scanDir(rootPath, rootPath);
    const totalSize = files.reduce((s, f) => s + f.size, 0);

    return NextResponse.json({
      root: rootPath,
      files,
      totalSize,
      totalFiles: files.length,
      scannedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: String(err),
        root: rootPath,
        files: [],
        totalSize: 0,
        totalFiles: 0,
        scannedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}