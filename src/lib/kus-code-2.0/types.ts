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

export interface PhaseConfig {
  phase: number;
  name: string;
  agents: string[];
}

export interface PipelineConfig {
  phases: PhaseConfig[];
  maxRetriesPerPhase: number;
  modelTier: string;
  repository: string;
  branch: string;
  userIntent: string;
  contextFiles: Array<{ path: string; content: string }>;
}

export interface OrchestratorState {
  pipelineId: string;
  currentPhase: number;
  currentAgentIndex: number;
  startTime: number;
  config: PipelineConfig;
  status: string;
  activeBranchId: string;
}

export type ExecutionMode = 'kus-code-1.0' | 'kus-code-2.0' | 'kus-ai-3.0';
