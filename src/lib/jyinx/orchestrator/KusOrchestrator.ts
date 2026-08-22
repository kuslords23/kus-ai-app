"use client";

import type { AgentRequest, AgentTask, AgentExecutionLog } from "./AgentRequest";
import { scoutAgent, type ScoutReport } from "./agents/ScoutAgent";
import { coderAgent, type CoderResult, type CodeEdit } from "./agents/CoderAgent";
import { auditorAgent, type AuditReport } from "./agents/AuditorAgent";
import { timeTravelEngine } from "./TimeTravelEngine";
import type { StateNode } from "./StateNode";

export interface OrchestratorState {
  tasks: AgentTask[];
  logs: AgentExecutionLog[];
  currentPhase: "idle" | "planning" | "executing" | "testing" | "committing" | "completed" | "failed";
  userIntent: string;
  repository: string;
  startTime: Date;
  /** Latest scout report from the current execution */
  scoutReport?: ScoutReport;
  /** Latest coder result from the current execution */
  coderResult?: CoderResult;
  /** Latest audit report from the current execution */
  auditReport?: AuditReport;
  /** Whether autonomous mode is active */
  autonomousMode: boolean;
}

type OrchestratorListener = (state: OrchestratorState) => void;

export class KusOrchestrator {
  private state: OrchestratorState;
  private listeners: Set<OrchestratorListener> = new Set();
  private taskCounter = 0;

  constructor() {
        this.state = {
      tasks: [],
      logs: [],
      currentPhase: "idle",
      userIntent: "",
      repository: "",
      startTime: new Date(),
      autonomousMode: false,
    };
  }

