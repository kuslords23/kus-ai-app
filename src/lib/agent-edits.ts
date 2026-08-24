/**
 * Client-safe code-edit utilities.
 *
 * Extracted OUT of `@/services/agentPipeline` (a server-only module that pulls
 * in `next/headers` via githubCommit/pushHost) so client components like the
 * AuditorAgent / KusOrchestrator can use the pure parsing + verification
 * helpers WITHOUT dragging the server pipeline into the client bundle.
 *
 * This module has NO runtime imports — it is safe in any environment.
 */

export type AgentEdit = { path: string; content: string };

/**
 * Parses a coder reply containing prose narration plus fenced code blocks into
 * `(edits, narration)`. Each fenced block is treated as the full content of its
 * target file, using the nearest `PATH:`/`file:` header line as the path.
 */
export function parseFileEdits(reply: string): { edits: AgentEdit[]; narration: string } {
  const fence = /```[^\n]*\n([\s\S]*?)```/g;
  const narrationParts: string[] = [];
  const edits: AgentEdit[] = [];
  const pathHeader = /(?:path|file)\s*["':=]\s*["']?([A-Za-z0-9_./-]+(?:\.\w+)?)/i;
  let pendingPath: string | null = null;
  let cursor = 0;
  let match;

  while ((match = fence.exec(reply)) !== null) {
    const prose = reply.slice(cursor, match.index);
    narrationParts.push(prose);
    const header = prose.match(pathHeader);
    if (header?.[1]) pendingPath = header[1];
    edits.push({ path: pendingPath ?? "untitled.txt", content: match[1].replace(/\n+$/, "") });
    cursor = match.index + match[0].length;
  }
  narrationParts.push(reply.slice(cursor));
  return { edits, narration: narrationParts.join(" ").replace(/\s+/g, " ").trim() };
}

/**
 * Lightweight structural verification usable in browser/edge where no local
 * checkout exists to run tsc. Detects empty edits and unbalanced delimiters on
 * TS/TSX/JS/JSX files.
 */
export async function verifyEdits(files: AgentEdit[]): Promise<{ pass: boolean; errors: string[] }> {
  const errors: string[] = [];
  for (const file of files) {
    if (!file.content.trim()) {
      errors.push(`${file.path}: file content is empty.`);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/i.test(file.path)) continue;
    const count = (char: string): number => (file.content.match(new RegExp(`\\${char}`, "g")) ?? []).length;
    if (count("(") !== count(")")) errors.push(`${file.path}: unbalanced parentheses.`);
    if (count("[") !== count("]")) errors.push(`${file.path}: unbalanced brackets.`);
    if (count("{") !== count("}")) errors.push(`${file.path}: unbalanced braces.`);
  }
  return { pass: errors.length === 0, errors };
}