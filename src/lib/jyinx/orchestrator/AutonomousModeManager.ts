/**
 * Autonomous Mode Manager
 *
 * Controls the execution state between Manual (human-in-the-loop) and
 * Autonomous (fully automated) modes. Supports live interruption, state
 * inspection, timeline branching, and mode switching mid-execution.
 */

import { kusOrchestrator, type OrchestratorState } from "./KusOrchestrator";
import { timeTravelEngine } from "./TimeTravelEngine";
import type { StateNode } from "./StateNode";

export type ExecutionMode = "manual" | "autonomous";

export type InterruptionReason =
  | "user_request"
  | "validation_failure"
  | "security_breach"
  | "credit_exhausted"
  | "timeout"
  | "error_threshold_exceeded"
  | "manual_intervention";

export type LoopPhase = "idle" | "scouting" | "coding" | "auditing" | "testing" | "committing" | "completed" | "interrupted" | "error";

export interface ExecutionSnapshot {
  id: string;
  timestamp: Date;
  mode: ExecutionMode;
  phase: LoopPhase;
  orchestratorState: OrchestratorState;
  currentNode: StateNode | null;
  interruption?: {
    reason: InterruptionReason;
    message: string;
    timestamp: Date;
  };
}

export interface LoopConfig {
  /** Maximum consecutive validation failures before interrupting */
  maxValidationFailures: number;
  /** Maximum agent execution time in ms before timeout */
  maxExecutionTimeMs: number;
  /** Whether to auto-commit on completion in autonomous mode */
  autoCommit: boolean;
  /** Maximum number of self-healing attempts per block */
  maxHealAttempts: number;
}

type LoopListener = (snapshot: ExecutionSnapshot) => void;

const DEFAULT_LOOP_CONFIG: LoopConfig = {
  maxValidationFailures: 3,
  maxExecutionTimeMs: 300_000, // 5 minutes
  autoCommit: true,
  maxHealAttempts: 3,
};

export class AutonomousModeManager {
  private mode: ExecutionMode = "manual";
  private phase: LoopPhase = "idle";
  private config: LoopConfig = DEFAULT_LOOP_CONFIG;
  private listeners = new Set<LoopListener>();
  private abortController: AbortController | null = null;
  private validationFailures = 0;
  private interruption: ExecutionSnapshot["interruption"] = undefined;

  constructor() {
    // Subscribe to orchestrator state changes
    kusOrchestrator.subscribe((state) => {
      if (this.mode === "autonomous" && this.phase !== "idle") {
        this.emitSnapshot();
      }
    });
  }

