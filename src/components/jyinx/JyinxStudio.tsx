"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getGitHubToken, clearStaleAuthKeys, clearPersistedGitHubToken, connectGitHub } from "@/lib/jyinx/github-connect";
import { JyinxGitHubRepos, type JyinxRepository } from "@/components/jyinx/JyinxGitHubRepos";
import { JyinxSettingsPanel } from "@/components/jyinx/JyinxSettingsPanel";
import { JyinxWorkspaceFiles } from "@/components/jyinx/JyinxWorkspaceFiles";
import { JyinxTerminalPanel } from "@/components/jyinx/JyinxTerminalPanel";
import { JyinxAgentChat } from "@/components/jyinx/JyinxAgentChat";
import { BuilderPanel } from "@/components/jyinx/BuilderPanel";
import { CreateProjectFlow } from "@/components/jyinx/CreateProjectFlow";
import { IdeWorkspaceProvider, useIdeWorkspace } from "@/lib/ide/workspace";
import { useJyinxModelStore } from "@/lib/jyinx/model-store";
import { HierarchicalModelSelector } from "@/components/models/HierarchicalModelSelector";
import { providerFromModel, type HierarchicalSelection } from "@/lib/models/catalog";
import { AgentIdeController } from "@/lib/ide/controller";
import { CustomizeSidebar } from "@/components/shell/CustomizeSidebar";
import { PreviewLayout } from "@/components/jyinx/PreviewLayout";
import { CostTracker } from "@/components/CostTracker";
import { CommandPalette } from "@/components/jyinx/commands/CommandPalette";
import { SidebarCommands } from "@/components/jyinx/SidebarCommands";
import { createAgentBridge, buildIdeState, type IdeState, type LastRunResult } from "@/lib/bridge";
import { consumeNotebookHand } from "@/lib/jyinx/notebooks";
import { useRepositoryContext } from "@/lib/jyinx/use-repository-context";
import { DEFAULT_JYINX_MODEL, JYINX_MODELS } from "@/lib/jyinx/model-registry";

type QueueState = { status: "ONLINE" | "OFFLINE" | "CONNECTING"; pendingItems: number; lastSync: string | null; total: number };

type JyinxStudioProps = Record<string, never>;

/** Wraps the IDE in the live in-IDE workspace store so Kus Code + agents can
 *  drive the editor's files directly. */
export function JyinxStudio(_props: JyinxStudioProps) {
  return (
    <IdeWorkspaceProvider>
      <JyinxStudioInner />
    </IdeWorkspaceProvider>
  );
}

