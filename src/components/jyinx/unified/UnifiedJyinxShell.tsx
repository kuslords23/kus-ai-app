"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { autonomousModeManager, type ExecutionMode, type LoopPhase } from "@/lib/jyinx/orchestrator/AutonomousModeManager";
import { kusOrchestrator, type OrchestratorState } from "@/lib/jyinx/orchestrator/KusOrchestrator";
import { persistenceManager, type SessionData } from "@/lib/jyinx/orchestrator/PersistenceManager";

export type RailTab = "agents" | "files" | "chat" | "timeline" | "inspector";

type Props = {
  projectId: string;
  userId?: string | null;
  repository: string;
  leftRail: ReactNode;
  mainContent: ReactNode;
  rightPanel: ReactNode;
  defaultTab?: RailTab;
};

/**
 * Unified Interface Shell — persistent left-hand context rail with dynamic
 * tab binding, autonomous mode controls, and live execution state display.
 */
export function UnifiedJyinxShell({
  projectId,
  userId,
  repository,
  leftRail,
  mainContent,
  rightPanel,
  defaultTab = "agents",
}: Props) {
  const [activeTab, setActiveTab] = useState<RailTab>(defaultTab);
  const [mode, setMode] = useState<ExecutionMode>(autonomousModeManager.getMode());
  const [phase, setPhase] = useState<LoopPhase>(autonomousModeManager.getPhase());
  const [orchestratorState, setOrchestratorState] = useState<OrchestratorState>(kusOrchestrator.getState());
  const [session, setSession] = useState<SessionData | null>(null);

  // Subscribe to autonomous mode + orchestrator state
  useEffect(() => {
    const unsubMode = autonomousModeManager.subscribe((snapshot) => {
      setMode(snapshot.mode);
      setPhase(snapshot.phase);
    });
    const unsubOrch = kusOrchestrator.subscribe((state) => {
      setOrchestratorState(state);
    });

    // Load persisted session
    persistenceManager.loadSession(projectId, userId).then((data) => {
      if (data) setSession(data);
    });

    return () => {
      unsubMode();
      unsubOrch();
    };
  }, [projectId, userId]);

  const handleToggleMode = useCallback(async () => {
    await autonomousModeManager.toggleMode();
  }, []);

  const runAutonomousTask = useCallback(
    async (intent: string) => {
      await autonomousModeManager.setMode("autonomous");
      await autonomousModeManager.startLoop(intent, repository);
    },
    [repository]
  );

  const tabs: Array<{ id: RailTab; label: string; icon: string; badge?: number }> = [
    { id: "agents", label: "Agents", icon: "🤖" },
    { id: "files", label: "Files", icon: "📁" },
    { id: "chat", label: "Chat", icon: "💬" },
    { id: "timeline", label: "Timeline", icon: "⏱" },
    { id: "inspector", label: "Inspector", icon: "🔍" },
  ];

  // Compute live status
  const runningTasks = orchestratorState.tasks.filter((t) => t.status === "running").length;
  const completedTasks = orchestratorState.tasks.filter((t) => t.status === "completed").length;
  const totalTasks = orchestratorState.tasks.length;

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      {/* Persistent Left Rail */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface/70 lg:flex">
        {/* Rail Tabs */}
        <div className="flex shrink-0 gap-0.5 border-b border-border px-2 py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 rounded-lg px-2 py-1.5 text-center transition ${
                activeTab === tab.id
                  ? "bg-gold/15 text-gold border border-gold/30"
                  : "text-muted hover:bg-surface-hover border border-transparent"
              }`}
              title={tab.label}
            >
              <span className="text-xs">{tab.icon}</span>
              <span className="mt-0.5 block text-[9px]">{tab.label}</span>
              {tab.badge ? (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[8px] text-background">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Autonomous Mode Toggle */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Execution Mode
            </p>
            <p className={`text-[11px] font-medium ${mode === "autonomous" ? "text-success" : phase !== "idle" ? "text-gold" : "text-muted"}`}>
              {phase !== "idle" && phase !== "completed" ? (
                <span className="flex items-center gap-1">
                  <span className={`inline-block h-1.5 w-1.5 animate-pulse rounded-full ${mode === "autonomous" ? "bg-success" : "bg-gold"}`} />
                  {phase}
                </span>
              ) : mode === "autonomous" ? "Autonomous" : "Manual"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleToggleMode()}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gold/50 ${
              mode === "autonomous" ? "bg-success" : "bg-muted/30"
            }`}
            role="switch"
            aria-checked={mode === "autonomous"}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                mode === "autonomous" ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {/* Live Execution Status */}
        <div className="shrink-0 border-b border-border px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Live Status
          </p>
          <div className="mt-1.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted">Tasks</span>
              <span className="text-[11px] font-mono text-foreground">
                {runningTasks > 0 ? (
                  <span className="text-gold">{runningTasks} running</span>
                ) : (
                  `${completedTasks}/${totalTasks} done`
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted">Phase</span>
              <span className="text-[11px] font-mono text-foreground">{orchestratorState.currentPhase}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted">Repository</span>
              <span className="max-w-[120px] truncate text-[11px] font-mono text-foreground">
                {repository || "—"}
              </span>
            </div>
          </div>
          {/* Quick prompt */}
          <div className="mt-2">
            <input
              type="text"
              placeholder="Autonomous task…"
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-gold"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.currentTarget.value.trim()) {
                  void runAutonomousTask(e.currentTarget.value.trim());
                  e.currentTarget.value = "";
                }
              }}
            />
          </div>
        </div>

        {/* Active Tab Content — dynamic binding */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {leftRail}
        </div>
      </aside>

      {/* Central Content */}
      <main className="flex min-w-0 flex-1 flex-col">
        {mainContent}
      </main>

      {/* Right Panel */}
      {rightPanel && (
        <div className="hidden w-[min(42%,560px)] shrink-0 border-l border-border xl:block">
          {rightPanel}
        </div>
      )}
    </div>
  );
}
