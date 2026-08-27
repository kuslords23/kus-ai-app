"use client";

import type { AgentResult, PhaseConfig, PipelineConfig } from "../types";
import { buildSuccessResult, buildFailureResult } from "../AgentResult";
import { timeTravelEngine } from "../../jyinx/orchestrator/TimeTravelEngine";

export const PHASE_DEFINITIONS: PhaseConfig[] = [
  {
    phase: 1,
    name: "Think - Decomposition & Architecture",
    agents: ["Architect Agent", "Architectural Critic Agent", "Architecture Synthesizer Agent"],
  },
  {
    phase: 2,
    name: "Build - Code Generation & Stacking",
    agents: ["Specialist Coder Agent", "Code Reviewer Agent", "Lead Code Synthesizer Agent"],
  },
  {
    phase: 3,
    name: "Break & Repair - Self-Correction & Verification",
    agents: ["Automated Debugger Agent", "Stress-Tester Agent", "Chief Quality Officer (CQO) Agent"],
  },
  {
    phase: 4,
    name: "Attack - Security & Anti-Malware Audit",
    agents: ["Cybersecurity Expert Agent", "Penetration Tester Agent", "Chief Security Officer (CSO) Agent"],
  },
  {
    phase: 5,
    name: "Optimize - Performance & Optimization",
    agents: ["Profiler Agent", "Minifier & Cleaner Agent", "Final Release Synthesizer Agent"],
  },
];

const AGENT_SYSTEM_PROMPTS: Record<string, string> = {
  "Architect Agent": "You are the Architect Agent - Phase 1 (Think). Design high-level systems architecture, file layouts, and interface contracts. Output blueprint markdown in patch.",
  "Architectural Critic Agent": "You are the Architectural Critic Agent - Phase 1. Adversarially audit the blueprint for logical flaws, circular dependencies, and edge-case gaps.",
  "Architecture Synthesizer Agent": "You are the Architecture Synthesizer Agent - Phase 1. Reconcile blueprint and objections into a locked, definitive plan.",
  "Specialist Coder Agent": "You are the Specialist Coder Agent - Phase 2 (Build). Write modular, strictly typed TypeScript/React code without TODOs. Deliver exact code in patch.",
  "Code Reviewer Agent": "You are the Code Reviewer Agent - Phase 2. Audit code for type safety, import leaks, and syntax errors.",
  "Lead Code Synthesizer Agent": "You are the Lead Code Synthesizer Agent - Phase 2. Merge reviewed patches into unified file diffs.",
  "Automated Debugger Agent": "You are the Automated Debugger Agent - Phase 3 (Break & Repair). Execute code tests, capture stack traces, and patch bugs based on runtime output.",
  "Stress-Tester Agent": "You are the Stress-Tester Agent - Phase 3. Simulate heavy loads, malformed params, null inputs, and race conditions.",
  "Chief Quality Officer (CQO) Agent": "You are the Chief Quality Officer - Phase 3. Make final pass/fail decision. Mandate corrections until all tests pass.",
  "Cybersecurity Expert Agent": "You are the Cybersecurity Expert Agent - Phase 4 (Attack). Scan for secret exposures, unauthorized API calls, and injection vectors.",
  "Penetration Tester Agent": "You are the Penetration Tester Agent - Phase 4. Simulate prompt injection, path traversal, and sandbox escape.",
  "Chief Security Officer (CSO) Agent": "You are the Chief Security Officer - Phase 4. Review reports and issue definitive security clearance.",
  "Profiler Agent": "You are the Profiler Agent - Phase 5 (Optimize). Measure execution speed, bundle size, and memory. Provide before/after metrics.",
  "Minifier & Cleaner Agent": "You are the Minifier & Cleaner Agent - Phase 5. Strip dead code, optimize imports, clean payloads.",
  "Final Release Synthesizer Agent": "You are the Final Release Synthesizer Agent - Phase 5. Compile build artifacts, generate commit logs, trigger deployment.",
};

export class CoreEngine {
  private snapshotIdCounter = 0;

  getPhaseDefinitions(): PhaseConfig[] {
    return PHASE_DEFINITIONS;
  }

  getSystemPrompt(agentRole: string): string {
    return AGENT_SYSTEM_PROMPTS[agentRole] ?? "You are a Kus Code 2.0 agent.";
  }