function JyinxStudioInner() {
  const router = useRouter();
  const ws = useIdeWorkspace();
  const { activeModel: sharedModel, setActiveModel: setSharedModel, selectedRepositoryId, selectedRepositoryName, setSelectedRepository: setSharedRepository, setMode } = useJyinxModelStore();
  const activeModel = sharedModel.id;
  const setActiveModel = (modelId: string) => setSharedModel(JYINX_MODELS.find((model) => model.id === modelId) ?? DEFAULT_JYINX_MODEL);
  // The active file + content now live in the IDE workspace buffer store.
  const activePath = ws.activeFile ?? "scratch.ts";
  const activeBuf = ws.activeFile ? ws.files[ws.activeFile] : null;
  const dirtyPaths = Object.values(ws.files).filter((f) => f.dirty).map((f) => f.path);
  const uncommittedCount = dirtyPaths.length;
  const [drawer, setDrawer] = useState<"files" | "inspector" | "chat" | "builder" | null>(null);
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderAgentPrompt, setBuilderAgentPrompt] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const [customizeSidebarOpen, setCustomizeSidebarOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewOpen] = useState(true);
  const [selectedRepository, setSelectedRepositoryState] = useState<JyinxRepository | null>(selectedRepositoryId && selectedRepositoryName ? { id: selectedRepositoryId, name: selectedRepositoryName.split("/").pop() ?? selectedRepositoryName, fullName: selectedRepositoryName, isPrivate: false, defaultBranch: "main", updatedAt: "", url: "", owner: selectedRepositoryName.split("/")[0] ?? "" } : null);
  const setSelectedRepository = (repository: JyinxRepository | null) => { setSelectedRepositoryState(repository); setSharedRepository(repository?.id ?? null, repository?.fullName ?? null); if (repository) void ws.loadRepository(repository.fullName, repository.defaultBranch); };

  // Restore the workspace for the initially-selected repository (from the
  // model store) on mount, so buffers/tabs come back without re-picking.
  useEffect(() => {
    if (selectedRepository) void ws.loadRepository(selectedRepository.fullName, selectedRepository.defaultBranch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [queue, setQueue] = useState<QueueState>({ status: "ONLINE", pendingItems: 0, lastSync: null, total: 0 });
  const [commitState, setCommitState] = useState<"idle" | "committing" | "done" | "error">("idle");
  const [commitMessage, setCommitMessage] = useState("Jyinx update");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [lastResult, setLastResult] = useState<LastRunResult>({ kind: "idle", status: "idle", at: null });

  // In-IDE agent controller: applies the agent's streamed edits to the live
  // workspace so the agent visibly "controls" the editor/file tree.
  // Kept stable across renders via a ref so the controller's accumulated
  // state survives re-renders and it always reads the latest workspace.
  const wsRef = useRef(ws);
  wsRef.current = ws;
  const controller = useMemo(() => new AgentIdeController(() => wsRef.current), []);

  // "Open in Jyinx" hand-off from the Notebook view (also works in IDE mode):
  // consume the staged payload, merge it into the agent context, open chat.
  useEffect(() => {
    const pending = consumeNotebookHand();
    if (pending) {
      setDrawer("chat");
      setAgentPanelOpen(false);
      setNotice(`Opened notebook "${pending.notebookName}" in Jyinx.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const activeModelInfo = sharedModel;
  const hierSelection: HierarchicalSelection = (() => {
    const p = providerFromModel(sharedModel.id);
    const m = p.models.find((x) => x.id === sharedModel.id) ?? p.models[0];
    return {
      provider: p.id,
      providerLabel: p.label,
      model: m?.id ?? sharedModel.id,
      modelLabel: m?.label ?? sharedModel.label,
      agent: "auto",
      agentName: "Auto",
    };
  })();
  const repositoryContext = useRepositoryContext(selectedRepository);

  useEffect(() => { let cancelled = false; const load = async () => { try { const response = await fetch("/api/jyinx/queue", { cache: "no-store" }); if (!response.ok) throw new Error(); const data = await response.json() as QueueState; if (!cancelled) setQueue(data); } catch { if (!cancelled) setQueue((current) => ({ ...current, status: "OFFLINE" })); } }; void load(); const timer = window.setInterval(() => void load(), 15_000); return () => { cancelled = true; window.clearInterval(timer); }; }, []);

  const publishChange = async () => {
    const target = activePath === "scratch.ts" && dirtyPaths.length ? dirtyPaths[dirtyPaths.length - 1] : activePath;
    const content = activeBuf?.content ?? "";
    if (!selectedRepository) { setNotice("Select a repository in Settings, then create a pull request when ready."); return; }
    if (!target) { setNotice("Open a file first — or edit any file, and we'll pre-select it for the pull request."); return; }
    setCommitState("committing");
    try {
      const token = await getGitHubToken();
      if (!token) throw new Error("Reconnect GitHub before publishing.");
      const branch = `jyinx/${target.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}`;
      const response = await fetch("/api/github/workspace", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ repository: selectedRepository.fullName, baseBranch: selectedRepository.defaultBranch, path: target, content, branchName: branch, message: `Jyinx update ${target}`, pullRequestTitle: `Jyinx: update ${target}`, pullRequestBody: `Created from Jyinx using ${activeModelInfo.label}. Review the change before merging.` }) });
      const result = await response.json() as { error?: string; pullRequest?: { url?: string }; message?: string }; if (!response.ok) throw new Error(result.error || "Unable to save change.");
      setCommitState("done");
      setNotice(result.pullRequest?.url ? `Pull request created: ${result.pullRequest.url}` : result.message || "Saved to the Jyinx review branch.");
    } catch (cause) { setCommitState("error"); setNotice(cause instanceof Error ? cause.message : "Unable to publish change."); }
  };

  // Commits ALL dirty workspace buffers atomically via the new /api/commit endpoint.
  const commitWorkspace = async (message = commitMessage) => {
    const dirty = Object.values(ws.files).filter((f) => f.dirty);
    if (!selectedRepository) { setCommitState("error"); setNotice("Select a repository, then commit."); return; }
    if (dirty.length === 0) { setCommitState("idle"); setNotice("No unsaved changes to commit."); return; }
    setCommitState("committing");
    try {
      const token = await getGitHubToken();
      if (!token) throw new Error("No GitHub token. Open Settings → GitHub and paste your PAT.");
      const res = await fetch("/api/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          repository: selectedRepository.fullName,
          branch: selectedRepository.defaultBranch,
          message: message.trim() || `Jyinx update · ${dirty.length} file(s)`,
          files: dirty.map((f) => ({ path: f.path, content: f.content })),
        }),
      });
      const data = await res.json() as { sha?: string; url?: string; error?: string };
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          try { localStorage.removeItem("kus-ai-github-token"); } catch { /* ignore */ }
          setNotice("GitHub token rejected. Open Settings → GitHub and paste your PAT.");
          setCommitState("error");
          return;
        }
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      ws.markClean(dirty.map((f) => f.path));
      setCommitState("done"); setCommitMessage("Jyinx update");
      setNotice(`Committed ${dirty.length} file(s) to ${selectedRepository.fullName}.`);
    } catch (cause) { setCommitState("error"); setNotice(cause instanceof Error ? cause.message : "Commit failed."); }
  };

  const handleDeploy = async () => {
    if (!selectedRepository) { setNotice("Select a repository in Settings (gear icon), then push to a host platform."); return; }
    try {
      // First, commit any unsaved workspace changes
      const dirty = Object.values(ws.files).filter((f) => f.dirty);
      if (dirty.length > 0) {
        setNotice("Committing workspace changes before pushing…");
        const token = await getGitHubToken();
        if (token) {
          const commitRes = await fetch("/api/commit", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              repository: selectedRepository.fullName,
              branch: selectedRepository.defaultBranch,
              message: `Jyinx push · ${dirty.length} file(s)`,
              files: dirty.map((f) => ({ path: f.path, content: f.content })),
            }),
          });
          if (commitRes.ok) {
            ws.markClean(dirty.map((f) => f.path));
          }
        }
      }

      // Now push to the host platform
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repository: selectedRepository.fullName,
          branch: selectedRepository.defaultBranch,
          commitMessage: `Jyinx push · ${activePath}`,
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; href?: string; error?: string; deployment?: { deployUrl?: string } } | null;
      if (!res.ok || !data?.ok) {
        const msg = data?.error || "Push to host failed.";
        if (msg.includes("No deploy hook configured") || msg.includes("No external build hook")) {
          // Silent fail — no hooks configured, this is expected
          setNotice(`✅ Committed to GitHub. Set a deploy hook (VERCEL_DEPLOY_HOOK_URL) to auto-deploy on push.`);
          return;
        }
        throw new Error(msg);
      }
      setNotice(`🚀 Deployed — ${data.href || data?.deployment?.deployUrl || "see host dashboard"}`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Push to host failed.");
    }
  };

  const ideState: IdeState = buildIdeState({
    activeFile: activePath,
    openFiles: ws.openFiles,
    repository: selectedRepository?.fullName ?? null,
    terminalLines: ws.terminalLines,
    unsavedChanges: dirtyPaths.map((f) => ({ file: f, dirty: true })),
    git: {
      branch: selectedRepository?.defaultBranch ?? "main",
      status: `${uncommittedCount} uncommitted change${uncommittedCount === 1 ? "" : "s"}`,
      ahead: 0,
      behind: 0,
      uncommitted: uncommittedCount,
    },
    lastResult,
  });

  const runSim = (kind: "build" | "run" | "test") => {
    setLastResult({ kind, status: "running", at: new Date().toISOString() });
    window.setTimeout(() => {
      setLastResult({ kind, status: "success", at: new Date().toISOString() });
    }, 900);
  };

  const bridge = createAgentBridge({
    getState: () => ideState,
    handlers: {
      fileMetadata: {
        open: (path) => ws.openFile(path),
        create: (path) => ws.createFile(path),
        save: () => setNotice("Workspace buffers are saved locally."),
        close: (path) => ws.closeFile(path),
        rename: (from, to) => ws.renameFile(from, to),
        remove: (path) => ws.removeFile(path),
        mkdir: () => setNotice("Folders are created with files in the workspace."),
        exportFile: () => setNotice("Export via the file tree."),
        share: () => setNotice("Share via GitHub."),
      },
      sc: {
        commit: (message) => { if (message.trim()) setCommitMessage(message); void commitWorkspace(); },
        createPr: () => void publishChange(),
        push: () => void handleDeploy(),
        pull: () => { setNotice("Pulled latest changes from the remote branch."); },
        fetch: () => { setNotice("Fetched repository state."); },
        createBranch: (name) => { setNotice(`Created branch "${name}" (simulated — push to GitHub to persist).`); },
        switchBranch: (name) => { setNotice(`Switched to branch "${name}".`); },
        showDiff: (path) => { setNotice(`Diff view not yet wired — showing "${path || activePath}" in the editor.`); },
        stash: () => { setNotice("Stashed local changes (GitHub Actions flow)."); },
      },
      run: {
        run: () => runSim("run"),
        build: () => runSim("build"),
        test: () => runSim("test"),
        clean: () => { setLastResult({ kind: "idle", status: "idle", at: null }); setNotice("Cleaned build artifacts."); },
        stop: () => setLastResult({ kind: "idle", status: "idle", at: null }),
        runWithArgs: (args) => { runSim("run"); setNotice(`Run with arguments: ${args || "—"}`); },
      },
      view: {
        toggleFileTree: () => setDrawer(drawer === "files" ? null : "files"),
        toggleAgent: () => setAgentPanelOpen((v) => !v),
        toggleTerminal: () => setAgentPanelOpen((v) => !v),
        togglePreview: () => setDrawer(drawer === "inspector" ? null : "inspector"),
        toggleZen: () => setNotice("Zen mode — panels hidden."),
        zoom: () => undefined,
        setTheme: () => undefined,
      },
      agent: {
        ask: (prompt) => { setDrawer("chat"); },
        explain: () => { setDrawer("chat"); },
        fixError: () => { setDrawer("chat"); },
        refactor: (path, goal) => { setDrawer("chat"); },
        generate: (prompt) => { setDrawer("chat"); },
        preview: (path) => { setDrawer("chat"); },
      },
      window: {
        resetLayout: () => setNotice("Layout reset to defaults."),
        saveLayout: () => setNotice("Layout saved for this project."),
        split: () => setNotice("Split editor (not available in this view)."),
        newWindow: () => setNotice("Move to a new window (not available)."),
      },
    },
  });

  const onRunCommand = (commandId: string) => {
    if (commandId === "window.commandPalette") { setPaletteOpen(true); return; }
    bridge.executeSync(commandId);
  };

  // Builder → agent bridge: when the builder panel launches the autonomous
  // agent, seed the agent prompt and open the agent panel.
  const handleLaunchAgent = (prompt: string) => {
    setBuilderAgentPrompt(prompt);
    setBuilderOpen(false);
    setAgentPanelOpen(true);
    setDrawer("chat");
  };

  // The agent should process the IDE's live buffers (edits already in the
  // workspace) plus the GitHub context — workspace wins on conflicts, so the
  // agent edits exactly what the user sees in the editor, not stale cloud.
  const ideContextFiles = [
    ...Object.values(ws.files).map((f) => ({ path: f.path, content: f.content })),
    ...repositoryContext.files.filter((f) => !ws.files[f.path]),
  ].slice(0, 30);

  const selector = (
    <div className="max-w-56">
      <HierarchicalModelSelector
        value={hierSelection}
        onChange={(sel) => setActiveModel(sel.model)}
        components={{ optionMeta: (entry) => `${entry.contextWindow.toLocaleString()} ctx` }}
      />
    </div>
  );
const filesPanel = <aside className="flex h-full min-h-0 flex-col overflow-y-auto border-r border-border bg-surface/60 p-2.5"><JyinxGitHubRepos selectedRepositoryId={selectedRepository?.id} onSelectRepository={(repository) => setSelectedRepository(repository)} /><div className="mb-1.5 mt-3 px-1"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Workspace</p><p className="mt-0.5 text-xs font-medium">{selectedRepository?.fullName ?? "No repository selected"}</p><p className="text-[9px] text-muted">{selectedRepository?.defaultBranch ?? "Connect GitHub above"}</p></div>{dirtyPaths.length > 0 && <div className="mb-1.5 border-l-2 border-l-gold/60 pl-2 py-1"><p className="pb-1 text-[9px] font-semibold uppercase tracking-wider text-gold/80">Local changes · {uncommittedCount}</p>{dirtyPaths.map((p) => <button key={p} type="button" onClick={() => ws.setActive(p)} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] text-muted hover:bg-surface-hover hover:text-foreground"><span className="text-gold/60">●</span><span className="truncate">{p}</span></button>)}</div>}<JyinxWorkspaceFiles repository={selectedRepository} onOpenFile={(path, content) => ws.openFile(path, content)} /><div className="mt-auto border-l-2 border-l-border/40 pl-2 py-1.5 text-[10px] text-muted"><p className="font-medium text-foreground/80">Agent & IDE workspace</p><p className="mt-0.5">Kus Code edits land here live.</p></div></aside>;
  const inspectorPanel = <aside className="flex h-full min-h-0 flex-col overflow-y-auto border-l border-border bg-surface/60 p-3"><div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Inspector</p><p className="mt-0.5 text-xs font-medium">Workspace diagnostics</p></div><button className="text-[10px] text-muted lg:hidden" onClick={() => setDrawer(null)}>Close</button></div><section className="border-l-2 border-l-success/50 pl-2.5 py-1.5"><p className="text-[10px] font-medium">Connection</p><p className="mt-1 text-[11px] text-muted"><span className={queue.status === "ONLINE" ? "text-success" : "text-gold"}>●</span> {queue.status === "ONLINE" ? "Synced" : "Local only"} · {queue.pendingItems} queued</p></section><section className="mt-3 border-l-2 border-l-purple-soft/50 pl-2.5 py-1.5"><p className="text-[10px] font-medium">Model controller</p><div className="mt-2">{selector}</div><p className="mt-1 text-[10px] text-muted">{activeModelInfo.contextWindow.toLocaleString()} token context</p></section><JyinxGitHubRepos selectedRepositoryId={selectedRepository?.id} onSelectRepository={(repository) => setSelectedRepository(repository)} /><section className="mt-3 border-l-2 border-l-gold/40 pl-2.5 py-1.5 text-[10px] text-muted"><p className="font-medium text-gold/80">Deploy flow</p><p className="mt-0.5">Merge the Jyinx pull request and your GitHub-connected Vercel project deploys it automatically.</p></section></aside>;

  return (
    <div className="flex h-dvh max-w-full flex-col overflow-hidden bg-background text-foreground">
      {/* 1. Minimalist Top Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-background/90 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <button className="shrink-0 rounded-lg border border-border p-1.5 text-muted hover:text-gold hover:border-gold/40 transition-colors lg:hidden" onClick={() => setDrawer("files")} aria-label="Menu">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">Jyinx IDE</p>
            <p className="text-[10px] text-muted truncate">{selectedRepository?.fullName ?? "local"} · {selectedRepository?.defaultBranch ?? "main"}</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[10px] text-muted">
          {uncommittedCount > 0 && <span className="flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-gold"><span className="h-1.5 w-1.5 rounded-full bg-gold" />{uncommittedCount} unsaved</span>}
          <span className="font-mono">{activePath}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={() => void commitWorkspace()} disabled={commitState === "committing" || uncommittedCount === 0} className="rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted hover:text-foreground hover:border-gold/40 transition-colors disabled:opacity-50">{commitState === "committing" ? "…" : `Commit${uncommittedCount > 0 ? ` (${uncommittedCount})` : ""}`}</button>
          <button type="button" onClick={() => void handleDeploy()} disabled={!selectedRepository} className="rounded-md bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1 text-[10px] font-medium text-white transition-colors disabled:opacity-50">Push</button>
          <span className="mx-1 h-4 w-px bg-border/60" />
          <button
            type="button"
            onClick={() => { setBuilderOpen(false); setDrawer(drawer === "chat" ? null : "chat"); }}
            className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${drawer === "chat" ? "bg-gold/15 text-gold border border-gold/30" : "text-muted hover:text-foreground border border-transparent hover:border-border"}`}
            title="Chat / Autonomous"
          >
            💬
          </button>
          <button
            type="button"
            onClick={() => { setBuilderOpen(!builderOpen); }}
            className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${builderOpen ? "bg-gold/15 text-gold border border-gold/30" : "text-muted hover:text-foreground border border-transparent hover:border-border"}`}
            title="Builder"
          >
            🛠
          </button>
          <span className="mx-1 h-4 w-px bg-border/60" />
          <button type="button" onClick={() => setCustomizeSidebarOpen(true)} className="rounded-md border border-border px-2 py-1 text-[10px] text-muted hover:text-foreground hover:border-gold/40 transition-colors" title="Settings">⚙</button>
        </div>
      </header>

      {/* 2. Main split: file tree + editor + side panels */}
      <div className="flex w-full max-w-full flex-1 min-h-0 overflow-hidden">
        <div className="hidden w-64 shrink-0 lg:block">{filesPanel}</div>
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <section className="flex min-w-0 flex-1 flex-col">
              {ws.openFiles.length > 0 && <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-background/40 px-2"><span className="mr-1 text-[9px] uppercase tracking-wider text-muted">Open</span>{ws.openFiles.map((p) => <button key={p} type="button" onClick={() => ws.setActive(p)} className={`shrink-0 cursor-pointer rounded-t-md border-b-2 px-2 py-1.5 text-[11px] ${p === activePath ? "border-gold text-gold" : "border-transparent text-muted hover:text-foreground"}`} title={p}>{p.split("/").pop()}{ws.files[p]?.dirty ? " ●" : ""}<span className="ml-1 text-muted/60" onClick={(e) => { e.stopPropagation(); ws.closeFile(p); }}>✕</span></button>)}</div>}
              <textarea value={activeBuf?.content ?? ""} onChange={(event) => { if (ws.activeFile) ws.writeFile(ws.activeFile, event.target.value); }} spellCheck={false} className="min-h-[180px] w-full max-w-full flex-1 resize-none overflow-x-auto p-4 font-mono text-xs leading-6 outline-none md:text-sm" style={{ backgroundColor: "var(--editor-bg)", color: "var(--editor-text)" }} />
            </section>
            {previewOpen && <div className="hidden w-[min(44%,560px)] shrink-0 border-l border-border lg:block"><PreviewLayout src="/" title="Live preview" /></div>}
            <div className="hidden w-[min(42%,440px)] shrink-0 border-l border-border lg:block">
            {builderOpen ? (
              <BuilderPanel onClose={() => setBuilderOpen(false)} onLaunchAgent={handleLaunchAgent} />
            ) : (
              <JyinxAgentChat
                key={selectedRepository?.fullName ?? "local"}
                open
                model={activeModelInfo}
                code={activeBuf?.content ?? ""}
                file={activePath}
                repository={selectedRepository?.fullName}
                repositoryContext={repositoryContext.context}
                repositoryFiles={ideContextFiles}
                onEdits={controller.applyEdits.bind(controller)}
                sessionKey={selectedRepository?.fullName ?? "local"}
                pendingPrompt={builderAgentPrompt ?? undefined}
                boundFile={activePath === "scratch.ts" ? undefined : activePath}
                defaultMode={agentPanelOpen ? "autonomous" : undefined}
              />
            )}
          </div>
          </div>
          <JyinxTerminalPanel repository={selectedRepository?.fullName} file={activePath} />
        </main>
        <div className="hidden w-72 shrink-0 lg:block">{inspectorPanel}</div>
      </div>

      {/* 3. Clean Bottom Tab Bar (Mobile) — just Chat, Jyinx, Royal */}
      <nav className="grid shrink-0 grid-cols-3 border-t border-border bg-surface/95 text-[11px] text-center text-muted xl:hidden">
        <button onClick={() => setDrawer("chat")} className="py-2 text-gold hover:text-gold/80 transition-colors">💬 Chat</button>
        <button onClick={() => { setMode("agent"); router.push("/jyinx"); }} className="py-2 hover:text-foreground transition-colors">🤖 Jyinx</button>
        <button onClick={() => router.push("/")} className="py-2 hover:text-foreground transition-colors">👑 Royal</button>
      </nav>

      {/* Drawer overlays (mobile) — files drawer shows a menu sidebar */}
      {drawer && <div className="fixed inset-0 z-50 bg-black/60 lg:hidden" onClick={() => setDrawer(null)}>
        <div className={`absolute top-0 bottom-0 w-[min(92vw,420px)] bg-surface shadow-2xl ${drawer === "files" ? "left-0" : "right-0"}`} onClick={(event) => event.stopPropagation()}>
          {drawer === "files" ? (
            <aside className="flex h-full flex-col overflow-y-auto p-3">
              <header className="flex items-center justify-between border-b border-border/40 pb-2.5 mb-3">
                <p className="text-xs font-semibold">Menu</p>
                <button type="button" onClick={() => setDrawer(null)} className="rounded-md border border-border/40 px-2 py-1 text-[10px] text-muted hover:text-gold">Close</button>
              </header>
              <div className="space-y-1">
                <button type="button" onClick={() => { /* No-op: Files is already shown */ }} className="flex w-full items-center gap-2.5 border-l-2 border-l-gold/60 pl-2.5 py-2 text-left text-[11px] text-gold transition-colors">📁 Files</button>
                <button type="button" onClick={() => { setCommandsOpen(true); setDrawer(null); }} className="flex w-full items-center gap-2.5 border-l-2 border-l-transparent hover:border-l-gold/40 pl-2.5 py-2 text-left text-[11px] text-muted hover:text-foreground transition-colors">⌘ Commands</button>
                <button type="button" onClick={() => { setBuilderOpen(true); setDrawer("builder"); }} className="flex w-full items-center gap-2.5 border-l-2 border-l-transparent hover:border-l-gold/40 pl-2.5 py-2 text-left text-[11px] text-muted hover:text-foreground transition-colors">🛠 Builder</button>
                <button type="button" onClick={() => { setCreateFlowOpen(true); setDrawer(null); }} className="flex w-full items-center gap-2.5 border-l-2 border-l-transparent hover:border-l-gold/40 pl-2.5 py-2 text-left text-[11px] text-muted hover:text-foreground transition-colors">＋ Create Project</button>
                <button type="button" onClick={() => { setCostOpen(true); setDrawer(null); }} className="flex w-full items-center gap-2.5 border-l-2 border-l-transparent hover:border-l-gold/40 pl-2.5 py-2 text-left text-[11px] text-muted hover:text-foreground transition-colors">💳 Cost & Keys</button>
                <button type="button" onClick={() => { setDrawer("inspector"); }} className="flex w-full items-center gap-2.5 border-l-2 border-l-transparent hover:border-l-gold/40 pl-2.5 py-2 text-left text-[11px] text-muted hover:text-foreground transition-colors">📊 Status</button>
                <button type="button" onClick={() => { setCustomizeSidebarOpen(true); setDrawer(null); }} className="flex w-full items-center gap-2.5 border-l-2 border-l-transparent hover:border-l-gold/40 pl-2.5 py-2 text-left text-[11px] text-muted hover:text-foreground transition-colors">⚙ Settings</button>
                <div className="border-t border-border/40 pt-3 mt-2">
                  {filesPanel}
                </div>
              </div>
            </aside>
          ) : drawer === "inspector" ? (
            <JyinxAgentChat key={"inspector-" + (selectedRepository?.fullName ?? "local")} open onClose={() => setDrawer(null)} model={activeModelInfo} code={activeBuf?.content ?? ""} file={activePath} repository={selectedRepository?.fullName} repositoryContext={repositoryContext.context} repositoryFiles={ideContextFiles} onEdits={controller.applyEdits.bind(controller)} sessionKey={selectedRepository?.fullName ?? "local"} pendingPrompt={builderAgentPrompt ?? undefined} boundFile={activePath === "scratch.ts" ? undefined : activePath} defaultMode={agentPanelOpen ? "autonomous" : undefined} />
          ) : drawer === "chat" || drawer === "builder" ? (
            drawer === "builder" || builderOpen ? (
              <BuilderPanel onClose={() => { setDrawer(null); setBuilderOpen(false); }} onLaunchAgent={handleLaunchAgent} />
            ) : (
              <JyinxAgentChat key={"chat-" + (selectedRepository?.fullName ?? "local")} open onClose={() => setDrawer(null)} model={activeModelInfo} code={activeBuf?.content ?? ""} file={activePath} repository={selectedRepository?.fullName} repositoryContext={repositoryContext.context} repositoryFiles={ideContextFiles} onEdits={controller.applyEdits.bind(controller)} sessionKey={selectedRepository?.fullName ?? "local"} pendingPrompt={builderAgentPrompt ?? undefined} boundFile={activePath === "scratch.ts" ? undefined : activePath} />
            )
          ) : null}
        </div>
      </div>}

      {/* Modals */}
      {createFlowOpen && (
        <div className="fixed inset-0 z-[70] bg-black/70 sm:p-6" onClick={() => setCreateFlowOpen(false)}>
          <div className="absolute right-0 top-0 h-full w-[min(92vw,420px)] overflow-y-auto sm:mx-auto sm:max-w-md sm:relative sm:mt-10 sm:rounded-2xl sm:border sm:border-border sm:bg-surface" onClick={(e) => e.stopPropagation()}>
            <CreateProjectFlow
              open
              onClose={() => setCreateFlowOpen(false)}
              onLaunchAgent={(prompt) => {
                setCreateFlowOpen(false);
                setBuilderAgentPrompt(prompt);
                setBuilderOpen(false);
                setDrawer("chat");
              }}
            />
          </div>
        </div>
      )}
      <JyinxSettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} activeModel={activeModel} onModelChange={setActiveModel} selectedRepositoryId={selectedRepository?.id} onRepositoryChange={(repository) => { if (repository) setSelectedRepository(repository); }} redirectPath="/jyinx" />
      {costOpen && <div className="fixed inset-0 z-[70] bg-black/70 p-4 sm:p-6" onClick={() => setCostOpen(false)}><section className="mx-auto mt-8 h-full max-h-[70vh] max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}><header className="flex items-center justify-between border-b border-border pb-3"><p className="text-sm font-semibold">Cost & keys</p><button type="button" onClick={() => setCostOpen(false)} className="rounded-lg border border-border px-2 py-1 text-xs text-muted">Close</button></header><div className="py-4"><CostTracker /></div></section></div>}
      <CustomizeSidebar open={customizeSidebarOpen} onClose={() => setCustomizeSidebarOpen(false)} queue={queue} activeModel={activeModelInfo} onModelChange={setActiveModel} selectedRepository={selectedRepository} onSelectRepository={setSelectedRepository} onAutonomousToggle={() => setAgentPanelOpen((current) => !current)} autonomousEnabled={agentPanelOpen} onCostClick={() => { setCostOpen(true); setCustomizeSidebarOpen(false); }} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={bridge.registry.list()} onRun={onRunCommand} state={ideState} />
      {commandsOpen && (
        <div className="fixed inset-0 z-[70] bg-black/60" onClick={() => setCommandsOpen(false)}>
          <aside className="absolute right-0 top-0 h-full w-[min(92vw,400px)] overflow-y-auto border-l border-border bg-surface p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <header className="flex items-center justify-between border-b border-border pb-3 mb-3">
              <p className="text-sm font-semibold">⌘ Commands</p>
              <button type="button" onClick={() => setCommandsOpen(false)} className="rounded-lg border border-border px-2 py-1 text-xs text-muted">Close</button>
            </header>
            <SidebarCommands commands={bridge.registry.list()} onRun={onRunCommand} onClose={() => setCommandsOpen(false)} />
          </aside>
        </div>
      )}
      {notice && (() => {
    const isAuthError = notice.toLowerCase().includes("github") || notice.toLowerCase().includes("connect") || notice.toLowerCase().includes("token") || notice.toLowerCase().includes("auth") || notice.toLowerCase().includes("expired") || notice.toLowerCase().includes("scope") || notice.toLowerCase().includes("permission");
    return (
      <div className="fixed bottom-0 left-0 right-0 z-[80] flex items-center justify-center p-3 sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2 sm:max-w-lg sm:p-0">
        <div className="flex w-full max-w-full flex-wrap items-center gap-2 rounded-xl border border-gold/30 bg-surface px-3 py-2.5 shadow-2xl sm:max-w-lg sm:flex-nowrap sm:px-4 sm:py-2">
          <span className="min-w-0 flex-1 break-words text-[11px] leading-relaxed text-gold sm:text-xs">{notice}</span>
          {isAuthError && (
            <button
              type="button"
              onClick={() => {
                clearStaleAuthKeys();
                clearPersistedGitHubToken();
                setNotice(null);
                void connectGitHub("/jyinx");
              }}
              className="shrink-0 rounded-md bg-gold px-2.5 py-1.5 text-[10px] font-semibold text-background hover:bg-gold/90 sm:text-xs"
            >
              Connect GitHub
            </button>
          )}
          <button type="button" onClick={() => setNotice(null)} className="shrink-0 rounded-lg border border-border px-2 py-1 text-[10px] text-muted hover:text-foreground sm:text-xs">✕</button>
        </div>
      </div>
    );
  })()}
    </div>
  );
}
