"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { WEB_STACK_LABELS, type WebStack } from "@/lib/jyinx/web-app-generator";
import { generateWebApp } from "@/lib/jyinx/web-app-generator";
import { createClient } from "@/lib/supabase/client";
import { getGitHubToken } from "@/lib/jyinx/github-connect";

type CreateStep = "details" | "builder" | "agent" | "preview";

const LANGUAGES = ["typescript", "javascript", "python", "rust", "go"];

const BUILD_OPTIONS: Array<{ stack: WebStack; icon: string; description: string; color: string }> = [
  { stack: "react", icon: "⚛️", description: "React app with live components", color: "border-blue-500/30 bg-blue-500/10" },
  { stack: "vite", icon: "⚡", description: "Vite-style ES module app", color: "border-yellow-500/30 bg-yellow-500/10" },
  { stack: "html", icon: "🌐", description: "HTML / CSS / JS page", color: "border-emerald-500/30 bg-emerald-500/10" },
  { stack: "blog", icon: "📝", description: "Blog post with markdown", color: "border-purple-500/30 bg-purple-500/10" },
  { stack: "3d", icon: "🎮", description: "3D game / scene (Three.js)", color: "border-cyan-500/30 bg-cyan-500/10" },
];

interface CreateProjectFlowProps {
  open: boolean;
  onClose: () => void;
  onLaunchAgent?: (prompt: string) => void;
}

