"use client";

import { useState } from "react";

export function DevOpsPanel() {
  const [status, setStatus] = useState<"idle" | "working">("idle");
  const [message, setMessage] = useState("Ready");

  const run = async (action: "commit-push" | "deploy" | "query") => {
    setStatus("working");
    setMessage("Working…");
    try {
      const response = await fetch("/api/jyinx/devops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      setMessage(response.ok ? data.message || "Completed" : data.error || "Action failed");
    } catch {
      setMessage("Backend unavailable. No changes were claimed.");
    } finally {
      setStatus("idle");
    }
  };

  return <div className="devops-panel"><h3>Jyinx DevOps</h3><div className="control-group"><button type="button" onClick={() => void run("commit-push")} disabled={status !== "idle"}>Create PR workflow</button><button type="button" onClick={() => void run("deploy")} disabled={status !== "idle"}>Deploy to Vercel</button><button type="button" onClick={() => void run("query")} disabled={status !== "idle"}>Query DB</button></div><div className="status-indicator"><span className={`dot ${status === "idle" ? "green" : "yellow pulse"}`}></span><span className="status-text">{message}</span></div></div>;
}
