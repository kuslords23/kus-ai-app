"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  loadRoyalMemory,
  type RoyalMemory,
  type DecisionEntry,
} from "@/lib/memory/royalMemory";

interface MemoryPanelProps {
  userId: string | undefined;
  memoryDecay: "balanced" | "keep-all" | "minimal";
  onPinTopic: (topic: string) => void;
  onFadeTopic: (topic: string) => void;
  onMarkRegret: (pattern: string) => void;
}

export function MemoryPanel({
  userId,
  memoryDecay,
  onPinTopic,
  onFadeTopic,
  onMarkRegret,
}: MemoryPanelProps) {
  const [memory, setMemory] = useState<RoyalMemory | null>(null);
  const [regretInput, setRegretInput] = useState("");

  useEffect(() => {
    if (userId) setMemory(loadRoyalMemory(userId));
  }, [userId]);

  if (!userId || !memory) return null;

  const decisions = memory.decisions.slice(0, 6);

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <p className="text-sm font-medium text-gold">Royal memory</p>
      <p className="text-[11px] text-muted">
        Decay: <span className="capitalize">{memoryDecay}</span> — pinned topics stay forever.
      </p>

      {memory.pinnedTopics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {memory.pinnedTopics.map((t) => (
            <span
              key={t}
              className="text-[10px] px-2 py-0.5 rounded-full border border-gold/30 text-gold"
            >
              📌 {t}
            </span>
          ))}
        </div>
      )}

      {decisions.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted">
            Decision journal
          </p>
          {decisions.map((d: DecisionEntry) => (
            <div
              key={d.id}
              className="text-xs px-2 py-1.5 rounded-lg bg-surface/60 border border-border"
            >
              <p className="font-medium">{d.title}</p>
              <p className="text-muted truncate">{d.summary}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={regretInput}
          onChange={(e) => setRegretInput(e.target.value)}
          placeholder="Pattern to avoid…"
          className="flex-1 px-2 py-1.5 rounded-lg bg-background/60 border border-border text-xs"
        />
        <button
          type="button"
          onClick={() => {
            if (regretInput.trim()) {
              onMarkRegret(regretInput.trim());
              setRegretInput("");
              setMemory(loadRoyalMemory(userId));
            }
          }}
          className="px-2 py-1.5 rounded-lg border border-border text-xs hover:border-gold/40"
        >
          Avoid
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            const t = prompt("Pin a topic to keep forever:");
            if (t) {
              onPinTopic(t);
              setMemory(loadRoyalMemory(userId));
            }
          }}
          className="text-[10px] px-2 py-1 rounded-full border border-border"
        >
          Pin topic
        </button>
        <button
          type="button"
          onClick={() => {
            const t = prompt("Let this topic fade:");
            if (t) {
              onFadeTopic(t);
              setMemory(loadRoyalMemory(userId));
            }
          }}
          className="text-[10px] px-2 py-1 rounded-full border border-border"
        >
          Fade topic
        </button>
      </div>
    </div>
  );
}
