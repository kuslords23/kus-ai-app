import type { AgentDefinition } from "@/lib/agents/registry";
import { AGENTS } from "@/lib/agents/registry";
import { JYINX_MODELS, type JyinxModel } from "@/lib/jyinx/model-registry";

/**
 * Universal hierarchical model catalog: Provider → Model → Agent.
 *
 * Single source of truth for every model picker in the app (Royal, Jyinx,
 * settings, top bar). Replacement for the scattered flat dropdowns so the
 * selection flow is uniform everywhere: pick a Provider, then a Model within
 * it, then an Agent / persona.
 */

export type ProviderId = "kusai" | "openrouter" | "google";

export type ModelEntry = {
  id: string;
  label: string;
  /** Free vs paid tier within this provider. */
  tier: "Free" | "Paid" | "Auto";
  contextWindow: number;
  /** True when this model must route through the generic OpenAI-compatible gateway. */
  viaGateway?: boolean;
  /** Gateway model string to send (defaults to `id`). */
  gatewayModel?: string;
};

export type AgentOption = {
  id: string;
  name: string;
  icon: string;
  tagline: string;
};

export type ModelProvider = {
  id: ProviderId;
  label: string;
  icon: string;
  description: string;
  models: ModelEntry[];
  agents: AgentOption[];
};

function toEntry(m: JyinxModel): ModelEntry {
  return {
    id: m.id,
    label: m.label,
    tier: m.id === "openrouter/free" || /:free$/.test(m.id) || m.tier === "Free" ? "Free" : "Paid",
    contextWindow: m.contextWindow,
    viaGateway: true,
  };
}

/** Models that live on the OpenRouter mesh (grouped Free vs Paid). */
const OPENROUTER_MODELS = JYINX_MODELS.filter((m) => !m.id.startsWith("kus-ai/") && m.id !== "openrouter/free").map(toEntry);

const AGENT_OPTIONS: AgentOption[] = AGENTS.map((a) => ({
  id: a.id,
  name: a.name,
  icon: a.icon,
  tagline: a.tagline,
}));

export const MODEL_CATALOG: ModelProvider[] = [
  {
    id: "kusai",
    label: "Kus AI (Custom)",
    icon: "🤖",
    description: "Our own runner — routes through the Kus AI brain.",
    models: [
      {
        id: "kus-ai/royal",
        label: "Kus AI (Royal)",
        tier: "Auto",
        contextWindow: 128_000,
      },
      {
        id: "kus-ai/kus-code-1",
        label: "Kus Code 1.0",
        tier: "Auto",
        contextWindow: 64_000,
      },
      {
        id: "kus-ai/kus-code-2",
        label: "Kus Code 2.0",
        tier: "Auto",
        contextWindow: 128_000,
      },
      {
        id: "kus-ai/kus-code-3",
        label: "Kus Code 3.0",
        tier: "Auto",
        contextWindow: 256_000,
      },
    ],
    agents: AGENT_OPTIONS,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    icon: "⬡",
    description: "One key to scores of free & paid models.",
    models: [
      { id: "openrouter/free", label: "OpenRouter Free", tier: "Free", contextWindow: 128_000, viaGateway: true, gatewayModel: "openrouter/free" },
      ...OPENROUTER_MODELS.filter((m) => m.tier === "Free"),
      ...OPENROUTER_MODELS.filter((m) => m.tier === "Paid"),
    ],
    agents: AGENT_OPTIONS,
  },
  {
    id: "google",
    label: "Google Gemini",
    icon: "✨",
    description: "Gemini via Google AI Studio (or platform key).",
    models: [
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "Free", contextWindow: 1_000_000, viaGateway: true, gatewayModel: "google/gemini-2.5-flash" },
      { id: "google/gemini-2.5-flash:free", label: "Gemini Flash (free)", tier: "Free", contextWindow: 1_000_000, viaGateway: true },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "Paid", contextWindow: 1_000_000, viaGateway: true },
    ],
    agents: AGENT_OPTIONS,
  },
];

export function getProvider(id: ProviderId): ModelProvider | undefined {
  return MODEL_CATALOG.find((p) => p.id === id);
}

export function findModel(modelId: string): { provider: ModelProvider; model: ModelEntry } | null {
  for (const provider of MODEL_CATALOG) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) return { provider, model };
  }
  return null;
}

/** Resolve the provider by a raw model string (fallback to OpenRouter). */
export function providerFromModel(modelId: string): ModelProvider {
  if (modelId.startsWith("kus-ai/")) return getProvider("kusai")!;
  if (modelId.startsWith("google/") || /gemini/i.test(modelId)) return getProvider("google")!;
  return getProvider("openrouter")!;
}

/** Check if a model is a Kus AI powered model. */
export function isKusAiModel(modelId: string): boolean {
  return modelId.startsWith("kus-ai/");
}

/** Check if a model is one of the built-in Kus Code pipeline versions. */
export function isKusCodeModel(modelId: string): boolean {
  return modelId.startsWith("kus-ai/kus-code");
}

/** Get the appropriate backend model identifier for routing. */
export function resolveBackendModel(modelId: string): string {
  if (modelId === "kus-ai/kus-code-1") return "kus-code/ai-1";
  if (modelId === "kus-ai/kus-code-2") return "kus-code/ai-2";
  if (modelId === "kus-ai/kus-code-3") return "kus-code/ai-3";
  if (modelId === "kus-ai/royal") return "kus-ai/royal";
  return modelId;
}

export type HierarchicalSelection = {
  provider: ProviderId;
  providerLabel: string;
  model: string;
  modelLabel: string;
  agent: string;
  agentName: string;
};

/** Default selection: Kus AI / OpenRouter Auto, Auto agent. */
export function defaultSelection(): HierarchicalSelection {
  const provider = getProvider("openrouter")!;
  const model = provider.models.find((m) => m.id === "openrouter/free") ?? provider.models[0];
  const agent = AGENT_OPTIONS[0];
  return {
    provider: provider.id,
    providerLabel: provider.label,
    model: model.id,
    modelLabel: model.label,
    agent: agent.id,
    agentName: agent.name,
  };
}

const SELECTION_KEY = "kus:model-selection";

export function saveSelection(sel: HierarchicalSelection): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify(sel));
  } catch {
    // ignore quota
  }
}

export function loadSelection(): HierarchicalSelection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HierarchicalSelection;
    if (!parsed.provider || !parsed.model || !parsed.agent) return null;
    return parsed;
  } catch {
    return null;
  }
}

export { SELECTION_KEY };