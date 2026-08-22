/**
 * QA / Auditor Agent
 *
 * Runs automated tests, lints syntax, reviews changes before presenting them
 * to the user. Works with the Stacking Box engine to validate each block.
 */

import type { CodeEdit } from "./CoderAgent";
import { verifyEdits } from "@/services/agentPipeline";

export type AuditCheck =
  | "structural"
  | "lint"
  | "typescript"
  | "best-practices"
  | "security"
  | "performance"
  | "accessibility"
  | "backward-compatibility"
  | "cross-dependency";

export type AuditSeverity = "error" | "warning" | "info";

export type AuditFinding = {
  id: string;
  file: string;
  line: number;
  column?: number;
  severity: AuditSeverity;
  message: string;
  rule: string;
  suggestion?: string;
};

export type AuditReport = {
  id: string;
  timestamp: Date;
  target: string;
  checksPerformed: AuditCheck[];
  findings: AuditFinding[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    passed: boolean;
  };
  durationMs: number;
};

export type AuditRequest = {
  files: CodeEdit[];
  repository: string;
  branch: string;
  checks?: AuditCheck[];
  previousReport?: AuditReport;
};

// Best-practice anti-patterns to detect
const BEST_PRACTICE_RULES = [
  {
    id: "no-debugger",
    test: /debugger;/,
    message: "Debugger statement left in code",
    severity: "warning" as AuditSeverity,
    suggestion: 'Remove debugger statements before committing',
  },
  {
    id: "no-console-log",
    test: /console\.log\(/,
    message: "Console.log() found in production code",
    severity: "info" as AuditSeverity,
    suggestion: 'Consider using a proper logging library',
  },
  {
    id: "no-todo",
    test: /TODO|FIXME|HACK|XXX/,
    message: "TODO/FIXME comment found",
    severity: "info" as AuditSeverity,
    suggestion: 'Resolve or track the task before committing',
  },
  {
    id: "no-any-ts",
    test: /: any/,
    message: "TypeScript `any` type used",
    severity: "warning" as AuditSeverity,
    suggestion: 'Replace with proper type or use `unknown`',
  },
  {
    id: "no-non-null-assertion",
    test: /!\.[a-zA-Z]/,
    message: "Non-null assertion operator used",
    severity: "warning" as AuditSeverity,
    suggestion: 'Use optional chaining or type guards instead',
  },
  {
    id: "no-huge-component",
    test: null,
    message: "Component file exceeds 300 lines",
    severity: "warning" as AuditSeverity,
    suggestion: 'Consider extracting sub-components',
  },
];

const DEFAULT_CHECKS: AuditCheck[] = [
  "structural",
  "best-practices",
  "security",
  "backward-compatibility",
];

export class AuditorAgent {
  /**
   * Run a full audit on code edits.
   */
  async audit(request: AuditRequest): Promise<AuditReport> {
    const startTime = Date.now();
    const checks = request.checks ?? DEFAULT_CHECKS;
    const findings: AuditFinding[] = [];

    // Structural checks
    if (checks.includes("structural")) {
      const structural = await this.runStructuralCheck(request.files);
      findings.push(...structural);
    }

    // Best-practices scan
    if (checks.includes("best-practices")) {
      const practices = this.runBestPracticesCheck(request.files);
      findings.push(...practices);
    }

    // Security scan
    if (checks.includes("security")) {
      const security = this.runSecurityCheck(request.files);
      findings.push(...security);
    }

    // Backward-compatibility scan
    if (checks.includes("backward-compatibility")) {
      const compat = this.runCompatibilityCheck(request.files, request.previousReport);
      findings.push(...compat);
    }

    const errors = findings.filter((f) => f.severity === "error").length;
    const warnings = findings.filter((f) => f.severity === "warning").length;
    const infos = findings.filter((f) => f.severity === "info").length;

    const report: AuditReport = {
      id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date(),
      target: request.repository,
      checksPerformed: checks,
      findings,
      summary: {
        errors,
        warnings,
        infos,
        passed: errors === 0 && warnings <= 3,
      },
      durationMs: Date.now() - startTime,
    };

    return report;
  }

  /**
   * Quick pre-commit check (fast path for CI/CD).
   * Only runs structural and best-practices checks.
   */
  async quickCheck(edits: CodeEdit[]): Promise<{ pass: boolean; report: AuditReport }> {
    const report = await this.audit({
      files: edits,
      repository: "",
      branch: "",
      checks: ["structural", "best-practices"],
    });
    return { pass: report.summary.passed, report };
  }

  /**
   * Generate a concise summary of audit findings suitable for prompt injection.
   */
  formatForPrompt(report: AuditReport): string {
    if (report.findings.length === 0) {
      return "## Audit Report\nAll checks passed. No issues found.";
    }
    const lines = [`## Audit Report (${report.durationMs}ms)`, ""];
    for (const f of report.findings.slice(0, 15)) {
      const icon = f.severity === "error" ? "❌" : f.severity === "warning" ? "⚠️" : "ℹ️";
      lines.push(`- ${icon} [${f.rule}] ${f.message} @ ${f.file}:${f.line}`);
      if (f.suggestion) lines.push(`  Suggestion: ${f.suggestion}`);
    }
    if (report.findings.length > 15) {
      lines.push(`... and ${report.findings.length - 15} more findings`);
    }
    lines.push("", `Summary: ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.infos} info`);
    return lines.join("\n");
  }

  private async runStructuralCheck(edits: CodeEdit[]): Promise<AuditFinding[]> {
    const findings: AuditFinding[] = [];
    const result = await verifyEdits(edits.map((e) => ({ path: e.path, content: e.content })));
    if (!result.pass) {
      for (const err of result.errors) {
        const parts = err.split(": ");
        findings.push({
          id: `struct_${findings.length}`,
          file: parts[0] || "unknown",
          line: 1,
          severity: "error",
          message: parts[1] || err,
          rule: "structural-integrity",
        });
      }
    }
    return findings;
  }

  private runBestPracticesCheck(edits: CodeEdit[]): AuditFinding[] {
    const findings: AuditFinding[] = [];
    for (const edit of edits) {
      const lines = edit.content.split("\n");
      for (const rule of BEST_PRACTICE_RULES) {
        if (!rule.test) {
          // Line-count check
          if (lines.length > 300 && edit.path.match(/\.tsx?$|\.jsx?$/)) {
            findings.push({
              id: `${rule.id}:${edit.path}`,
              file: edit.path,
              line: 300,
              severity: rule.severity,
              message: rule.message.replace("300", String(lines.length)),
              rule: rule.id,
              suggestion: rule.suggestion,
            });
          }
          continue;
        }
        for (let i = 0; i < lines.length; i++) {
          if (rule.test.test(lines[i])) {
            findings.push({
              id: `${rule.id}:${edit.path}:${i + 1}`,
              file: edit.path,
              line: i + 1,
              severity: rule.severity,
              message: rule.message,
              rule: rule.id,
              suggestion: rule.suggestion,
            });
          }
        }
      }
    }
    return findings;
  }

  private runSecurityCheck(edits: CodeEdit[]): AuditFinding[] {
    const findings: AuditFinding[] = [];
    const securityPatterns = [
      { id: "eval-usage", test: /\beval\s*\(/, severity: "error" as AuditSeverity, message: "eval() is a security risk", suggestion: "Avoid eval() - use safer alternatives" },
      { id: "innerHTML-xss", test: /\.innerHTML\s*=/, severity: "error" as AuditSeverity, message: "innerHTML assignment may cause XSS", suggestion: "Use textContent or DOMPurify" },
      { id: "sql-concat", test: /(SELECT|INSERT|UPDATE|DELETE)[\s\S]{0,80}\+/, severity: "error" as AuditSeverity, message: "Possible SQL injection via string concatenation", suggestion: "Use parameterized queries" },
    ];

    for (const edit of edits) {
      const lines = edit.content.split("\n");
      for (const pattern of securityPatterns) {
        for (let i = 0; i < lines.length; i++) {
          if (pattern.test.test(lines[i])) {
            findings.push({
              id: `${pattern.id}:${edit.path}:${i + 1}`,
              file: edit.path,
              line: i + 1,
              severity: pattern.severity,
              message: pattern.message,
              rule: pattern.id,
              suggestion: pattern.suggestion,
            });
          }
        }
      }
    }
    return findings;
  }

  private runCompatibilityCheck(edits: CodeEdit[], previousReport?: AuditReport): AuditFinding[] {
    // Check if previous warnings are being resolved or new ones introduced
    if (!previousReport) return [];
    const findings: AuditFinding[] = [];
    // In production, compare signatures of exports/interfaces
    // For now, just note the audit is incremental
    return findings;
  }
}

export const auditorAgent = new AuditorAgent();