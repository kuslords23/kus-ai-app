/**
 * Defensive Red Team Security Auditor
 *
 * Runs static pattern checks for common vulnerability classes and returns
 * findings + patch recommendations for the Coder agent.
 *
 * Intentionally does NOT generate exploit payloads, PoCs, or attack procedures.
 */

export type FindingCategory =
  | "sql-injection"
  | "xss"
  | "path-traversal"
  | "auth-bypass"
  | "command-injection"
  | "secrets"
  | "exposed-endpoint";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type SecurityFinding = {
  id: string;
  category: FindingCategory;
  riskLevel: RiskLevel;
  filePath?: string;
  lineHint?: number;
  summary: string;
  evidence: string;
  patchRecommendation: string;
};

export type AuditResult = {
  id: string;
  target: string;
  status: "passed" | "failed" | "in-progress";
  findings: SecurityFinding[];
  overallRiskScore: number;
  timestamp: Date;
  recommendedActions: string[];
};

type PatternRule = {
  id: string;
  category: FindingCategory;
  riskLevel: RiskLevel;
  test: RegExp;
  summary: string;
  patchRecommendation: string;
};

const RULES: PatternRule[] = [
  {
    id: "sql-concat",
    category: "sql-injection",
    riskLevel: "critical",
    test: /(?:SELECT|INSERT|UPDATE|DELETE)[\s\S]{0,80}\+\s*(?:req\.|params\.|query\.|body\.|user)/i,
    summary: "Possible SQL built via string concatenation with request input",
    patchRecommendation:
      "Use parameterized queries / prepared statements or an ORM query builder. Never concatenate user input into SQL.",
  },
  {
    id: "xss-innerhtml",
    category: "xss",
    riskLevel: "high",
    test: /\.innerHTML\s*=\s*(?!['"`])/,
    summary: "Dynamic innerHTML assignment may allow XSS",
    patchRecommendation: "Prefer textContent or a sanitizer (e.g. DOMPurify) before rendering HTML.",
  },
  {
    id: "path-traversal",
    category: "path-traversal",
    riskLevel: "high",
    test: /(?:readFile|writeFile|createReadStream)\s*\(\s*(?:req\.|params\.|query\.)/i,
    summary: "Filesystem path derived directly from request input",
    patchRecommendation: "Resolve paths against a fixed root and reject `..` segments before IO.",
  },
  {
    id: "rls-bypass-hint",
    category: "auth-bypass",
    riskLevel: "critical",
    test: /\.from\(['"`]\w+['"`]\)[\s\S]{0,120}\.select\([^)]*\)(?![\s\S]{0,80}\.eq\(['"`]user_id)/i,
    summary: "Database select may lack user-scoped filter (RLS risk if policies are weak)",
    patchRecommendation:
      "Enforce RLS on the table and always scope queries by authenticated user id on the server.",
  },
  {
    id: "cmd-exec",
    category: "command-injection",
    riskLevel: "critical",
    test: /(?:exec|execSync|spawn)\s*\(\s*[`'"].*\$\{|(?:exec|execSync)\s*\(\s*(?:req\.|params\.)/i,
    summary: "Shell execution may include untrusted input",
    patchRecommendation: "Avoid shelling out with user input. Use allow-listed commands and argv arrays without a shell.",
  },
  {
    id: "hardcoded-secret",
    category: "secrets",
    riskLevel: "high",
    test: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{12,}['"]/i,
    summary: "Possible hardcoded credential in source",
    patchRecommendation: "Move secrets to environment variables or a vault; rotate any exposed credentials.",
  },
  {
    id: "open-cors",
    category: "exposed-endpoint",
    riskLevel: "medium",
    test: /Access-Control-Allow-Origin['":\s]+['"]?\*/i,
    summary: "Wildcard CORS may expose authenticated endpoints",
    patchRecommendation: "Restrict CORS origins to known frontends; never combine `*` with credentials.",
  },
];

function riskScore(level: RiskLevel): number {
  switch (level) {
    case "low":
      return 1;
    case "medium":
      return 3;
    case "high":
      return 7;
    case "critical":
      return 9;
  }
}

export class RedTeamAgent {
  /**
   * Audit a map of file path → source text.
   * Returns findings and patch recommendations only (no exploit payloads).
   */
  auditFiles(files: Record<string, string>, target = "workspace"): AuditResult {
    const findings: SecurityFinding[] = [];

    for (const [filePath, content] of Object.entries(files)) {
      const lines = content.split("\n");
      for (const rule of RULES) {
        for (let i = 0; i < lines.length; i++) {
          if (!rule.test.test(lines[i]!)) continue;
          findings.push({
            id: `${rule.id}:${filePath}:${i + 1}`,
            category: rule.category,
            riskLevel: rule.riskLevel,
            filePath,
            lineHint: i + 1,
            summary: rule.summary,
            evidence: lines[i]!.trim().slice(0, 160),
            patchRecommendation: rule.patchRecommendation,
          });
        }
      }
    }

    const overallRiskScore =
      findings.length === 0
        ? 0
        : Math.min(10, Math.round(findings.reduce((s, f) => s + riskScore(f.riskLevel), 0) / findings.length));

    const categories = new Set(findings.map((f) => f.category));
    const recommendedActions: string[] = [];
    if (categories.has("sql-injection")) recommendedActions.push("Parameterize all database queries");
    if (categories.has("xss")) recommendedActions.push("Sanitize / escape untrusted HTML output");
    if (categories.has("auth-bypass")) recommendedActions.push("Review RLS policies and auth guards");
    if (categories.has("secrets")) recommendedActions.push("Rotate and vault any hardcoded secrets");
    if (categories.has("command-injection")) recommendedActions.push("Remove shell interpolation of user input");
    if (categories.has("exposed-endpoint")) recommendedActions.push("Tighten CORS and auth on public routes");
    if (recommendedActions.length === 0) recommendedActions.push("No critical static findings — keep CI security checks enabled");

    return {
      id: `audit_${Date.now().toString(36)}`,
      target,
      status: findings.length > 0 ? "failed" : "passed",
      findings,
      overallRiskScore,
      timestamp: new Date(),
      recommendedActions,
    };
  }

  /** Prompt fragment for the Coder agent after an audit. */
  formatPatchBrief(result: AuditResult): string {
    if (result.findings.length === 0) return "Red Team audit passed — no static findings.";
    const lines = [`## Red Team Findings (${result.findings.length})`, ""];
    for (const f of result.findings.slice(0, 20)) {
      lines.push(`- [${f.riskLevel}] ${f.summary}${f.filePath ? ` @ ${f.filePath}:${f.lineHint}` : ""}`);
      lines.push(`  Patch: ${f.patchRecommendation}`);
    }
    lines.push("", "Recommended actions:", ...result.recommendedActions.map((a) => `- ${a}`));
    return lines.join("\n");
  }
}

export const redTeamAgent = new RedTeamAgent();
