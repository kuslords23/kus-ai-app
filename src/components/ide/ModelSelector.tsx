"use client";

/**
 * Decoupled AI Model Picker.
 *
 * This is the primary model-provider selector for Jyinx. Users choose a
 * provider and model independently of any sub-agent (Kus AI) — only the
 * selected provider+model pair is passed downstream. Sub-agent binding
 * (if any) is handled exclusively by the agentRouter.
 */

import { useEffect, useMemo, useState } from "react";

// ── Data layer ──────────────────────────────────────────

export interface ProviderOption {
  id: string;
  label: string;
  /** e.g. "Gemini · OpenRouter · Auto" */
  shortHint?: string;
  modelList: ModelOption[];
}

export interface ModelOption {
  id: string;
  label: string;
  hint?: string;
  freeTier?: boolean;
  byok?: boolean;
  cost?: string;
}

const PROVIDERS: ProviderOption[] = [
  {
    id: "kusai",
    label: "Kus AI",
    shortHint: "Royal · Kus Code 1.0 · 2.0 · 3.0",
    modelList: [
      { id: "kus-ai/royal", label: "Kus AI (Royal)", hint: "Everyday royal assistant", freeTier: true },
      { id: "kus-ai/kus-code-1", label: "Kus Code 1.0", hint: "Legacy pipeline", freeTier: true },
      { id: "kus-ai/kus-code-2", label: "Kus Code 2.0", hint: "Balanced pipeline", freeTier: true },
      { id: "kus-ai/kus-code-3", label: "Kus Code 3.0", hint: "Flagship pipeline", freeTier: true },
    ],
  },
  {
    id: "google",
    label: "Google Gemini",
    shortHint: "Gemini Flash · Pro · Nano",
    modelList: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "Fast, free-tier capable", freeTier: true },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "Advanced reasoning", byok: true },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    shortHint: "Multi-model free router",
    modelList: [
      { id: "openrouter/free", label: "OpenRouter Free (Auto)", hint: "Best available free model", freeTier: true },
      { id: "stealth/ox-alpha:free", label: "Ox Alpha (Free)", hint: "1M ctx · via OpenRouter", freeTier: true },
      { id: "google/gemini-2.5-flash:free", label: "Gemini Flash (Free)", hint: "Via OpenRouter", freeTier: true },
      { id: "meta-llama/llama-3-8b-instruct:free", label: "Llama 3 8B (Free)", hint: "Via OpenRouter", freeTier: true },
      { id: "stealth/ox-alpha", label: "Ox Alpha (Paid)", hint: "1M ctx · flagship", byok: true },
      { id: "openrouter/auto", label: "OpenRouter Auto (Paid)", hint: "Best paid model", byok: true },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    shortHint: "GPT · o-series",
    modelList: [
      { id: "gpt-4o", label: "GPT-4o", hint: "Omni-model", byok: true },
      { id: "gpt-4o-mini", label: "GPT-4o Mini", hint: "Fast & cheap", byok: true },
    ],
  },
  {
    id: "auto",
    label: "Auto (Smart Router)",
    shortHint: "Picks best free/paid model",
    modelList: [
      { id: "auto", label: "Auto Select", hint: "Jyinx picks the best model for your task", freeTier: true },
    ],
  },
];

const STORAGE_KEY = "jyinx-selected-provider-model";

interface Selection {
  provider: string;
  model: string;
}

function readStored(): Selection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Selection;
  } catch { /* ignore */ }
  return null;
}

function writeStored(s: Selection): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// ── Component ───────────────────────────────────────────

interface ModelSelectorProps {
  onChange?: (provider: string, model: string) => void;
  /** Pre-select from external state (e.g., workspace restore). */
  initialProvider?: string;
  initialModel?: string;
  compact?: boolean;
  className?: string;
}

export function ModelSelector({
  onChange,
  initialProvider,
  initialModel,
  compact = false,
  className = "",
}: ModelSelectorProps) {
  const stored = useMemo(() => readStored(), []);
  const [provider, setProvider] = useState(initialProvider ?? stored?.provider ?? "auto");
  const [model, setModel] = useState(initialModel ?? stored?.model ?? "auto");
  const [open, setOpen] = useState(false);

  const activeProvider = useMemo(() => PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0], [provider]);
  const activeModel = useMemo(() => activeProvider.modelList.find((m) => m.id === model) ?? activeProvider.modelList[0], [model, activeProvider]);

  useEffect(() => {
    writeStored({ provider, model });
    onChange?.(provider, model);
  }, [provider, model, onChange]);

  function selectProvider(id: string) {
    setProvider(id);
    const p = PROVIDERS.find((x) => x.id === id);
    const def = p?.modelList[0]?.id ?? "auto";
    setModel(def);
  }

  const baseCls = "px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors";

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`${baseCls} flex items-center gap-1.5 bg-background/60 border-border hover:border-gold/40 ${
          compact ? "text-[10px] px-2 py-1" : ""
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-gold">{activeModel?.freeTier ? "🆓" : "⚡"}</span>
        <span>{activeProvider.label} · {activeModel?.label}</span>
        <span className="text-muted">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 z-[60] w-72 rounded-2xl border border-border bg-background/95 backdrop-blur-xl shadow-2xl p-3 space-y-3">
            {/* Step 1: Provider */}
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted mb-1.5">Provider</p>
              <div className="grid grid-cols-2 gap-1">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => selectProvider(p.id)}
                    className={`text-left px-2 py-1.5 rounded-lg text-[10px] border transition-colors ${
                      provider === p.id
                        ? "border-gold/40 bg-gold/15 text-gold"
                        : "border-border bg-background/40 text-muted hover:border-gold/25"
                    }`}
                  >
                    <p className="font-medium">{p.label}</p>
                    <p className="text-[9px] opacity-70 truncate">{p.shortHint}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Model */}
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted mb-1.5">Model</p>
              <div className="space-y-1">
                {activeProvider.modelList.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setModel(m.id); setOpen(false); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] border transition-colors flex items-center justify-between ${
                      model === m.id
                        ? "border-gold/40 bg-gold/15 text-gold"
                        : "border-transparent bg-background/20 hover:bg-background/40"
                    }`}
                  >
                    <div>
                      <p className="font-medium">{m.label}</p>
                      {m.hint && <p className="text-[9px] opacity-70">{m.hint}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {m.freeTier && <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1 rounded">Free</span>}
                      {m.byok && <span className="text-[9px] text-gold bg-gold/10 px-1 rounded">BYOK</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[9px] text-muted text-center">
              Sub-agents are scoped to Kus AI only. This picker controls your general model.
            </p>
          </div>
        </>
      )}
    </div>
  );
}