"use client";

import { useState } from "react";
import {
  MODEL_CATALOG,
  defaultSelection,
  saveSelection,
  type HierarchicalSelection,
  type ModelEntry,
  type ModelProvider,
} from "@/lib/models/catalog";

type Step = "provider" | "model" | "agent";

export type HierarchicalSelectorProps = {
  value: HierarchicalSelection | null;
  onChange: (sel: HierarchicalSelection) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: (btn: { open: boolean; selection: HierarchicalSelection | null }) => React.ReactNode;
  /** Preselect a model id when opening (e.g. from a quick picker). */
  defaultModelId?: string;
  components?: {
    optionLabel?: (entry: ModelEntry) => string;
    optionMeta?: (entry: ModelEntry) => string;
  };
};

/**
 * Universal hierarchical model selector: Provider → Model → Agent.
 *
 * A single reusable component used across Royal, Jyinx, settings and the top
 * bar so no flat model dropdowns remain. The final selection persists to
 * localStorage via `saveSelection`.
 */
export function HierarchicalModelSelector({
  value,
  onChange,
  open: controlledOpen,
  onOpenChange,
  trigger,
  defaultModelId,
  components,
}: HierarchicalSelectorProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };

  const [step, setStep] = useState<Step>("provider");
  const [providerId, setProviderId] = useState<ModelProvider["id"] | null>(
    defaultModelId
      ? (findProviderForModel(defaultModelId) ?? null)
      : value?.provider ?? null
  );
  const [modelId, setModelId] = useState<string | null>(
    defaultModelId ?? value?.model ?? null
  );
  const [agentId, setAgentId] = useState<string | null>(value?.agent ?? null);

  const provider = providerId ? MODEL_CATALOG.find((p) => p.id === providerId) : null;
  const model = modelId && provider ? provider.models.find((m) => m.id === modelId) : null;

  const resetTo = (sel: HierarchicalSelection) => {
    setProviderId(sel.provider);
    setModelId(sel.model);
    setAgentId(sel.agent);
    setStep("provider");
  };

  const selectAndClose = (sel: HierarchicalSelection) => {
    saveSelection(sel);
    onChange(sel);
    setOpen(false);
    resetTo(sel);
  };

  const titleBar = (title: string, onBack?: () => void) => (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface"
        >
          ← Back
        </button>
      )}
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</p>
    </div>
  );

  const triggerState = value
    ? {
        provider: value.providerLabel,
        model: value.modelLabel,
        agent: value.agentName,
      }
    : null;

  return (
    <div className="relative inline-block">
      {trigger
        ? trigger({ open: Boolean(open), selection: value })
        : (() => {
            const sel = value ?? defaultSelection();
            return (
              <button
                type="button"
                onClick={() => setOpen(!open)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/50 px-2.5 py-1.5 text-xs text-foreground hover:border-gold/40"
              >
                <span className="font-medium">{sel.modelLabel}</span>
                <span className="text-muted">·</span>
                <span className="text-muted">{sel.agentName}</span>
                <span className="ml-0.5 text-muted">▾</span>
              </button>
            );
          })()}

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
          {step === "provider" && (
            <div>
              {titleBar("Choose Provider")}
              <div className="max-h-72 space-y-1 overflow-y-auto p-2">
                {MODEL_CATALOG.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProviderId(p.id);
                      setModelId(p.models[0]?.id ?? null);
                      setAgentId(null);
                      setStep("model");
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      providerId === p.id
                        ? "border-gold/40 bg-gold/10"
                        : "border-border bg-surface/40 hover:bg-surface"
                    }`}
                  >
                    <span className="text-base">{p.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-foreground">{p.label}</span>
                      <span className="block text-[10px] text-muted">{p.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === "model" && provider && (
            <div>
              {titleBar(`${provider.icon} ${provider.label}`, () => setStep("provider"))}
              <div className="max-h-72 space-y-0.5 overflow-y-auto p-2">
                {(["Free", "Paid", "Auto"] as const)
                  .filter((tier) => provider.models.some((m) => m.tier === tier))
                  .map((tier) => (
                    <div key={tier} className="mb-1">
                      <p className="px-1 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                        {tier}
                      </p>
                      {provider.models
                        .filter((m) => m.tier === tier)
                        .map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setModelId(m.id);
                              setAgentId(agentId ?? value?.agent ?? null);
                              setStep("agent");
                            }}
                            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[11px] transition-colors ${
                              modelId === m.id
                                ? "bg-gold/15 text-gold"
                                : "text-foreground hover:bg-surface"
                            }`}
                          >
                            <span>
                              {components?.optionLabel?.(m) ?? m.label}
                              {components?.optionMeta && (
                                <span className="block text-[9px] text-muted">
                                  {components.optionMeta(m)}
                                </span>
                              )}
                            </span>
                            {modelId === m.id && <span className="text-gold">✓</span>}
                          </button>
                        ))}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {step === "agent" && provider && model && (
            <div>
              {titleBar(`${model.label} → Agent`, () => setStep("model"))}
              <div className="max-h-72 space-y-1 overflow-y-auto p-2">
                {provider.agents.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() =>
                      selectAndClose({
                        provider: provider.id,
                        providerLabel: provider.label,
                        model: model.id,
                        modelLabel: model.label,
                        agent: a.id,
                        agentName: a.name,
                      })
                    }
                    className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      agentId === a.id ? "border-gold/40 bg-gold/10" : "border-transparent hover:bg-surface"
                    }`}
                  >
                    <span className="text-sm">{a.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-foreground">{a.name}</span>
                      <span className="block text-[10px] text-muted">{a.tagline}</span>
                    </span>
                    {agentId === a.id && <span className="ml-auto text-gold">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {triggerState && (
            <div className="border-t border-border px-3 py-1.5 text-center text-[10px] text-muted">
              {triggerState.model} · {triggerState.agent}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function findProviderForModel(modelId: string): ModelProvider["id"] | null {
  for (const provider of MODEL_CATALOG) {
    if (provider.models.some((m) => m.id === modelId)) return provider.id;
  }
  return null;
}