export function CreateProjectFlow({ open, onClose, onLaunchAgent }: CreateProjectFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<CreateStep>("details");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("typescript");
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedStack, setSelectedStack] = useState<WebStack>("react");
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("My Jyinx App");
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdRepo, setCreatedRepo] = useState<{ fullName: string; name: string; defaultBranch: string; url?: string; language?: string; commitUrl?: string } | null>(null);

  if (!open) return null;

  // ── Step 1: Project Details ──
  if (step === "details") {
    return (
      <section className="flex h-full min-h-0 flex-col bg-surface">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Create Project</p>
            <p className="text-[11px] text-muted">Set up a new GitHub repository</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-gold">Close</button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Project name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-project" autoFocus className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Language template</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm capitalize outline-none focus:border-gold">
              {LANGUAGES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span className="text-xs text-muted">Private repository</span>
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
          </label>
          {createError && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{createError}</p>}
          <div className="flex items-center justify-between gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={creating} className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground disabled:opacity-50">Cancel</button>
            <button
              type="button"
              onClick={async () => {
                const trimmed = name.trim();
                if (!trimmed) { setCreateError("Project name is required."); return; }
                if (trimmed.length > 100) { setCreateError("Project name is too long."); return; }
                setCreating(true);
                setCreateError(null);
                try {
                  let token: string | null = null;
                  try {
                    const { data } = await createClient().auth.getSession();
                    token = data.session?.provider_token ?? null;
                  } catch { /* fall through */ }
                  if (!token) token = await getGitHubToken();
                  if (!token) throw new Error("Connect GitHub before creating a project.");
                  const response = await fetch("/api/github/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ name: trimmed, language, private: isPrivate }),
                  });
                  const result = (await response.json()) as { repository?: { fullName: string; name: string; defaultBranch: string; url?: string; language?: string; commitUrl?: string }; error?: string };
                  if (!response.ok || !result.repository) throw new Error(result.error || "GitHub could not create the project.");
                  setCreatedRepo(result.repository);
                  setStep("builder");
                } catch (cause) {
                  setCreateError(cause instanceof Error ? cause.message : "Unable to create the project.");
                } finally { setCreating(false); }
              }}
              disabled={creating || !name.trim()}
              className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create Repository →"}
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ── Step 2: Builder Options ──
  if (step === "builder") {
    return (
      <section className="flex h-full min-h-0 flex-col bg-surface">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">What to build?</p>
            {createdRepo && <p className="text-[11px] text-gold truncate">Repository: {createdRepo.fullName}</p>}
          </div>
          <button type="button" onClick={() => setStep("details")} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-gold">← Back</button>
        </header>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted px-1">Choose a template</p>
          {BUILD_OPTIONS.map((opt) => (
            <button
              key={opt.stack}
              type="button"
              onClick={() => { setSelectedStack(opt.stack); setStep("agent"); }}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all hover:scale-[1.02] ${opt.color}`}
            >
              <span className="text-xl">{opt.icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{WEB_STACK_LABELS[opt.stack]}</p>
                <p className="text-[11px] text-muted">{opt.description}</p>
              </div>
              <span className="ml-auto text-muted">→</span>
            </button>
          ))}
          <div className="relative pt-2">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-surface px-2 text-muted">or</span></div>
          </div>
          <button
            type="button"
            onClick={() => {
              const promptText = `Build a ${WEB_STACK_LABELS[selectedStack]}${createdRepo ? ` in ${createdRepo.fullName}` : ""}. Describe what you want to build.`;
              onLaunchAgent?.(promptText);
              setStep("agent");
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/5 px-4 py-3 text-sm font-medium text-gold hover:bg-gold/10 transition-colors"
          >
            🤖 Build with Agent
          </button>
        </div>
      </section>
    );
  }

  // ── Step 3: Agent Chat (this is handled by the parent via onLaunchAgent) ──
  // The parent should show JyinxAgentChat in autonomous mode when this step is reached.
  // We render a placeholder directing to the chat.
  if (step === "agent") {
    return (
      <section className="flex h-full min-h-0 flex-col bg-surface">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Building in Agent</p>
            <p className="text-[11px] text-gold">{WEB_STACK_LABELS[selectedStack]} · {createdRepo?.fullName ?? name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-gold">Close</button>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
          <p className="text-4xl">🤖</p>
          <p className="text-sm font-medium text-foreground">Agent is building your project</p>
          <p className="text-xs text-muted max-w-xs">The autonomous agent is working on {WEB_STACK_LABELS[selectedStack]} in {createdRepo?.fullName ?? name}. You can track progress and chat with the agent in the chat panel.</p>
          <button
            type="button"
            onClick={() => {
              // Generate preview from the template
              setGenerating(true);
              try {
                const project = generateWebApp(selectedStack, prompt || `Build a ${WEB_STACK_LABELS[selectedStack]}`, title);
                setGeneratedHtml(project.html);
                try {
                  sessionStorage.setItem("jyinx_preview_html", project.html);
                  sessionStorage.setItem("jyinx_preview_title", title);
                  sessionStorage.setItem("jyinx_preview_stack", selectedStack);
                } catch { /* ignore */ }
              } catch { /* ignore */ }
              setGenerating(false);
              setStep("preview");
            }}
            className="rounded-xl bg-gold px-6 py-3 text-sm font-semibold text-background hover:bg-gold/90 transition-colors"
          >
            Preview Project
          </button>
        </div>
      </section>
    );
  }

  // ── Step 4: Preview with actions ──
  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Preview</p>
          <p className="text-[11px] text-gold">{title} · {WEB_STACK_LABELS[selectedStack]}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-gold">Close</button>
      </header>
      <div className="flex-1 flex flex-col min-h-0">
        {/* Preview iframe */}
        {generatedHtml ? (
          <iframe
            srcDoc={generatedHtml}
            title="Preview"
            className="flex-1 w-full border-0 bg-white"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <div>
              <p className="text-4xl mb-2">✅</p>
              <p className="text-sm font-medium text-success">Your {WEB_STACK_LABELS[selectedStack].toLowerCase()} is ready!</p>
              <p className="mt-1 text-xs text-muted">{(generatedHtml?.length ?? 0 / 1024).toFixed(0)} KB generated</p>
            </div>
          </div>
        )}
      </div>
      {/* Action buttons */}
      <div className="shrink-0 border-t border-border bg-background/60 px-4 py-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { setStep("agent"); }}
            className="rounded-xl border border-border px-4 py-2.5 text-xs font-medium text-muted hover:text-foreground hover:border-gold/40 transition-colors"
          >
            Keep Editing
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!generatedHtml) return;
              setPublishing(true);
              try {
                const res = await fetch("/api/marketplace", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "publish-app",
                    name: title,
                    description: `${WEB_STACK_LABELS[selectedStack]} — ${prompt || "Built with Jyinx"}`,
                    assetClass: "app",
                    priceCredits: 0,
                    tags: [selectedStack, "app", "jyinx"],
                    htmlContent: generatedHtml,
                    stack: selectedStack,
                  }),
                });
                const data = (await res.json()) as { listing?: { id?: string }; error?: string };
                if (!res.ok || !data.listing) throw new Error(data.error || "Publishing failed");
                setPublishNotice(`Published! ID: ${data.listing.id}`);
              } catch (cause) {
                setPublishNotice(cause instanceof Error ? cause.message : "Publishing failed");
              } finally { setPublishing(false); }
            }}
            disabled={publishing}
            className="rounded-xl bg-gold px-4 py-2.5 text-xs font-semibold text-background hover:bg-gold/90 disabled:opacity-50 transition-colors"
          >
            {publishing ? "Publishing…" : "Publish"}
          </button>
          <button
            type="button"
            onClick={() => { setStep("builder"); setGeneratedHtml(null); }}
            className="rounded-xl border border-border px-4 py-2.5 text-xs font-medium text-muted hover:text-foreground hover:border-gold/40 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (generatedHtml) {
                try {
                  localStorage.setItem("jyinx_saved_preview", generatedHtml);
                  setPublishNotice("Saved locally!");
                } catch { /* ignore */ }
              }
            }}
            className="rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-xs font-medium text-success hover:bg-success/20 transition-colors"
          >
            Save
          </button>
        </div>
        {publishNotice && (
          <p className="mt-2 rounded-lg border border-gold/25 bg-gold/5 px-3 py-2 text-xs text-gold text-center">{publishNotice}</p>
        )}
      </div>
    </section>
  );
}