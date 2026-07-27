"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChatInput } from "@/components/chat/ChatInput";
import { SuggestionChips } from "@/components/chat/SuggestionChips";
import { AttachmentMenu } from "@/components/attachments/AttachmentMenu";
import { AgentPicker } from "@/components/agents/AgentPicker";
import { getSuggestionChips } from "@/lib/rag/chips";
import { buildUserContext } from "@/lib/rag/userContext";
import { useAuth } from "@/lib/hooks/useAuth";
import type { AppSettings } from "@/lib/settings";
import { getAgent } from "@/lib/agents/registry";
import type { ChatAttachment } from "@/lib/attachments/types";

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
  const userContext = useMemo(() => buildUserContext(user), [user]);
  const chips = useMemo(() => getSuggestionChips(userContext), [userContext]);
  const agent = getAgent(activeAgentId);

  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);

  const handleSend = (text: string) => {
    onSend(text, attachments.length ? attachments : undefined);
    setAttachments([]);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-6">
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-20 h-20 rounded-3xl bg-gradient-to-br from-gold/25 to-purple/30 border border-gold/35 flex items-center justify-center pulse-gold"
        >
          <span className="text-3xl font-bold text-gold">K</span>
        </motion.div>

        <div className="text-center space-y-2 max-w-sm">
          <h1 className="text-xl font-semibold">Kus AI</h1>
          <p className="text-sm text-muted">
            Royal advisor for the whole kingdom — same soul as hub, Grok-style home.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap justify-center">
          <button
            type="button"
            onClick={() => setAgentPickerOpen(true)}
            className="px-3 py-1 rounded-full text-[11px] border border-gold/35 bg-gold/10 text-gold"
          >
            {agent.icon} {agent.name}
          </button>
          <span className="px-3 py-1 rounded-full text-[11px] border border-border bg-surface/60 text-muted capitalize">
            {settings.mode}
          </span>
          {settings.voiceModeDefault && (
            <span className="px-3 py-1 rounded-full text-[11px] border border-purple/40 bg-purple/10 text-purple-soft">
              Voice
            </span>
          )}
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
          placeholder="Ask anything…"
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