  subscribe(listener: OrchestratorListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private addLog(log: Omit<AgentExecutionLog, "id" | "timestamp">): void {
    this.state.logs.push({
      ...log,
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
    });
    this.notify();
  }

  private addTask(task: Omit<AgentTask, "id" | "createdAt" | "startedAt" | "logId">): AgentTask {
      const newTask: AgentTask = {
        ...task,
        id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date(),
        startedAt: new Date(),
        logId: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      };
    this.state.tasks.push(newTask);
    this.notify();
    return newTask;
  }

  private updateTask(id: string, updates: Partial<AgentTask>): void {
    const task = this.state.tasks.find((t) => t.id === id);
    if (task) {
      Object.assign(task, updates);
      this.notify();
    }
  }

    setUserIntent(intent: string, repository: string): void {
    this.state.userIntent = intent;
    this.state.repository = repository;
    this.state.startTime = new Date();
    this.state.currentPhase = "planning";
    this.state.tasks = [];
    this.state.logs = [];
    this.state.scoutReport = undefined;
    this.state.coderResult = undefined;
    this.state.auditReport = undefined;
    this.notify();
  }

  setAutonomousMode(enabled: boolean): void {
    this.state.autonomousMode = enabled;
    this.notify();
  }

  /**
   * Decompose a high-level user request into a multi-agent execution plan
   */
    async decompose(intent: string): Promise<AgentTask[]> {
    this.addLog({
      action: "request",
      details: `Decomposing user intent: "${intent}"`,
      status: "started",
      success: true,
    });

    // Phase 1: Scout the intent to gather real-time context
    this.addLog({
      action: "execute",
      details: `Scout agent: Gathering live context for "${intent}"`,
      status: "started",
      success: true,
    });

    try {
      const scoutReport = await scoutAgent.scout({
        query: intent,
        sources: ["web", "github", "repo-local"],
      });
      this.state.scoutReport = scoutReport;

      this.addLog({
        action: "execute",
        details: `Scout agent found ${scoutReport.hits.length} references: ${scoutReport.summary}`,
        status: "completed",
        success: true,
      });
    } catch (error) {
      this.addLog({
        action: "error",
        details: `Scout agent failed: ${error instanceof Error ? error.message : "Unknown"}`,
        status: "failed",
        success: false,
      });
    }

    // Create the agent train plan
    const plan = [
      { role: "scout", prompt: `Research and gather context for: ${intent}` },
      { role: "coder", prompt: `Implement solution for: ${intent}` },
      { role: "qa", prompt: `Test and audit implementation for: ${intent}` },
    ];

    const tasks: AgentTask[] = [];
    for (const step of plan) {
      const task = this.addTask({
        status: "pending",
        role: step.role,
        prompt: step.prompt,
        statusMessage: "Waiting to start",
        agentId: `agent_${step.role}`,
      });
      tasks.push(task);
    }

    this.addLog({
      action: "execute",
      details: `Created ${tasks.length} subtasks for execution plan`,
      status: "completed",
      success: true,
    });

    this.state.currentPhase = "executing";
    this.notify();

    return tasks;
  }

  /**
   * Execute the agent train sequentially with state tracking
   */
    async executePlan(tasks: AgentTask[]): Promise<void> {
    this.state.currentPhase = "executing";
    this.notify();

    for (const task of tasks) {
      this.updateTask(task.id, { status: "running", startedAt: new Date() });
      this.addLog({
        action: "start",
        details: `Starting ${task.role} agent: ${task.prompt}`,
        status: "running",
        success: true,
        files: [],
      });

      try {
        // Route to the correct agent based on role
        switch (task.role) {
          case "scout":
            await this.runScoutAgent(task);
            break;
          case "coder":
            await this.runCoderAgent(task);
            break;
          case "qa":
            await this.runAuditorAgent(task);
            break;
          default:
            await this.runAgent(task);
        }

        this.updateTask(task.id, {
          status: "completed",
          completedAt: new Date(),
          statusMessage: "Completed successfully",
        });

        this.addLog({
          action: "execute",
          details: `${task.role} agent completed: ${task.prompt}`,
          status: "completed",
          success: true,
        });
      } catch (error) {
        this.updateTask(task.id, {
          status: "failed",
          completedAt: new Date(),
          statusMessage: `Failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        });

        this.addLog({
          action: "error",
          details: `${task.role} agent failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          status: "failed",
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });

        // On failure, transition to failed state but allow retry
        this.state.currentPhase = "failed";
        this.notify();
        return;
      }
    }

    this.state.currentPhase = "completed";
    this.notify();

    // Snapshot the completed state
    const currentState = timeTravelEngine.getCurrentState();
    if (currentState) {
      timeTravelEngine.snapshot(
        {
          ...currentState,
          phase: "completed",
          userIntent: this.state.userIntent,
          tasks: this.state.tasks.map((t) => ({
            id: t.id,
            role: t.role,
            status: t.status,
            prompt: t.prompt,
            statusMessage: t.statusMessage,
            completedAt: t.completedAt,
          })),
          logs: this.state.logs.map((l) => ({
            id: l.id,
            timestamp: l.timestamp,
            action: l.action,
            details: l.details,
            status: l.status,
            success: l.success,
            error: l.error,
          })),
          files: {},
          metadata: { scoutReport: this.state.scoutReport, autonomousMode: this.state.autonomousMode },
          label: `execution:${this.state.userIntent.slice(0, 40)}`,
        },
        `Completed: ${this.state.userIntent.slice(0, 60)}`
      );
    }
  }

    /**
   * Run the Scout Agent for real-time context gathering.
   */
  private async runScoutAgent(task: AgentTask): Promise<void> {
    const report = await scoutAgent.scout({
      query: task.prompt,
      sources: ["web", "github", "repo-local"],
      repository: this.state.repository,
    });
    this.state.scoutReport = report;

    this.addLog({
      action: "execute",
      details: scoutAgent.formatForPrompt(report),
      status: "completed",
      success: true,
      logs: [report.summary],
    });
  }

  /**
   * Run the Coder Agent for code generation/modification.
   */
  private async runCoderAgent(task: AgentTask): Promise<void> {
    const contextFiles = this.state.scoutReport
      ? [{ path: "scout-report.md", content: scoutAgent.formatForPrompt(this.state.scoutReport) }]
      : [];

    const result = await coderAgent.execute({
      intent: task.prompt,
      repository: this.state.repository,
      branch: "main",
      contextFiles,
    });
    this.state.coderResult = result;

    this.addLog({
      action: "execute",
      details: `Coder: ${result.summary}`,
      status: "completed",
      success: true,
      files: result.edits.map((e) => e.path),
      logs: [result.explanation],
    });
  }

  /**
   * Run the QA / Auditor Agent for code review and validation.
   */
  private async runAuditorAgent(task: AgentTask): Promise<void> {
    const edits = this.state.coderResult?.edits ?? [];
    const report = await auditorAgent.audit({
      files: edits.map((e) => ({ path: e.path, content: e.content })),
      repository: this.state.repository,
      branch: "main",
    });
    this.state.auditReport = report;

    this.addLog({
      action: "test",
      details: auditorAgent.formatForPrompt(report),
      status: report.summary.passed ? "completed" : "failed",
      success: report.summary.passed,
      logs: [`${report.summary.errors} errors, ${report.summary.warnings} warnings`],
    });
  }

  /**
   * Fallback generic agent runner when no specialized agent exists.
   */
  private async runAgent(task: AgentTask): Promise<void> {
    const phases = [
      { action: "execute" as const, details: `${task.role}: Analyzing context...` },
      { action: "execute" as const, details: `${task.role}: Generating solution...` },
      { action: "test" as const, details: `${task.role}: Running validation checks...` },
    ];

    for (const phase of phases) {
      await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));
      this.addLog({
        action: phase.action,
        details: phase.details,
        status: "running",
        success: true,
        logs: [phase.details],
      });
    }
  }

  /**
   * Get current orchestrator state
   */
  getState(): OrchestratorState {
    return this.state;
  }

  /**
   * Reset orchestrator for new task
   */
  reset(): void {
        this.state = {
      tasks: [],
      logs: [],
      currentPhase: "idle",
      userIntent: "",
      repository: "",
      startTime: new Date(),
      autonomousMode: false,
    };
    this.notify();
  }
}

// Singleton instance
export const kusOrchestrator = new KusOrchestrator();