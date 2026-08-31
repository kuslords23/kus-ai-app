"use client";

/**
 * Jyinx Terminal Panel — VS Code-style bottom-docked terminal with tabs.
 *
 * Features:
 *  - Bottom-docked with resizable height
 *  - Minimize/maximize/close controls
 *  - Terminal, Output, Problems tabs
 *  - Command input with $ prompt
 */
import { useCallback, useRef, useState } from "react";

type Props = { repository?: string; file?: string; onClose?: () => void };

type Tab = "terminal" | "output" | "problems";

export type DiagnosticItem = {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "info";
  message: string;
  code?: string;
};

const MIN_HEIGHT = 80;
const MAX_HEIGHT = 400;
const DEFAULT_HEIGHT = 160;

export function JyinxTerminalPanel({ repository, file, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("terminal");
  const [command, setCommand] = useState("");
  const [logs, setLogs] = useState<string[]>(["Jyinx terminal ready.", "Type a command (e.g. build, test, npm run) and press Enter."]);
  const [running, setRunning] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [visible, setVisible] = useState(true);
  const [maximized, setMaximized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const runCommand = useCallback(async () => {
    const value = command.trim();
    if (!value || running) return;
    setCommand("");
    setRunning(true);
    const inputLine = `$ ${value}`;
    setLogs((current) => [...current, inputLine]);

    const action = value === "build" || value.startsWith("npm run build") || value.startsWith("build")
      ? "build"
      : value === "test" || value.startsWith("npm test") || value.startsWith("test")
        ? "test"
        : "run";

    try {
      const response = await fetch("/api/jyinx/workspace-exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, command: value, repository, file }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        stdout?: string; stderr?: string; exitCode?: number;
        diagnostics?: DiagnosticItem[]; error?: string;
      };
      if (response.ok) {
        const stdout = data.stdout?.trim();
        const stderr = data.stderr?.trim();
        if (stdout) { setLogs((c) => [...c, ...stdout.split("\n")]); setOutputLines((c) => [...c, ...stdout.split("\n")]); }
        if (stderr) { setLogs((c) => [...c, ...stderr.split("\n")]); setOutputLines((c) => [...c, ...stderr.split("\n")]); }
        if (data.diagnostics?.length) setDiagnostics((c) => [...c, ...(data.diagnostics as DiagnosticItem[])]);
        setLogs((c) => [...c, `Process exited with code ${data.exitCode ?? 0}`]);
      } else {
        setLogs((c) => [...c, data.error || "Command failed."]);
      }
    } catch {
      setLogs((c) => [...c, "Terminal backend unavailable."]);
    } finally {
      setRunning(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
    }
  }, [command, running, repository, file]);

  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.filter((d) => d.severity === "warning").length;

  const currentHeight = maximized ? MAX_HEIGHT : height;

  // Resize handlers
  const onResizeStart = (e: React.MouseEvent) => {
    resizeRef.current = { startY: e.clientY, startHeight: height };
    document.addEventListener("mousemove", onResizeMove);
    document.addEventListener("mouseup", onResizeEnd);
    e.preventDefault();
  };
  const onResizeMove = (e: MouseEvent) => {
    if (!resizeRef.current) return;
    const delta = resizeRef.current.startY - e.clientY;
    const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, resizeRef.current.startHeight - delta));
    setHeight(newHeight);
    if (maximized) setMaximized(false);
  };
  const onResizeEnd = () => {
    resizeRef.current = null;
    document.removeEventListener("mousemove", onResizeMove);
    document.removeEventListener("mouseup", onResizeEnd);
  };

  if (!visible) {
    return (
<div className="flex shrink-0 items-center justify-center border-t border-border" style={{ backgroundColor: "var(--terminal-bg)" }}>
          <button
            type="button"
            onClick={() => setVisible(true)}
            className="flex w-full items-center justify-center gap-2 py-1 text-[10px] text-muted hover:text-gold transition-colors"
          >
            <span>▴</span> Terminal
          </button>
        </div>
    );
  }

  return (
    <section className="relative flex shrink-0 flex-col border-t border-border font-mono text-xs" style={{ height: currentHeight, backgroundColor: "var(--terminal-bg)", color: "var(--terminal-text)" }}>
      {/* Resize handle */}
      <div
        className="absolute -top-1 left-0 right-0 z-10 h-2 cursor-n-resize hover:bg-gold/30 transition-colors"
        onMouseDown={onResizeStart}
      />

      {/* Tab header with controls */}
      <header className="flex shrink-0 items-center justify-between border-b border-border/40 px-2 py-1">
        <div className="flex items-center gap-1">
          {(["terminal", "output", "problems"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-md px-2 py-0.5 text-[9px] uppercase tracking-wider transition-colors ${
                tab === t ? "bg-gold/15 text-gold" : "text-muted hover:text-foreground"
              }`}
            >
              {t}
              {t === "problems" && (errorCount > 0 || warningCount > 0) && (
                <span className="ml-1 text-danger">({errorCount + warningCount})</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted/60">{repository || "local"}</span>
          <button
            type="button"
            onClick={() => setMaximized(!maximized)}
            className="rounded px-1.5 py-0.5 text-[9px] text-muted hover:text-foreground transition-colors"
            title={maximized ? "Restore" : "Maximize"}
          >
            {maximized ? "▾" : "▴"}
          </button>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="rounded px-1.5 py-0.5 text-[9px] text-muted hover:text-foreground transition-colors"
            title="Minimize"
          >
            ✕
          </button>
        </div>
      </header>

      {/* Tab content */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {tab === "terminal" && (
          <div className="space-y-0.5" style={{ color: "var(--terminal-text)" }}>
            {logs.slice(-60).map((log, i) => (
              <p key={`${i}-${log.slice(0, 20)}`} className="whitespace-pre-wrap break-all text-[11px] leading-relaxed">
                {log.startsWith("$ ") ? <span><span style={{ color: "var(--terminal-prompt)" }}>$</span> <span style={{ opacity: 0.9 }}>{log.slice(2)}</span></span> : <span style={{ opacity: 0.8 }}>{log}</span>}
              </p>
            ))}
            {running && <p className="text-gold animate-pulse">Running…</p>}
          </div>
        )}
        {tab === "output" && (
          <div className="space-y-0.5" style={{ color: "var(--terminal-text)" }}>
            {outputLines.length === 0 && <p className="text-muted italic text-[11px]">No output yet.</p>}
            {outputLines.slice(-60).map((line, i) => (
              <p key={`out-${i}`} className="whitespace-pre-wrap break-all text-[11px] leading-relaxed" style={{ opacity: 0.8 }}>{line}</p>
            ))}
          </div>
        )}
        {tab === "problems" && (
          <div className="space-y-1">
            {diagnostics.length === 0 && <p className="text-muted italic text-[11px]">No problems detected.</p>}
            {diagnostics.map((d, i) => (
              <div key={`diag-${i}`} className={`border-l-2 pl-2 py-1 ${
                d.severity === "error" ? "border-l-red-400" : d.severity === "warning" ? "border-l-yellow-400" : "border-l-blue-400"
              }`}>
                <p className="text-[10px] font-medium">{d.file}:{d.line}:{d.column}{d.code ? ` [${d.code}]` : ""}</p>
                <p className="text-[10px] text-muted">{d.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Command input */}
      <div className="flex shrink-0 items-center gap-2 border-t border-border/40 px-3 py-1.5">
        <span style={{ color: "var(--terminal-prompt)" }}>$</span>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void runCommand(); }}
          placeholder="build, test, npm run dev…"
          className="min-w-0 flex-1 bg-transparent text-[11px] text-foreground outline-none"
        />
        <button
          type="button"
          onClick={() => void runCommand()}
          disabled={!command.trim() || running}
          className="rounded-md bg-gold/80 px-2 py-1 text-[10px] font-semibold text-background hover:bg-gold disabled:opacity-50 transition-colors"
        >
          {running ? "…" : "Run"}
        </button>
      </div>
    </section>
  );
}