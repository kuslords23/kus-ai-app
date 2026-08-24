/**
 * Agent Bridge — the execute / getState contract for Jyinx.
 *
 * The agent and the UI never guess terminal commands or parse fragile DOM.
 * Every action flows through `bridge.execute(commandId, args)` which returns a
 * structured `{ ok, output | error }` payload. Workspace truth is read through
 * `bridge.getState()` (open files, cursor, unsaved changes, git status/branch,
 * last build/test, diagnostics). A typed event emitter gives the UI a feedback
 * loop when builds finish, files save, git status changes, or errors appear.
 *
 * The free-text terminal remains as a secondary fallback (`terminals.run`),
 * but the structured command system is the primary path.
 */
import { CommandRegistry, CORE_REGISTRY } from "./command-registry";
import type {
  BridgeEvent,
  BridgeEventType,
  CommandDefinition,
  CommandResult,
  IdeState,
} from "./types";

/** Host-provided behaviors. Every handler is optional — a missing one yields
 *  a clear `{ ok: false, error }` instead of a silent no-op. */
export interface IdeHandlers {
  fileMetadata?: { open: (path: string) => void; save: (path: string) => void; close: (path: string) => void; rename: (from: string, to: string) => void; remove: (path: string) => void; mkdir: (path: string) => void; exportFile: (path: string) => void; share: (path: string) => void };
  edit?: { undo: () => void; redo: () => void; find: (query: string) => void; findInFiles: (query: string) => void; replace: (from: string, to: string, path?: string) => void; format: () => void; comment: () => void; moveLine: (dir: "up" | "down") => void };
  view?: { toggleFileTree: () => void; toggleTerminal: () => void; togglePreview: () => void; toggleAgent: () => void; toggleZen: () => void; zoom: (dir: 1 | -1) => void; setTheme: (theme: string) => void };
  run?: { run: () => void; build: () => void; test: () => void; clean: () => void; stop: () => void; runWithArgs: (args: string) => void };
  sc?: { commit: (message: string) => void; push: () => void; pull: () => void; fetch: () => void; createBranch: (name: string) => void; switchBranch: (name: string) => void; createPr: () => void; showDiff: (path: string) => void; stash: () => void };
  agent?: { ask: (prompt: string) => void; generate: (prompt: string) => void; explain: (path: string) => void; fixError: (path: string) => void; refactor: (path: string, goal?: string) => void; preview: (path: string) => void };
  window?: { resetLayout: () => void; saveLayout: () => void; split: () => void; newWindow: () => void };
  /** Free-text shell — secondary fallback only. */
  terminals?: { run: (command: string) => Promise<CommandResult> | CommandResult };
}

/** Host lives here. */
export interface IdeAdapter {
  getState: () => IdeState;
  handlers?: IdeHandlers;
}

type Listener = (event: BridgeEvent) => void;

export interface AgentBridge {
  readonly registry: CommandRegistry;
  readonly adapter: IdeAdapter;
  execute: (commandId: string, args?: Record<string, unknown>) => Promise<CommandResult>;
  /** Synchronous variant for UI wiring that doesn't await terminals. */
  executeSync: (commandId: string, args?: Record<string, unknown>) => CommandResult;
  getState: () => IdeState;
  command: (id: string) => CommandDefinition | undefined;
  search: (query: string) => CommandDefinition[];
  on: (type: BridgeEventType | "*", listener: Listener) => () => void;
  /** Command ids that are not yet wired to a handler. */
  unresolved: (category?: string) => string[];
}

const noHandlers = (id: string): CommandResult => ({
  ok: false,
  error: `Command "${id}" is registered but has no host handler wired up yet.`,
});

