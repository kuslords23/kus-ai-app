"use client";

import { useState } from "react";
import type { AuditResult } from "@/lib/jyinx/security/RedTeamAgent";

export function RedTeamPanel() {
  const [result, setResult] = useState<AuditResult | null>(null);
  const [patchBrief, setPatchBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState("export function handler(req) {\n  const q = 'SELECT * FROM users WHERE id=' + req.query.id;\n  return db.query(q);\n}\n");

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/jyinx/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "red_team",
          target: "editor-buffer",
          files: { "scratch.ts": source },
        }),
      });
      const data = await res.json();
      setResult(data.result ?? null);
      setPatchBrief(data.patchBrief ?? "");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Defensive Security Audit</h2>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="rounded-md bg-red-600/80 px-3 py-1.5 text-xs text-white disabled:opacity-50"
        >
          {busy ? "Auditing…" : "Run audit"}
        </button>
      </div>
      <textarea
        value={source}
        onChange={(e) => setSource(e.target.value)}
        className="h-40 w-full rounded-lg border border-border bg-background p-2 font-mono text-xs"
      />
      {result && (
        <div className="rounded-lg border border-border p-3 text-xs">
          <p>
            Status: <strong>{result.status}</strong> · Risk {result.overallRiskScore}/10 · Findings{" "}
            {result.findings.length}
          </p>
          <ul className="mt-2 space-y-2">
            {result.findings.map((f) => (
              <li key={f.id} className="rounded border border-border/60 p-2">
                <p className="font-medium">
                  [{f.riskLevel}] {f.summary}
                </p>
                <p className="text-muted">{f.patchRecommendation}</p>
              </li>
            ))}
          </ul>
          {patchBrief && (
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[11px]">
              {patchBrief}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
