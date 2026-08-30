"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface ThoughtStep {
  icon: string;
  label: string;
  detail?: string;
  status: "pending" | "active" | "done";
}

/**
 * ExpandableThoughtProcess — a collapsible "thought process" section that shows
 * the AI's reasoning steps: thinking, reading, searching, editing, committing.
 * Each step can be clicked to expand and see the full scope/detail.
 */
export function ExpandableThoughtProcess({
  steps,
  className = "",
  defaultExpanded = true,
}: {
  steps: ThoughtStep[];
  className?: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  if (steps.length === 0) return null;

  const activeSteps = steps.filter((s) => s.status !== "pending");
  if (activeSteps.length === 0) return null;

  const summary = activeSteps
    .filter((s) => s.status === "active" || s.status === "done")
    .map((s) => s.icon)
    .join(" ");

  return (
    <div className={`rounded-xl border border-gold/20 bg-gold/[0.03] overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-[11px] text-muted hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold/60 animate-pulse" />
          <span>Thought process</span>
        </span>
        <span className="ml-1 text-[10px] text-gold/60">{summary}</span>
        <span className="ml-auto transition-transform duration-200" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
          ▾
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border/50"
          >
            <div className="space-y-0.5 p-2">
              {steps.map((step, i) => (
                <div key={i}>
                  <button
                    type="button"
                    onClick={() => setExpandedStep(expandedStep === i ? null : i)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-surface/80"
                  >
                    <span className="shrink-0 text-xs">
                      {step.status === "done" ? "✅" : step.status === "active" ? "⏳" : "○"}
                    </span>
                    <span className="shrink-0">{step.icon}</span>
                    <span className={step.status === "active" ? "text-gold font-medium" : "text-muted"}>
                      {step.label}
                    </span>
                    {step.detail && (
                      <span className="ml-auto text-[10px] text-muted/60 transition-transform" style={{ transform: expandedStep === i ? "rotate(180deg)" : "rotate(0deg)" }}>
                        ▾
                      </span>
                    )}
                  </button>
                  <AnimatePresence>
                    {step.detail && expandedStep === i && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
                        <pre className="ml-8 mt-1 mb-1 mr-2 whitespace-pre-wrap rounded-lg bg-background/60 p-2 text-[10px] leading-relaxed text-muted border border-border/40">
                          {step.detail}
                        </pre>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}