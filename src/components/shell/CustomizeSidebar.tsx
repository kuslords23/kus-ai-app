"use client";

import { useState } from "react";
import type { JyinxRepository } from "@/components/jyinx/JyinxGitHubRepos";
import { JyinxGitHubRepos } from "@/components/jyinx/JyinxGitHubRepos";
import type { JyinxModel } from "@/lib/jyinx/model-registry";
import { HierarchicalModelSelector } from "@/components/models/HierarchicalModelSelector";
import { providerFromModel, type HierarchicalSelection } from "@/lib/models/catalog";
import { GitHubSetup } from "@/components/jyinx/GitHubSetup";

type QueueState = { status: "ONLINE" | "OFFLINE" | "CONNECTING"; pendingItems: number; lastSync: string | null; total: number };

interface CustomizeSidebarProps {
  open: boolean;
  onClose: () => void;
  queue: QueueState;
  activeModel: JyinxModel;
  onModelChange: (modelId: string) => void;
  selectedRepository?: JyinxRepository | null;
  onSelectRepository: (repo: JyinxRepository | null) => void;
  onAutonomousToggle: () => void;
  autonomousEnabled: boolean;
  onCostClick: () => void;
}

export function CustomizeSidebar({
  open,
  onClose,
  queue,
  activeModel,
  onModelChange,
  selectedRepository,
  onSelectRepository,
  onAutonomousToggle,
  autonomousEnabled,
  onCostClick,
}: CustomizeSidebarProps) {
  if (!open) return null;

  const [activeTab, setActiveTab] = useState<"model" | "repo" | "settings">("model");

  const hierSelection: HierarchicalSelection = (() => {
    const p = providerFromModel(activeModel.id);
    const m = p.models.find((x) => x.id === activeModel.id) ?? p.models[0];
    return {
      provider: p.id,
      providerLabel: p.label,
      model: m?.id ?? activeModel.id,
      modelLabel: m?.label ?? activeModel.label,
      agent: "auto",
      agentName: "Auto",
    };
  })();

  return (
    <div className="fixed inset-0 z-[70] bg-black/60" onClick={onClose}>
      <aside
        className="absolute right-0 top-0 h-full w-[min(92vw,400px)] overflow-y-auto border-l border-border bg-surface p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <p className="text-lg font-semibold">Customize</p>
            <p className="mt-1 text-xs text-muted">Tune your Jyinx workspace</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-gold"
          >
            Done
          </button>
        </header>

        <div className="flex gap-1.5 border-b border-border py-3">
          {(["model", "repo", "settings"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs capitalize ${
                activeTab === tab
                  ? "bg-gold/15 text-gold border border-gold/30"
                  : "text-muted border border-transparent hover:bg-surface"
              }`}
            >
              {tab === "model" ? "Model" : tab === "repo" ? "Repository" : "Settings"}
            </button>
          ))}
        </div>

        <div className="py-4 space-y-4">
          {activeTab === "model" && (
            <>
              <section className="border-l-2 border-l-purple-soft/50 pl-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">Model controller</p>
                <HierarchicalModelSelector
                  value={hierSelection}
                  onChange={(sel) => onModelChange(sel.model)}
                  components={{ optionMeta: (entry) => `${entry.contextWindow.toLocaleString()} ctx` }}
                />
                <p className="mt-1.5 text-[10px] text-muted">{activeModel.contextWindow.toLocaleString()} token context</p>
              </section>

              <section className="border-l-2 border-l-success/50 pl-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">Connection</p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted">Status</span>
                  <span className={`text-[11px] flex items-center gap-1 ${
                    queue.status === "ONLINE" ? "text-success" : "text-gold"}`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                      queue.status === "ONLINE" ? "bg-success" : "bg-gold"}`} />
                    {queue.status === "ONLINE" ? "Synced" : "Local only"}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[11px] text-muted">Queued items</span>
                  <span className="text-[11px] font-mono">{queue.pendingItems}</span>
                </div>
              </section>

              <section className="border-l-2 border-l-gold/40 pl-3 py-2">
                <p className="text-[10px] font-medium text-gold/80 mb-1.5">Autonomous mode</p>
                <p className="text-[10px] text-muted/80 mb-2">Let Jyinx execute tasks autonomously without manual approval for each step.</p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted">Enabled</span>
                  <button
                    type="button"
                    onClick={onAutonomousToggle}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                      autonomousEnabled ? "bg-success" : "bg-muted/30"}`}
                    role="switch"
                    aria-checked={autonomousEnabled}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      autonomousEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                </div>
              </section>

              <button
                type="button"
                onClick={onCostClick}
                className="w-full border-l-2 border-l-border/40 pl-3 py-2 text-left hover:border-l-gold/50 transition-colors"
              >
                <p className="text-[11px] font-semibold">Cost & API keys</p>
                <p className="text-[9px] text-muted mt-0.5">View credit balance and manage provider keys</p>
              </button>
            </>
          )}

          {activeTab === "repo" && (
            <section className="border-l-2 border-l-border/40 pl-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">Connected repositories</p>
              <JyinxGitHubRepos
                selectedRepositoryId={selectedRepository?.id}
                onSelectRepository={(repo) => onSelectRepository(repo)}
              />
              {selectedRepository && (
                <div className="mt-3 border-l-2 border-l-gold/30 pl-2 py-1">
                  <p className="text-xs font-medium">{selectedRepository.fullName}</p>
                  <p className="text-[9px] text-muted mt-0.5">{selectedRepository.defaultBranch} branch</p>
                </div>
              )}
            </section>
          )}

          {activeTab === "settings" && (
            <section className="space-y-3">
              <div className="border-l-2 border-l-border/40 pl-3 py-2">
                <GitHubSetup />
              </div>

              <div className="border-l-2 border-l-border/40 pl-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">Quick actions</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => window.location.href = "/jyinx/search"}
                    className="rounded-md border border-border/40 px-2.5 py-1.5 text-[10px] text-muted hover:border-gold/40 hover:text-gold transition-colors"
                  >
                    🔎 Code search
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.href = "/jyinx/code-library"}
                    className="rounded-md border border-border/40 px-2.5 py-1.5 text-[10px] text-muted hover:border-gold/40 hover:text-gold transition-colors"
                  >
                    📦 Code library
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.href = "/jyinx/peer-chat"}
                    className="rounded-md border border-border/40 px-2.5 py-1.5 text-[10px] text-muted hover:border-gold/40 hover:text-gold transition-colors"
                  >
                    👥 Peer chat
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.href = "/jyinx/marketplace"}
                    className="rounded-md border border-border/40 px-2.5 py-1.5 text-[10px] text-muted hover:border-gold/40 hover:text-gold transition-colors"
                  >
                    🏪 Marketplace
                  </button>
                </div>
              </div>
              <div className="border-l-2 border-l-gold/40 pl-3 py-2">
                <p className="text-[10px] font-medium text-gold/80 mb-1">Deploy flow</p>
                <p className="text-[9px] text-muted/80 leading-relaxed">
                  Merge the Jyinx pull request and your GitHub-connected Vercel project deploys it automatically.
                </p>
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
