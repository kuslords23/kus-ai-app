"use client";

import { useEffect, useMemo, useState } from "react";
import { JYINX_MODELS, type JyinxModel } from "@/lib/jyinx/model-registry";
import type { JyinxRepository } from "@/components/jyinx/JyinxGitHubRepos";

type CustomAgent = {
  id: string;
  name: string;
  modelId: string;
  endpoint: string;
  systemPrompt: string;
  tag: string;
};

type Props = {
  repositories: JyinxRepository[];
  selectedRepositoryId?: number;
  onRepositoryChange: (repository: JyinxRepository | null) => void;
  activeModel: JyinxModel;
  onModelChange: (model: JyinxModel) => void;
  onAgentChange?: (agent: CustomAgent | null) => void;
  compact?: boolean;
};

const STORAGE_KEY = "jyinx:custom-agents";

export function JyinxComposerControls({ repositories, selectedRepositoryId, onRepositoryChange, activeModel, onModelChange, onAgentChange, compact = false }: Props) {
  const [agents, setAgents] = useState<CustomAgent[]>([]);
  const [agentId, setAgentId] = useState("");
  const [managerOpen, setManagerOpen] = useState(false);
  const [name, setName] = useState("");
  const [modelId, setModelId] = useState(JYINX_MODELS[0]?.id ?? "openrouter/auto");
  const [endpoint, setEndpoint] = useState("https://openrouter.ai/api/v1/chat/completions");
  const [systemPrompt, setSystemPrompt] = useState("You are a careful coding assistant.");
  const [tag, setTag] = useState("coding");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setAgents(JSON.parse(saved) as CustomAgent[]);
    } catch {
      setAgents([]);
    }
  }, []);

  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === agentId) ?? null, [agentId, agents]);

  useEffect(() => {
    onAgentChange?.(selectedAgent);
  }, [onAgentChange, selectedAgent]);

  const selectAgent = (id: string) => {
    setAgentId(id);
    const agent = agents.find((item) => item.id === id);
    if (agent) onModelChange({ id: agent.modelId, label: agent.name, tier: "Balanced", contextWindow: 128_000 });
    onAgentChange?.(agent ?? null);
  };

  const saveAgent = () => {
    const trimmedName = name.trim();
    const trimmedModel = modelId.trim();
    if (!trimmedName || !trimmedModel) return;
    const agent: CustomAgent = { id: `agent-${Date.now()}`, name: trimmedName, modelId: trimmedModel, endpoint: endpoint.trim(), systemPrompt: systemPrompt.trim(), tag: tag.trim() || "custom" };
    const next = [...agents, agent];
    setAgents(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setName("");
    setAgentId(agent.id);
    onModelChange({ id: agent.modelId, label: agent.name, tier: "Balanced", contextWindow: 128_000 });
    onAgentChange?.(agent);
    setManagerOpen(false);
  };

  return <div className={`rounded-xl border border-border bg-background/50 ${compact ? "p-2" : "p-3"}`}><div className="grid gap-2 sm:grid-cols-3"><label className="min-w-0"><span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Repository</span><select value={selectedRepositoryId ?? ""} onChange={(event) => onRepositoryChange(repositories.find((repository) => repository.id === Number(event.target.value)) ?? null)} className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-xs outline-none focus:border-gold"><option value="">Select repository</option>{repositories.map((repository) => <option key={repository.id} value={repository.id}>{repository.fullName}</option>)}</select></label><label className="min-w-0"><span className="mb-1 block text-[10px] uppercase tracking-wider text-muted">Model</span><select value={agentId ? `agent:${agentId}` : activeModel.id} onChange={(event) => event.target.value.startsWith("agent:") ? selectAgent(event.target.value.slice(6)) : (setAgentId(""), onAgentChange?.(null), onModelChange(JYINX_MODELS.find((model) => model.id === event.target.value) ?? activeModel))} className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-xs outline-none focus:border-gold"><optgroup label="Jyinx models">{JYINX_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label} · {model.tier}</option>)}</optgroup>{agents.length > 0 && <optgroup label="Custom agents">{agents.map((agent) => <option key={agent.id} value={`agent:${agent.id}`}>{agent.name} · {agent.tag}</option>)}</optgroup>}</select></label><button type="button" onClick={() => setManagerOpen((value) => !value)} className="self-end rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-gold">{managerOpen ? "Close agent manager" : "Add custom agent"}</button></div>{managerOpen && <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Agent name" className="rounded-lg border border-border bg-surface px-2 py-2 text-xs outline-none focus:border-gold" /><input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="Tag, e.g. refactor" className="rounded-lg border border-border bg-surface px-2 py-2 text-xs outline-none focus:border-gold" /><input value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="OpenRouter model ID" className="rounded-lg border border-border bg-surface px-2 py-2 text-xs outline-none focus:border-gold" /><input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="Compatible endpoint URL" className="rounded-lg border border-border bg-surface px-2 py-2 text-xs outline-none focus:border-gold" /><textarea value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} placeholder="System prompt" className="min-h-16 rounded-lg border border-border bg-surface px-2 py-2 text-xs outline-none focus:border-gold sm:col-span-2" /><div className="flex items-center justify-between gap-2 sm:col-span-2"><p className="text-[10px] text-muted">API keys remain server-side. Configure provider keys in Vercel environment variables.</p><button type="button" onClick={saveAgent} disabled={!name.trim() || !modelId.trim()} className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-background disabled:opacity-50">Save agent</button></div></div>}</div>;
}

export type { CustomAgent };
