"use client";

/**
 * Jyinx Terminal Panel — with Problems, Output, and Terminal tabs.
 *
 * Connects to the workspace backend to run build, test, and system commands
 * in real time and surfaces diagnostics (compiler errors, lint warnings) in
 * a structured Problems tab.
 */
import { useCallback, useRef, useState } from "react";

type Props = { repository?: string; file?: string };

type Tab = "terminal" | "output" | "problems";

export type DiagnosticItem = {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "info";
  message: string;
  code?: string;
};

export function JyinxTerminalPanel({ repository, file }: Props) {
  const [tab, setTab] = useState<Tab>("terminal");
  const [command, setCommand] = useState("");
  const [logs, setLogs] = useState<string[]>(["Jyinx terminal ready.", "Type a command (e.g. build, test, npm run) and press Enter."]);
  const [running, setRunning] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const runCommand = useCallback(async () => {
    const value = command.trim();
    if (!value || running) return;
    setCommand("");
    setRunning(true);
    const inputLine = `$ ${value}`;
    setLogs((current) => [...current, inputLine]);

    // Map common IDE commands to actions
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
        stdout?: string;
        stderr?: string;
        exitCode?: number;
        diagnostics?: DiagnosticItem[];
        error?: string;
      };
      if (response.ok) {
        const stdout = data.stdout?.trim();
        const stderr = data.stderr?.trim();
        if (stdout) {
          setLogs((current) => [...current, ...stdout.split("\n")]);
          setOutputLines((current) => [...current, ...stdout.split("\n")]);
        }
        if (stderr) {
          setLogs((current) => [...current, ...stderr.split("\n")]);
          setOutputLines((current) => [...current, ...stderr.split("\n")]);
        }
        if (data.diagnostics?.length) {
          setDiagnostics((current) => [...current, ...(data.diagnostics as DiagnosticItem[])]);
        }
        setLogs((current) => [...current, `Process exited with code ${data.exitCode ?? 0}`]);
      } else {
        setLogs((current) => [...current, data.error || "Command failed."]);
      }
    } catch {
      setLogs((current) => [...current, "Terminal backend unavailable. Command kept local."]);
    } finally {
      setRunning(false);
      // Auto-scroll
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
    }
  }, [command, running, repository, file]);

  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.filter((d) => d.severity === "warning").length;

  return (
    <section className="flex min-h-36 flex-col border-t border-border bg-[#090711] font-mono text-xs">
      {/* Tab header with counts */}
      <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-1">
          {(["terminal", "output", "problems"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-md px-2 py-1 text-[10px] uppercase tracking-wider transition-colors ${
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
        <span className="text-[10px] text-muted">{repository || "local workspace"}</span>
      </header>

      {/* Tab content */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "terminal" && (
          <div className="space-y-1 text-purple-soft">
            {logs.slice(-60).map((log, index) => (
              <p key={`${index}-${log.slice(0, 20)}`} className="whitespace-pre-wrap break-all">
                {log}
              </p>
            ))}
            {running && <p className="text-gold animate-pulse">Running…</p>}
            {!running && logs.length <= 2 && (
              <p className="text-muted italic">Enter a command above to get started.</p>
            )}
          </div>
        )}

        {tab === "output" && (
          <div className="space-y-1 text-purple-soft">
            {outputLines.length === 0 && (
              <p className="text-muted italic">No output yet. Run a build or test command.</p>
            )}
            {outputLines.slice(-60).map((line, index) => (
              <p key={`out-${index}`} className="whitespace-pre-wrap break-all">{line}</p>
            ))}
          </div>
        )}

        {tab === "problems" && (
          <div className="space-y-1">
            {diagnostics.length === 0 && (
              <p className="text-muted italic">No problems detected. Run a build or type-check to scan.</p>
            )}
            {diagnostics.map((d, i) => (
              <div
                key={`diag-${i}`}
                className={`rounded-md border px-2 py-1.5 text-[11px] ${
                  d.severity === "error"
                    ? "border-red-500/30 bg-red-500/10 text-red-400"
                    : d.severity === "warning"
                      ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
                      : "border-blue-500/30 bg-blue-500/10 text-blue-400"
                }`}
              >
                <span className="font-medium">{d.file}:{d.line}:{d.column}</span>
                {d.code && <span className="ml-1 opacity-70">[{d.code}]</span>}
                <p className="mt-0.5">{d.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Command input */}
      <div className="flex shrink-0 gap-2 border-t border-border p-2">
        <span className="py-2 text-success">$</span>
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void runCommand(); }}
          placeholder="build, test, npm run dev…"
          className="min-w-0 flex-1 bg-transparent py-2 text-xs text-foreground outline-none"
        />
        <button
          type="button"
          onClick={() => void runCommand()}
          disabled={!command.trim() || running}
          className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-background disabled:opacity-50"
        >
          {running ? "…" : "Run"}
        </button>
      </div>
    </section>
  );
}