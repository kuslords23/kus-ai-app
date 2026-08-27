"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

const MENU_WIDTH = 288; // w-72
const MENU_GAP = 8;
const MENU_MAX_HEIGHT_BASE = 288; // max-h-72
const MENU_HORIZONTAL_MARGIN = 8;

/**
 * Universal hierarchical model selector: Provider → Model → Agent.
 *
 * A single reusable component used across Royal, Jyinx, settings and the top
 * bar so no flat model dropdowns remain. The final selection persists to
 * localStorage via `saveSelection`.
 *
 * The option panel is rendered through a portal directly into `document.body`
 * with a high z-index and flips upward when there is not enough room below the
 * trigger, so it never gets clipped by an ancestor or trapped under a fixed
 * composer. A transparent click-away backdrop guarantees taps always toggle
 * the menu open/closed.
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
  const setOpen = useCallback(
    (v: boolean) => {
      setInternalOpen(v);
      onOpenChange?.(v);
    },
    [onOpenChange]
  );

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

  const triggerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    maxHeight: number;
    flipUp: boolean;
  } | null>(null);

  const provider = providerId ? MODEL_CATALOG.find((p) => p.id === providerId) : null;
  const model = modelId && provider ? provider.models.find((m) => m.id === modelId) : null;

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tail = MENU_MAX_HEIGHT_BASE + MENU_GAP;
    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    const flipUp = spaceBelow < tail && spaceAbove > spaceBelow;
    const availableV = flipUp ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(120, Math.min(MENU_MAX_HEIGHT_BASE, availableV - MENU_GAP));
    const left = Math.min(
      Math.max(MENU_HORIZONTAL_MARGIN, rect.left),
      Math.max(MENU_HORIZONTAL_MARGIN, vw - MENU_WIDTH - MENU_HORIZONTAL_MARGIN)
    );
    const top = flipUp
      ? Math.max(MENU_GAP, rect.top - maxHeight - MENU_GAP)
      : rect.bottom + MENU_GAP;
    setPos({ top, left, maxHeight, flipUp });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const onWindowEvent = () => measure();
    window.addEventListener("resize", onWindowEvent);
    window.addEventListener("scroll", onWindowEvent, true);
    return () => {
      window.removeEventListener("resize", onWindowEvent);
      window.removeEventListener("scroll", onWindowEvent, true);
    };
  }, [open, measure, step, providerId]);

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
          className="cursor-pointer rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface"
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

  const renderTrigger = () =>
    trigger
      ? trigger({ open: Boolean(open), selection: value })
      : (() => {
          const sel = value ?? defaultSelection();
          return (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border/80 bg-background/50 px-2.5 py-1.5 text-xs text-foreground hover:border-gold/40"
              aria-haspopup="menu"
              aria-expanded={Boolean(open)}
            >
              <span className="font-medium">{sel.modelLabel}</span>
              <span className="text-muted">·</span>
              <span className="text-muted">{sel.agentName}</span>
              <span className="ml-0.5 text-muted">▾</span>
            </button>
          );
        })();

  const panel = (
    <div className="flex max-h-full w-72 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
      <div className="min-h-0 flex-1 overflow-y-auto">
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
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
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
                            selectAndClose({
                              provider: provider.id,
                              providerLabel: provider.label,
                              model: m.id,
                              modelLabel: m.label,
                              agent: "auto",
                              agentName: "Auto",
                            });
                          }}
                          className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[11px] transition-colors ${
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
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    agentId === a.id
                      ? "border-gold/40 bg-gold/10"
                      : "border-transparent hover:bg-surface"
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
    </div>
  );

  return (
    <>
      <div ref={triggerRef} className="relative inline-block">
        {renderTrigger()}
      </div>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            {/* Click-away backdrop: sits below the panel so taps anywhere toggles/clears it. */}
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              role="menu"
              style={{
                top: pos.top,
                left: pos.left,
                maxHeight: pos.maxHeight,
              }}
              className="fixed z-[9999]"
            >
              {panel}
            </div>
          </>,
          document.body
        )}
    </>
  );
}

function findProviderForModel(modelId: string): ModelProvider["id"] | null {
  for (const provider of MODEL_CATALOG) {
    if (provider.models.some((m) => m.id === modelId)) return provider.id;
  }
  return null;
}