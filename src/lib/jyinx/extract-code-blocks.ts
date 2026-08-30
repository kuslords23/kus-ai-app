"use client";

/**
 * Extracts file edits from assistant chat responses.
 * Looks for code blocks with a path header (PATH: src/file.ts), or
 * just treats any fenced code block as a file.
 */

const FILE_RE = /###\s*([^\n]+)\n```[\w+-]*\n([\s\S]*?)```/g;
const PATH_RE = /^PATH:\s*(\S+)\s*$/im;

export interface ExtractedFile {
  path: string;
  content: string;
}

/**
 * Parse a response for fenced code blocks with path headers.
 * Returns extracted files + the clean text (without code blocks).
 */
export function extractCodeBlocks(response: string): {
  files: ExtractedFile[];
  cleanText: string;
} {
  const files: ExtractedFile[] = [];
  let cleanText = response;

  // Try ### path\n```lang\ncontent``` pattern first
  let match: RegExpExecArray | null;
  FILE_RE.lastIndex = 0;
  const found: Array<{ full: string; path: string; content: string }> = [];

  while ((match = FILE_RE.exec(response)) !== null) {
    found.push({ full: match[0], path: match[1].trim(), content: match[2].trim() });
  }

  if (found.length > 0) {
    for (const f of found) {
      files.push({ path: f.path, content: f.content });
      cleanText = cleanText.replace(f.full, `*📄 ${f.path}*`);
    }
    return { files, cleanText };
  }

  // Try PATH: header pattern inside ``` blocks
  const blockRegex = /```[\w+-]*\n([\s\S]*?)```/g;
  while ((match = blockRegex.exec(response)) !== null) {
    const block = match[1];
    const pathMatch = PATH_RE.exec(block);
    if (pathMatch) {
      const path = pathMatch[1];
      const content = block.replace(PATH_RE, "").trim();
      files.push({ path, content });
      cleanText = cleanText.replace(match[0], `*📄 ${path}*`);
    }
  }

  return { files, cleanText };
}

/** Format a file list into a section header. */
export function formatFilesSection(files: ExtractedFile[]): string {
  if (files.length === 0) return "";
  return files.map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n");
}