"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { JyinxChatPanel } from "@/components/jyinx/JyinxChatPanel";
import { JyinxStudio } from "@/components/jyinx/JyinxStudio";
import { JyinxGitHubRepos, type JyinxRepository } from "@/components/jyinx/JyinxGitHubRepos";
import { DEFAULT_JYINX_MODEL } from "@/lib/jyinx/model-registry";
import { useJyinxModelStore, type JyinxCustomAgent } from "@/lib/jyinx/model-store";
import { JyinxComposerControls } from "@/components/jyinx/JyinxComposerControls";
import { AgentTaskList } from "./AgentTaskList";
import { CustomizeDrawer } from "./CustomizeDrawer";
import { MobilePromptBar } from "./MobilePromptBar";
import { TaskDetail } from "./TaskDetail";
import { WorkspaceDirectory } from "./WorkspaceDirectory";
import type { AgentTask, MobileFilters, Workspace } from "./types";

const initialTasks: AgentTask[] = [
  { id: "task-1", title: "Build mobile workspace agent dashboard", workspaceId: "pending", status: "working", branch: "jyinx/mobile-agent", additions: 974, deletions: 187, updatedAt: new Date().toISOString(), files: ["JyinxMobileDashboard.tsx"], logs: ["Opened workspace tree", "Mapped mobile navigation states", "Building responsive task cards"] },
  { id: "task-2", title: "Review GitHub repository connector", workspaceId: "pending", status: "review", branch: "jyinx/github-workspace", additions: 142, deletions: 31, updatedAt: new Date(Date.now() - 86_400_000).toISOString(), files: ["github/workspace/route.ts"], logs: ["Read provider token session", "Inspected repository permissions", "Prepared pull request review"] },
];
const defaultFilters: MobileFilters = { groupBy: "status", statuses: [], branch: "all", showDiff: true, showBranch: true, showUpdated: true };

function toWorkspace(repository: JyinxRepository): Workspace {
  return { id: String(repository.id), name: repository.fullName, branch: repository.defaultBranch, source: "github", private: repository.isPrivate };
}

