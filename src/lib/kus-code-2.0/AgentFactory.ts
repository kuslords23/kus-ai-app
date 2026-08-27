"use client";

/**
 * Dynamic Agent Factory
 * Spawns temporary expert processes with custom tools, constraints, and criteria.
 * Used when a prompt requires expertise outside the permanent 15-agent roster.
 */

import type { AgentResult } from "./types";
import { buildFailureResult, buildSuccessResult } from "./AgentResult";
import { timeTravelEngine } from "../jyinx/orchestrator/TimeTravelEngine";

export interface SpawnedAgentConfig {
  role: string;
  domain: string;
  systemPrompt: string;
  tools: string[];
  constraints: string[];
  evaluationCriteria: string[];
  maxTokens: number;
  model?: string;
}

export interface SpawnedAgentProcess {
  id: string;
  config: SpawnedAgentConfig;
  startTime: number;
  status: "running" | "completed" | "failed";
  result?: AgentResult;
}

const DOMAIN_REGISTRY: Record<string, Partial<SpawnedAgentConfig>> = {
  "game-engine": { domain: "Game Engine", tools: ["vulkan", "webgpu", "physics"], maxTokens: 8192 },
  "cad-engineering": { domain: "CAD Engine", tools: ["b-rep", "nurbs", "fea"], maxTokens: 8192 },
  "scientific": { domain: "Scientific Reasoning", tools: ["simulation", "validation"], maxTokens: 16384 },
  "spacecraft-sim": { domain: "Spacecraft Orbital Simulation", tools: ["physics", "rendering", "math"], maxTokens: 16384 },
  "cost-optimization": { domain: "Cost Analysis", tools: ["pricing", "telemetry", "database"], maxTokens: 4096 },
  "observability": { domain: "Observability Engineering", tools: ["monitoring", "logging", "tracing"], maxTokens: 4096 },
  "documentation": { domain: "Technical Documentation", tools: ["markdown", "diagrams"], maxTokens: 4096 },
};

export class AgentFactory {
  private processes: Map<string, SpawnedAgentProcess> = new Map();
  private idCounter = 0;

  spawn(config: SpawnedAgentConfig): SpawnedAgentProcess {
    const id = "agent_factory_" + Date.now() + "_" + (++this.idCounter);
    const process: SpawnedAgentProcess = {
      id,
      config,
      startTime: Date.now(),
      status: "running",
    };
    this.processes.set(id, process);
    timeTravelEngine.snapshot(
      {
        id: "spawn_" + id,
        parentId: null,
        branch: "agent-factory",
        timestamp: new Date(),
        phase: "executing",
        userIntent: config.role,
        repository: "",
        tasks: [],
        logs: [],
        files: {},
        metadata: { factoryProcess: config.domain, role: config.role },
        label: "Spawn: " + config.role,
      },
      "Agent Factory spawned " + config.role + " for " + config.domain
    );
    return process;
  }

  complete(id: string, result: AgentResult): void {
    const process = this.processes.get(id);
    if (!process) return;
    process.status = "completed";
    process.result = result;
  }

  fail(id: string, error: string): void {
    const process = this.processes.get(id);
    if (!process) return;
    process.status = "failed";
    process.result = buildFailureResult(process.config.role, 0, error, "");
  }

  getProcess(id: string): SpawnedAgentProcess | undefined {
    return this.processes.get(id);
  }

  getAllProcesses(): SpawnedAgentProcess[] {
    return Array.from(this.processes.values());
  }

  getActiveProcesses(): SpawnedAgentProcess[] {
    return this.getAllProcesses().filter((p) => p.status === "running");
  }

  resolveDomain(userIntent: string): SpawnedAgentConfig {
    const lower = userIntent.toLowerCase();
    if (lower.includes("spacecraft") || lower.includes("orbital") || lower.includes("simulat")) {
      return this.mergeConfig("spacecraft-sim", "Orbital Simulation Engineer", "Design and build a spacecraft orbital simulator with physics, rendering, and real-time controls.");
    }
    if (lower.includes("game") || lower.includes("vulkan") || lower.includes("render")) {
      return this.mergeConfig("game-engine", "Game Engine Architect", "Design game engine architecture with rendering, physics, and animation systems.");
    }
    if (lower.includes("cad") || lower.includes("nurb") || lower.includes("b-rep")) {
      return this.mergeConfig("cad-engineering", "CAD Engineer", "Design CAD kernel with B-Rep/NURBS geometry and FEA simulation.");
    }
    if (lower.includes("hypothesis") || lower.includes("scientific") || lower.includes("experiment")) {
      return this.mergeConfig("scientific", "Scientific Researcher", "Formulate and test hypotheses using simulation and evidence.");
    }
    return this.mergeConfig("specialist", "Domain Specialist", "You are a specialist agent for: " + userIntent);
  }

  private mergeConfig(domainKey: string, role: string, systemPrompt: string): SpawnedAgentConfig {
    const base = DOMAIN_REGISTRY[domainKey] ?? { domain: "General", tools: [] as string[], maxTokens: 4096 };
    return {
      role,
      domain: base.domain ?? "General",
      systemPrompt,
      tools: base.tools ?? [],
      constraints: [],
      evaluationCriteria: ["output quality", "correctness", "performance"],
      maxTokens: base.maxTokens ?? 4096,
    };
  }
}

export const agentFactory = new AgentFactory();
