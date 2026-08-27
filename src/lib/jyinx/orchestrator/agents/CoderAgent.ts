/**
 * Coder Agent
 *
 * Handles multi-file code generation and modifications within active workspace
 * boundaries. Produces edit blocks that go through the Stacking Box validation
 * pipeline before being committed.
 */

import type { AgentTask, AgentExecutionLog } from "../AgentRequest";

export type CodeEdit = {
  path: string;
  content: string;
  language?: string;
};

export type CoderRequest = {
  intent: string;
  repository: string;
  branch: string;
  contextFiles: Array<{ path: string; content: string }>;
  instructions?: string;
  model?: string;
};

export type CoderResult = {
  edits: CodeEdit[];
  summary: string;
  explanation: string;
};

const PATH_HEADER = /(?:path|file)\s*["':=]\s*["']?([A-Za-z0-9_./-]+(?:\.\w+)?)/i;

/**
 * Parse a coder reply into structured file edits and narration.
 * Supports fenced code blocks with preceding path declarations.
 */
export function parseCoderOutput(reply: string): { edits: CodeEdit[]; narration: string } {
  const fence = /```([\w]*)\n([\s\S]*?)```/g;
  const narrationParts: string[] = [];
  const edits: CodeEdit[] = [];
  let pendingPath: string | null = null;
  let cursor = 0;
  let match;

  while ((match = fence.exec(reply)) !== null) {
    const prose = reply.slice(cursor, match.index);
    narrationParts.push(prose);
    const header = prose.match(PATH_HEADER);
    if (header?.[1]) pendingPath = header[1];

    edits.push({
      path: pendingPath ?? "untitled.txt",
      content: match[2].replace(/\n+$/, ""),
      language: match[1] || undefined,
    });
    cursor = match.index + match[0].length;
  }
  narrationParts.push(reply.slice(cursor));
  return {
    edits,
    narration: narrationParts.join(" ").replace(/\s+/g, " ").trim(),
  };
}

/**
 * Verify structural integrity of code edits (delimiters, empty content).
 */
export function verifyCoderEdits(edits: CodeEdit[]): { pass: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const edit of edits) {
    if (!edit.content.trim()) {
      errors.push(`${edit.path}: file content is empty.`);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/i.test(edit.path)) continue;
    const count = (char: string): number => (edit.content.match(new RegExp(`\\${char}`, "g")) ?? []).length;
    if (count("(") !== count(")")) errors.push(`${edit.path}: unbalanced parentheses.`);
    if (count("[") !== count("]")) errors.push(`${edit.path}: unbalanced brackets.`);
    if (count("{") !== count("}")) errors.push(`${edit.path}: unbalanced braces.`);
  }
  return { pass: errors.length === 0, errors };
}

export class CoderAgent {
  /**
   * Execute a coding task, producing structured edits.
   * In production, this would call the LLM via the model gateway.
   * For now, it returns a structured result compatible with the pipeline.
   */
  async execute(request: CoderRequest): Promise<CoderResult> {
    // Build context summary
    const contextSummary = request.contextFiles
      .map((f) => `### ${f.path}\n${f.content}`)
      .join("\n\n");

    // In production, this would call the LLM
    // For now, simulate a structured response
    const edits: CodeEdit[] = request.contextFiles.map((f) => ({
      path: f.path,
      content: f.content,
    }));

    return {
      edits,
      summary: `Generated ${edits.length} file edit(s) for: ${request.intent}`,
      explanation: `Coder agent processed request for ${request.repository} on branch ${request.branch}`,
    };
  }

  /**
   * Apply a healing pass: given validation errors, produce corrected content.
   */
  async heal(intent: string, filePath: string, currentContent: string, errors: string[]): Promise<CodeEdit> {
    // In production, this would call the LLM with the error log
    return {
      path: filePath,
      content: currentContent,
      language: filePath.split(".").pop(),
    };
  }
}

export const coderAgent = new CoderAgent();