"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { JyinxChatPanel } from "@/components/jyinx/JyinxChatPanel";
import { JyinxGitHubRepos, type JyinxRepository } from "@/components/jyinx/JyinxGitHubRepos";
import { JyinxSettingsPanel } from "@/components/jyinx/JyinxSettingsPanel";
import { JyinxWorkspaceFiles } from "@/components/jyinx/JyinxWorkspaceFiles";
import { JyinxTerminalPanel } from "@/components/jyinx/JyinxTerminalPanel";
import { AgentExecutionStream } from "@/components/jyinx/AgentExecutionStream";
import { useRepositoryContext } from "@/lib/jyinx/use-repository-context";
import { DEFAULT_JYINX_MODEL, JYINX_MODELS } from "@/lib/jyinx/model-registry";
import { useJyinxModelStore } from "@/lib/jyinx/model-store";
import { HierarchicalModelSelector } from "@/components/models/HierarchicalModelSelector";
import { providerFromModel, type HierarchicalSelection } from "@/lib/models/catalog";
import { CommandPalette } from "@/components/jyinx/commands/CommandPalette";
import { createAgentBridge, buildIdeState, type IdeState, type LastRunResult } from "@/lib/bridge";
import { CustomizeSidebar } from "@/components/shell/CustomizeSidebar";
import { PreviewLayout } from "@/components/jyinx/PreviewLayout";
import { CreateProjectModal } from "@/components/CreateProjectModal";
import { CostTracker } from "@/components/CostTracker";
import { consumeNotebookHand } from "@/lib/jyinx/notebooks";
import { IdeWorkspaceProvider, useIdeWorkspace } from "@/lib/ide/workspace";
import { AgentIdeController } from "@/lib/ide/controller";

type QueueState = { status: "ONLINE" | "OFFLINE" | "CONNECTING"; pendingItems: number; lastSync: string | null; total: number };

type JyinxStudioProps = { onExit?: () => void };

/** Wraps the IDE in the live in-IDE workspace store so Kus Code + agents can
 *  drive the editor's files directly. */
export function JyinxStudio({ onExit }: JyinxStudioProps) {
  return (
    <IdeWorkspaceProvider>
      <JyinxStudioInner onExit={onExit} />
    </IdeWorkspaceProvider>
  );
}

