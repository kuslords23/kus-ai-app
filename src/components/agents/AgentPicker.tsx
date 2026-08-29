"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AGENTS, getAgent } from "@/lib/agents/registry";

interface AgentPickerProps {
  open: boolean;
  onClose: () => void;
  activeId: string;
  onSelect: (id: string) => void;
}

export function AgentPicker({
  open,
  onClose,
  activeId,
  onSelect,
}: AgentPickerProps) {
  const active = getAgent(activeId);

  // Split agents into groups for visual clarity
  const royalAgents = AGENTS.filter((a) =>
    ["auto", "royal-advisor", "sports-expert", "creative-helper", "market-guide", "support-tech", "fast"].includes(a.id)
  );
  const workshopModes = AGENTS.filter((a) =>
    ["plan", "ask", "learn", "research", "build"].includes(a.id)
  );

  const renderAgent = (a: (typeof AGENTS)[0]) => (
    <button
      key={a.id}
      onClick={() => {
        onSelect(a.id);
        onClose();
      }}
      className={`w-full text-left px-3 py-3 rounded-xl border transition-colors ${
        a.id === activeId
          ? "border-gold bg-gold/10"
          : "border-transparent hover:bg-surface-hover"
      }`}
    >
      <div className="flex items-center gap-2">
        <span>{a.icon}</span>
        <div>
          <p className="text-sm font-medium">{a.name}</p>
          <p className="text-[11px] text-muted">{a.tagline}</p>
        </div>
        {a.id === activeId && (
          <span className="ml-auto text-gold text-xs">✓</span>
        )}
      </div>
    </button>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 30 }}
            animate={{ y: 0 }}
            exit={{ y: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm glass border border-border rounded-3xl p-4 max-h-[80vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Kus AI Agents</h3>
              <span className="text-xs text-muted">{active.icon} {active.name}</span>
            </div>

            {royalAgents.length > 0 && (
              <>
                <p className="px-1 pb-1 text-[10px] uppercase tracking-wider text-muted">Royal Agents</p>
                <div className="space-y-1 mb-4">{royalAgents.map(renderAgent)}</div>
              </>
            )}

            {workshopModes.length > 0 && (
              <>
                <p className="px-1 pb-1 text-[10px] uppercase tracking-wider text-muted border-t border-border pt-3 mt-1">Workshop Modes</p>
                <div className="space-y-1">{workshopModes.map(renderAgent)}</div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
