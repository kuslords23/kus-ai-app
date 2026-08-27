/**
 * Agent Bridge — shared types.
 *
 * The bridge is the single structured contract between the Jyinx IDE surface
 * and the autonomous agent/runtime. Every meaningful action is a registered
 * Command (stable id + title + argument schema); every query about the
 * working editor/workspace resolves through `getState()`.
 */

/** Stable categories across the entire command surface. */
export type CommandCategory =
  | "file"
  | "edit"
  | "view"
  | "run"
  | "source-control"
  | "agent"
  | "window";

export const COMMAND_CATEGORIES: ReadonlyArray<{
  id: CommandCategory;
  label: string;
}> = [
  { id: "file", label: "File" },
  { id: "edit", label: "Edit" },
  { id: "view", label: "View" },
  { id: "run", label: "Run" },
  { id: "source-control", label: "Source Control" },
  { id: "agent", label: "Agent" },
  { id: "window", label: "Window / Layout" },
];

export interface ArgField {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select";
  required?: boolean;
  /** Options for `select` typed args. */
  options?: string[];
  placeholder?: string;
  /** Default value when omitted. */
  defaultValue?: string | number | boolean;
}

export interface CommandDefinition {
  /** Stable id, e.g. `"run.build"`. Never changes. */
  id: string;
  title: string;
  category: CommandCategory;
  description: string;
  icon?: string;
  /** Human readable shortcut hint (e.g. "Cmd+K"). */
  shortcut?: string;
  args: ArgField[];
  /** Extra search terms for the command palette. */
  keywords?: string[];
}

export type CommandResult =
  | { ok: true; output?: string; data?: unknown }
  | { ok: false; error: string; data?: unknown };

/** A single cursor/selection position in a file. */
export interface CursorPosition {
  file: string | null;
  line: number;
  column: number;
}

/** A dirty (unsaved) file. */
export interface DirtyFile {
  file: string;
  dirty: boolean;
}

/** Snapshot of the git state for the active workspace. */
export interface GitSnapshot {
  branch: string | null;
  /** Human readable status summary (e.g. "3 changed files"). */
  status: string;
  ahead: number;
  behind: number;
  uncommitted: number;
}

/** Last build/test outcome. */
export interface LastRunResult {
  kind: "idle" | "run" | "build" | "test";
  status: "idle" | "running" | "success" | "failure";
  at: string | null;
}

export interface Diagnostic {
  file: string;
  severity: "error" | "warning";
  message: string;
  line: number;
}

/**
 * Snapshot of the whole IDE/workspace — returned by `agent.getState()` and
 * used to drive the status strip, command palette, and adaptive menus.
 */
export interface IdeState {
  openFiles: string[];
  activeFile: string | null;
  cursor: CursorPosition | null;
  unsavedChanges: DirtyFile[];
  git: GitSnapshot | null;
  lastResult: LastRunResult | null;
  diagnostics: Diagnostic[];
  repository: string | null;
  /** Free-text terminal transcript (secondary fallback only). */
  terminalLines: string[];
}

export type BridgeEventType =
  | "build-finished"
  | "file-saved"
  | "git-status-change"
  | "deploy-finished"
  | "error"
  | "command";

export interface BridgeEvent {
  type: BridgeEventType;
  at: string;
  /** For `command` events this is the command id. */
  commandId?: string;
  payload?: unknown;
}