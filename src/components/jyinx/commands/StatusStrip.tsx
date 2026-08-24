"use client";

/**
 * Persistent status strip — inline git feedback & actionable errors.
 *
 * Replaces hard blocking errors (e.g. "open a file first before creating a
 * PR") with a thin, tap-to-expand strip. Surfaces the uncommitted-changes
 * chip, current branch, last build/test result, and diagnostics count.
 */
import { useState } from "react";
import type { IdeState } from "@/lib/bridge";
import { hasUncommitted } from "@/lib/bridge";

interface StatusStripProps {
  state: IdeState | null;
  onRun: (commandId: string) => void;
}

export function StatusStrip({ state, onRun }: StatusStripProps) {
  const [expanded, setExpanded] = useState(false);
  if (!state) return null;

  const git = state.git;
  const last = state.lastResult;
  const errorCount = state.diagnostics.filter((d) => d.severity === "error").length;
  const warnCount = state.diagnostics.filter((d) => d.severity === "warning").length;
  const dirty = hasUncommitted(state);
  const fileLabel = state.activeFile ?? "no file open";

  return (
    <div className="shrink-0 border-t border-border bg-background/80">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-3 overflow-x-auto px-3 py-[5px] text-[10px] text-muted hover:bg-surface/40"
        title="Expand status"
      >
        {/* Uncommitted chip */}
        {dirty ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-gold">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" /> {state.unsavedChanges.length} unsaved · {git?.uncommitted ?? 0} uncommitted
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> clean
          </span>
        )}

        <span className="shrink-0 font-mono">{git?.branch ?? "no branch"}</span>
        <span className="shrink-0">· {fileLabel}</span>

        {last && last.status !== "idle" && (
          <span className={`shrink-0 ${last.status === "failure" ? "text-danger" : "text-success"}`}>
            {last.kind}: {last.status}
          </span>
        )}

        {errorCount > 0 && <span className="shrink-0 text-danger">{errorCount} errors</span>}
        {warnCount > 0 && <span className="shrink-0 text-warning">{warnCount} warnings</span>}

        <span className="ml-auto shrink-0">{expanded ? "▲" : "▲"}</span>
      </button>

      {expanded && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
          <StatusAction label="Commit" onClick={() => onRun("sc.commit")} />
          <StatusAction label="Push" onClick={() => onRun("sc.push")} />
          <StatusAction label="Pull" onClick={() => onRun("sc.pull")} />
          <StatusAction label="View diff" onClick={() => onRun("sc.diff")} />
          <StatusAction label="Build" onClick={() => onRun("run.build")} />
          <StatusAction label="Run" onClick={() => onRun("run.run")} />
          {dirty && git?.uncommitted === 0 && (
            <span className="text-[10px] text-muted">Tip: create a pull request when ready.</span>
          )}
        </div>
      )}
    </div>
  );
}

function StatusAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-md border border-border px-2 py-1 text-[10px] text-muted transition-colors hover:border-gold/40 hover:text-gold"
    >
      {label}
    </button>
  );
}