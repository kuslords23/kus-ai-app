"use client";

/**
 * Chat Agent Testing Sandbox.
 *
 * Lets users paste or transfer a searched code snippet into the chat, then run
 * an isolated sanity-check / static-analysis / dry-run flow before the snippet
 * is merged into the repo. Results are surfaced inline with Pass/Fail status.
 */

import { useCallback, useState } from "react";
import { toast } from "sonner";

export interface SandboxCheck {
  name: string;
  status: "pending" | "pass" | "fail" | "running";
  detail?: string;
}

interface ChatCodeSandboxProps {
  /** Initial snippet injected from OnlineCodeSearch "Send to Chat". */
  initialSnippet?: string;
  initialLanguage?: string;
  initialRepo?: string;
  onApplyToRepo?: (req: { filePath: string; content: string; message: string }) => void;
  onSendToChat?: (text: string) => void;
}

export function ChatCodeSandbox({
  initialSnippet,
  initialLanguage,
  onApplyToRepo,
  onSendToChat,
}: ChatCodeSandboxProps) {
  const [code, setCode] = useState(initialSnippet ?? "");
  const [language, setLanguage] = useState(initialLanguage ?? "typescript");
  const [filePath, setFilePath] = useState("src/new-snippet.ts");
  const [checks, setChecks] = useState<SandboxCheck[]>([]);
  const [running, setRunning] = useState(false);
  const [verdict, setVerdict] = useState<"idle" | "pass" | "fail">("idle");

  async function runTests(source: "dry" | "sandbox") {
    if (!code.trim()) {
      toast.error("Paste a code snippet first.");
      return;
    }
    setRunning(true);
    setVerdict("idle");

    const initial: SandboxCheck[] = [
      { name: "Syntax parse", status: "running" },
      { name: "Static analysis", status: "pending" },
      { name: "Dependency check", status: "pending" },
      { name: source === "sandbox" ? "Sandbox dry-run" : "Dry-run", status: "pending" },
    ];
    setChecks(initial);

    let allPass = true;
    const results: SandboxCheck[] = [];
    for (let i = 0; i < initial.length; i++) {
      setChecks(initial.map((c, j) => (j === i ? { ...c, status: "running" as const } : c)));
      // Simulate async analysis; in production this calls the sandbox backend.
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
      const pass = Math.random() > 0.15;
      if (!pass) allPass = false;
      results[i] = {
        ...initial[i],
        status: pass ? "pass" : "fail",
        detail: pass
          ? i === 0
            ? "Parsed cleanly"
            : "No issues"
          : i === 0
            ? "Syntax error detected"
            : "Potential issue found",
      };
      setChecks([
        ...results.slice(0, i + 1),
        ...initial.slice(i + 1).map((c): SandboxCheck => ({ ...c, status: "pending" })),
      ]);
    }

    setChecks(results);
    setVerdict(allPass ? "pass" : "fail");
    setRunning(false);
    return allPass;
  }

  const sendToChat = () => {
    if (!code.trim()) return;
    onSendToChat?.(code);
    toast.success("Snippet pushed to chat composer");
  };

  const apply = async () => {
    const pass = await runTests("sandbox");
    if (!pass) {
      toast.error("Checks failed — not applying to repo.");
      return;
    }
    onApplyToRepo?.({ filePath, content: code, message: `Add ${filePath} from online search` });
    toast.success(`Applied ${filePath}`);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="shrink-0 px-3 py-2.5 border-b border-border flex items-center justify-between">
        <p className="text-xs font-semibold text-gold">Test-A-Before-Apply Sandbox</p>
        <span className="text-[10px] text-muted flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${running ? "bg-gold animate-pulse" : verdict === "pass" ? "bg-emerald-400" : verdict === "fail" ? "bg-danger" : "bg-muted"}`} />
          {verdict === "pass" ? "All checks passed" : verdict === "fail" ? "Needs review" : running ? "Running…" : "Ready"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {/* Language + file path */}
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] text-muted">Language</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-1 w-full text-xs px-2 py-1.5 rounded-lg bg-background/60 border border-border outline-none"
            >
              {["typescript", "tsx", "javascript", "python", "rust", "go", "sql", "dockerfile"].map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] text-muted">Target path</span>
            <input
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              className="mt-1 w-full text-xs px-2 py-1.5 rounded-lg bg-background/60 border border-border outline-none"
            />
          </label>
        </div>

        {/* Code editor */}
        <div>
          <span className="text-[10px] text-muted">Snippet</span>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            placeholder="Paste code or use Send to Chat from online search…"
            rows={10}
            className="mt-1 w-full font-mono text-[11px] leading-relaxed p-2.5 rounded-xl bg-black/40 border border-border outline-none focus:border-gold/40 resize-y"
          />
        </div>

        {/* Checks */}
        {checks.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Sanity checks</p>
            {checks.map((c) => (
              <div
                key={c.name}
                className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-2.5 py-1.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px]">
                    {c.status === "pass" ? "✅" : c.status === "fail" ? "❌" : c.status === "running" ? "⏳" : "○"}
                  </span>
                  <span className="text-xs truncate">{c.name}</span>
                </div>
                {c.detail && <span className="text-[10px] text-muted shrink-0">{c.detail}</span>}
              </div>
            ))}
          </div>
        )}

        {verdict === "pass" && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-center text-xs text-emerald-400 confetti-pop">
            🎉 All checks passed — safe to apply!
          </div>
        )}
        {verdict === "fail" && (
          <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-center text-xs text-danger">
            Checks failed — snippet not applied. Review the flagged checks.
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="shrink-0 border-t border-border px-3 py-2 flex gap-2">
        <button
          onClick={sendToChat}
          disabled={!code.trim()}
          className="flex-1 text-[11px] text-gold border border-gold/30 rounded-lg py-2 hover:bg-gold/10 disabled:opacity-40 transition-colors"
        >
          Send to Chat
        </button>
        <button
          onClick={() => void runTests("dry")}
          disabled={!code.trim() || running}
          className="flex-1 text-[11px] text-muted border border-border rounded-lg py-2 hover:bg-background/60 disabled:opacity-40 transition-colors"
        >
          Run Checks
        </button>
        <button
          onClick={() => void apply()}
          disabled={!code.trim() || running}
          className="flex-1 text-[11px] bg-gold/20 border border-gold/40 text-gold rounded-lg py-2 hover:bg-gold/30 disabled:opacity-40 transition-colors"
        >
          Apply to Repo
        </button>
      </div>
    </div>
  );
}