  getDefaultPipelineConfig(intent: string, repository: string, branch: string): PipelineConfig {
    return {
      phases: PHASE_DEFINITIONS,
      maxRetriesPerPhase: 2,
      modelTier: "free",
      repository,
      branch,
      userIntent: intent,
      contextFiles: [],
    };
  }

  /**
   * Execute a single agent call with structured contract output.
   * In production, this calls the Model Gateway with function calling.
   */
  async executeAgent(agentRole: string, phase: number, context: string, snapshotId: string): Promise<AgentResult> {
    const snapshot = timeTravelEngine.snapshot(
      {
        id: "agent_" + Date.now() + "_" + (++this.snapshotIdCounter),
        parentId: null,
        branch: "core-engine",
        timestamp: new Date(),
        phase: "executing",
        userIntent: agentRole,
        repository: "",
        tasks: [],
        logs: [{ id: "log_" + Date.now(), timestamp: new Date(), action: "execute", details: agentRole + " starting phase " + phase, status: "running", success: true }],
        files: {},
        metadata: { phase, agentRole },
        label: agentRole + " (Phase " + phase + ")",
      },
      agentRole + " started phase " + phase
    );

    // In production, this calls the LLM with the structured AgentResult contract
    // and validates the output through validateAgentResult()

    return buildSuccessResult(agentRole, phase, {
      patch: context,
      confidence: phase >= 3 ? 0.75 : 0.9,
      recommendation: agentRole + " completed phase " + phase + " analysis.",
    }, snapshotId);
  }

  /**
   * Execute all 5 agents in a single phase with trio handshake (Generator -> Critic -> Synthesizer)
   */
  async executePhase(phase: number, userIntent: string, snapshotId: string): Promise<AgentResult[]> {
    const phaseDef = PHASE_DEFINITIONS.find((p) => p.phase === phase);
    if (!phaseDef) return [];

    const results: AgentResult[] = [];
    for (const agentRole of phaseDef.agents) {
      const result = await this.executeAgent(agentRole, phase, userIntent, snapshotId);
      results.push(result);
    }
    return results;
  }

  /**
   * Run the full 5-phase, 15-agent pipeline.
   */
  async executeFullPipeline(intent: string, repository: string, branch: string): Promise<{ allResults: AgentResult[]; pipelineSuccess: boolean }> {
    const startSnapshotId = timeTravelEngine.snapshot(
      {
        id: "pipeline_" + Date.now(),
        parentId: null,
        branch: branch,
        timestamp: new Date(),
        phase: "planning",
        userIntent: intent,
        repository: repository,
        tasks: [],
        logs: [],
        files: {},
        metadata: { pipeline: "kus-code-2.0", totalAgents: 15 },
        label: "Kus Code 2.0 Pipeline: " + intent.slice(0, 60),
      },
      "Pipeline Start: " + intent.slice(0, 80)
    );

    const allResults: AgentResult[] = [];
    let pipelineSuccess = true;

    for (const phaseDef of PHASE_DEFINITIONS) {
      const phaseResults = await this.executePhase(phaseDef.phase, intent, startSnapshotId);
      allResults.push(...phaseResults);

      const phaseFailed = phaseResults.some((r) => r.status === "failure");
      if (phaseFailed) {
        pipelineSuccess = false;
        break;
      }

      // Snapshot after each phase
      timeTravelEngine.snapshot(
        {
          id: "phase_" + phaseDef.phase + "_" + Date.now(),
          parentId: startSnapshotId,
          branch: branch,
          timestamp: new Date(),
          phase: phaseDef.phase === 5 ? "committing" : "executing",
          userIntent: intent,
          repository: repository,
          tasks: phaseResults.map((r) => ({
            id: "task_" + Date.now() + "_" + r.agentRole,
            role: r.agentRole,
            status: r.status,
            prompt: r.recommendation,
            statusMessage: r.status === "success" ? "Completed" : "Failed",
          })),
          logs: [],
          files: {},
          metadata: { phase: phaseDef.phase, agentCount: phaseResults.length },
          label: "Phase " + phaseDef.phase + " complete: " + phaseDef.name,
        },
        "Complete: Phase " + phaseDef.phase
      );
    }

    return { allResults, pipelineSuccess };
  }
}

export const coreEngine = new CoreEngine();
