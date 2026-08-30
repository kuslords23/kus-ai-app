"use client";

import { useState, useEffect, useCallback } from "react";
import type { JyinxRepository } from "@/components/jyinx/JyinxGitHubRepos";
import { JyinxGitHubRepos } from "@/components/jyinx/JyinxGitHubRepos";
import type { JyinxModel } from "@/lib/jyinx/model-registry";
import { HierarchicalModelSelector } from "@/components/models/HierarchicalModelSelector";
import { providerFromModel, type HierarchicalSelection } from "@/lib/models/catalog";
import { persistGitHubToken } from "@/lib/jyinx/github-connect";

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
  const [patInput, setPatInput] = useState("");
  const [patStatus, setPatStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [patMessage, setPatMessage] = useState("");
  const [patShort, setPatShort] = useState<string | null>(null);
  const [githubLogin, setGithubLogin] = useState<string | null>(null);

  // Load existing token status on mount
  useEffect(() => {
    if (!open) return;
    const check = async () => {
      try {
        const local = localStorage.getItem("kus-ai-github-token");
        if (local) {
          setPatShort(local.slice(0, 8) + "...");
          // Verify the stored token
          const res = await fetch("/api/github/commit", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${local}` },
            body: JSON.stringify({ action: "scope" }),
            cache: "no-store",
          });
          const data = (await res.json().catch(() => ({}))) as { ok?: boolean; login?: string; scopes?: string[]; error?: string };
          if (data.ok) {
            setGithubLogin(data.login ?? null);
            setPatStatus("saved");
            const hasRepoScope = data.scopes?.includes("repo") || data.scopes?.includes("fine-grained-pat");
            setPatMessage(hasRepoScope ? "Connected with repo write access" : `Connected as ${data.login ?? ""} (scopes: ${(data.scopes ?? []).join(", ") || "none"})`);
          } else {
            setPatStatus("error");
            setPatMessage(data.error ?? "Token invalid or expired");
          }
        }
      } catch {
        // ignore
      }
    };
    void check();
  }, [open]);

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
              <section className="rounded-2xl border border-border bg-background/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted mb-3">Model controller</p>
                <HierarchicalModelSelector
                  value={hierSelection}
                  onChange={(sel) => onModelChange(sel.model)}
                  components={{ optionMeta: (entry) => `${entry.contextWindow.toLocaleString()} ctx` }}
                />
                <p className="mt-2 text-[11px] text-muted">{activeModel.contextWindow.toLocaleString()} token context</p>
              </section>

              <section className="rounded-2xl border border-border bg-background/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted mb-3">Connection</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Status</span>
                  <span className={`text-xs flex items-center gap-1 ${
                    queue.status === "ONLINE" ? "text-success" : "text-gold"}`}>
                    <span className={`inline-block h-2 w-2 rounded-full ${
                      queue.status === "ONLINE" ? "bg-success" : "bg-gold"}`} />
                    {queue.status === "ONLINE" ? "Synced" : "Local only"}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted">Queued items</span>
                  <span className="text-xs font-mono">{queue.pendingItems}</span>
                </div>
              </section>

              <section className="rounded-2xl border border-gold/25 bg-gold/5 p-4">
                <p className="text-xs font-medium text-gold mb-2">Autonomous mode</p>
                <p className="text-[11px] text-muted mb-3">Let Jyinx execute tasks autonomously without manual approval for each step.</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Enabled</span>
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
                className="w-full rounded-xl border border-border bg-background/50 p-3 text-left hover:bg-surface"
              >
                <p className="text-xs font-semibold">Cost & API keys</p>
                <p className="text-[10px] text-muted mt-0.5">View credit balance and manage provider keys</p>
              </button>
            </>
          )}

          {activeTab === "repo" && (
            <section className="rounded-2xl border border-border bg-background/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted mb-3">Connected repositories</p>
              <JyinxGitHubRepos
                redirectPath="/jyinx"
                selectedRepositoryId={selectedRepository?.id}
                onSelectRepository={(repo) => onSelectRepository(repo)}
              />
              {selectedRepository && (
                <div className="mt-4 rounded-xl border border-border bg-background/40 p-3">
                  <p className="text-xs font-medium">{selectedRepository.fullName}</p>
                  <p className="text-[10px] text-muted mt-0.5">{selectedRepository.defaultBranch} branch</p>
                </div>
              )}
            </section>
          )}

          {activeTab === "settings" && (
            <section className="space-y-3">
              {/* ── GitHub Personal Access Token ── */}
              <div className="rounded-2xl border border-border bg-background/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted mb-2">GitHub key</p>
                <p className="text-[10px] text-muted mb-3 leading-relaxed">
                  Enter a classic or fine-grained PAT with <strong>repo</strong> scope so Jyinx can commit code to your repositories.
                  {patShort && <span className="block mt-1 text-gold">Active token: {patShort}</span>}
                  {githubLogin && <span className="block mt-0.5 text-success">Logged in as {githubLogin}</span>}
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={patInput}
                    onChange={(e) => setPatInput(e.target.value)}
                    placeholder="github_pat_11AA..."
                    className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-gold/50"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const token = patInput.trim();
                      if (!token) return;
                      setPatStatus("saving");
                      setPatMessage("");
                      try {
                        // Save to localStorage FIRST (this is the fast path)
                        localStorage.setItem("kus-ai-github-token", token);
                        // Also persist via the API for Supabase DB backup
                        await persistGitHubToken(token).catch(() => {});
                        setPatShort(token.slice(0, 8) + "...");
                        // Verify the token against GitHub
                        const res = await fetch("/api/github/commit", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ action: "scope" }),
                          cache: "no-store",
                        });
                        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; login?: string; scopes?: string[]; error?: string };
                        if (data.ok) {
                          setGithubLogin(data.login ?? null);
                          const hasRepoScope = data.scopes?.includes("repo") || data.scopes?.includes("fine-grained-pat");
                          setPatStatus("saved");
                          setPatMessage(hasRepoScope ? "Connected with repo write access" : `Connected as ${data.login ?? ""} (scopes: ${(data.scopes ?? []).join(", ") || "none"})`);
                          setPatInput("");
                        } else {
                          setPatStatus("error");
                          setPatMessage(data.error ?? "Token invalid or expired");
                        }
                      } catch (cause) {
                        setPatStatus("error");
                        setPatMessage(cause instanceof Error ? cause.message : "Failed to save token");
                      }
                    }}
                    disabled={patStatus === "saving" || !patInput.trim()}
                    className="shrink-0 rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-background hover:bg-gold/90 disabled:opacity-50 transition-colors"
                  >
                    {patStatus === "saving" ? "Saving…" : "Save"}
                  </button>
                </div>
                {patMessage && (
                  <p className={"mt-2 text-[10px] " + (patStatus === "error" ? "text-danger" : "text-success")}>{patMessage}</p>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-background/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted mb-3">Quick actions</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => window.location.href = "/jyinx/search"}
                    className="rounded-lg border border-border px-3 py-2 text-xs text-muted hover:border-gold/40 hover:text-gold"
                  >
                    🔎 Code search
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.href = "/jyinx/code-library"}
                    className="rounded-lg border border-border px-3 py-2 text-xs text-muted hover:border-gold/40 hover:text-gold"
                  >
                    📦 Code library
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.href = "/jyinx/peer-chat"}
                    className="rounded-lg border border-border px-3 py-2 text-xs text-muted hover:border-gold/40 hover:text-gold"
                  >
                    👥 Peer chat
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.href = "/jyinx/marketplace"}
                    className="rounded-lg border border-border px-3 py-2 text-xs text-muted hover:border-gold/40 hover:text-gold"
                  >
                    🏪 Marketplace
                  </button>
                </div>
              </div>
              <div className="rounded-2xl border border-gold/25 bg-gold/5 p-4">
                <p className="text-xs font-medium text-gold mb-2">Deploy flow</p>
                <p className="text-[10px] text-muted leading-relaxed">
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
