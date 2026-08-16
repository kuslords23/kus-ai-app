"use client";

import { useState } from "react";

type Props = { repository?: string; file?: string };

export function JyinxTerminalPanel({ repository, file }: Props) {
  const [command, setCommand] = useState("");
  const [logs, setLogs] = useState<string[]>(["Jyinx terminal ready.", "Commands are executed through the configured project backend."]);
  const [running, setRunning] = useState(false);

  const runCommand = async () => {
    const value = command.trim();
    if (!value || running) return;
    setCommand("");
    setRunning(true);
    setLogs((current) => [...current, `$ ${value}`]);
    try {
      const response = await fetch("/api/jyinx/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "terminal", command: value, repository, file }) });
      const data = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      setLogs((current) => [...current, response.ok ? (data.message || "Command accepted by the workspace backend.") : (data.error || "Command was rejected by the workspace backend.")]);
    } catch {
      setLogs((current) => [...current, "Terminal backend unavailable; command kept local."]);
    } finally {
      setRunning(false);
    }
  };

  return <section className="flex min-h-36 flex-col border-t border-border bg-[#090711] font-mono text-xs"><header className="flex items-center justify-between border-b border-border px-3 py-2 text-muted"><span>Terminal</span><span>{repository || "local workspace"}</span></header><div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3 text-purple-soft">{logs.slice(-40).map((log, index) => <p key={`${index}-${log}`}>{log}</p>)}{running && <p className="text-gold">Running…</p>}</div><div className="flex gap-2 border-t border-border p-2"><span className="py-2 text-success">$</span><input value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void runCommand(); }} placeholder="build, test, git status…" className="min-w-0 flex-1 bg-transparent py-2 text-xs text-foreground outline-none" /><button type="button" onClick={() => void runCommand()} disabled={!command.trim() || running} className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-background disabled:opacity-50">Run</button></div></section>;
}
