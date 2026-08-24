/**
 * Structured Command Registry (the "Agent Bridge" command surface).
 *
 * Every meaningful action in Jyinx has a stable id, title, category, and an
 * explicit argument schema. UIs and agents resolve commands through this
 * registry instead of guessing terminal commands or parsing fragile DOM.
 */
import type { CommandCategory, CommandDefinition } from "./types";

export class CommandRegistry {
  private commands = new Map<string, CommandDefinition>();

  register(def: CommandDefinition): CommandDefinition {
    if (!def?.id) throw new Error("CommandRegistry.register requires an id");
    this.commands.set(def.id, def);
    return def;
  }

  registerMany(defs: CommandDefinition[]): void {
    for (const def of defs) this.register(def);
  }

  has(id: string): boolean {
    return this.commands.has(id);
  }

  get(id: string): CommandDefinition | undefined {
    return this.commands.get(id);
  }

  list(): CommandDefinition[] {
    return [...this.commands.values()];
  }

  listByCategory(category: CommandCategory): CommandDefinition[] {
    return [...this.commands.values()].filter((c) => c.category === category);
  }

  /**
   * Search commands by id / title / keywords. Used by the command palette
   * (Cmd+K) and by the agent when resolving a requested action.
   */
  search(query: string): CommandDefinition[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.list();
    return [...this.commands.values()].filter((c) => {
      if (c.id.toLowerCase().includes(q)) return true;
      if (c.title.toLowerCase().includes(q)) return true;
      if ((c.keywords ?? []).some((k) => k.toLowerCase().includes(q))) return true;
      return false;
    });
  }

  get size(): number {
    return this.commands.size;
  }
}

