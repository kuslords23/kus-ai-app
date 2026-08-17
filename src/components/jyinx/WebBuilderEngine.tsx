"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useJyinxModelStore } from "@/lib/jyinx/model-store";
import { generateWebApp, WEB_STACKS, WEB_STACK_LABELS, type WebStack } from "@/lib/jyinx/web-app-generator";
import { PreviewLayout } from "@/components/jyinx/PreviewLayout";
import { HeaderMenu } from "@/components/jyinx/HeaderMenu";

type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * WebBuilderEngine — agentic web/blog generation with a live-DOM feedback loop.
 *
 * - Prompt → local generative engine scaffolds a runnable HTML app (React /
 *   Vite / HTML / Blog) and injects it into the adjacent preview canvas
 *   immediately (desktop or mobile viewport).
 * - A chat agent loop lets the user iterate ("make the hero purple", "add a
 *   form") and streams updated HTML / instructions back into the canvas in
 *   real time, so code generation updates the visual DOM instantly.
 */
export function WebBuilderEngine() {
  const { activeModel } = useJyinxModelStore();
  const [stack, setStack] = useState<WebStack>("react");
  const [title, setTitle] = useState("My Jyinx App");
  const [prompt, setPrompt] = useState("Build a landing page for a meetup app: hero, event list, signup form.");
  const [generatedHtml, setGeneratedHtml] = useState<string>("");
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [publishUrl, setPublishUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const regenerateRef = useRef<(html: string) => void>(() => undefined);

  // Generative engine: scaffold from prompt + stack.
  const scaffold = useCallback((nextStack: WebStack, nextPrompt: string, nextTitle: string) => {
    const project = generateWebApp(nextStack, nextPrompt, nextTitle);
    setGeneratedHtml(project.html);
    return project.html;
  }, []);

  // Async agent "design" call — route through the Jyinx chat agent so the model
  // can produce richer HTML / code; falls back to the local engine on failure.
  const agentGenerate = useCallback(async (input: string, stackOverride?: WebStack): Promise<string> => {
    const useStack = stackOverride ?? stack;
    try {
      const response = await fetch("/api/jyinx/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: input, model: activeModel.id }),
      });
      const data = (await response.json()) as { content?: string; error?: string };
      if (!response.ok || !data.content) throw new Error(data.error || "Agent unavailable");
      const content = data.content;
      // If the agent returns a full document, inject it directly; else wrap.
      if (/<html[\s>]/i.test(content) || /<!doctype/i.test(content)) return content;
      const wrapper = generateWebApp(useStack, content, title);
      return wrapper.html;
    } catch {
      return scaffold(useStack, input, title);
    }
  }, [activeModel.id, scaffold, stack, title]);

  // Live-DOM feedback loop: any generated/applied HTML updates the canvas.
  useEffect(() => {
    regenerateRef.current = (html: string) => {
      setGeneratedHtml(html);
      setMessages((current) => [...current, { role: "assistant", content: "Updated the preview with your changes." }]);
    };
  }, []);

  // Initial scaffold on mount and when stack/prompt/title change.
  useEffect(() => {
    setGeneratedHtml(scaffold(stack, prompt, title));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stack]);

  const previewHtml = useMemo(() => (generatedHtml.trim() ? generatedHtml : scaffold(stack, prompt, title)), [generatedHtml, scaffold, stack, prompt, title]);

  const handleScaffoldClick = useCallback(() => {
    setGeneratedHtml(scaffold(stack, prompt, title));
    regenerateRef.current(scaffold(stack, prompt, title));
  }, [scaffold, stack, prompt, title]);

  const handleStackChange = useCallback((next: WebStack) => {
    setStack(next);
    setGeneratedHtml(scaffold(next, prompt, title));
  }, [prompt, scaffold, title]);

  const sendAgentMessage = async () => {
    const text = agentInput.trim();
    if (!text || agentBusy) return;
    setAgentInput("");
    setAgentBusy(true);
    const nextMessages: ChatTurn[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setNotice(null);
    try {
      const html = await agentGenerate(text);
      setGeneratedHtml(html);
      setMessages((current) => [...current, { role: "assistant", content: "Preview updated live based on your request." }]);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Agent request failed.");
    } finally {
      setAgentBusy(false);
    }
  };

  const publish = async () => {
    setNotice(null);
    try {
      const response = await fetch("/api/hosting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: title.trim() || "Jyinx App", html: previewHtml, stack }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || "Unable to publish.");
      setPublishUrl(data.url);
      setNotice(`Published — ${data.url}`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Unable to publish the site.");
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <Link href="/jyinx" className="shrink-0 rounded-lg border border-gold/30 bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold">← Jyinx</Link>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Web Builder Engine</p>
          <p className="truncate text-[10px] text-muted">AI scaffold → live DOM preview</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {publishUrl && <a href={publishUrl} target="_blank" rel="noreferrer" className="hidden text-[11px] text-success underline md:block">{publishUrl}</a>}
          <button type="button" onClick={() => void publish()} className="rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-medium text-success">Publish ↗</button>
          <HeaderMenu active={{ autonomous: false }} onAction={(action) => { if (action === "back") window.location.href = "/jyinx"; }} />
        </div>
      </header>

      {notice && <div className="shrink-0 border-b border-gold/25 bg-gold/5 px-4 py-2 text-xs text-gold">{notice}</div>}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Left: controls + agent chat */}
        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto border-r border-border p-4 lg:max-w-md">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Scaffold</div>
          <label className="mt-2 block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Prompt</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-gold" />
          </label>

          <div className="mt-3">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Stack</span>
            <div className="flex flex-wrap gap-1.5">
              {WEB_STACKS.map((item) => (
                <button key={item} type="button" onClick={() => handleStackChange(item)} className={`rounded-lg border px-2.5 py-1 text-[11px] ${stack === item ? "border-gold/50 bg-gold/15 text-gold" : "border-border text-muted hover:text-foreground"}`}>{WEB_STACK_LABELS[item]}</button>
              ))}
            </div>
          </div>

          <label className="mt-3 block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-gold" />
          </label>

          <button type="button" onClick={handleScaffoldClick} className="mt-3 rounded-xl bg-gold px-3 py-2 text-sm font-semibold text-background">Generate in preview</button>

          {/* Agent feedback loop */}
          <div className="mt-5">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">AI agent loop</div>
            <div className="mt-2 flex min-h-32 flex-col gap-2 rounded-xl border border-border bg-surface/40 p-2">
              {messages.length === 0 ? (
                <p className="p-2 text-xs text-muted">Ask the agent to design or adjust the app — changes reflect live in the preview.</p>
              ) : (
                messages.map((msg, index) => (
                  <div key={index} className={`max-w-[90%] rounded-xl px-3 py-1.5 text-xs ${msg.role === "user" ? "self-end bg-gold/15 text-gold" : "self-start border border-border bg-background/60 text-foreground"}`}>{msg.content}</div>
                ))
              )}
              {agentBusy && <p className="p-1 text-[11px] text-muted">Agent designing…</p>}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input value={agentInput} onChange={(event) => setAgentInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void sendAgentMessage(); }} placeholder="e.g. add a purple hero and a signup form" className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-gold" />
              <button type="button" onClick={() => void sendAgentMessage()} disabled={agentBusy || !agentInput.trim()} className="shrink-0 rounded-xl bg-purple px-3 py-2 text-xs font-semibold text-background disabled:opacity-50">Send</button>
            </div>
          </div>
        </section>

        {/* Right: live preview with desktop/mobile switcher */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-border px-4 py-2 text-xs text-muted">
            <span className="font-medium text-foreground">Live preview</span> — edit/prompt updates the DOM instantly
            <span className="ml-2 text-muted">· {activeModel.label}</span>
          </div>
          <div className="min-h-0 flex-1">
            <PreviewLayout src={undefined} html={previewHtml} title="Web builder preview" defaultOpen />
          </div>
        </div>
      </div>
    </div>
  );
}