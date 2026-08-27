"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_JYINX_MODEL, getJyinxModel, type JyinxModel } from "./model-registry";

export type JyinxCustomAgent = {
  id: string;
  name: string;
  modelId: string;
  endpoint: string;
  systemPrompt: string;
  tag: string;
};

type JyinxModelState = {
  activeModel: JyinxModel;
  customAgents: JyinxCustomAgent[];
  selectedRepositoryId: number | null;
  selectedRepositoryName: string | null;
  mode: "agent" | "ide";
  historyEnabled: boolean;
  setActiveModel: (model: JyinxModel) => void;
  setCustomAgents: (agents: JyinxCustomAgent[]) => void;
  addCustomAgent: (agent: JyinxCustomAgent) => void;
  setSelectedRepository: (id: number | null, name?: string | null) => void;
  setMode: (mode: "agent" | "ide") => void;
  setHistoryEnabled: (enabled: boolean) => void;
};

const STORAGE_KEY = "jyinx:model-state";
const ModelContext = createContext<JyinxModelState | null>(null);

export function JyinxModelProvider({ children }: { children: ReactNode }) {
  const [activeModel, setActiveModelState] = useState(DEFAULT_JYINX_MODEL);
  const [customAgents, setCustomAgentsState] = useState<JyinxCustomAgent[]>([]);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<number | null>(null);
  const [selectedRepositoryName, setSelectedRepositoryName] = useState<string | null>(null);
  const [mode, setModeState] = useState<"agent" | "ide">("agent");
  const [historyEnabled, setHistoryEnabledState] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const state = JSON.parse(saved) as Partial<{ activeModelId: string; customAgents: JyinxCustomAgent[]; selectedRepositoryId: number | null; selectedRepositoryName: string | null; mode: "agent" | "ide"; historyEnabled: boolean }>;
      const savedModel = state.activeModelId ? getJyinxModel(state.activeModelId) : undefined;
      if (savedModel) setActiveModelState(savedModel);
      if (Array.isArray(state.customAgents)) setCustomAgentsState(state.customAgents);
      if (typeof state.selectedRepositoryId === "number" || state.selectedRepositoryId === null) setSelectedRepositoryId(state.selectedRepositoryId ?? null);
      if (typeof state.selectedRepositoryName === "string" || state.selectedRepositoryName === null) setSelectedRepositoryName(state.selectedRepositoryName ?? null);
      if (state.mode === "agent" || state.mode === "ide") setModeState(state.mode);
      if (typeof state.historyEnabled === "boolean") setHistoryEnabledState(state.historyEnabled);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const state = JSON.parse(event.newValue) as { activeModelId?: string; mode?: "agent" | "ide" };
        const model = state.activeModelId ? getJyinxModel(state.activeModelId) : undefined;
        if (model) setActiveModelState(model);
        if (state.mode === "agent" || state.mode === "ide") setModeState(state.mode);
      } catch {
        // Ignore malformed external storage updates.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = (next: Partial<{ activeModelId: string; customAgents: JyinxCustomAgent[]; selectedRepositoryId: number | null; selectedRepositoryName: string | null; mode: "agent" | "ide"; historyEnabled: boolean }>) => {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, unknown>;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...next }));
  };

  const value = useMemo<JyinxModelState>(() => ({
    activeModel,
    customAgents,
    selectedRepositoryId,
    selectedRepositoryName,
    mode,
    historyEnabled,
    setActiveModel: (model) => { setActiveModelState(model); persist({ activeModelId: model.id }); },
    setCustomAgents: (agents) => { setCustomAgentsState(agents); persist({ customAgents: agents }); },
    addCustomAgent: (agent) => { setCustomAgentsState((current) => { const next = [...current, agent]; persist({ customAgents: next }); return next; }); },
    setSelectedRepository: (id, name = null) => { setSelectedRepositoryId(id); setSelectedRepositoryName(name); persist({ selectedRepositoryId: id, selectedRepositoryName: name }); },
    setMode: (nextMode) => { setModeState(nextMode); persist({ mode: nextMode }); },
    setHistoryEnabled: (enabled) => { setHistoryEnabledState(enabled); persist({ historyEnabled: enabled }); },
  }), [activeModel, customAgents, historyEnabled, mode, selectedRepositoryId, selectedRepositoryName]);

  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>;
}

export function useJyinxModelStore() {
  const value = useContext(ModelContext);
  if (!value) throw new Error("useJyinxModelStore must be used inside JyinxModelProvider");
  return value;
}
