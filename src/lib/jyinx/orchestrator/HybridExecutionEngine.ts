export type ExecutionTarget = "local" | "cloud" | "auto";

export interface HybridConfig {
  defaultTarget: ExecutionTarget;
  localFileSizeLimit: number;
  localTaskLimit: number;
  preferLocalWhenOffline: boolean;
  cloudEndpoint?: string;
}

export interface HybridExecutionRecord {
  id: string;
  target: ExecutionTarget;
  taskId: string;
  startedAt: Date;
  completedAt: Date;
  success: boolean;
  error?: string;
  offloaded: boolean;
  bytesProcessed: number;
}

const DEFAULT_HYBRID_CONFIG: HybridConfig = {
  defaultTarget: "auto",
  localFileSizeLimit: 500_000,
  localTaskLimit: 5,
  preferLocalWhenOffline: true,
  cloudEndpoint: process.env.NEXT_PUBLIC_CLOUD_RUNNER_ENDPOINT,
};

function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

function generateId(): string {
  return "hybrid_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 9);
}

export class HybridExecutionEngine {
  private config: HybridConfig = DEFAULT_HYBRID_CONFIG;
  private records: HybridExecutionRecord[] = [];
  private listeners: Array<(record: HybridExecutionRecord) => void> = [];

  getConfig(): HybridConfig {
    return { ...this.config };
  }

  updateConfig(partial: Partial<HybridConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  subscribe(listener: (record: HybridExecutionRecord) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getRecords(): HybridExecutionRecord[] {
    return [...this.records];
  }

  async resolveTarget(intent: string, taskCount: number, estimatedBytes: number): Promise<ExecutionTarget> {
    if (this.config.defaultTarget !== "auto") return this.config.defaultTarget;
    const online = isOnline();
    if (!online && this.config.preferLocalWhenOffline) return "local";
    if (!this.config.cloudEndpoint) return "local";
    if (taskCount > this.config.localTaskLimit) return "cloud";
    if (estimatedBytes > this.config.localFileSizeLimit) return "cloud";
    return "local";
  }

  async execute(intent: string, repository: string, forceTarget?: ExecutionTarget): Promise<HybridExecutionRecord> {
    const taskCount = Math.ceil(intent.length / 200);
    const estimatedBytes = intent.length * 2;
    const target = forceTarget ?? (await this.resolveTarget(intent, taskCount, estimatedBytes));
    const startTime = new Date();

    const record: HybridExecutionRecord = {
      id: generateId(),
      target,
      taskId: generateId(),
      startedAt: startTime,
      completedAt: startTime,
      success: false,
      offloaded: target === "cloud",
      bytesProcessed: estimatedBytes,
    };

    try {
      if (target === "cloud") {
        const result = await this.executeInCloud(intent, repository);
        record.success = result.success;
        record.error = result.error;
      } else {
        const result = await this.executeLocally(intent, repository);
        record.success = result.success;
        record.error = result.error;
      }
    } catch (err: unknown) {
      record.success = false;
      record.error = err instanceof Error ? err.message : String(err);
    }

    record.completedAt = new Date();
    this.records.push(record);

    for (const fn of this.listeners) {
      try { fn(record); } catch { /* ignore listener errors */ }
    }

    return record;
  }

  private async executeLocally(intent: string, repository: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { autonomousModeManager } = await import("./AutonomousModeManager");
      if (autonomousModeManager.getMode() !== "autonomous") {
        return { success: false, error: "Autonomous mode is not active locally." };
      }
      await autonomousModeManager.startLoop(intent, repository);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async executeInCloud(intent: string, repository: string): Promise<{ success: boolean; error?: string }> {
    if (!this.config.cloudEndpoint) {
      return { success: false, error: "No cloud endpoint configured." };
    }
    try {
      const response = await fetch(this.config.cloudEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent, repository, payloadType: "ide_snapshot" }),
      });
      if (!response.ok) {
        return { success: false, error: "HTTP error status: " + response.status };
      }
      const data = (await response.json()) as any;
      return { success: data.ok !== false, error: data.error };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  getHealth() {
    const total = this.records.length;
    const ok = this.records.filter((r) => r.success).length;
    return {
      online: isOnline(),
      totalExecutions: total,
      successfulExecutions: ok,
      successRate: total > 0 ? (ok / total) * 100 : 100,
      lastExecution: total > 0 ? this.records[total - 1] : null,
    };
  }
}

export const hybridExecutionEngine = new HybridExecutionEngine();