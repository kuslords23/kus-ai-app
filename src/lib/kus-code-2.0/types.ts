export interface AgentResult {
  status: "success" | "failure" | "blocked";
  phase: number;
  agentRole: string;
  filesRead: string[];
  filesModified: string[];
  patch: string;
  testsCreated: string[];
  testsPassed: boolean;
  testsFailed: string[];
  errors: string[];
  warnings: string[];
  confidence: number;
  recommendation: string;
  snapshotId: string;
}
