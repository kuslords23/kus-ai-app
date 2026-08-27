"use client";
import type { AgentResult } from "./types";

/**
 * AgentResult Builder & Validator.
 * Every agent must output a strictly validated AgentResult contract.
 */

const REQUIRED_FIELDS: (keyof AgentResult)[] = [
  "status", "phase", "agentRole", "filesRead", "filesModified",
  "patch", "testsCreated", "testsPassed", "testsFailed",
  "errors", "warnings", "confidence", "recommendation", "snapshotId"
];

export function validateAgentResult(input: Partial<AgentResult>): { valid: boolean; errors: string[]; result: AgentResult | null } {
  const errors: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    if (input[field] === undefined || input[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  if (errors.length > 0) {
    return { valid: false, errors, result: null };
  }
  if (!["success", "failure", "blocked"].includes(input.status!)) {
    errors.push("status must be success | failure | blocked");
  }
  if (typeof input.confidence !== "number" || input.confidence! < 0 || input.confidence! > 1) {
    errors.push("confidence must be a number between 0 and 1");
  }
  if (errors.length > 0) {
    return { valid: false, errors, result: null };
  }
  return { valid: true, errors: [], result: input as AgentResult };
}

export function buildFailureResult(agentRole: string, phase: number, errorMessage: string, snapshotId: string): AgentResult {
  return {
    status: "failure",
    phase,
    agentRole,
    filesRead: [],
    filesModified: [],
    patch: "",
    testsCreated: [],
    testsPassed: false,
    testsFailed: [],
    errors: [errorMessage],
    warnings: [],
    confidence: 0,
    recommendation: "",
    snapshotId
  };
}

export function buildSuccessResult(agentRole: string, phase: number, content: Partial<AgentResult>, snapshotId: string): AgentResult {
  return {
    status: "success",
    phase,
    agentRole,
    filesRead: content.filesRead ?? [],
    filesModified: content.filesModified ?? [],
    patch: content.patch ?? "",
    testsCreated: content.testsCreated ?? [],
    testsPassed: content.testsPassed ?? true,
    testsFailed: content.testsFailed ?? [],
    errors: content.errors ?? [],
    warnings: content.warnings ?? [],
    confidence: content.confidence ?? 1.0,
    recommendation: content.recommendation ?? "",
    snapshotId
  };
}
