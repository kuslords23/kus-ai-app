"use client";

import { useEffect, useState } from "react";
import {
  timeTravelEngine,
  type TimeTravelEvent,
  type TimeTravelSnapshot,
} from "@/lib/jyinx/orchestrator/TimeTravelEngine";
import type { StateNode, Branch } from "@/lib/jyinx/orchestrator/StateNode";

type Props = {
  /** When provided, overrides internal branch selection */
  branchId?: string;
  /** Called when user forks/rewinds to a node */
  onNavigate?: (node: StateNode) => void;
  /** Collapsible closed state */
  defaultCollapsed?: boolean;
};

/**
 * Interactive timeline UI panel for the Time-Travel & State Replay engine.
 * Users can click any historical checkpoint, fork/rewind, and resume execution.
 */
export function TimeTravelTimeline({ branchId, onNavigate, defaultCollapsed = false }: Props) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState(branchId ?? "main");
  const [nodes, setNodes] = useState<StateNode[]>([]);
  const [timeline, setTimeline] = useState<StateNode[]>([]);
  const [snapshots, setSnapshots] = useState<TimeTravelSnapshot[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [branchName, setBranchName] = useState("");

  const refresh = () => {
    setBranches(timeTravelEngine.getBranches());
    setTimeline(timeTravelEngine.getTimeline(activeBranchId));
    setSnapshots(timeTravelEngine.getSnapshots(activeBranchId));
  };

  useEffect(() => {
    refresh();
    return timeTravelEngine.subscribe(() => refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, branchId]);

  const handleFork = (nodeId: string) => {
    const name = branchName.trim() || `branch-${Date.now().toString(36).slice(-4)}`;
    const branch = timeTravelEngine.fork(nodeId, name);
    setBranchName("");
    setActiveBranchId(branch.id);
    setSelectedNodeId(nodeId);
  };

  const handleRewind = (nodeId: string) => {
    const state = timeTravelEngine.rewind(nodeId);
    setSelectedNodeId(nodeId);
    onNavigate?.(state);
  };

  const handleResume = (nodeId: string) => {
    const state = timeTravelEngine.resume(nodeId);
    setSelectedNodeId(nodeId);
    onNavigate?.(state);
  };

  const handleSwitchBranch = (id: string) => {
    timeTravelEngine.switchBranch(id);
    setActiveBranchId(id);
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="w-full rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs font-medium text-gold hover:bg-gold/20"
      >
        ⏱ Open Time-Travel Timeline
      </button>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-surface/80">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">⏱ Time-Travel</span>
          <span className="rounded bg-gold/10 px-1.5 py-0.5 text-[10px] text-gold">
            {branches.length} branch(es)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:text-gold"
          >
            Collapse
          </button>
        </div>
      </header>

      {/* Branch selector */}
      <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
        {branches.map((branch) => (
          <button
            key={branch.id}
            type="button"
            onClick={() => handleSwitchBranch(branch.id)}
            className={`rounded-md border px-2 py-0.5 text-[10px] transition ${
              activeBranchId === branch.id
                ? "border-gold/50 bg-gold/10 text-gold"
                : "border-border text-muted hover:border-gold/30"
            }`}
          >
            {branch.name}
            {branch.active && <span className="ml-1 text-success">●</span>}
          </button>
        ))}
      </div>

      {/* Fork controls */}
      <div className="flex gap-1 px-3 py-2">
        <input
          value={branchName}
          onChange={(e) => setBranchName(e.target.value)}
          placeholder="New branch name"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] text-foreground outline-none focus:border-gold"
        />
        <button
          type="button"
          onClick={() => selectedNodeId && handleFork(selectedNodeId)}
          disabled={!selectedNodeId}
          className="shrink-0 rounded-md border border-gold/30 bg-gold/10 px-2 py-1 text-[10px] text-gold disabled:opacity-40"
        >
          Fork
        </button>
      </div>

      {/* Timeline */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {timeline.length === 0 && (
          <p className="py-4 text-center text-xs text-muted">No timeline nodes yet.</p>
        )}
        <div className="relative space-y-1 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-border">
          {timeline.map((node) => {
            const snap = snapshots.find((s) => s.state.id === node.id);
            const isSelected = selectedNodeId === node.id;
            return (
              <div
                key={node.id}
                className={`relative flex cursor-pointer items-start gap-2 rounded-lg border px-2 py-1.5 transition ${
                  isSelected
                    ? "border-gold/50 bg-gold/10"
                    : "border-transparent hover:border-border hover:bg-surface-hover"
                }`}
                onClick={() => setSelectedNodeId(node.id)}
              >
                <span
                  className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${
                    node.phase === "failed"
                      ? "border-red-500 bg-red-500/20"
                      : node.phase === "completed"
                        ? "border-success bg-success/20"
                        : "border-gold bg-gold/20"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-foreground">
                    {snap?.label ?? node.label ?? node.id}
                  </p>
                  <p className="text-[10px] text-muted">
                    {node.phase} · {node.timestamp.toLocaleTimeString()}
                    {node.tasks.length > 0 && ` · ${node.tasks.length} task(s)`}
                  </p>
                </div>
                {/* Actions */}
                <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100" 
                     onClick={(e) => e.stopPropagation()}
                     onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                     onMouseLeave={(e) => (e.currentTarget.style.opacity = "")}>
                  <button
                    type="button"
                    onClick={() => handleRewind(node.id)}
                    className="rounded border border-border px-1.5 py-0.5 text-[9px] text-muted hover:text-gold"
                    title="Rewind to this node"
                  >
                    ⏪
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResume(node.id)}
                    className="rounded border border-border px-1.5 py-0.5 text-[9px] text-muted hover:text-success"
                    title="Resume from this node"
                  >
                    ▶
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected node details */}
      {selectedNodeId && (
        <div className="border-t border-border px-3 py-2">
          {(() => {
            const node = timeline.find((n) => n.id === selectedNodeId);
            if (!node) return null;
            return (
              <div className="text-[10px] leading-relaxed text-muted">
                <p className="font-semibold text-foreground">Selected: {node.label ?? node.id}</p>
                <p>User intent: {node.userIntent || "—"}</p>
                <p>
                  Files: {Object.keys(node.files).length > 0 ? Object.keys(node.files).join(", ") : "—"}
                </p>
                {node.error && (
                  <p className="mt-1 rounded bg-red-500/10 px-2 py-1 text-red-400">⚠ {node.error}</p>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </section>
  );
}
