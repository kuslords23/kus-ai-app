/**
 * Agent → IDE controller.
 *
 * Translates Kus Code / agent execution events into concrete operations on the
 * live in-IDE workspace: opening files, writing/creating/renaming/removing
 * buffers, and logging terminal commands. This is what makes the agent visibly
 * "control the IDE" — the same source drives review + commit.
 */
import type { IdeWorkspace } from "./workspace";

export interface AgentIdeEvent {
  type: "open" | "edit" | "create" | "rename" | "delete" | "command" | "build";
  path?: string;
  content?: string;
  from?: string;
  to?: string;
  command?: string;
  message?: string;
  status?: string;
}

export interface AgentIdeSnapshot {
  /** Ordered file operations applied so far (for "what did the agent do"). */
  operations: AgentIdeEvent[];
  /** File paths the agent touched, in order. */
  touchedFiles: string[];
  /** Git status text emitted by the agent (e.g. branch / dirty counts). */
  statusLines: string[];
  /** Raw terminal output lines. */
  terminalLines: string[];
}

const MAX_OPS = 500;

export class AgentIdeController {
  private ws: IdeWorkspace;
  private operations: AgentIdeEvent[] = [];
  private touchedFiles: string[] = [];
  private statusLines: string[] = [];
  private terminalLines: string[] = [];

  constructor(ws: IdeWorkspace) {
    this.ws = ws;
  }

  /** Applies one agent event to the live IDE workspace. */
  apply(ev: AgentIdeEvent): void {
    this.operations.push(ev);
    if (this.operations.length > MAX_OPS) this.operations.shift();

    switch (ev.type) {
      case "open": {
        if (ev.path) {
          this.touch(ev.path);
          this.ws.openFile(ev.path, ev.content ?? this.ws.files[ev.path]?.content);
        }
        break;
      }
      case "edit": {
        if (ev.path && typeof ev.content === "string") {
          this.touch(ev.path);
          this.ws.writeFile(ev.path, ev.content);
        }
        break;
      }
      case "create": {
        if (ev.path) {
          this.touch(ev.path);
          this.ws.createFile(ev.path, ev.content ?? "");
        }
        break;
      }
      case "rename": {
        if (ev.from && ev.to) {
          this.ws.renameFile(ev.from, ev.to);
        }
        break;
      }
      case "delete": {
        if (ev.path) this.ws.removeFile(ev.path);
        break;
      }
      case "command": {
        if (ev.command) this.pushTerminal(`$ ${ev.command}`);
        break;
      }
      case "build": {
        if (ev.message) this.pushTerminal(`[build] ${ev.message}`);
        if (ev.status) this.statusLines.push(ev.status);
        break;
      }
    }
  }

  /** Apply agent edits from a fenced-code style list (path → content). */
  applyEdits(edits: Array<{ path: string; content: string }>): void {
    for (const edit of edits) {
      const exists = this.ws.files[edit.path];
      this.apply({ type: exists ? "edit" : "create", path: edit.path, content: edit.content });
    }
  }

  pushTerminal(line: string): void {
    this.terminalLines.push(line);
    if (this.terminalLines.length > MAX_OPS) this.terminalLines.shift();
    this.ws.pushTerminal(line);
  }

  pushStatus(line: string): void {
    this.statusLines.push(line);
  }

  private touch(path: string): void {
    if (!this.touchedFiles.includes(path)) this.touchedFiles.push(path);
  }

  snapshot(): AgentIdeSnapshot {
    return {
      operations: [...this.operations],
      touchedFiles: [...this.touchedFiles],
      statusLines: [...this.statusLines],
      terminalLines: [...this.terminalLines],
    };
  }

  reset(): void {
    this.operations = [];
    this.touchedFiles = [];
    this.statusLines = [];
    this.terminalLines = [];
  }
}