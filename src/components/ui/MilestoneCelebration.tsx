"use client";

/**
 * Milestone Celebration & Gamified Onboarding.
 *
 * Step-by-step workspace setup progress tracker with micro-animations and
 * positive reinforcement when users hit key targets (cleared task states,
 * finished deployments, first commit, etc.).
 */

import { useEffect, useMemo, useState } from "react";

export interface Milestone {
  id: string;
  label: string;
  hint?: string;
  done: boolean;
}

interface MilestoneCelebrationProps {
  title?: string;
  milestones: Milestone[];
  /** Drives completion heuristics (e.g. tasks cleared). */
  progress?: number;
  /** Optional confetti trigger on crossing 100%. */
  onComplete?: () => void;
  compact?: boolean;
}

const CONFETTI_CLASSES = [
  "confetti-a", "confetti-b", "confetti-c", "confetti-d",
  "confetti-e", "confetti-f", "confetti-g", "confetti-h",
];

export function MilestoneCelebration({
  title,
  milestones,
  progress,
  onComplete,
  compact = false,
}: MilestoneCelebrationProps) {
  const [celebrate, setCelebrate] = useState(false);
  const [prevDone, setPrevDone] = useState(0);

  const doneCount = useMemo(
    () => milestones.filter((m) => m.done).length,
    [milestones]
  );

  const pct = Math.max(
    0,
    Math.min(100, Math.round(((progress ?? doneCount) / Math.max(1, milestones.length)) * 100))
  );

  // Fire celebration when a milestone crosses 100% or when a step just completed.
  useEffect(() => {
    if ((pct >= 100 || doneCount > prevDone) && doneCount > 0) {
      setCelebrate(true);
      const t = setTimeout(() => setCelebrate(false), 2000);
      onComplete?.();
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneCount, pct]);

  useEffect(() => {
    setPrevDone(doneCount);
  }, [doneCount]);

  return (
    <div className="relative overflow-hidden">
      {celebrate && (
        <div className="pointer-events-none absolute inset-0 z-10">
          {CONFETTI_CLASSES.map((c) => (
            <span key={c} className={c} />
          ))}
        </div>
      )}

      <div
        className={`rounded-2xl border ${
          pct >= 100
            ? "border-gold/50 bg-gold/10"
            : "border-border bg-background/40"
        } p-4 transition-colors duration-500`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold">
              {pct >= 100 ? "🎉" : ""} {pct >= 100 ? "All set!" : title ?? "Workspace setup"}
            </p>
            <p className="text-[10px] text-muted mt-0.5">
              {doneCount} / {milestones.length} milestones complete
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold text-gold">{pct}%</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 rounded-full bg-background/60 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-gold/70 to-gold rounded-full transition-all duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Steps */}
        <div className={`mt-3 space-y-1.5 ${compact ? "" : ""}`}>
          {milestones.map((m) => (
            <MilestoneRow key={m.id} milestone={m} compact={compact} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MilestoneRow({ milestone, compact }: { milestone: Milestone; compact: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-2 ${
        milestone.done ? "bg-emerald-500/10" : "bg-background/30"
      } transition-colors ${compact ? "py-1" : "py-1.5"}`}
    >
      <div
        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 text-[8px] transition-all ${
          milestone.done
            ? "bg-emerald-500 border-emerald-500 text-black"
            : "border-border text-transparent"
        }`}
      >
        ✓
      </div>
      <div className="min-w-0 flex-1">
        <p className={`${compact ? "text-[11px]" : "text-xs"} truncate`}>{milestone.label}</p>
        {milestone.hint && !milestone.done && (
          <p className="text-[9px] text-muted truncate">{milestone.hint}</p>
        )}
      </div>
      {milestone.done && (
        <span className="text-[9px] text-emerald-400 shrink-0">Done</span>
      )}
    </div>
  );
}