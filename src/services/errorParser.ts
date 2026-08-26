/**
 * Structured error parser for build/type-check/test output.
 *
 * Extracts file paths, line numbers, column numbers, and error messages from
 * common tool output formats (TypeScript, ESLint, npm test, Python, etc.) so
 * the autonomous agent can target fixes precisely instead of dumping the entire
 * error log back to the LLM.
 *
 * The parsed errors are structured into a format the coder agent can consume
 * to produce a targeted patch — file, line, column, message, and severity.
 */

export type ErrorSeverity = "error" | "warning" | "info";

export interface ParsedError {
  /** File path relative to the repository root. */
  file: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column number (0 if unknown). */
  column: number;
  /** The error or warning message. */
  message: string;
  /** Severity classification. */
  severity: ErrorSeverity;
  /** Raw error code (e.g. "TS2322", "ESLint:no-unused-vars"). */
  code?: string;
  /** The raw line of output this was parsed from. */
  raw: string;
}

export interface ParsedErrorReport {
  errors: ParsedError[];
  warnings: ParsedError[];
  /** Unique files affected. */
  affectedFiles: string[];
  /** Summary message for the coder agent. */
  summary: string;
}

// ── TSC / TypeScript error format ───────────────────────────────────────────
// src/file.ts:123:45 - error TS2322: Type 'X' is not assignable to type 'Y'.
const TSC_RE = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/;
// Alternative: src/file.ts(123,45): error TS2322: ...
const TSC_RE_ALT = /^(.+?):(\d+):(\d+)\s+-\s+(error|warning)\s+(TS\d+):\s+(.+)$/;

// ── ESLint error format ─────────────────────────────────────────────────────
// /path/to/file.ts
//   123:45  error  no-unused-vars  'x' is defined but never used
const ESLINT_RE = /^\s+(\d+):(\d+)\s+(error|warning)\s+(\S+)\s+(.+)$/;

// ── Generic file:line:col format ────────────────────────────────────────────
// file.ts:line:col: error message
const GENERIC_RE = /^(.+?):(\d+)(?::(\d+))?:\s+(error|warning)?\s*(.+)$/i;

// ── npm test / Jest format ──────────────────────────────────────────────────
// FAIL src/file.test.ts
//   ● Test name › assertion
//     expect(received).toBe(expected)
const JEST_FAIL_RE = /^FAIL\s+(.+?)(?:\s|$)/;
const JEST_TEST_RE = /^\s+●\s+(.+)$/;

/**
 * Parse a single line of build/test output into a structured error, or null.
 */
function parseLine(line: string, baseDir?: string): ParsedError | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let match: RegExpMatchArray | null;

  // TypeScript format: src/file.ts(123,45): error TS2322: message
  match = trimmed.match(TSC_RE);
  if (match) {
    const file = cleanPath(match[1], baseDir);
    return {
      file,
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      severity: match[4] as ErrorSeverity,
      code: match[5],
      message: match[6],
      raw: trimmed,
    };
  }

  // TypeScript alt format: src/file.ts:123:45 - error TS2322: message
  match = trimmed.match(TSC_RE_ALT);
  if (match) {
    const file = cleanPath(match[1], baseDir);
    return {
      file,
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      severity: match[4] as ErrorSeverity,
      code: match[5],
      message: match[6],
      raw: trimmed,
    };
  }

  // ESLint format
  match = trimmed.match(ESLINT_RE);
  if (match && trimmed.startsWith(" ")) {
    // ESLint errors come on the line after the file path
    // We need the file context — handled by parseOutput
    return {
      file: "", // file is set by the caller
      line: parseInt(match[1], 10),
      column: parseInt(match[2], 10),
      severity: match[3] as ErrorSeverity,
      code: `ESLint:${match[4]}`,
      message: match[5],
      raw: trimmed,
    };
  }

  // Generic file:line:col format
  match = trimmed.match(GENERIC_RE);
  if (match) {
    const file = cleanPath(match[1], baseDir);
    const stat = match[4]?.toLowerCase() as ErrorSeverity | undefined;
    return {
      file,
      line: parseInt(match[2], 10),
      column: match[3] ? parseInt(match[3], 10) : 0,
      severity: stat === "warning" ? "warning" : "error",
      message: match[5],
      raw: trimmed,
    };
  }

  // Jest FAIL line
  match = trimmed.match(JEST_FAIL_RE);
  if (match) {
    const file = cleanPath(match[1], baseDir);
    return {
      file,
      line: 1,
      column: 0,
      severity: "error",
      message: `Test suite failed: ${file}`,
      raw: trimmed,
    };
  }

  return null;
}

