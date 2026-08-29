"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getGitHubToken } from "@/lib/jyinx/github-connect";

const LANGUAGES = ["typescript", "javascript", "python", "rust", "go"];

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (repo: { fullName: string; name: string; defaultBranch: string; url?: string; language?: string; commitUrl?: string }) => void;
};

type CreateState = "idle" | "creating" | "done" | "error";

/**
 * New Project creation modal.
 *
 * Validates a project name + language template, then asks the backend
 * (`/api/github/create`) to create the GitHub repo and push a scaffolding
 * commit in the selected language. Reports clear errors instead of failing
 * silently.
 */
export function CreateProjectModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("typescript");
  const [isPrivate, setIsPrivate] = useState(false);
  const [state, setState] = useState<CreateState>("idle");
  const [message, setMessage] = useState("");

  if (!open) return null;

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setState("error"); setMessage("Project name is required."); return; }
    if (trimmed.length > 100) { setState("error"); setMessage("Project name is too long (max 100)."); return; }
    setState("creating");
    setMessage("");
    try {
      let token: string | null = null;
      try {
        const { data } = await createClient().auth.getSession();
        token = data.session?.provider_token ?? null;
      } catch {
        /* fall through */
      }
      if (!token) token = await getGitHubToken();
      if (!token) throw new Error("Connect GitHub before creating a project.");
      const response = await fetch("/api/github/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: trimmed, language, private: isPrivate }),
      });
      const result = (await response.json()) as { repository?: { fullName: string; name: string; defaultBranch: string; url?: string; language?: string; commitUrl?: string }; error?: string };
      if (!response.ok || !result.repository) throw new Error(result.error || "GitHub could not create the project.");
      setState("done");
      setMessage(`Created ${result.repository.fullName} (${result.repository.language ?? language}).`);
      onCreated?.(result.repository);
    } catch (cause) {
      setState("error");
      setMessage(cause instanceof Error ? cause.message : "Unable to create the project.");
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 p-4 sm:p-6" onClick={() => { if (state !== "creating") onClose(); }}>
      <section className="mx-auto mt-10 w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="border-b border-border px-5 py-4">
          <p className="text-sm font-semibold">Create project</p>
          <p className="mt-0.5 text-xs text-muted">Initializes a new GitHub repository with a language template.</p>
        </header>
        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Project name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={state === "creating"}
              placeholder="my-project"
              autoFocus
              onKeyDown={(event) => { if (event.key === "Enter") void submit(); }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold disabled:opacity-60"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Language template</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={state === "creating"} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm capitalize outline-none focus:border-gold">
              {LANGUAGES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span className="text-xs text-muted">Private repository</span>
            <input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} disabled={state === "creating"} />
          </label>
          {message && (
            <p className={`rounded-lg border px-3 py-2 text-xs ${state === "error" ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-success/30 bg-success/10 text-success"}`}>{message}</p>
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={state === "creating"} className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground disabled:opacity-50">Cancel</button>
            <button type="button" onClick={() => void submit()} disabled={state === "creating" || !name.trim()} className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50">
              {state === "creating" ? "Creating…" : "Create repository"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}