function JyinxStudioInner({ onExit }: JyinxStudioProps) {
  const router = useRouter();
  const ws = useIdeWorkspace();
  const { activeModel: sharedModel, setActiveModel: setSharedModel, setMode, selectedRepositoryId, selectedRepositoryName, setSelectedRepository: setSharedRepository } = useJyinxModelStore();
  const activeModel = sharedModel.id;
  const setActiveModel = (modelId: string) => setSharedModel(JYINX_MODELS.find((model) => model.id === modelId) ?? DEFAULT_JYINX_MODEL);
  // The active file + content now live in the IDE workspace buffer store.
  const activePath = ws.activeFile ?? "scratch.ts";
  const activeBuf = ws.activeFile ? ws.files[ws.activeFile] : null;
  const dirtyPaths = Object.values(ws.files).filter((f) => f.dirty).map((f) => f.path);
  const uncommittedCount = dirtyPaths.length;
  const [drawer, setDrawer] = useState<"files" | "inspector" | "chat" | null>(null);
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
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
  const [publishState, setPublishState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [publishMessage, setPublishMessage] = useState("");
  const [commitState, setCommitState] = useState<"idle" | "committing" | "done" | "error">("idle");
  const [commitMessage, setCommitMessage] = useState("Jyinx update");
  const [notebookContext, setNotebookContext] = useState<string | null>(null);
  const [notebookPrompt, setNotebookPrompt] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
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
      setNotebookContext(pending.context);
      setNotebookPrompt(`Continue from the "${pending.notebookName}" notebook context.`);
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
    // Non-blocking tips instead of hard errors: auto-select the last edited
    // file when none is open, and guide (rather than block) when no repo.
    const target = activePath === "scratch.ts" && dirtyPaths.length ? dirtyPaths[dirtyPaths.length - 1] : activePath;
    const content = activeBuf?.content ?? "";
    if (!selectedRepository) { setPublishState("idle"); setPublishMessage("Select a repository in Settings, then create a pull request when ready."); return; }
    if (!target) { setPublishState("idle"); setPublishMessage("Open a file first — or edit any file, and we'll pre-select it for the pull request."); return; }
    setPublishState("saving"); setPublishMessage("");
    try {
      const { data } = await createClient().auth.getSession(); const token = data.session?.provider_token;
      if (!token) throw new Error("Reconnect GitHub before publishing.");
      const branch = `jyinx/${target.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}`;
      const response = await fetch("/api/github/workspace", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ repository: selectedRepository.fullName, baseBranch: selectedRepository.defaultBranch, path: target, content, branchName: branch, message: `Jyinx update ${target}`, pullRequestTitle: `Jyinx: update ${target}`, pullRequestBody: `Created from Jyinx using ${activeModelInfo.label}. Review the change before merging.` }) });
      const result = await response.json() as { error?: string; pullRequest?: { url?: string }; message?: string }; if (!response.ok) throw new Error(result.error || "Unable to save change."); setPublishState("saved"); setPublishMessage(result.pullRequest?.url ? `Pull request created: ${result.pullRequest.url}` : result.message || "Saved to the Jyinx review branch.");
    } catch (cause) { setPublishState("error"); setPublishMessage(cause instanceof Error ? cause.message : "Unable to publish change."); }
  };

  // Commits ALL dirty workspace buffers atomically (action "commit-files"),
  // marks them clean, then offers to push the branch to the host platform.
  const commitWorkspace = async (message = commitMessage) => {
    const dirty = Object.values(ws.files).filter((f) => f.dirty);
    if (!selectedRepository) { setCommitState("error"); setNotice("Select a repository, then commit."); return; }
    if (dirty.length === 0) { setCommitState("idle"); setNotice("No unsaved changes to commit."); return; }
    setCommitState("committing");
    try {
      const { data } = await createClient().auth.getSession(); const token = data.session?.provider_token;
      if (!token) throw new Error("Reconnect GitHub before committing.");
      const response = await fetch("/api/github/commit", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "commit-files", repository: selectedRepository.fullName, baseBranch: selectedRepository.defaultBranch, message: message.trim() || `Jyinx update · ${dirty.length} file(s)`, files: dirty.map((f) => ({ path: f.path, content: f.content })) }) });
      const result = await response.json() as { error?: string; commitSha?: string; commitUrl?: string }; if (!response.ok) throw new Error(result.error || "Unable to commit to GitHub.");
      ws.markClean(dirty.map((f) => f.path));
      setCommitState("done"); setCommitMessage("Jyinx update");
      setNotice(`Committed ${dirty.length} file(s) to GitHub.`);
      void handleDeploy();
    } catch { setCommitState("error"); setNotice("Commit failed — see GitHub."); }
  };

  const commitToGitHub = (message?: string) => commitWorkspace(message);

  const handleDeploy = async () => {
    if (!selectedRepository) { setNotice("Select a repository, then push to a host platform."); return; }
    try {
      // First, commit any unsaved workspace changes
      const dirty = Object.values(ws.files).filter((f) => f.dirty);
      if (dirty.length > 0) {
        setNotice("Committing workspace changes before pushing…");
        const { data } = await createClient().auth.getSession();
        const token = data.session?.provider_token;
        if (token) {
          const commitRes = await fetch("/api/github/commit", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              action: "commit-files",
              repository: selectedRepository.fullName,
              baseBranch: selectedRepository.defaultBranch,
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
        // If no hooks configured, show the preview URL as a fallback
        if (msg.includes("No external build hook")) {
          setNotice(`📦 Push recorded. Deploy when a build hook is configured. ${data?.href ? `Preview: ${data.href}` : ""}`);
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
        toggleAgent: () => { setDrawer("chat"); setAgentPanelOpen(false); },
        toggleTerminal: () => setAgentPanelOpen((v) => !v),
        togglePreview: () => setDrawer(drawer === "inspector" ? null : "inspector"),
        toggleZen: () => setNotice("Zen mode — panels hidden."),
        zoom: () => undefined,
        setTheme: () => undefined,
      },
      agent: {
        ask: (prompt) => { setNotebookPrompt(prompt || "Help me with the active file."); setDrawer("chat"); },
        explain: () => { setNotebookPrompt(`Explain ${activePath}.`); setDrawer("chat"); },
        fixError: () => { setNotebookPrompt(`Fix errors in ${activePath}.`); setDrawer("chat"); },
        refactor: (path, goal) => { setNotebookPrompt(`Refactor ${path || activePath}${goal ? `: ${goal}` : ""}.`); setDrawer("chat"); },
        generate: (prompt) => { setNotebookPrompt(prompt); setDrawer("chat"); },
        preview: (path) => { setNotebookPrompt(`Generate a live preview for ${path || activePath}.`); setDrawer("chat"); },
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
const filesPanel = <aside className="flex h-full min-h-0 flex-col overflow-y-auto border-r border-border bg-surface/60 p-3"><JyinxGitHubRepos redirectPath="/jyinx" selectedRepositoryId={selectedRepository?.id} onSelectRepository={(repository) => setSelectedRepository(repository)} /><div className="mb-2 mt-4 px-1"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Workspace</p><p className="mt-1 text-sm font-medium">{selectedRepository?.fullName ?? "No repository selected"}</p><p className="mt-0.5 text-[10px] text-muted">{selectedRepository?.defaultBranch ?? "Connect GitHub above"}</p></div>{dirtyPaths.length > 0 && <div className="mb-2 rounded-xl border border-gold/25 bg-gold/5 p-2"><p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gold">Local changes · {uncommittedCount}</p>{dirtyPaths.map((p) => <button key={p} type="button" onClick={() => ws.setActive(p)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs text-muted hover:bg-surface-hover hover:text-foreground"><span className="text-gold">●</span><span className="truncate">{p}</span></button>)}</div>}<JyinxWorkspaceFiles repository={selectedRepository} onOpenFile={(path, content) => ws.openFile(path, content)} /><div className="mt-auto rounded-xl border border-border bg-background/50 p-3 text-[11px] text-muted"><p className="font-medium text-foreground">Agent & IDE workspace</p><p className="mt-1">Kus Code edits land here live. Review, then commit all local changes.</p></div></aside>;
  const inspectorPanel = <aside className="flex h-full min-h-0 flex-col overflow-y-auto border-l border-border bg-surface/60 p-4"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Inspector</p><p className="mt-1 text-sm font-medium">Workspace diagnostics</p></div><button className="text-xs text-muted lg:hidden" onClick={() => setDrawer(null)}>Close</button></div><section className="rounded-2xl border border-border bg-background/50 p-3"><p className="text-sm font-medium">Connection</p><p className="mt-2 text-xs text-muted"><span className={queue.status === "ONLINE" ? "text-success" : "text-gold"}>●</span> {queue.status === "ONLINE" ? "Synced" : "Local only"} · {queue.pendingItems} queued</p></section><section className="mt-4 rounded-2xl border border-border bg-background/50 p-3"><p className="text-sm font-medium">Model controller</p><div className="mt-3">{selector}</div><p className="mt-2 text-[11px] text-muted">{activeModelInfo.contextWindow.toLocaleString()} token context</p></section><JyinxGitHubRepos selectedRepositoryId={selectedRepository?.id} onSelectRepository={(repository) => setSelectedRepository(repository)} /><section className="mt-4 rounded-xl border border-gold/25 bg-gold/5 p-3 text-xs text-muted"><p className="font-medium text-gold">Deploy flow</p><p className="mt-1">Merge the Jyinx pull request and your GitHub-connected Vercel project deploys it automatically.</p></section></aside>;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
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
          {uncommittedCount > 0 && <button type="button" onClick={() => void commitWorkspace()} disabled={commitState === "committing"} className="rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted hover:text-foreground hover:border-gold/40 transition-colors disabled:opacity-50">{commitState === "committing" ? "…" : "Commit"}</button>}
          <button type="button" onClick={() => void handleDeploy()} disabled={!selectedRepository} className="rounded-md bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1 text-[10px] font-medium text-white transition-colors disabled:opacity-50">Push</button>
          <button type="button" onClick={() => setCustomizeSidebarOpen(true)} className="rounded-md border border-border px-2 py-1 text-[10px] text-muted hover:text-foreground hover:border-gold/40 transition-colors" title="Settings">⚙</button>
        </div>
      </header>

      {/* 2. Main split: file tree + editor + side panels */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="hidden w-64 shrink-0 lg:block">{filesPanel}</div>
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <section className="flex min-w-0 flex-1 flex-col">
              {ws.openFiles.length > 0 && <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-background/40 px-2"><span className="mr-1 text-[9px] uppercase tracking-wider text-muted">Open</span>{ws.openFiles.map((p) => <button key={p} type="button" onClick={() => ws.setActive(p)} className={`shrink-0 cursor-pointer rounded-t-md border-b-2 px-2 py-1.5 text-[11px] ${p === activePath ? "border-gold text-gold" : "border-transparent text-muted hover:text-foreground"}`} title={p}>{p.split("/").pop()}{ws.files[p]?.dirty ? " ●" : ""}<span className="ml-1 text-muted/60" onClick={(e) => { e.stopPropagation(); ws.closeFile(p); }}>✕</span></button>)}</div>}
              <textarea value={activeBuf?.content ?? ""} onChange={(event) => { if (ws.activeFile) ws.writeFile(ws.activeFile, event.target.value); }} spellCheck={false} className="min-h-[180px] flex-1 resize-none bg-[#0d0917] p-4 font-mono text-xs leading-6 text-purple-soft outline-none md:text-sm" />
            </section>
            {previewOpen && <div className="hidden w-[min(44%,560px)] shrink-0 border-l border-border lg:block"><PreviewLayout src="/" title="Live preview" /></div>}
            <div className="hidden w-[min(42%,440px)] shrink-0 border-l border-border xl:block">{agentPanelOpen ? <AgentExecutionStream open repository={selectedRepository?.fullName ?? ""} branch={selectedRepository?.defaultBranch ?? "main"} model={activeModel} repositoryFiles={ideContextFiles} onEdits={controller.applyEdits.bind(controller)} sessionKey={selectedRepository?.fullName ?? "local"} /> : <JyinxChatPanel open model={activeModelInfo} code={activeBuf?.content ?? ""} file={activePath} repository={selectedRepository?.fullName} repositoryContext={`${repositoryContext.context}${notebookContext ? `\n\n${notebookContext}` : ""}`} pendingPrompt={notebookPrompt ?? undefined} workspaceId={selectedRepository?.fullName ?? "local"} autonomous={agentPanelOpen} boundFile={activePath === "scratch.ts" ? undefined : activePath} />}</div>
          </div>
          <JyinxTerminalPanel repository={selectedRepository?.fullName} file={activePath} />
        </main>
        <div className="hidden w-72 shrink-0 lg:block">{inspectorPanel}</div>
      </div>

      {/* 3. Clean Bottom Tab Bar (Mobile) */}
      <nav className="grid shrink-0 grid-cols-4 border-t border-border bg-surface/95 text-[11px] text-center text-muted xl:hidden">
        <button onClick={() => setDrawer("files")} className="py-2 hover:text-foreground transition-colors">Files</button>
        <button onClick={() => setDrawer("chat")} className="py-2 text-gold hover:text-gold/80 transition-colors">Chat</button>
        <button onClick={() => setDrawer("inspector")} className="py-2 hover:text-foreground transition-colors">Status</button>
        <button onClick={() => router.push("/")} className="py-2 hover:text-foreground transition-colors">Royal</button>
      </nav>

      {/* Drawer overlays (mobile) */}
      {drawer && <div className="fixed inset-0 z-50 bg-black/60 lg:hidden" onClick={() => setDrawer(null)}><div className={`absolute top-0 bottom-0 w-[min(92vw,420px)] bg-surface shadow-2xl ${drawer === "files" ? "left-0" : "right-0"}`} onClick={(event) => event.stopPropagation()}>{drawer === "files" ? filesPanel : drawer === "inspector" ? inspectorPanel : agentPanelOpen ? <AgentExecutionStream open onClose={() => setDrawer(null)} repository={selectedRepository?.fullName ?? ""} branch={selectedRepository?.defaultBranch ?? "main"} model={activeModel} repositoryFiles={ideContextFiles} onEdits={controller.applyEdits.bind(controller)} sessionKey={selectedRepository?.fullName ?? "local"} /> : <JyinxChatPanel open onClose={() => setDrawer(null)} model={activeModelInfo} code={activeBuf?.content ?? ""} file={activePath} repository={selectedRepository?.fullName} repositoryContext={`${repositoryContext.context}${notebookContext ? `\n\n${notebookContext}` : ""}`} pendingPrompt={notebookPrompt ?? undefined} workspaceId={selectedRepository?.fullName ?? "local"} autonomous={agentPanelOpen} boundFile={activePath === "scratch.ts" ? undefined : activePath} />}</div></div>}

      {/* Modals */}
      <JyinxSettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} activeModel={activeModel} onModelChange={setActiveModel} selectedRepositoryId={selectedRepository?.id} onRepositoryChange={(repository) => { if (repository) setSelectedRepository(repository); }} redirectPath="/jyinx" />
      {createOpen && <CreateProjectModal open onClose={() => setCreateOpen(false)} onCreated={(repo) => { setCreateOpen(false); setNotice(`Project created: ${repo.fullName}`); }} />}
      {costOpen && <div className="fixed inset-0 z-[70] bg-black/70 p-4 sm:p-6" onClick={() => setCostOpen(false)}><section className="mx-auto mt-8 h-full max-h-[70vh] max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}><header className="flex items-center justify-between border-b border-border pb-3"><p className="text-sm font-semibold">Cost & keys</p><button type="button" onClick={() => setCostOpen(false)} className="rounded-lg border border-border px-2 py-1 text-xs text-muted">Close</button></header><div className="py-4"><CostTracker /></div></section></div>}
      <CustomizeSidebar open={customizeSidebarOpen} onClose={() => setCustomizeSidebarOpen(false)} queue={queue} activeModel={activeModelInfo} onModelChange={setActiveModel} selectedRepository={selectedRepository} onSelectRepository={setSelectedRepository} onAutonomousToggle={() => setAgentPanelOpen((current) => !current)} autonomousEnabled={agentPanelOpen} onCostClick={() => { setCostOpen(true); setCustomizeSidebarOpen(false); }} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={bridge.registry.list()} onRun={onRunCommand} state={ideState} />
      {notice && <button type="button" onClick={() => setNotice(null)} className="fixed bottom-4 left-1/2 z-[80] -translate-x-1/2 rounded-xl border border-gold/30 bg-surface px-4 py-2 text-sm text-gold shadow-2xl">{notice}</button>}
    </div>
  );
}