/**
 * Clean a file path: strip baseDir prefix, remove leading ./ or /.
 */
function cleanPath(path: string, baseDir?: string): string {
  let p = path.trim();
  if (baseDir && p.startsWith(baseDir)) {
    p = p.slice(baseDir.length).replace(/^[/\\]/, "");
  }
  return p.replace(/^\.\//, "").replace(/^[/\\]/, "");
}

/**
 * Parse full build/test output (multi-line string) into structured errors.
 */
export function parseBuildOutput(
  output: string,
  options?: { baseDir?: string }
): ParsedErrorReport {
  const lines = output.split("\n");
  const errors: ParsedError[] = [];
  const warnings: ParsedError[] = [];
  const fileSet = new Set<string>();

  let currentEslintFile = "";

  for (const line of lines) {
    // Track ESLint file headers: /path/to/file.ts
    if (/^\s*\/\S+\.(ts|tsx|js|jsx)\s*$/.test(line.trim())) {
      currentEslintFile = cleanPath(line.trim(), options?.baseDir);
      continue;
    }

    const parsed = parseLine(line, options?.baseDir);
    if (!parsed) continue;

    // ESLint: use the tracked file header
    if (!parsed.file && currentEslintFile) {
      parsed.file = currentEslintFile;
    }
    if (!parsed.file) continue;

    fileSet.add(parsed.file);

    if (parsed.severity === "warning") {
      warnings.push(parsed);
    } else {
      errors.push(parsed);
    }
  }

  const summary = buildSummary(errors, warnings);

  return {
    errors,
    warnings,
    affectedFiles: [...fileSet],
    summary,
  };
}

function buildSummary(errors: ParsedError[], warnings: ParsedError[]): string {
  const parts: string[] = [];
  if (errors.length > 0) {
    const byFile = new Map<string, number>();
    for (const e of errors) {
      byFile.set(e.file, (byFile.get(e.file) ?? 0) + 1);
    }
    const fileList = [...byFile.entries()]
      .map(([f, c]) => `  - ${f} (${c} error${c === 1 ? "" : "s"})`)
      .join("\n");
    parts.push(`Found ${errors.length} error(s) in ${byFile.size} file(s):\n${fileList}`);
  }
  if (warnings.length > 0) {
    parts.push(`${warnings.length} warning(s) also present.`);
  }
  if (parts.length === 0) {
    return "No errors found.";
  }
  return parts.join("\n");
}

/**
 * Format parsed errors into a compact prompt for the coder agent.
 * Includes file, line, code, and message — scoped to the most relevant errors.
 */
export function formatErrorsForCoder(report: ParsedErrorReport, maxErrors = 20): string {
  if (report.errors.length === 0) {
    return "All checks passed with no errors.";
  }

  const lines: string[] = [
    `## Build Errors (${report.errors.length} total, showing ${Math.min(report.errors.length, maxErrors)})`,
    "",
  ];

  for (const err of report.errors.slice(0, maxErrors)) {
    const code = err.code ? ` [${err.code}]` : "";
    lines.push(`- **${err.file}:${err.line}:${err.column}**${code}`);
    lines.push(`  ${err.message}`);
    lines.push("");
  }

  if (report.warnings.length > 0) {
    lines.push(`## Warnings (${report.warnings.length})`);
    for (const warn of report.warnings.slice(0, 10)) {
      const code = warn.code ? ` [${warn.code}]` : "";
      lines.push(`- ${warn.file}:${warn.line}${code} — ${warn.message}`);
    }
    lines.push("");
  }

  if (report.affectedFiles.length > 0) {
    lines.push(`## Affected Files`);
    for (const f of report.affectedFiles) {
      lines.push(`- \`${f}\``);
    }
    lines.push("");
  }

  lines.push("Fix the errors above. Output the corrected file(s) in full.");
  return lines.join("\n");
}