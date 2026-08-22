"use client";

export interface AgentRequest {
  /** Natural language task description */
  task: string;
  /** Optional context files or code snippets */
  context?: string[];
  /** Target repository or workspace */
  repository?: string;
  /** Desired completion deadline (optional) */
  deadline?: string;
}

export interface AgentTask {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "canceled";
  role: string;
  prompt: string;
  statusMessage: string;
  createdAt: Date;
  startedAt: Date;
  completedAt?: Date;
  logId: string;
  agentId: string;
}

export interface AgentExecutionLog {
  id: string;
  timestamp: Date;
  action: "request" | "start" | "execute" | "modify" | "test" | "commit" | "error";
  details: string;
  status: string;
  success: boolean;
  error?: string;
  files?: string[];
  logs?: string[];
}