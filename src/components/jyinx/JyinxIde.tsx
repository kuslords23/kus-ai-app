"use client";

import { useMemo, useState } from "react";
import { useJyinxModelStore } from "@/lib/jyinx/model-store";
import { generateWebApp, WebStack, WEB_STACKS, WEB_STACK_LABELS } from "@/lib/jyinx/web-app-generator";
import { PreviewLayout } from "@/components/jyinx/PreviewLayout";
import { HeaderMenu } from "@/components/jyinx/HeaderMenu";

type JyinxIdeProps = { onExit?: () => void };

/**
 * JyinxIde — the web-building workspace.
 *
 * A complete IDE-to-preview builder: scaffold a live web app (React, Vite,
 * HTML/CSS/JS, Blog) from a prompt, edit the generated source in an inline
 * editor, and inspect it in real time in the adjacent dual-pane `PreviewLayout`
 * with instant Desktop ↔ Mobile viewport switching.
 */
export function JyinxIde({ onExit }: JyinxIdeProps) {
  const { setMode, activeModel } = useJyinxModelStore();
  const [stack, setStack] = useState<WebStack>("react");
  const [prompt, setPrompt] = useState("Build a landing page for a meetup app with a hero, an event list, and a signup button.");
  const [title, setTitle] = useState("My Jyinx App");
  const [customHtml, setCustomHtml] = useState("");
  const [mode, setSourceMode] = useState<"auto" | "html">("auto");

  // Generate a runnable HTML doc for the selected stack (re-runs as inputs change).
  const generated = useMemo(
    () => generateWebApp(stack, prompt, title),
    [stack, prompt, title]
  );

  const previewHtml = useMemo(() => {
    if (mode === "html" && customHtml.trim()) return customHtml;
    return generated.html;
  }, [generated.html, mode, customHtml]);

  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const publish = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      const response = await fetch("/api/hosting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: title.trim() || "Jyinx App",
          html: previewHtml,
          stack,
        }),
      });
      const data = (await response.json()) as { url?: string; site?: { slug?: string }; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || "Unable to publish.");
      setPublishedUrl(data.url);
    } catch (cause) {
      setPublishError(cause instanceof Error ? cause.message : "Unable to publish.");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-background/90 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => { setMode("agent"); onExit?.(); }}
            className="shrink-0 rounded-lg border border-gold/30 bg-gold/10 px-2 py-1.5 text-xs font-medium text-gold"
          >
            ← Back
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Jyinx Builder</p>
            <p className="truncate text-[10px] text-muted">Design system · dual-pane preview</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[10px] uppercase tracking-wider text-muted sm:block">{activeModel.label}</span>
          <button
            type="button"
            onClick={() => void publish()}
            disabled={publishing}
            className="rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-medium text-success disabled:opacity-60"
          >
            {publishing ? "Publishing…" : publishedUrl ? "Republish" : "Publish ↗"}
          </button>
          <HeaderMenu
            active={{ autonomous: false }}
            onAction={(action) => {
              if (action === "back") { setMode("agent"); onExit?.(); }
            }}
          />
        </div>
      </header>

      {publishError && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-red-500/10 px-4 py-2 text-xs text-red-400">
          <span>Publish failed: {publishError}</span>
        </div>
      )}
      {publishedUrl && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-success/10 px-4 py-2 text-xs text-success">
          <span>Live: </span>
          <a href={publishedUrl} target="_blank" rel="noreferrer" className="underline">{publishedUrl}</a>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Left: config + editor */}
        <section className="flex min-w-0 flex-1 flex-col border-r border-border">
          {/* Builder config bar */}
          <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center">
            <label className="text-[10px] uppercase tracking-wider text-muted">Stack</label>
            <div className="flex flex-wrap gap-1">
              {WEB_STACKS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setStack(item)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] ${stack === item ? "border-gold/40 bg-gold/15 text-gold" : "border-border text-muted hover:text-foreground"}`}
                >
                  {WEB_STACK_LABELS[item]}
                </button>
              ))}
            </div>
            <div className="sm:ml-auto sm:flex sm:items-center sm:gap-2">
              <label className="text-[10px] uppercase tracking-wider text-muted">Title</label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-gold sm:w-44"
              />
            </div>
          </div>

          {/* Prompt line */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the app to build…"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-gold"
            />
          </div>

          {/* Source mode + editor */}
          <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-[11px]">
            <span className="text-muted">Source</span>
            <div className="flex overflow-hidden rounded-md border border-border">
              <button
                type="button"
                onClick={() => setSourceMode("auto")}
                className={`px-2 py-1 ${mode === "auto" ? "bg-gold text-background" : "text-muted"}`}
              >
                Generated
              </button>
              <button
                type="button"
                onClick={() => setSourceMode("html")}
                className={`px-2 py-1 ${mode === "html" ? "bg-gold text-background" : "text-muted"}`}
              >
                Custom HTML
              </button>
            </div>
            <span className="ml-auto text-muted">{generated.files["index.html"] ? "index.html" : "web-app.ssr"}</span>
          </div>

          <textarea
            value={mode === "html" ? customHtml : generated.html}
            onChange={(event) => setCustomHtml(event.target.value)}
            spellCheck={false}
            className="min-h-[220px] flex-1 resize-none bg-[#0d0917] p-4 font-mono text-[11px] leading-6 text-purple-soft outline-none"
          />
        </section>

        {/* Right: live preview with Desktop/Mobile switcher */}
        <div className="hidden w-[min(50%,760px)] shrink-0 md:block">
          <PreviewLayout src={undefined} html={previewHtml} title="Live preview" defaultOpen />
        </div>
      </div>
    </div>
  );
}