export function JyinxMobileDashboard() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [repositoryRecords, setRepositoryRecords] = useState<JyinxRepository[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tasks, setTasks] = useState(initialTasks);
  const [filters, setFilters] = useState(defaultFilters);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [task, setTask] = useState<AgentTask | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [queueStatus, setQueueStatus] = useState<"ONLINE" | "OFFLINE" | "CONNECTING">("CONNECTING");
  const [pendingItems, setPendingItems] = useState(0);
  const { activeModel, setActiveModel, customAgents, addCustomAgent, selectedRepositoryId, setSelectedRepository, mode, setMode } = useJyinxModelStore();
  const ideOpen = mode === "ide";
  const [customAgent, setCustomAgent] = useState<JyinxCustomAgent | null>(customAgents[0] ?? null);
  useEffect(() => { setCustomAgent(customAgents[0] ?? null); }, [customAgents]);

  const loadRepositories = useCallback((repositories: JyinxRepository[]) => {
    const next = repositories.map(toWorkspace);
    setRepositoryRecords(repositories);
    setWorkspaces(next);
    setWorkspace((current) => current && next.some((item) => item.id === current.id) ? current : next[0] ?? null);
    setTasks((current) => current.map((item) => ({ ...item, workspaceId: next[0]?.id ?? "pending" })));
  }, []);

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

  const stats = useMemo(() => ({ all: tasks.length, working: tasks.filter((item) => item.status === "working").length, attention: tasks.filter((item) => item.status === "attention").length + (queueStatus === "OFFLINE" ? pendingItems : 0), review: tasks.filter((item) => item.status === "review").length }), [pendingItems, queueStatus, tasks]);
  const visibleWorkspaces = workspaces.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));
  const workspaceTasks = workspace ? tasks.map((item) => ({ ...item, workspaceId: item.workspaceId === "pending" ? workspace.id : item.workspaceId })) : [];

  const createTask = (prompt: string) => {
    if (!workspace) return;
    const newTask: AgentTask = { id: `prompt-${Date.now()}`, title: prompt, workspaceId: workspace.id, status: "draft", branch: `jyinx/${workspace.name.split("/").pop()}-agent`, additions: 0, deletions: 0, updatedAt: new Date().toISOString(), files: [], logs: ["Prompt received", "Repository context attached", "Ready to build"] };
    setTasks((current) => [newTask, ...current]);
    setTask(newTask);
  };

  if (ideOpen) return <div className="min-h-dvh"><JyinxStudio onExit={() => setMode("agent")} /></div>;

  return <main className="min-h-dvh bg-background px-4 pb-28 pt-5 text-foreground sm:mx-auto sm:max-w-xl sm:px-6"><header className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 font-semibold text-gold">K</div><div><p className="text-base font-semibold">Jyinx</p><p className="text-xs text-muted">{activeModel.label}{customAgent ? ` · ${customAgent.name}` : workspace ? ` · ${workspace.name}` : ""}</p></div></div><div className="flex items-center gap-2"><span className={`hidden rounded-full px-2 py-1 text-[10px] sm:inline-flex ${queueStatus === "ONLINE" ? "bg-success/10 text-success" : "bg-gold/10 text-gold"}`}>{queueStatus === "ONLINE" ? "Live" : `${pendingItems} queued`}</span><button type="button" onClick={() => setChatOpen(true)} className="rounded-xl border border-gold/30 bg-gold/10 px-2 py-2 text-xs text-gold" aria-label="Open Jyinx chat">Chat</button><button type="button" onClick={() => setSearchOpen((value) => !value)} className="rounded-xl border border-border p-2 text-muted" aria-label="Search workspaces">⌕</button><button type="button" onClick={() => setCustomizeOpen(true)} className="rounded-xl border border-border p-2 text-muted" aria-label="Customize dashboard">☷</button></div></header>{searchOpen && <div className="mt-4"><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search workspaces..." className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold" /></div>}<section className="mt-6 grid grid-cols-2 gap-3">{([["all", "All agents", stats.all, "bg-purple/15 text-purple-soft"], ["working", "Working", stats.working, "bg-success/10 text-success"], ["attention", "Needs attention", stats.attention, "bg-danger/10 text-danger"], ["review", "In review", stats.review, "bg-gold/10 text-gold"]] as const).map(([id, label, value, tone]) => <button type="button" key={id} onClick={() => id === "all" ? setFilters(defaultFilters) : setFilters({ ...filters, statuses: [id as AgentTask["status"]] })} className="rounded-2xl border border-border bg-surface/70 p-4 text-left"><span className={`inline-flex rounded-lg px-2 py-1 text-[10px] ${tone}`}>●</span><span className="mt-3 block text-2xl font-semibold">{value}</span><span className="mt-1 block text-xs text-muted">{label}</span></button>)}</section><section className="mt-6 rounded-2xl border border-border bg-surface/50 p-3"><JyinxGitHubRepos redirectPath="/jyinx" selectedRepositoryId={selectedRepositoryId ?? (workspace ? Number(workspace.id) : undefined)} onRepositoriesLoaded={loadRepositories} onSelectRepository={(repository) => setWorkspace(toWorkspace(repository))} /><JyinxComposerControls repositories={repositoryRecords} selectedRepositoryId={selectedRepositoryId ?? (workspace ? Number(workspace.id) : undefined)} onRepositoryChange={(repository) => { if (!repository) return; setSelectedRepository(repository.id, repository.fullName); setWorkspace(toWorkspace(repository)); }} activeModel={activeModel} onModelChange={setActiveModel} onAgentChange={(agent) => { setCustomAgent(agent); if (agent && !customAgents.some((item) => item.id === agent.id)) addCustomAgent(agent); }} /></section>{workspace ? <><WorkspaceDirectory workspaces={visibleWorkspaces} activeId={workspace.id} onSelect={setWorkspace} onAdd={() => setCustomizeOpen(true)} onOpenIde={() => setMode("ide")} />{notice && <p className="mt-3 rounded-xl border border-gold/25 bg-gold/5 px-3 py-2 text-xs text-gold">{notice}</p>}<AgentTaskList workspace={workspace} tasks={workspaceTasks} filters={filters} onSelect={setTask} /></> : <section className="mt-6 rounded-2xl border border-dashed border-border p-6 text-center"><p className="text-sm font-medium">Connect GitHub to load workspaces</p><p className="mt-2 text-xs leading-relaxed text-muted">Your accessible repositories will appear here automatically after you authorize GitHub.</p></section>}<MobilePromptBar onSubmit={(prompt) => { if (!workspace) { setNotice("Connect GitHub before starting an agent task."); return; } setChatOpen(true); createTask(prompt); }} onAttach={() => setNotice(workspace ? `Repository context attached: ${workspace.name}` : "Connect GitHub first to attach repository context.")} onVoice={() => setNotice("Voice input is not configured yet. Type a task or open the full IDE for agent chat.")} /><CustomizeDrawer open={customizeOpen} filters={filters} onChange={setFilters} onClose={() => setCustomizeOpen(false)} />{chatOpen && <div className="fixed inset-0 z-[60] bg-black/70 p-3 sm:p-6" onClick={() => setChatOpen(false)}><section className="mx-auto h-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface" onClick={(event) => event.stopPropagation()}><JyinxChatPanel open onClose={() => setChatOpen(false)} model={activeModel} code="" file="mobile-workspace" repository={workspace?.name} agent={customAgent} workspaceId={workspace?.name ?? "local"} /></section></div>}{task && <TaskDetail task={task} onClose={() => setTask(null)} onAction={(selectedTask) => { setTask(null); setNotice(selectedTask.status === "review" ? "Open the full IDE to review the complete diff and create a pull request." : "Task is ready in the Jyinx agent workspace. Open the full IDE to build it with repository context."); }} />}</main>;
}
