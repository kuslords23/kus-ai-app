"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChatInput } from "@/components/chat/ChatInput";
import { SuggestionChips } from "@/components/chat/SuggestionChips";
import { AttachmentMenu } from "@/components/attachments/AttachmentMenu";
import { AgentPicker } from "@/components/agents/AgentPicker";
import { getSuggestionChips } from "@/lib/rag/chips";
import { buildFullRagContext } from "@/lib/rag/userContext";
import { useAuth } from "@/lib/hooks/useAuth";
import type { AppSettings } from "@/lib/settings";
import { getAgent, resolveAgentForRag } from "@/lib/agents/registry";
import type { ChatAttachment } from "@/lib/attachments/types";
import {
  loadRoyalMemory,
  shouldShowDailyBriefing,
} from "@/lib/memory/royalMemory";
import { fetchDailyBriefing } from "@/lib/briefings/daily";

interface HomeCanvasProps {
  onSend: (text: string, attachments?: ChatAttachment[]) => void;
  onSpeak: () => void;
  listening?: boolean;
  voiceSupported?: boolean;
  settings: AppSettings;
  disabled?: boolean;
  activeAgentId: string;
  onAgentChange: (id: string) => void;
}

export function HomeCanvas({
  onSend,
  onSpeak,
  listening,
  voiceSupported,
  settings,
  disabled,
  activeAgentId,
  onAgentChange,
}: HomeCanvasProps) {
  const { user } = useAuth();
  const userContext = useMemo(
    () =>
      buildFullRagContext({
        user,
        settings,
        agent: resolveAgentForRag(activeAgentId),
      }),
    [user, settings, activeAgentId]
  );
  const chips = useMemo(() => getSuggestionChips(userContext), [userContext]);
  const agent = getAgent(activeAgentId);

  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);

  useEffect(() => {
    if (!user?.id || !settings.dailyBriefings) return;
    const memory = loadRoyalMemory(user.id);
    if (!shouldShowDailyBriefing(memory, true)) return;

    let cancelled = false;
    setBriefingLoading(true);
    fetchDailyBriefing(user.id, memory).then((text) => {
      if (!cancelled) {
        setBriefing(text);
        setBriefingLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, settings.dailyBriefings]);

  const handleSend = (text: string) => {
    onSend(text, attachments.length ? attachments : undefined);
    setAttachments([]);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-5 overflow-y-auto">
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-20 h-20 rounded-3xl bg-gradient-to-br from-gold/25 to-purple/30 border border-gold/35 flex items-center justify-center pulse-gold"
        >
          <span className="text-3xl font-bold text-gold">👑</span>
        </motion.div>

        <div className="text-center space-y-2 max-w-sm">
          <h1 className="text-xl font-semibold">Royal</h1>
          <p className="text-sm text-muted">
            Your Kus-lords companion — actions, memory, voice, and the whole kingdom.
          </p>
        </div>

        {(briefingLoading || briefing) && settings.dailyBriefings && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm glass border border-gold/25 rounded-2xl p-3 text-left"
          >
            <p className="text-[10px] uppercase tracking-wider text-gold mb-1">
              Daily briefing
            </p>
            <p className="text-xs text-foreground leading-relaxed">
              {briefingLoading ? "Preparing your briefing…" : briefing}
            </p>
            {briefing && !briefingLoading && (
              <button
                type="button"
                onClick={() => onSend("Expand on my daily briefing")}
                className="mt-2 text-[11px] text-gold"
              >
                Tell me more →
              </button>
            )}
          </motion.div>
        )}

        <div className="flex gap-2 flex-wrap justify-center">
          <button
            type="button"
            onClick={() => setAgentPickerOpen(true)}
            className="px-3 py-1 rounded-full text-[11px] border border-gold/35 bg-gold/10 text-gold"
          >
            {agent.icon} {agent.name}
          </button>
          {settings.silentMode && (
            <span className="px-3 py-1 rounded-full text-[11px] border border-border text-muted">
              Silent
            </span>
          )}
          <span className="px-3 py-1 rounded-full text-[11px] border border-border bg-surface/60 text-muted capitalize">
            {settings.energyLevel === "auto" ? "Energy: auto" : `Energy: ${settings.energyLevel}`}
          </span>
        </div>

        <SuggestionChips
          chips={chips.slice(0, 6)}
          onSelect={(c) => onSend(c.prompt || c.label)}
        />
      </div>

      <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
        {voiceSupported && (
          <div className="flex justify-center">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onSpeak}
              className={`px-6 py-2.5 rounded-full text-sm font-medium border ${
                listening
                  ? "bg-danger/20 border-danger/40 text-danger"
                  : "bg-foreground text-background border-foreground"
              }`}
            >
              {listening ? "Listening…" : "Speak"}
            </motion.button>
          </div>
        )}

        <ChatInput
          large
          onSend={handleSend}
          disabled={disabled}
          placeholder="Ask Royal anything…"
          voiceSupported={voiceSupported}
          listening={listening}
          onToggleListen={onSpeak}
          attachments={attachments}
          onRemoveAttachment={(id) =>
            setAttachments((prev) => prev.filter((a) => a.id !== id))
          }
          onOpenAttachMenu={() => setAttachMenuOpen(true)}
          activeAgent={{ icon: agent.icon, name: agent.name }}
          onAgentClick={() => setAgentPickerOpen(true)}
        />
      </div>

      <AttachmentMenu
        open={attachMenuOpen}
        onClose={() => setAttachMenuOpen(false)}
        onAttachments={(files) =>
          setAttachments((prev) => [...prev, ...files].slice(0, 4))
        }
        onSelectAgent={(id) => onAgentChange(id)}
        onSelectCompanion={(url) => window.open(url, "_blank")}
      />

      <AgentPicker
        open={agentPickerOpen}
        onClose={() => setAgentPickerOpen(false)}
        activeId={activeAgentId}
        onSelect={onAgentChange}
      />
    </div>
  );
}
