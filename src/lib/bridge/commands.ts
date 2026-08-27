/**
 * Command-surface helpers for building an `IdeState` from live studio state.
 */
import type { GitSnapshot, IdeState, LastRunResult } from "./types";

/**
 * Build a sane default `IdeState` from whatever a host can provide. Missing
 * fields fall back to neutral values so the status strip / palette never crash.
 */
export function buildIdeState(partial: Partial<IdeState> = {}): IdeState {
  const git: GitSnapshot = partial.git ?? {
    branch: null,
    status: "No git repo connected",
    ahead: 0,
    behind: 0,
    uncommitted: 0,
  };
  const lastResult: LastRunResult = partial.lastResult ?? {
    kind: "idle",
    status: "idle",
    at: null,
  };
  return {
    openFiles: partial.openFiles ?? [],
    activeFile: partial.activeFile ?? null,
    cursor: partial.cursor ?? null,
    unsavedChanges: partial.unsavedChanges ?? [],
    git,
    lastResult,
    diagnostics: partial.diagnostics ?? [],
    repository: partial.repository ?? null,
    terminalLines: partial.terminalLines ?? [],
  };
}

/** True when a workspace has uncommitted changes worth surfacing. */
export function hasUncommitted(state: IdeState): boolean {
  return state.unsavedChanges.length > 0 || (state.git?.uncommitted ?? 0) > 0;
}