  subscribe(listener: LoopListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitSnapshot(): void {
    const snapshot = this.createSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private createSnapshot(): ExecutionSnapshot {
    return {
      id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
      mode: this.mode,
      phase: this.phase,
      orchestratorState: kusOrchestrator.getState(),
      currentNode: timeTravelEngine.getCurrentState() ?? null,
      interruption: this.interruption,
    };
  }

  getMode(): ExecutionMode {
    return this.mode;
  }

  getPhase(): LoopPhase {
    return this.phase;
  }

  getConfig(): LoopConfig {
    return { ...this.config };
  }

  /**
   * Toggle between manual and autonomous mode.
   * If currently executing, interruption is requested.
   */
  async toggleMode(): Promise<ExecutionMode> {
    if (this.phase !== "idle" && this.mode === "autonomous") {
      await this.interrupt("user_request", "Switching to manual mode");
    }
    this.mode = this.mode === "manual" ? "autonomous" : "manual";
    this.emitSnapshot();
    return this.mode;
  }

  /**
   * Set mode explicitly.
   */
  setMode(mode: ExecutionMode): void {
    this.mode = mode;
    this.emitSnapshot();
  }

  /**
   * Start the autonomous execution loop.
   */
  async startLoop(intent: string, repository: string): Promise<void> {
    if (this.mode !== "autonomous") {
      throw new Error("Cannot start autonomous loop in manual mode");
    }
    if (this.phase !== "idle") {
      throw new Error(`Loop already running (phase: ${this.phase})`);
    }

    this.phase = "scouting";
    this.interruption = undefined;
    this.validationFailures = 0;
    this.abortController = new AbortController();

    // Set user intent in orchestrator
    kusOrchestrator.setUserIntent(intent, repository);
    this.emitSnapshot();

    try {
      // Phase 1: Scouting
      this.phase = "scouting";
      this.emitSnapshot();

      // Check for abort
      if (this.abortController.signal.aborted) return;

      // Phase 2: Decompose into tasks
      const tasks = await kusOrchestrator.decompose(intent);

      // Check for abort
      if (this.abortController.signal.aborted) return;

      // Phase 3: Execute each task through the agent train
      for (let i = 0; i < tasks.length; i++) {
        if (this.abortController.signal.aborted) return;

        const task = tasks[i];
        this.phase = task.role === "scout" ? "scouting" : task.role === "coder" ? "coding" : task.role === "qa" ? "auditing" : "testing";
        this.emitSnapshot();

        // Execute the task (in production, routes to actual agent)
        await kusOrchestrator.executePlan([task]);

        // Check validation failures
        const state = kusOrchestrator.getState();
        const failedTasks = state.tasks.filter((t) => t.status === "failed");
        if (failedTasks.length > 0) {
          this.validationFailures++;
          if (this.validationFailures >= this.config.maxValidationFailures) {
            await this.interrupt("error_threshold_exceeded",
              `Exceeded maximum validation failures (${this.config.maxValidationFailures})`
            );
            return;
          }
        }
      }

      // Phase 4: Committing
      if (this.config.autoCommit && !this.abortController.signal.aborted) {
        this.phase = "committing";
        this.emitSnapshot();
      }

      this.phase = "completed";
      this.emitSnapshot();
    } catch (error) {
      this.phase = "error";
      this.interruption = {
        reason: "error_threshold_exceeded",
        message: error instanceof Error ? error.message : "Unknown error in autonomous loop",
        timestamp: new Date(),
      };
      this.emitSnapshot();
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Interrupt the current execution loop.
   */
  async interrupt(reason: InterruptionReason, message: string): Promise<void> {
    this.interruption = {
      reason,
      message,
      timestamp: new Date(),
    };

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.phase = "interrupted";
    this.emitSnapshot();

    // Take a snapshot of the current state for potential resume
    const currentState = timeTravelEngine.getCurrentState();
    if (currentState) {
      timeTravelEngine.snapshot(
        {
          ...currentState,
          label: `interrupted:${reason}`,
        },
        `Interrupted at ${currentState.phase} (${reason})`
      );
    }
  }

  /**
   * Resume from an interrupted state.
   */
  async resume(fromNodeId?: string): Promise<void> {
    if (this.phase !== "interrupted") {
      throw new Error(`Can only resume from interrupted state (current: ${this.phase})`);
    }

    this.interruption = undefined;
    this.phase = "scouting";
    this.abortController = new AbortController();
    this.emitSnapshot();

    // Resume from the specified node or continue from current
    if (fromNodeId) {
      timeTravelEngine.resume(fromNodeId, {
        phase: "executing",
      });
    }
  }

  /**
   * Switch back to manual mode mid-execution.
   */
  async switchToManual(): Promise<void> {
    await this.interrupt("manual_intervention", "User switched to manual mode");
    this.mode = "manual";
    this.emitSnapshot();
  }

  /**
   * Reset the manager to idle state.
   */
  reset(): void {
    this.phase = "idle";
    this.interruption = undefined;
    this.validationFailures = 0;
    this.abortController = null;
    this.emitSnapshot();
  }
}

// Singleton instance
export const autonomousModeManager = new AutonomousModeManager();