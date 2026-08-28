"use client";

/**
 * BuilderPanel — a "What do you want to build?" menu that appears in the
 * Jyinx IDE right panel. Users pick Web App, Blog, 3D Game, or HTML/CSS/JS.
 * After generation, a "Preview" button opens the dedicated preview page.
 */
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { WEB_STACK_LABELS, type WebStack } from "@/lib/jyinx/web-app-generator";
import { generateWebApp } from "@/lib/jyinx/web-app-generator";

interface BuilderPanelProps {
  onClose: () => void;
}

type BuilderStep = "choose" | "configure" | "preview";

const BUILD_OPTIONS: Array<{ stack: WebStack; icon: string; description: string; color: string }> = [
  { stack: "react", icon: "⚛️", description: "React app with live components", color: "border-blue-500/30 bg-blue-500/10" },
  { stack: "vite", icon: "⚡", description: "Vite-style ES module app", color: "border-yellow-500/30 bg-yellow-500/10" },
  { stack: "html", icon: "🌐", description: "HTML / CSS / JS page", color: "border-emerald-500/30 bg-emerald-500/10" },
  { stack: "blog", icon: "📝", description: "Blog post with markdown", color: "border-purple-500/30 bg-purple-500/10" },
  { stack: "3d", icon: "🎮", description: "3D game / scene (Three.js)", color: "border-cyan-500/30 bg-cyan-500/10" },
];

export function BuilderPanel({ onClose }: BuilderPanelProps) {
  const router = useRouter();
  const [step, setStep] = useState<BuilderStep>("choose");
  const [selectedStack, setSelectedStack] = useState<WebStack>("react");
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("My Jyinx App");
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = useCallback(() => {
    setGenerating(true);
    try {
      const project = generateWebApp(selectedStack, prompt || `Build a ${WEB_STACK_LABELS[selectedStack]}`, title);
      setGeneratedHtml(project.html);
      // Store in sessionStorage for the preview page
      try {
        sessionStorage.setItem("jyinx_preview_html", project.html);
        sessionStorage.setItem("jyinx_preview_title", title);
        sessionStorage.setItem("jyinx_preview_stack", selectedStack);
      } catch {
        /* ignore */
      }
      setStep("preview");
    } catch (cause) {
      console.error("Generation failed:", cause);
    } finally {
      setGenerating(false);
    }
  }, [selectedStack, prompt, title]);

  const openPreview = useCallback(() => {
    router.push("/jyinx/preview");
  }, [router]);

  if (step === "choose") {
    return (
      <section className="flex h-full min-h-0 flex-col bg-surface">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">What do you want to build?</p>
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-gold">Close</button>
        </header>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {BUILD_OPTIONS.map((opt) => (
            <button
              key={opt.stack}
              type="button"
              onClick={() => { setSelectedStack(opt.stack); setStep("configure"); }}
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
        </div>
      </section>
    );
  }

  if (step === "configure") {
    return (
      <section className="flex h-full min-h-0 flex-col bg-surface">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Configure</p>
            <p className="text-[11px] text-gold">{WEB_STACK_LABELS[selectedStack]}</p>
          </div>
          <button type="button" onClick={() => setStep("choose")} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-gold">← Back</button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My App" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-gold" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Prompt / Description</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`Describe what you want to build...`}
              rows={4}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-gold resize-none"
            />
          </label>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="w-full rounded-xl bg-gold px-4 py-2.5 text-sm font-semibold text-background hover:bg-gold/90 disabled:opacity-50 transition-colors"
          >
            {generating ? "Generating…" : `Generate ${WEB_STACK_LABELS[selectedStack]}`}
          </button>
        </div>
      </section>
    );
  }

  // Preview step
  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Built! 🎉</p>
          <p className="text-[11px] text-gold">{title} · {WEB_STACK_LABELS[selectedStack]}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-gold">Close</button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-center">
          <p className="text-2xl mb-2">✅</p>
          <p className="text-sm font-medium text-success">Your {WEB_STACK_LABELS[selectedStack].toLowerCase()} is ready!</p>
          <p className="mt-1 text-xs text-muted">{(generatedHtml?.length ?? 0 / 1024).toFixed(0)} KB generated</p>
        </div>

        <button
          type="button"
          onClick={openPreview}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3 text-sm font-semibold text-background hover:bg-gold/90 transition-colors"
        >
          <span>👁</span> Open Preview
        </button>

        <button
          type="button"
          onClick={() => { setStep("choose"); setGeneratedHtml(null); }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs text-muted hover:text-foreground transition-colors"
        >
          Build Something Else
        </button>
      </div>
    </section>
  );
}