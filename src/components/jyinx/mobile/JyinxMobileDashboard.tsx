"use client";

import { useCallback, useMemo, useState } from "react";
import { JyinxGitHubRepos, type JyinxRepository } from "@/components/jyinx/JyinxGitHubRepos";
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
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tasks, setTasks] = useState(initialTasks);
  const [filters, setFilters] = useState(defaultFilters);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [task, setTask] = useState<AgentTask | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");

  const loadRepositories = useCallback((repositories: JyinxRepository[]) => {
    const next = repositories.map(toWorkspace);
    setWorkspaces(next);
    setWorkspace((current) => current && next.some((item) => item.id === current.id) ? current : next[0] ?? null);
    setTasks((current) => current.map((item) => ({ ...item, workspaceId: next[0]?.id ?? "pending" })));
  }, []);

  const stats = useMemo(() => ({ all: tasks.length, working: tasks.filter((item) => item.status === "working").length, attention: tasks.filter((item) => item.status === "attention").length, review: tasks.filter((item) => item.status === "review").length }), [tasks]);
  const visibleWorkspaces = workspaces.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));
  const workspaceTasks = workspace ? tasks.map((item) => ({ ...item, workspaceId: item.workspaceId === "pending" ? workspace.id : item.workspaceId })) : [];

  const createTask = (prompt: string) => {
    if (!workspace) return;
    const newTask: AgentTask = { id: `prompt-${Date.now()}`, title: prompt, workspaceId: workspace.id, status: "draft", branch: `jyinx/${workspace.name.split("/").pop()}-agent`, additions: 0, deletions: 0, updatedAt: new Date().toISOString(), files: [], logs: ["Prompt received", "Repository context attached", "Ready to build"] };
    setTasks((current) => [newTask, ...current]);
    setTask(newTask);
  };

  return <main className="min-h-dvh bg-background px-4 pb-28 pt-5 text-foreground sm:mx-auto sm:max-w-xl sm:px-6"><header className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 font-semibold text-gold">K</div><div><p className="text-base font-semibold">Jyinx</p><p className="text-xs text-muted">{workspace?.name ?? "Connect a GitHub workspace"}</p></div></div><div className="flex items-center gap-2"><button type="button" onClick={() => setSearchOpen((value) => !value)} className="rounded-xl border border-border p-2 text-muted" aria-label="Search workspaces">⌕</button><button type="button" onClick={() => setCustomizeOpen(true)} className="rounded-xl border border-border p-2 text-muted" aria-label="Customize dashboard">☷</button></div></header>{searchOpen && <div className="mt-4"><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search workspaces..." className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold" /></div>}<section className="mt-6 grid grid-cols-2 gap-3">{([["all", "All agents", stats.all, "bg-purple/15 text-purple-soft"], ["working", "Working", stats.working, "bg-success/10 text-success"], ["attention", "Needs attention", stats.attention, "bg-danger/10 text-danger"], ["review", "In review", stats.review, "bg-gold/10 text-gold"]] as const).map(([id, label, value, tone]) => <button type="button" key={id} onClick={() => id === "all" ? setFilters(defaultFilters) : setFilters({ ...filters, statuses: [id as AgentTask["status"]] })} className="rounded-2xl border border-border bg-surface/70 p-4 text-left"><span className={`inline-flex rounded-lg px-2 py-1 text-[10px] ${tone}`}>●</span><span className="mt-3 block text-2xl font-semibold">{value}</span><span className="mt-1 block text-xs text-muted">{label}</span></button>)}</section><section className="mt-6 rounded-2xl border border-border bg-surface/50 p-3"><JyinxGitHubRepos redirectPath="/jyinx/mobile" selectedRepositoryId={workspace ? Number(workspace.id) : undefined} onRepositoriesLoaded={loadRepositories} onSelectRepository={(repository) => setWorkspace(toWorkspace(repository))} /></section>{workspace ? <><WorkspaceDirectory workspaces={visibleWorkspaces} activeId={workspace.id} onSelect={setWorkspace} onAdd={() => setCustomizeOpen(true)} /><AgentTaskList workspace={workspace} tasks={workspaceTasks} filters={filters} onSelect={setTask} /></> : <section className="mt-6 rounded-2xl border border-dashed border-border p-6 text-center"><p className="text-sm font-medium">Connect GitHub to load workspaces</p><p className="mt-2 text-xs leading-relaxed text-muted">Your accessible repositories will appear here automatically after you authorize GitHub.</p></section>}<MobilePromptBar onSubmit={createTask} /><CustomizeDrawer open={customizeOpen} filters={filters} onChange={setFilters} onClose={() => setCustomizeOpen(false)} />{task && <TaskDetail task={task} onClose={() => setTask(null)} onAction={() => setTask(null)} />}</main>;
}
