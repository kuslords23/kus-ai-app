"use client";

import { useState, useCallback } from "react";

export type ExecutionMode = "kus-code-1.0" | "kus-code-2.0" | "kus-ai-3.0";

const MODE_LABELS: Record<ExecutionMode, { label: string; description: string; color: string }> = {
  "kus-code-1.0": { label: "Kus Code 1.0", description: "Fast, lightweight multi-agent", color: "border-blue-500/40 text-blue-400" },
  "kus-code-2.0": { label: "Kus Code 2.0", description: "15-agent expert pipeline", color: "border-gold/40 text-gold" },
  "kus-ai-3.0": { label: "Kus AI 3.0", description: "Full 10-layer orchestration", color: "border-emerald-500/40 text-emerald-400" },
};

interface ModeSwitcherProps {
  currentMode: ExecutionMode;
  onModeChange: (mode: ExecutionMode) => void;
  className?: string;
}

export function ModeSwitcher({ currentMode, onModeChange, className = "" }: ModeSwitcherProps) {
  return (
    <div className={"flex items-center gap-1 px-2 " + className}>
      {(Object.keys(MODE_LABELS) as ExecutionMode[]).map((mode) => {
        const info = MODE_LABELS[mode];
        const isActive = mode === currentMode;
        return (
          <button
            key={mode}
            onClick={() => onModeChange(mode)}
            className={
              "px-2 py-1 text-[10px] rounded-lg border transition-all " +
              (isActive ? info.color + " bg-background/80" : "border-transparent text-muted hover:border-border")
            }
            title={info.description}
          >
            {info.label}
          </button>
        );
      })}
    </div>
  );
}

// Singleton state for cross-component access
export const MODE_QUERY_PARAM = "execution_mode";

let _globalMode: ExecutionMode = "kus-code-1.0";
const _modeListeners: Array<(mode: ExecutionMode) => void> = [];

export function getGlobalMode(): ExecutionMode {
  return _globalMode;
}

export function setGlobalMode(mode: ExecutionMode): void {
  _globalMode = mode;
  _modeListeners.forEach((l) => l(mode));
}

export function useGlobalMode(): [ExecutionMode, (mode: ExecutionMode) => void] {
  const [mode, setMode] = useState<ExecutionMode>(_globalMode);

  const setter = useCallback((m: ExecutionMode) => {
    setMode(m);
    setGlobalMode(m);
  }, []);

  useState(() => {
    _modeListeners.push(setMode);
    return () => {
      const idx = _modeListeners.indexOf(setMode);
      if (idx >= 0) _modeListeners.splice(idx, 1);
    };
  });

  return [mode, setter];
}
