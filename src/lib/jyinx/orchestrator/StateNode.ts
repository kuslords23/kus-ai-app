"use client";

export interface StateNode {
  id: string;
  parentId: string | null;
  branch: string;
  timestamp: Date;
  phase: "idle" | "planning" | "executing" | "testing" | "committing" | "completed" | "failed";
  userIntent: string;
  repository: string;
  tasks: Array<{
    id: string;
    role: string;
    status: string;
    prompt: string;
    statusMessage: string;
    completedAt?: Date;
  }>;
  logs: Array<{
    id: string;
    timestamp: Date;
    action: string;
    details: string;
    status: string;
    success: boolean;
    error?: string;
  }>;
  files: Record<string, string>;
  metadata: Record<string, unknown>;
  label?: string;
  error?: string;
}

export interface Branch {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  nodeCount: number;
  active: boolean;
}

export interface ReplayOptions {
  branchId?: string;
  fromNodeId?: string;
  preserveCurrent?: boolean;
  label?: string;
}