/** Default command set — the canonical Jyinx surface. */
export const CORE_COMMANDS: CommandDefinition[] = [
  // ── File ───────────────────────────────────────────────
  { id: "file.newFile", title: "New File", category: "file", icon: "🗒", description: "Create a new file", args: [{ key: "path", label: "Path", type: "string", placeholder: "e.g. src/lib/util.ts" }], keywords: ["create", "new"] },
  { id: "file.newFolder", title: "New Folder", category: "file", icon: "📁", description: "Create a new folder", args: [{ key: "path", label: "Path", type: "string" }] },
  { id: "file.open", title: "Open File", category: "file", icon: "📂", description: "Open a file in the editor", args: [{ key: "path", label: "Path", type: "string", required: true, placeholder: "src/App.tsx" }], keywords: ["open"] },
  { id: "file.save", title: "Save", category: "file", icon: "💾", description: "Save the active file", shortcut: "Cmd+S", args: [{ key: "path", label: "Path", type: "string" }] },
  { id: "file.saveAll", title: "Save All", category: "file", icon: "💾", description: "Save every open file with unsaved changes", args: [] },
  { id: "file.close", title: "Close", category: "file", icon: "✕", description: "Close a file", args: [{ key: "path", label: "Path", type: "string" }] },
  { id: "file.rename", title: "Rename File", category: "file", icon: "✏️", description: "Rename a file with diff feedback", args: [{ key: "from", label: "From", type: "string", required: true }, { key: "to", label: "To", type: "string", required: true }] },
  { id: "file.delete", title: "Delete File", category: "file", icon: "🗑", description: "Delete a file", args: [{ key: "path", label: "Path", type: "string", required: true }] },
  { id: "file.export", title: "Export", category: "file", icon: "⤓", description: "Export the active file", args: [{ key: "path", label: "Path", type: "string" }] },
  { id: "file.share", title: "Share", category: "file", icon: "🔗", description: "Share the active file", args: [{ key: "path", label: "Path", type: "string" }] },
  { id: "file.createPr", title: "Create Pull Request", category: "file", icon: "🔀", description: "Open a pull request for the active change", args: [{ key: "path", label: "Path", type: "string" }] },

  // ── Edit ───────────────────────────────────────────────
  { id: "edit.undo", title: "Undo", category: "edit", icon: "↩", shortcut: "Cmd+Z", description: "Undo the last change", args: [] },
  { id: "edit.redo", title: "Redo", category: "edit", icon: "↪", shortcut: "Cmd+Shift+Z", description: "Redo a change", args: [] },
  { id: "edit.cut", title: "Cut", category: "edit", icon: "✂", shortcut: "Cmd+X", description: "Cut the selection", args: [] },
  { id: "edit.copy", title: "Copy", category: "edit", icon: "📋", shortcut: "Cmd+C", description: "Copy the selection", args: [] },
  { id: "edit.paste", title: "Paste", category: "edit", icon: "📥", shortcut: "Cmd+V", description: "Paste from clipboard", args: [] },
  { id: "edit.find", title: "Find", category: "edit", icon: "🔎", shortcut: "Cmd+F", description: "Find within a file", args: [{ key: "query", label: "Find", type: "string" }], keywords: ["search", "find"] },
  { id: "edit.findInFiles", title: "Find in Files", category: "edit", icon: "🔎", shortcut: "Cmd+Shift+F", description: "Search across the workspace", args: [{ key: "query", label: "Query", type: "string", required: true }], keywords: ["search"] },
  { id: "edit.replace", title: "Replace", category: "edit", icon: "🔁", shortcut: "Cmd+H", description: "Replace text (range aware)", args: [{ key: "from", label: "Find", type: "string", required: true }, { key: "to", label: "Replace", type: "string" }, { key: "path", label: "File", type: "string" }] },
  { id: "edit.format", title: "Format", category: "edit", icon: "🪄", shortcut: "Shift+Alt+F", description: "Format the active file", args: [] },
  { id: "edit.comment", title: "Toggle Comment", category: "edit", icon: "💬", description: "Comment/uncomment lines", args: [{ key: "path", label: "File", type: "string" }] },
  { id: "edit.moveLine", title: "Move Line Up/Down", category: "edit", icon: "↕", description: "Move the active line", args: [{ key: "direction", label: "Direction", type: "select", options: ["up", "down"], defaultValue: "down" }] },

  // ── View ───────────────────────────────────────────────
  { id: "view.fileTree", title: "Toggle File Tree", category: "view", icon: "🗂", description: "Toggle the file explorer sidebar", args: [] },
  { id: "view.terminal", title: "Toggle Terminal", category: "view", icon: "⌨", description: "Toggle the terminal panel", args: [] },
  { id: "view.preview", title: "Toggle Preview", category: "view", icon: "👁", description: "Toggle the live preview/device canvas", args: [] },
  { id: "view.agent", title: "Toggle Agent Panel", category: "view", icon: "🤖", description: "Toggle the agent chat panel", args: [] },
  { id: "view.zen", title: "Zen Mode", category: "view", icon: "🧘", description: "Focus the editor, hide panels", args: [] },
  { id: "view.zoomIn", title: "Zoom In", category: "view", icon: "🔍", description: "Increase editor zoom", args: [] },
  { id: "view.zoomOut", title: "Zoom Out", category: "view", icon: "🔍", description: "Decrease editor zoom", args: [] },
  { id: "view.theme", title: "Switch Theme", category: "view", icon: "🎨", description: "Cycle dark/light theme", args: [{ key: "theme", label: "Theme", type: "select", options: ["dark", "light", "auto"], defaultValue: "dark" }] },

  // ── Run ────────────────────────────────────────────────
  { id: "run.run", title: "Run", category: "run", icon: "▶", description: "Run the workspace", args: [] },
  { id: "run.build", title: "Build", category: "run", icon: "🛠", description: "Build the project", args: [] },
  { id: "run.test", title: "Test", category: "run", icon: "🧪", description: "Run tests", args: [] },
  { id: "run.clean", title: "Clean", category: "run", icon: "🧹", description: "Remove build artifacts", args: [] },
  { id: "run.stop", title: "Stop", category: "run", icon: "⏹", description: "Stop the running process", args: [] },
  { id: "run.withArgs", title: "Run with Arguments", category: "run", icon: "⚙", description: "Run with custom arguments / scheme", args: [{ key: "args", label: "Arguments", type: "string", placeholder: "--port 3000" }, { key: "scheme", label: "Scheme", type: "string", placeholder: "dev" }] },

  // ── Source Control ─────────────────────────────────────
  { id: "sc.commit", title: "Commit", category: "source-control", icon: "✅", shortcut: "Cmd+Enter", description: "Commit staged changes", args: [{ key: "message", label: "Message", type: "string", required: true }] },
  { id: "sc.push", title: "Push", category: "source-control", icon: "⬆", description: "Push the current branch", args: [] },
  { id: "sc.pull", title: "Pull", category: "source-control", icon: "⬇", description: "Pull latest changes", args: [] },
  { id: "sc.fetch", title: "Fetch", category: "source-control", icon: "🔃", description: "Fetch from remote", args: [] },
  { id: "sc.createBranch", title: "Create Branch", category: "source-control", icon: "🌿", description: "Create and switch to a branch", args: [{ key: "name", label: "Branch name", type: "string", required: true }] },
  { id: "sc.switchBranch", title: "Switch Branch", category: "source-control", icon: "🔀", description: "Switch to a branch", args: [{ key: "name", label: "Branch name", type: "string", required: true }] },
  { id: "sc.createPr", title: "Create Pull Request", category: "source-control", icon: "🔀", description: "Open a pull request", args: [{ key: "title", label: "Title", type: "string" }] },
  { id: "sc.diff", title: "View Diff", category: "source-control", icon: "🗒", description: "Show the diff for a file", args: [{ key: "path", label: "Path", type: "string" }] },
  { id: "sc.stash", title: "Stash Changes", category: "source-control", icon: "📦", description: "Stash uncommitted changes", args: [] },

  // ── Agent ──────────────────────────────────────────────
  { id: "agent.ask", title: "Ask Agent", category: "agent", icon: "🤖", description: "Ask Jyinx a question", args: [{ key: "prompt", label: "Prompt", type: "string", required: true }] },
  { id: "agent.generate", title: "Generate Code", category: "agent", icon: "✨", description: "Generate code with the agent", args: [{ key: "prompt", label: "Prompt", type: "string", required: true }] },
  { id: "agent.explain", title: "Explain Code", category: "agent", icon: "📖", description: "Explain the active file/selection", args: [{ key: "path", label: "Path", type: "string" }] },
  { id: "agent.fix", title: "Fix Error", category: "agent", icon: "🔧", description: "Ask the agent to resolve diagnostics", args: [{ key: "path", label: "Path", type: "string" }] },
  { id: "agent.refactor", title: "Refactor", category: "agent", icon: "🔄", description: "Refactor the active file", args: [{ key: "path", label: "Path", type: "string" }, { key: "goal", label: "Goal", type: "string" }] },
  { id: "agent.preview", title: "Generate Preview", category: "agent", icon: "👁", description: "Generate a live preview", args: [{ key: "path", label: "Path", type: "string" }] },

  // ── Window / Layout ────────────────────────────────────
  { id: "window.resetLayout", title: "Reset Layout", category: "window", icon: "🔄", description: "Restore the default layout", args: [] },
  { id: "window.saveLayout", title: "Save Layout", category: "window", icon: "💾", description: "Persist the current layout (memory per project)", args: [] },
  { id: "window.split", title: "Split Editor", category: "window", icon: "⊞", description: "Split the editor pane", args: [] },
  { id: "window.newWindow", title: "Move to New Window", category: "window", icon: "🪟", description: "Detach the editor into a new window", args: [] },
  { id: "window.commandPalette", title: "Command Palette", category: "window", icon: "⌘", shortcut: "Cmd+K", description: "Open the global command palette", args: [] },
  { id: "window.actions", title: "Actions", category: "window", icon: "☰", description: "Open the searchable actions sheet (phone)", args: [] },
];

export const CORE_REGISTRY = new CommandRegistry();
CORE_REGISTRY.registerMany(CORE_COMMANDS);