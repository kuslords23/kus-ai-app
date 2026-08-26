"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { connectGitHub } from "@/lib/jyinx/github-connect";
import { JyinxChatPanel } from "@/components/jyinx/JyinxChatPanel";
import { JyinxStudio } from "@/components/jyinx/JyinxStudio";
import type { JyinxRepository } from "@/components/jyinx/JyinxGitHubRepos";
import { JYINX_MODELS } from "@/lib/jyinx/model-registry";
import { JyinxSettingsPanel } from "@/components/jyinx/JyinxSettingsPanel";
import { useJyinxModelStore } from "@/lib/jyinx/model-store";
import { useRepositoryContext } from "@/lib/jyinx/use-repository-context";
import { JyinxComposerControls } from "@/components/jyinx/JyinxComposerControls";
import { AgentTaskList } from "./AgentTaskList";
import { CustomizeDrawer } from "./CustomizeDrawer";
import { MobilePromptBar } from "./MobilePromptBar";
import { AgentExecutionStream } from "@/components/jyinx/AgentExecutionStream";
import { TaskDetail } from "./TaskDetail";
import { WorkspaceDirectory } from "./WorkspaceDirectory";
import type { AgentTask, MobileFilters, Workspace } from "./types";
import { consumeNotebookHand } from "@/lib/jyinx/notebooks";
import Link from "next/link";

const initialTasks: AgentTask[] = [];
const defaultFilters: MobileFilters = { groupBy: "status", statuses: [], branch: "all", showDiff: true, showBranch: true, showUpdated: true };

function toWorkspace(repository: JyinxRepository): Workspace {
  return { id: String(repository.id), name: repository.fullName, branch: repository.defaultBranch, source: "github", private: repository.isPrivate };
}

