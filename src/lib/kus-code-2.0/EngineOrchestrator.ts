"use client";

import { timeTravelEngine } from "../jyinx/orchestrator/TimeTravelEngine";
import type { AgentResult, PipelineConfig, OrchestratorState } from "./types";
import { validateAgentResult } from "./AgentResult";
import { verifyCompilation, verifyTypes, runTests } from "./RealityLayer";

export type JudgeVerdict = "approved" | "needs_work" | "blocked";

const CONFIDENCE_THRESHOLD = 0.8;

/**
 * Master Orchestrator with built-in Judge system.
 * Routes through the 5-phase pipeline, escalates on low confidence, enforces structured contracts.
 */
export class EngineOrchestrator {
  private state: OrchestratorState | null = null;
  private listeners: Set<(event: OrchestratorEvent) => void> = new Set();

  getState(): OrchestratorState | null {
    return this.state;
  }

  subscribe(listener: (event: OrchestratorEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: OrchestratorEvent): void {
    this.listeners.forEach((l) => l(event));
  }

  async startPipeline(config: PipelineConfig): Promise<string> {
    const pipelineId = "pipeline_" + Date.now();
    const branchId = "branch_" + config.branch + "_" + Date.now();

    this.state = {
      pipelineId,
      currentPhase: 0,
      currentAgentIndex: 0,
      startTime: Date.now(),
      config,
      status: "running",
      activeBranchId: branchId,
    };

    this.emit({ type: "pipeline_start", pipelineId, config });

    // Execute phases
    for (let phaseIdx = 0; phaseIdx < config.phases.length; phaseIdx++) {
      const phase = config.phases[phaseIdx];
      this.state.currentPhase = phase.phase;

      for (let agentIdx = 0; agentIdx < phase.agents.length; agentIdx++) {
        this.state.currentAgentIndex = agentIdx;
        const agentRole = phase.agents[agentIdx];

        this.emit({
          type: "agent_start",
          pipelineId,
          phase: phase.phase,
          agentRole,
          phaseName: phase.name,
        });

        // Agent execution happens here (external call to model gateway)
        // The agent returns its structured AgentResult contract
        // For now, we simulate the flow
      }

      // Phase-level reality check
      const realityCheck = await this.runPhaseRealityCheck(phase.phase);
      if (!realityCheck.passed) {
        if (config.maxRetriesPerPhase > 0) {
          // Retry logic would go here
          this.emit({ type: "phase_retry", pipelineId, phase: phase.phase, reason: realityCheck.reason });
        }
      }
    }

    this.state.status = "completed";
    this.emit({ type: "pipeline_complete", pipelineId });
    return pipelineId;
  }

  /**
   * The Judge - evaluates agent results for confidence, validity, and escalation decisions.
   */
  judge(result: AgentResult, phase: number): { verdict: JudgeVerdict; reason: string; escalationRequired: boolean } {
    const validation = validateAgentResult(result);
    if (!validation.valid) {
      return { verdict: "blocked", reason: "Invalid contract: " + validation.errors.join(", "), escalationRequired: true };
    }

    if (result.status === "failure") {
      return { verdict: "blocked", reason: result.errors.join("; "), escalationRequired: true };
    }

    if (result.confidence < CONFIDENCE_THRESHOLD) {
      return {
        verdict: "needs_work",
        reason: "Low confidence (" + result.confidence + "), threshold is " + CONFIDENCE_THRESHOLD,
        escalationRequired: true,
      };
    }

    return { verdict: "approved", reason: "", escalationRequired: false };
  }

  /**
   * Escalate to premium model when judge confidence is low.
   */
  escalate(result: AgentResult, phase: number): { escalatedModel: string; reason: string } {
    return {
      escalatedModel: "openai/gpt-4.1",
      reason: "Escalating for phase " + phase + ": " + result.agentRole + " confidence was " + result.confidence,
    };
  }

  private async runPhaseRealityCheck(phase: number): Promise<{ passed: boolean; reason: string }> {
    // In production, runs actual compilations, tests, and benchmarks
    if (phase === 3) {
      // Phase 3 requires actual test execution
      const testResult = await runTests([]);
      if (!testResult.passed) {
        return { passed: false, reason: "Tests failed: " + testResult.errors.join("; ") };
      }
    }
    return { passed: true, reason: "" };
  }

  pause(): void {
    if (this.state) this.state.status = "paused";
    this.emit({ type: "pipeline_paused", pipelineId: this.state?.pipelineId ?? "" });
  }

  resume(): void {
    if (this.state) this.state.status = "running";
    this.emit({ type: "pipeline_resumed", pipelineId: this.state?.pipelineId ?? "" });
  }

  cancel(): void {
    if (this.state) this.state.status = "failed";
    this.emit({ type: "pipeline_cancelled", pipelineId: this.state?.pipelineId ?? "" });
  }
}

export type OrchestratorEvent = {
  type: "pipeline_start" | "pipeline_complete" | "pipeline_paused" | "pipeline_resumed" | "pipeline_cancelled" | "agent_start" | "agent_complete" | "phase_retry";
  pipelineId: string;
  phase?: number;
  agentRole?: string;
  phaseName?: string;
  config?: PipelineConfig;
  reason?: string;
};

export const engineOrchestrator = new EngineOrchestrator();
