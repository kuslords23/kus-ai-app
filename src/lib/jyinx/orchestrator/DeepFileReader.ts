/**
 * Deep File Reader
 * Scans workspace directories and reads files for agent context.
 */

export interface FileEntry {
  path: string;
  content: string;
  size: number;
  language: string;
  lastModified: number;
}

export interface DirectoryScanResult {
  root: string;
  files: FileEntry[];
  totalSize: number;
  totalFiles: number;
  scannedAt: Date;
  error?: string;
}

function getLanguage(path: string): string {
  const ext = path.split(".").pop() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript",
    py: "python", go: "go", rs: "rust",
    css: "css", html: "html", json: "json",
    md: "markdown", sql: "sql", yaml: "yaml",
  };
  return map[ext.toLowerCase()] ?? "text";
}

export class DeepFileReader {
  async scanDirectory(rootPath: string): Promise<DirectoryScanResult> {
    try {
      const res = await fetch("/api/jyinx/deep-scan?path=" + encodeURIComponent(rootPath));
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (err: unknown) {
      return { root: rootPath, files: [], totalSize: 0, totalFiles: 0, scannedAt: new Date(), error: String(err) };
    }
  }

  async readFile(filePath: string): Promise<FileEntry | null> {
    try {
      const res = await fetch("/api/jyinx/deep-scan?path=" + encodeURIComponent(filePath) + "&single=true");
      if (!res.ok) return null;
      const data = await res.json();
      return data.file ?? null;
    } catch { return null; }
  }

  findFiles(scan: DirectoryScanResult, pattern: RegExp): FileEntry[] {
    return scan.files.filter(f => pattern.test(f.path));
  }

  formatForContext(scan: DirectoryScanResult, maxTokens: number = 24000): string {
    const parts: string[] = [];
    parts.push("## Project (" + scan.totalFiles + " files)");
    parts.push(scan.files.map(f => f.path).sort().join("\n"));
    for (const file of scan.files.slice(0, 20)) {
      parts.push("");
      parts.push("### " + file.path + " (" + file.language + ")");
      parts.push("```" + file.language);
      parts.push(file.content.slice(0, 2000));
      parts.push("```");
    }
    return parts.join("\n");
  }
}

export const deepFileReader = new DeepFileReader();