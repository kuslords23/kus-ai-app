// ============================================================================
// Structured Command Registry — Type Definitions
// ============================================================================
// Every meaningful action in Jyinx has a stable ID, title, and argument schema.
// Commands are grouped by category: File, Edit, View, Run, Source Control,
// Agent, and Window/Layout.
// ============================================================================

export type CommandCategory =
  | "file"
  | "edit"
  | "view"
  | "run"
  | "source-control"
  | "agent"
  | "window";

export interface CommandArg {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select" | "file" | "text";
  required?: boolean;
  defaultValue?: string | number | boolean;
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
  description?: string;
}

export interface CommandDefinition {
  /** Unique stable identifier, e.g. "file.new" or "scm.commit" */
  id: string;
  /** Human-readable title for menus and command palette */
  title: string;
  /** Brief description of what this command does */
  description: string;
  /** Category for grouping in menus */
  category: CommandCategory;
  /** Icon identifier (emoji or icon name) */
  icon?: string;
  /** Keyboard shortcut hint */
  shortcut?: string;
  /** Argument schema */
  args: CommandArg[];
  /** Whether this command requires an active repository */
  requiresRepository?: boolean;
  /** Whether this command requires an open file */
  requiresFile?: boolean;
  /** Whether this command is destructive (e.g., delete) */
  destructive?: boolean;
  /** Whether this command is experimental */
  experimental?: boolean;
  /** Tags for command palette search */
  tags?: string[];
  /** Whether this command is available offline */
  offlineCapable?: boolean;
  /** Estimated time to complete (ms) */
  estimatedDurationMs?: number;
}

export interface CommandResult<T = unknown> {
  success: boolean;
  commandId: string;
  output?: T;
  error?: string;
  durationMs?: number;
  warnings?: string[];
  /** Structured log entries produced during execution */
  log?: Array<{
    timestamp: Date;
    level: "info" | "warn" | "error" | "debug";
    message: string;
  }>;
  /** Files modified by this command */
  filesModified?: string[];
  /** Whether a restart/reload is needed */
  requiresRestart?: boolean;
}

export type CommandExecutor = (
  args: Record<string, unknown>,
  context: ExecutionContext
) => Promise<CommandResult>;

export interface ExecutionContext {
  /** Currently open file path */
  currentFile?: string;
  /** Current file content */
  currentContent?: string;
  /** Active repository full name */
  repository?: string;
  /** Repository default branch */
  branch?: string;
  /** Active model ID */
  model?: string;
  /** Signal for aborting long-running commands */
  signal?: AbortSignal;
  /** Filesystem root for the workspace */
  workspaceRoot?: string;
}

// ============================================================================
// Editor State (returned by getState)
// ============================================================================

export interface EditorState {
  openFiles: string[];
  activeFile: string | null;
  cursorPosition: { line: number; column: number } | null;
  unsavedChanges: boolean;
  gitStatus: GitStatus;
  lastBuildResult: BuildResult | null;
  lastTestResult: TestResult | null;
  diagnostics: Diagnostic[];
  activeBranch: string;
  currentRepository: string | null;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: number;
  modified: number;
  untracked: number;
  conflicts: number;
  lastCommitMessage?: string;
  lastCommitSha?: string;
  isDirty: boolean;
}

export interface BuildResult {
  success: boolean;
  durationMs: number;
  errors: number;
  warnings: number;
  output: string;
  timestamp: Date;
}

export interface TestResult {
  passed: number;
  failed: number;
  total: number;
  durationMs: number;
  output: string;
  timestamp: Date;
}

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  source: string;
}

// ============================================================================
// Event Types
// ============================================================================

export type CommandEventType =
  | "build:complete"
  | "file:saved"
  | "git:status-changed"
  | "error:occurred"
  | "command:executed"
  | "diagnostics:updated"
  | "test:complete";

export interface CommandEvent {
  type: CommandEventType;
  timestamp: Date;
  payload: unknown;
}

export type EventListener = (event: CommandEvent) => void;

// ============================================================================
// Command Palette Item
// ============================================================================

export interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  category: CommandCategory;
  icon?: string;
  shortcut?: string;
  commandId: string;
  args?: Record<string, unknown>;
  /** Whether to open a sub-palette for argument input */
  requiresArgs?: boolean;
}"