export function JyinxMobileDashboard() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [repositoryRecords, setRepositoryRecords] = useState<JyinxRepository[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tasks, setTasks] = useState<AgentTask[]>(initialTasks);
  const [filters, setFilters] = useState(defaultFilters);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [task, setTask] = useState<AgentTask | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [executionOpen, setExecutionOpen] = useState(false);
  const [executionPrompt, setExecutionPrompt] = useState("");
  const [queueStatus, setQueueStatus] = useState<"ONLINE" | "OFFLINE" | "CONNECTING">("CONNECTING");
  const [pendingItems, setPendingItems] = useState(0);
  const { activeModel, setActiveModel, customAgents, addCustomAgent, selectedRepositoryId, setSelectedRepository, mode, setMode } = useJyinxModelStore();
  const ideOpen = mode === "ide";
  const selectedRepository = repositoryRecords.find((repository) => repository.id === selectedRepositoryId) ?? null;
  const repositoryContext = useRepositoryContext(selectedRepository);
  const [customAgentId, setCustomAgentId] = useState<string | null>(customAgents[0]?.id ?? null);
  const customAgent = customAgents.find((item) => item.id === customAgentId) ?? customAgents[0] ?? null;
  const [notebookContext, setNotebookContext] = useState<string | null>(null);

  // "Open in Jyinx" hand-off from the Notebook view: consume the staged
  // payload, open the agent chat, and seed the notebook context into it.
  useEffect(() => {
    const pending = consumeNotebookHand();
    if (pending) {
      setNotebookContext(pending.context);
      setChatOpen(true);
      setNotice(`Opened notebook "${pending.notebookName}" in Jyinx.`);
    }
  }, []);

  const loadRepositories = useCallback((repositories: JyinxRepository[]) => {
    const next = repositories.map(toWorkspace);
    setRepositoryRecords(repositories);
    setWorkspaces(next);
    setWorkspace((current) => current && next.some((item) => item.id === current.id) ? current : next[0] ?? null);
    const selected = repositories.find((repository) => repository.id === selectedRepositoryId) ?? repositories[0];
    if (selected) setSelectedRepository(selected.id, selected.fullName);
    setTasks((current) => current.map((item) => item.workspaceId === "pending" ? { ...item, workspaceId: next[0]?.id ?? "pending" } : item));
  }, [selectedRepositoryId, setSelectedRepository]);

  // Seed the workspace list from GitHub on mount (the full picker now lives in settings).
  useEffect(() => {
    let cancelled = false;
    const seed = async () => {
      try {
        const { data } = await createClient().auth.getSession();
        const token = data.session?.provider_token;
        if (!token || cancelled) return;
        const response = await fetch("/api/github/repos", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json().catch(() => ({}))) as { repositories?: JyinxRepository[] };
        if (cancelled) return;
        if (payload.repositories?.length) loadRepositories(payload.repositories);
      } catch {
        // non-fatal — the picker in settings handles connection errors.
      }
    };
    void seed();
    return () => { cancelled = true; };
  }, [loadRepositories]);

  useEffect(() => {
    let cancelled = false;
    const refreshMetrics = async () => {
      try {
        const response = await fetch("/api/jyinx/queue", { cache: "no-store" });
        if (!response.ok) throw new Error("Queue unavailable");
        const data = await response.json() as { status?: "ONLINE" | "OFFLINE" | "CONNECTING"; pendingItems?: number };
        if (!cancelled) {
          setQueueStatus(data.status ?? "ONLINE");
          setPendingItems(data.pendingItems ?? 0);
        }
      } catch {
        if (!cancelled) setQueueStatus("OFFLINE");
      }
    };
    void refreshMetrics();
    const timer = window.setInterval(() => void refreshMetrics(), 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const stats = useMemo(() => ({ all: tasks.length, working: tasks.filter((item) => item.status === "working").length, attention: tasks.filter((item) => item.status === "attention").length + pendingItems, review: tasks.filter((item) => item.status === "review").length }), [pendingItems, tasks]);
  const visibleWorkspaces = workspaces.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));
  const workspaceTasks = workspace ? tasks.map((item) => ({ ...item, workspaceId: item.workspaceId === "pending" ? workspace.id : item.workspaceId })) : [];

  const handleAutonomous = async (prompt: string) => {
    if (!workspace) {
      setNotice("Connect GitHub before starting an agent task.");
      void connectGitHub("/jyinx").catch(() => undefined);
      return;
    }
    try {
      const { data } = await createClient().auth.getSession();
      if (!data.session?.provider_token) {
        setNotice("Your GitHub session expired. Reconnecting…");
        await connectGitHub("/jyinx");
        return;
      }
      setExecutionPrompt(prompt);
      setExecutionOpen(true);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Unable to start the autonomous agent. Check the GitHub connection.");
    }
  };

  // Surface GitHub OAuth errors (missing scope, expired token) as a notice.
  useEffect(() => {
    const githubError = new URLSearchParams(window.location.search).get("github_error");
    if (githubError) setNotice(decodeURIComponent(githubError));
    const supabase = createClient();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.provider_token) setNotice(null);
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  if (ideOpen) return <div className="min-h-dvh"><JyinxStudio onExit={() => setMode("agent")} /></div>;

  return <main className="flex min-h-dvh flex-col overflow-y-auto bg-background px-4 pb-40 pt-5 text-foreground sm:mx-auto sm:max-w-xl sm:px-6"><header className="flex items-center justify-between"><div className="flex items-center gap-3"><Link href="/" className="flex h-10 shrink-0 items-center gap-1.5 rounded-2xl border border-border bg-surface/70 px-2.5 text-xs font-medium text-muted hover:border-gold/40 hover:text-gold" aria-label="Back to Royal">← Royal</Link><button type="button" onClick={() => setSettingsOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 font-semibold text-gold" aria-label="Open Jyinx account settings">K</button><div><p className="text-base font-semibold">Jyinx</p><p className="text-xs text-muted">{activeModel.label}{customAgent ? ` · ${customAgent.name}` : workspace ? ` · ${workspace.name}` : ""}</p></div></div><div className="flex items-center gap-2"><span className={`hidden rounded-full px-2 py-1 text-[10px] sm:inline-flex ${queueStatus === "ONLINE" ? "bg-success/10 text-success" : "bg-gold/10 text-gold"}`}>{queueStatus === "ONLINE" ? "Live" : `${pendingItems} queued`}</span><Link href="/jyinx/peer-chat" className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-2 py-2 text-xs text-blue-400" aria-label="Peer-to-Peer chat">👥</Link><Link href="/jyinx/code-library" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2 py-2 text-xs text-emerald-400" aria-label="Code library">📦</Link><Link href="/jyinx/search" className="rounded-xl border border-border p-2 text-muted hover:border-gold/30 hover:text-gold" aria-label="Online code search">🔎</Link><button type="button" onClick={() => setChatOpen(true)} className="rounded-xl border border-gold/30 bg-gold/10 px-2 py-2 text-xs text-gold" aria-label="Open Jyinx chat">Chat</button><button type="button" onClick={() => setMode("ide")} className="rounded-xl border border-purple/35 bg-purple/10 px-2 py-2 text-xs text-purple-soft" aria-label="Open Jyinx IDE">IDE</button><Link href="/jyinx/notebooks" className="rounded-xl border border-border p-2 text-muted hover:border-gold/30 hover:text-gold" aria-label="Open notebooks">📓</Link><button type="button" onClick={() => setSearchOpen((value) => !value)} className="rounded-xl border border-border p-2 text-muted" aria-label="Search workspaces">⌕</button><button type="button" onClick={() => setCustomizeOpen(true)} className="rounded-xl border border-border p-2 text-muted" aria-label="Customize dashboard">☷</button></div></header>{searchOpen && <div className="mt-4"><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search workspaces..." className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold" /></div>}<section className="mt-6 grid grid-cols-2 gap-3">{([["all", "All agents", stats.all, "bg-purple/15 text-purple-soft"], ["working", "Working", stats.working, "bg-success/10 text-success"], ["attention", "Needs attention", stats.attention, "bg-danger/10 text-danger"], ["review", "In review", stats.review, "bg-gold/10 text-gold"]] as const).map(([id, label, value, tone]) => <button type="button" key={id} onClick={() => { window.location.href = `/jyinx/metrics?metric=${id}`; }} className="rounded-2xl border border-border bg-surface/70 p-4 text-left"><span className={`inline-flex rounded-lg px-2 py-1 text-[10px] ${tone}`}>●</span><span className="mt-3 block text-2xl font-semibold">{value}</span><span className="mt-1 block text-xs text-muted">{label}</span></button>)}</section><section className="relative z-20 mt-6 rounded-2xl border border-border bg-surface/50 p-3"><button type="button" onClick={() => setSettingsOpen(true)} className="flex w-full items-center justify-between rounded-xl border border-border bg-background/50 px-3 py-2 text-left hover:border-gold/30"><span className="flex min-w-0 items-center gap-2"><span className="text-sm">📦</span><span className="min-w-0"><span className="block text-[11px] uppercase tracking-wider text-muted">Github repository</span><span className="block truncate text-xs font-medium">{workspace?.name ?? selectedRepository?.fullName ?? "Select repository"}</span></span></span><span className="shrink-0 rounded-lg border border-gold/30 bg-gold/10 px-2 py-1 text-[10px] text-gold">{repositoryRecords.length > 0 ? "Change" : "Connect"}</span></button><div className="mt-2"><JyinxComposerControls activeModel={activeModel} onModelChange={setActiveModel} onAgentChange={(agent) => { if (agent) { setCustomAgentId(agent.id); if (!customAgents.some((item) => item.id === agent.id)) addCustomAgent(agent); } }} /></div></section>{workspace ? <><WorkspaceDirectory workspaces={visibleWorkspaces} activeId={workspace.id} onSelect={setWorkspace} onAdd={() => setCustomizeOpen(true)} onOpenIde={() => setMode("ide")} />{notice && <p className="mt-3 rounded-xl border border-gold/25 bg-gold/5 px-3 py-2 text-xs text-gold">{notice}</p>}<AgentTaskList workspace={workspace} tasks={workspaceTasks} filters={filters} onSelect={setTask} /></> : <section className="mt-6 rounded-2xl border border-dashed border-border p-6 text-center"><p className="text-sm font-medium">Connect GitHub to load workspaces</p><p className="mt-2 text-xs leading-relaxed text-muted">Your accessible repositories will appear here automatically after you authorize GitHub.</p><button type="button" onClick={() => void connectGitHub("/jyinx")} className="mt-4 rounded-xl border border-gold/35 bg-gold/10 px-4 py-2 text-xs font-medium text-gold hover:bg-gold/20">Connect GitHub</button></section>}{notice && <p className="mt-3 rounded-xl border border-gold/25 bg-gold/5 px-3 py-2 text-xs text-gold">{notice}</p>}<MobilePromptBar onSubmit={(prompt) => void handleAutonomous(prompt)} onAttach={() => setNotice(workspace ? `Repository context attached: ${workspace.name}` : "Connect GitHub first to attach repository context.")} onVoice={() => setNotice("Voice input is not configured yet. Type a task or open the full IDE for agent chat.")} /><CustomizeDrawer open={customizeOpen} filters={filters} onChange={setFilters} onClose={() => setCustomizeOpen(false)} /><JyinxSettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} activeModel={activeModel.id} onModelChange={(model) => { const next = JYINX_MODELS.find((item) => item.id === model); if (next) setActiveModel(next); }} selectedRepositoryId={selectedRepositoryId ?? (workspace ? Number(workspace.id) : undefined)} onRepositoryChange={(repository) => { if (!repository) return; setSelectedRepository(repository.id, repository.fullName); setWorkspace(toWorkspace(repository)); }} onRepositoriesLoaded={loadRepositories} redirectPath="/jyinx" />{chatOpen && <div className="fixed inset-0 z-[60] bg-black/70 p-3 sm:p-6" onClick={() => setChatOpen(false)}><section className="mx-auto h-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface" onClick={(event) => event.stopPropagation()}><JyinxChatPanel open onClose={() => setChatOpen(false)} model={activeModel} code="" file="mobile-workspace" repository={workspace?.name} repositoryContext={`${repositoryContext.context}${notebookContext ? `\n\n${notebookContext}` : ""}`} agent={customAgent} workspaceId={workspace?.name ?? "local"} /></section></div>}{executionOpen && <div className="fixed inset-0 z-[60] bg-black/70 p-3 sm:p-6" onClick={() => setExecutionOpen(false)}><section className="mx-auto h-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface" onClick={(event) => event.stopPropagation()}><AgentExecutionStream open onClose={() => setExecutionOpen(false)} repository={workspace?.name ?? (selectedRepository ? selectedRepository.fullName : "")} branch={workspace?.branch ?? "main"} model={activeModel.id} repositoryFiles={repositoryContext.files} initialPrompt={executionPrompt} onPromptChange={setExecutionPrompt} sessionKey={workspace?.name ?? selectedRepository?.fullName ?? "mobile"} /></section></div>}{task && <TaskDetail task={task} onClose={() => setTask(null)} onAction={(selectedTask) => { setTask(null); setNotice(selectedTask.status === "review" ? "Open the full IDE to review the complete diff and create a pull request." : "Task is ready in the Jyinx agent workspace. Open the full IDE to build it with repository context."); }} />}</main>;
}