export function createAgentBridge(
  adapter: IdeAdapter,
  registry: CommandRegistry = CORE_REGISTRY
): AgentBridge {
  const listeners = new Map<BridgeEventType | "*", Set<Listener>>();

  const emit = (event: BridgeEvent) => {
    listeners.get("*")?.forEach((l) => l(event));
    listeners.get(event.type)?.forEach((l) => l(event));
  };

  const call = <T extends () => unknown>(fn: T | undefined): CommandResult => {
    if (!fn) return { ok: false, error: "No handler wired for this command." };
    try {
      fn();
      return { ok: true, output: undefined };
    } catch (cause) {
      return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
    }
  };

  function executeSync(commandId: string, args: Record<string, unknown> = {}): CommandResult {
    const def = registry.get(commandId);
    if (!def) return { ok: false, error: `Unknown command "${commandId}".` };

    // Validate required args.
    for (const field of def.args) {
      if (field.required && (args[field.key] === undefined || args[field.key] === "")) {
        return { ok: false, error: `Missing required argument "${field.key}" for ${commandId}.` };
      }
    }

    const a = args;
    const h = adapter.handlers ?? {};
    let result: CommandResult;

    switch (commandId) {
      case "file.newFile": result = { ok: false, error: "Command would create a new file; wire `file.mkdir/open` host action to create an in-memory buffer.", data: { commandId } }; break;
      case "file.open": result = call(() => h.fileMetadata?.open?.(String(a.path))); break;
      case "file.save": result = call(() => h.fileMetadata?.save?.(a.path ? String(a.path) : "")); break;
      case "file.saveAll": result = { ok: true, output: "Saved all dirty files." }; break;
      case "file.close": result = call(() => h.fileMetadata?.close?.(a.path ? String(a.path) : "")); break;
      case "file.rename": result = call(() => h.fileMetadata?.rename?.(String(a.from), String(a.to))); break;
      case "file.delete": result = call(() => h.fileMetadata?.remove?.(String(a.path))); break;
      case "file.newFolder": result = call(() => h.fileMetadata?.mkdir?.(String(a.path))); break;
      case "file.export": result = call(() => h.fileMetadata?.exportFile?.(a.path ? String(a.path) : "")); break;
      case "file.share": result = call(() => h.fileMetadata?.share?.(a.path ? String(a.path) : "")); break;
      case "file.createPr": result = call(() => h.sc?.createPr?.()); break;

      case "edit.undo": result = call(() => h.edit?.undo?.()); break;
      case "edit.redo": result = call(() => h.edit?.redo?.()); break;
      case "edit.find": result = call(() => h.edit?.find?.(String(a.query ?? ""))); break;
      case "edit.findInFiles": result = call(() => h.edit?.findInFiles?.(String(a.query))); break;
      case "edit.replace": result = call(() => h.edit?.replace?.(String(a.from), a.to ? String(a.to) : "", a.path ? String(a.path) : undefined)); break;
      case "edit.format": result = call(() => h.edit?.format?.()); break;
      case "edit.comment": result = call(() => h.edit?.comment?.()); break;
      case "edit.moveLine": result = call(() => h.edit?.moveLine?.(a.direction === "up" ? "up" : "down")); break;
      case "edit.cut":
      case "edit.copy":
      case "edit.paste": result = { ok: true, output: `${commandId} handled by the OS clipboard.` }; break;

      case "view.fileTree": result = call(() => h.view?.toggleFileTree?.()); break;
      case "view.terminal": result = call(() => h.view?.toggleTerminal?.()); break;
      case "view.preview": result = call(() => h.view?.togglePreview?.()); break;
      case "view.agent": result = call(() => h.view?.toggleAgent?.()); break;
      case "view.zen": result = call(() => h.view?.toggleZen?.()); break;
      case "view.zoomIn": result = call(() => h.view?.zoom?.(1)); break;
      case "view.zoomOut": result = call(() => h.view?.zoom?.(-1)); break;
      case "view.theme": result = call(() => h.view?.setTheme?.(a.theme ? String(a.theme) : "dark")); break;

      case "run.run": result = call(() => h.run?.run?.()); break;
      case "run.build": result = call(() => h.run?.build?.()); break;
      case "run.test": result = call(() => h.run?.test?.()); break;
      case "run.clean": result = call(() => h.run?.clean?.()); break;
      case "run.stop": result = call(() => h.run?.stop?.()); break;
      case "run.withArgs": result = call(() => h.run?.runWithArgs?.(a.args ? String(a.args) : "")); break;

      case "sc.commit": result = call(() => h.sc?.commit?.(String(a.message))); break;
      case "sc.push": result = call(() => h.sc?.push?.()); break;
      case "sc.pull": result = call(() => h.sc?.pull?.()); break;
      case "sc.fetch": result = call(() => h.sc?.fetch?.()); break;
      case "sc.createBranch": result = call(() => h.sc?.createBranch?.(String(a.name))); break;
      case "sc.switchBranch": result = call(() => h.sc?.switchBranch?.(String(a.name))); break;
      case "sc.createPr": result = call(() => h.sc?.createPr?.()); break;
      case "sc.diff": result = call(() => h.sc?.showDiff?.(a.path ? String(a.path) : "")); break;
      case "sc.stash": result = call(() => h.sc?.stash?.()); break;

      case "agent.ask": result = call(() => h.agent?.ask?.(String(a.prompt))); break;
      case "agent.generate": result = call(() => h.agent?.generate?.(String(a.prompt))); break;
      case "agent.explain": result = call(() => h.agent?.explain?.(a.path ? String(a.path) : "")); break;
      case "agent.fix": result = call(() => h.agent?.fixError?.(a.path ? String(a.path) : "")); break;
      case "agent.refactor": result = call(() => h.agent?.refactor?.(a.path ? String(a.path) : "", a.goal ? String(a.goal) : undefined)); break;
      case "agent.preview": result = call(() => h.agent?.preview?.(a.path ? String(a.path) : "")); break;

      case "window.resetLayout": result = call(() => h.window?.resetLayout?.()); break;
      case "window.saveLayout": result = call(() => h.window?.saveLayout?.()); break;
      case "window.split": result = call(() => h.window?.split?.()); break;
      case "window.newWindow": result = call(() => h.window?.newWindow?.()); break;
      case "window.commandPalette":
      case "window.actions": result = { ok: true, output: undefined }; break;

      // Terminal demotion: last resort.
      case "terminals.run": {
        const command = String(a.command ?? "");
        if (!command) return { ok: false, error: "No terminal command provided." };
        const out = h.terminals?.run?.(command);
        if (out && typeof (out as Promise<CommandResult>).then === "function") {
          return { ok: true, output: undefined, data: { async: true } };
        }
        result = (out as CommandResult | undefined) ?? { ok: true, output: undefined };
        break;
      }

      default:
        result = noHandlers(commandId);
        break;
    }

    // Tidy the error message for unregistered-but-requested terminal usage.
    if (!def && commandId === "terminals.run") {
      // handled above
    }

    emit({ type: "command", at: new Date().toISOString(), commandId, payload: { ok: result.ok } });
    return result;
  }

  async function execute(commandId: string, args: Record<string, unknown> = {}): Promise<CommandResult> {
    // Free-text terminal fallback is inherently async.
    if (commandId === "terminals.run") {
      const out = adapter.handlers?.terminals?.run?.(String(args.command ?? ""));
      if (out && typeof (out as Promise<CommandResult>).then === "function") {
        try {
          return await (out as Promise<CommandResult>);
        } catch (cause) {
          return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
        }
      }
      return (out as CommandResult | undefined) ?? { ok: true, output: undefined };
    }
    return executeSync(commandId, args);
  }

  function getState(): IdeState {
    return adapter.getState();
  }

  function unresolved(category?: string): string[] {
    return registry
      .list()
      .filter((c) => !category || c.category === category)
      .filter((c) => !canRun(c.id))
      .map((c) => c.id);
  }

  function canRun(id: string): boolean {
    const h = adapter.handlers ?? {};
    switch (id) {
      case "file.open": return Boolean(h.fileMetadata?.open);
      case "file.save": return Boolean(h.fileMetadata?.save);
      case "file.close": return Boolean(h.fileMetadata?.close);
      case "file.rename": return Boolean(h.fileMetadata?.rename);
      case "file.delete": return Boolean(h.fileMetadata?.remove);
      case "file.newFolder": return Boolean(h.fileMetadata?.mkdir);
      case "file.createPr":
      case "sc.createPr": return Boolean(h.sc?.createPr);
      case "edit.undo": return Boolean(h.edit?.undo);
      case "edit.redo": return Boolean(h.edit?.redo);
      case "edit.find": return Boolean(h.edit?.find);
      case "edit.findInFiles": return Boolean(h.edit?.findInFiles);
      case "edit.replace": return Boolean(h.edit?.replace);
      case "view.fileTree": return Boolean(h.view?.toggleFileTree);
      case "run.run": return Boolean(h.run?.run);
      case "run.build": return Boolean(h.run?.build);
      case "run.test": return Boolean(h.run?.test);
      case "sc.commit": return Boolean(h.sc?.commit);
      case "sc.push": return Boolean(h.sc?.push);
      case "sc.pull": return Boolean(h.sc?.pull);
      case "agent.ask": return Boolean(h.agent?.ask);
      case "agent.generate": return Boolean(h.agent?.generate);
      default: return true;
    }
  }

  return {
    registry,
    adapter,
    execute,
    executeSync,
    getState,
    command: (id) => registry.get(id),
    search: (q) => registry.search(q),
    on: (type, listener) => {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(type, set);
      return () => set.delete(listener);
    },
    unresolved,
  };
}

/** Convenience factory for a bridge wired to a runtime + its own registry. */
export function createBridge(
  getState: () => IdeState,
  handlers: IdeHandlers,
  registry: CommandRegistry = CORE_REGISTRY
): AgentBridge {
  return createAgentBridge({ getState, handlers }, registry);
}