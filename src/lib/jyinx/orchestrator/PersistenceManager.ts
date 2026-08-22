/**
 * Persistence Manager — Cross-Session State Persistence
 *
 * Stores and retrieves chat histories, active task branches, verification check
 * logs, and time-travel state nodes across sessions. Supports both Supabase
 * (when available) and localStorage fallback.
 *
 * Also provides a Pruned Context Window builder that produces structured
 * summaries instead of raw transcript dumps to prevent token bloat.
 */

import { timeTravelEngine, type TimeTravelSnapshot } from "./TimeTravelEngine";
import type { StateNode, Branch } from "./StateNode";

export interface SessionData {
  projectId: string;
  userId: string | null;
  chatHistory: ChatHistoryEntry[];
  activeBranchId: string;
  branches: Branch[];
  snapshots: TimeTravelSnapshot[];
  verificationLogs: VerificationLogEntry[];
  lastActiveAt: string;
  metadata: Record<string, unknown>;
}

export interface ChatHistoryEntry {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  branchId?: string;
  snapshotId?: string;
}

export interface VerificationLogEntry {
  id: string;
  blockId: string;
  timestamp: number;
  passed: boolean;
  errors: string[];
  antiPatterns: string[];
  branchId: string;
}

export interface PrunedContext {
  activeTaskGoal: string;
  currentPhase: string;
  recentHighlights: string[];
  branchSummary: string;
  recentDiffs: string[];
  pendingBlockCount: number;
  blockedOn: string | null;
  totalSnapshots: number;
}

const STORAGE_PREFIX = "jyinx:session:";

function getStorageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`;
}

export class PersistenceManager {
  private supabaseUrl?: string;
  private supabaseKey?: string;

  constructor() {
    this.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    this.supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }

  /**
   * Save session data. Attempts Supabase first, falls back to localStorage.
   */
  async saveSession(data: SessionData): Promise<boolean> {
    try {
      if (this.supabaseUrl && this.supabaseKey && data.userId) {
        return await this.saveToSupabase(data);
      }
      this.saveToLocal(data);
      return true;
    } catch {
      this.saveToLocal(data);
      return true;
    }
  }

  /**
   * Load session data. Attempts Supabase first, falls back to localStorage.
   */
  async loadSession(projectId: string, userId?: string | null): Promise<SessionData | null> {
    try {
      if (this.supabaseUrl && this.supabaseKey && userId) {
        const result = await this.loadFromSupabase(projectId, userId);
        if (result) return result;
      }
      return this.loadFromLocal(projectId);
    } catch {
      return this.loadFromLocal(projectId);
    }
  }

  /**
   * Build a pruned context window for model injection.
   * Prevents token bloat by injecting structured summaries rather than
   * raw transcript dumps.
   */
  buildPrunedContext(session: SessionData): PrunedContext {
    const activeBranch = session.branches.find((b) => b.id === session.activeBranchId);
    const recentSnapshots = session.snapshots
      .filter((s) => s.branchId === session.activeBranchId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 5);

    const recentMessages = session.chatHistory
      .slice(-6)
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 200)}`);

    const recentDiffs = recentSnapshots
      .map((s) => {
        const files = Object.keys(s.state.files);
        return files.length > 0
          ? `Snapshot "${s.label}" — ${files.length} file(s) modified`
          : null;
      })
      .filter((d): d is string => d !== null);

    // Determine what's blocking progress
    const failedLogs = session.verificationLogs
      .filter((l) => !l.passed && l.branchId === session.activeBranchId);
    const lastFailed = failedLogs.length > 0
      ? failedLogs[failedLogs.length - 1]
      : null;

    // Count pending tasks in the last message
    const lastAssistantMsg = [...session.chatHistory]
      .reverse()
      .find((m) => m.role === "assistant");
    const pendingCount = lastAssistantMsg
      ? (lastAssistantMsg.content.match(/pending|waiting|queued|scheduled/gi)?.length ?? 0)
      : 0;

    return {
      activeTaskGoal: activeBranch?.name ?? "Unknown",
      currentPhase: activeBranch?.active ? "executing" : "idle",
      recentHighlights: recentMessages,
      branchSummary: `${activeBranch?.name ?? "main"} (${activeBranch?.nodeCount ?? 0} nodes)`,
      recentDiffs,
      pendingBlockCount: pendingCount,
      blockedOn: lastFailed
        ? `Blocked on verification: ${lastFailed.errors.join("; ") || lastFailed.antiPatterns.join("; ")}`
        : null,
      totalSnapshots: session.snapshots.filter((s) => s.branchId === session.activeBranchId).length,
    };
  }

  /**
   * Format the pruned context as a prompt injection block.
   */
  formatPrunedContextForPrompt(context: PrunedContext): string {
    const lines = [
      "## Current Session Context (Pruned)",
      "",
      `Active Goal: ${context.activeTaskGoal}`,
      `Phase: ${context.currentPhase}`,
      `Branch: ${context.branchSummary}`,
      `Total Snapshots: ${context.totalSnapshots}`,
      `Pending Blocks: ${context.pendingBlockCount}`,
      "",
    ];

    if (context.recentHighlights.length > 0) {
      lines.push("Recent Messages:");
      for (const msg of context.recentHighlights.slice(-4)) {
        lines.push(`  ${msg}`);
      }
      lines.push("");
    }

    if (context.recentDiffs.length > 0) {
      lines.push("Recent Changes:");
      for (const diff of context.recentDiffs.slice(-3)) {
        lines.push(`  • ${diff}`);
      }
      lines.push("");
    }

    if (context.blockedOn) {
      lines.push("⚠️ Blocked:", `  ${context.blockedOn}`, "");
    }

    // Keep it compact — under 2K tokens
    return lines.join("\n");
  }

  private async saveToSupabase(data: SessionData): Promise<boolean> {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(this.supabaseUrl!, this.supabaseKey!);

    const { error } = await supabase.from("user_sessions").upsert(
      {
        user_id: data.userId,
        project_id: data.projectId,
        chat_history: data.chatHistory,
        active_branch_id: data.activeBranchId,
        branches: data.branches,
        snapshots: data.snapshots,
        verification_logs: data.verificationLogs,
        last_active_at: data.lastActiveAt,
        metadata: data.metadata,
      },
      { onConflict: "user_id,project_id" }
    );

    return !error;
  }

  private async loadFromSupabase(projectId: string, userId: string): Promise<SessionData | null> {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(this.supabaseUrl!, this.supabaseKey!);

    const { data, error } = await supabase
      .from("user_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .single();

    if (error || !data) return null;

    return {
      projectId: data.project_id,
      userId: data.user_id,
      chatHistory: data.chat_history ?? [],
      activeBranchId: data.active_branch_id ?? "main",
      branches: data.branches ?? [],
      snapshots: (data.snapshots ?? []).map((s: any) => ({
        ...s,
        timestamp: new Date(s.timestamp),
      })),
      verificationLogs: data.verification_logs ?? [],
      lastActiveAt: data.last_active_at,
      metadata: data.metadata ?? {},
    };
  }

  private saveToLocal(data: SessionData): void {
    try {
      const key = getStorageKey(data.projectId);
      const serialized = JSON.stringify({
        ...data,
        snapshots: data.snapshots.map((s) => ({
          ...s,
          timestamp: s.timestamp.toISOString(),
        })),
        lastActiveAt: new Date().toISOString(),
      });
      localStorage.setItem(key, serialized);
    } catch {
      // localStorage may be full or unavailable
    }
  }

  private loadFromLocal(projectId: string): SessionData | null {
    try {
      const key = getStorageKey(projectId);
      const raw = localStorage.getItem(key);
      if (!raw) return null;

      const data = JSON.parse(raw);
      return {
        ...data,
        snapshots: (data.snapshots ?? []).map((s: any) => ({
          ...s,
          timestamp: new Date(s.timestamp),
        })),
      };
    } catch {
      return null;
    }
  }

  /**
   * Sync the current time-travel engine state to persistent storage.
   */
  snapshotEngineState(projectId: string, userId?: string | null): SessionData {
    const branches = timeTravelEngine.getBranches();
    const activeBranch = timeTravelEngine.getActiveBranch();
    const snapshots: TimeTravelSnapshot[] = [];

    for (const branch of branches) {
      const branchSnapshots = timeTravelEngine.getSnapshots(branch.id);
      snapshots.push(...branchSnapshots);
    }

    return {
      projectId,
      userId: userId ?? null,
      chatHistory: [],
      activeBranchId: activeBranch?.id ?? "main",
      branches,
      snapshots,
      verificationLogs: [],
      lastActiveAt: new Date().toISOString(),
      metadata: {},
    };
  }

  /**
   * Record a verification log entry.
   */
  recordVerification(entry: VerificationLogEntry): void {
    const key = `jyinx:verification:${entry.branchId}`;
    try {
      const existing = JSON.parse(localStorage.getItem(key) ?? "[]") as VerificationLogEntry[];
      existing.push(entry);
      localStorage.setItem(key, JSON.stringify(existing.slice(-100)));
    } catch {
      // Storage unavailable
    }
  }

  /**
   * Get verification logs for a branch.
   */
  getVerificationLogs(branchId: string): VerificationLogEntry[] {
    try {
      const key = `jyinx:verification:${branchId}`;
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as VerificationLogEntry[]) : [];
    } catch {
      return [];
    }
  }
}

export const persistenceManager = new PersistenceManager();