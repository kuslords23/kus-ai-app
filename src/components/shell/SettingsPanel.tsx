"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AppSettings } from "@/lib/settings";
import { AGENTS } from "@/lib/agents/registry";
import { MemoryPanel } from "@/components/memory/MemoryPanel";
import { ConnectorsHub } from "@/components/settings/ConnectorsHub";
import { BillingModal } from "@/components/settings/BillingModal";
import { ReportModal } from "@/components/legal/ReportModal";
import { DeleteAccountModal } from "@/components/legal/DeleteAccountModal";
import {
  addRegrettedAction,
  fadeTopic,
  loadRoyalMemory,
  pinTopic,
} from "@/lib/memory/royalMemory";
import { useAuth } from "@/lib/hooks/useAuth";

import { usePushNotifications } from "@/lib/push/client";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onSignOut: () => void;
  userId?: string;
}

export function SettingsPanel({
  open,
  onClose,
  settings,
  onChange,
  onSignOut,
  userId,
}: SettingsPanelProps) {
  const { user } = useAuth();
  const [showConnectors, setShowConnectors] = useState(false);
  const [showBilling, setShowBilling] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const { toggle: togglePush } = usePushNotifications(
    settings.pushNotifications,
    userId ?? user?.id,
    (enabled) => onChange({ pushNotifications: enabled })
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md glass border border-border rounded-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
          >
            <h2 className="text-lg font-semibold text-gold">Royal settings</h2>

            <button
              onClick={() => setShowBilling(true)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-border bg-background/40 text-sm hover:border-gold/40 transition-colors"
            >
              <span className="flex items-center gap-2">💳 Credits &amp; Billing</span>
              <span className="text-[11px] text-muted">Balance &amp; top-up</span>
            </button>

            <button
              onClick={() => setShowConnectors((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-border bg-background/40 text-sm hover:border-gold/40 transition-colors"
            >
              <span className="flex items-center gap-2">🔌 Connectors &amp; Workspace</span>
              <span className={`text-[11px] ${showConnectors ? "text-gold" : "text-muted"}`}>{showConnectors ? "Hide" : "Manage"}</span>
            </button>

            {showConnectors ? (
              <ConnectorsHub onClose={() => setShowConnectors(false)} />
            ) : (
              <>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Open app in voice mode</span>
              <input
                type="checkbox"
                checked={settings.voiceModeDefault}
                onChange={(e) =>
                  onChange({ voiceModeDefault: e.target.checked })
                }
                className="accent-[var(--gold)] w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Speak replies (TTS)</span>
              <input
                type="checkbox"
                checked={settings.voiceReplies}
                onChange={(e) => onChange({ voiceReplies: e.target.checked })}
                className="accent-[var(--gold)] w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Silent mode</span>
              <input
                type="checkbox"
                checked={settings.silentMode}
                onChange={(e) => onChange({ silentMode: e.target.checked })}
                className="accent-[var(--gold)] w-4 h-4"
              />
            </label>
            <p className="text-[10px] text-muted -mt-2">
              Only speaks when you may be stuck or about to make a mistake.
            </p>

            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Help improve Royal</span>
              <input
                type="checkbox"
                checked={settings.contributeToLearning}
                onChange={(e) =>
                  onChange({ contributeToLearning: e.target.checked })
                }
                className="accent-[var(--gold)] w-4 h-4"
              />
            </label>
            <p className="text-[10px] text-muted -mt-2">
              Share anonymous learning signals (missed answers, corrections) with the kingdom training plane.
            </p>

            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Push notifications</span>
              <input
                type="checkbox"
                checked={settings.pushNotifications}
                onChange={() => void togglePush()}
                className="accent-[var(--gold)] w-4 h-4"
              />
            </label>
            <p className="text-[10px] text-muted -mt-2">
              Daily briefings and important Royal alerts.
            </p>

            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Daily briefings</span>
              <input
                type="checkbox"
                checked={settings.dailyBriefings}
                onChange={(e) => onChange({ dailyBriefings: e.target.checked })}
                className="accent-[var(--gold)] w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Skill shadowing</span>
              <input
                type="checkbox"
                checked={settings.skillShadowing}
                onChange={(e) => onChange({ skillShadowing: e.target.checked })}
                className="accent-[var(--gold)] w-4 h-4"
              />
            </label>

            <div className="space-y-2">
              <p className="text-sm">Energy matching</p>
              <div className="flex gap-2 flex-wrap">
                {(["auto", "low", "medium", "high"] as const).map((e) => (
                  <button
                    key={e}
                    onClick={() => onChange({ energyLevel: e })}
                    className={`px-3 py-1.5 rounded-full text-xs border capitalize ${
                      settings.energyLevel === e
                        ? "border-gold bg-gold/15 text-gold"
                        : "border-border text-muted"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm">Memory decay</p>
              <div className="flex gap-2 flex-wrap">
                {(["balanced", "keep-all", "minimal"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => onChange({ memoryDecay: m })}
                    className={`px-3 py-1.5 rounded-full text-xs border capitalize ${
                      settings.memoryDecay === m
                        ? "border-gold bg-gold/15 text-gold"
                        : "border-border text-muted"
                    }`}
                  >
                    {m.replace("-", " ")}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm">Creative constraints</p>
              <input
                value={settings.creativeConstraints}
                onChange={(e) =>
                  onChange({ creativeConstraints: e.target.value })
                }
                placeholder="e.g. under 100 words, Ghanaian tone, no betting"
                className="w-full px-3 py-2 rounded-xl bg-background/60 border border-border text-xs"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm">Appearance</p>
              <div className="flex gap-2 flex-wrap">
                {(["dark", "light", "system"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => onChange({ theme: t })}
                    className={`px-3 py-1.5 rounded-full text-xs border capitalize ${
                      settings.theme === t
                        ? "border-gold bg-gold/15 text-gold"
                        : "border-border text-muted"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm">Default agent</p>
              <div className="flex gap-2 flex-wrap">
                {AGENTS.slice(0, 4).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => onChange({ activeAgentId: a.id })}
                    className={`px-3 py-1.5 rounded-full text-xs border ${
                      settings.activeAgentId === a.id
                        ? "border-gold bg-gold/15 text-gold"
                        : "border-border text-muted"
                    }`}
                  >
                    {a.icon} {a.name}
                  </button>
                ))}
              </div>
            </div>

            <MemoryPanel
              userId={user?.id}
              memoryDecay={settings.memoryDecay}
              onPinTopic={(t) => {
                if (user?.id) pinTopic(loadRoyalMemory(user.id), t);
              }}
              onFadeTopic={(t) => {
                if (user?.id) fadeTopic(loadRoyalMemory(user.id), t);
              }}
              onMarkRegret={(p) => {
                if (user?.id) addRegrettedAction(loadRoyalMemory(user.id), p);
              }}
            />

            <p className="text-xs text-muted leading-relaxed">
              Royal uses the hub RAG brain with long-term memory, action confirmation,
              and cross-app chat sync via Supabase.
            </p>

            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-[10px] font-medium text-muted uppercase tracking-wide">Legal &amp; Safety</p>
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-background/40 text-xs text-muted hover:border-gold/40 hover:text-foreground transition-colors"
              >
                <span>Privacy Policy</span>
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-background/40 text-xs text-muted hover:border-gold/40 hover:text-foreground transition-colors"
              >
                <span>Terms of Service</span>
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
              <button
                onClick={() => setShowReport(true)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-background/40 text-xs text-muted hover:border-gold/40 hover:text-foreground transition-colors"
              >
                <span>Report Content</span>
                <span className="text-[10px] text-muted">Flag unsafe AI output</span>
              </button>
              <button
                onClick={() => setShowDelete(true)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-red-500/20 bg-red-500/5 text-xs text-red-400 hover:border-red-500/40 transition-colors"
              >
                <span>Delete Account &amp; Data</span>
                <span className="text-[10px]">Irreversible</span>
              </button>
            </div>

            <button
              onClick={onSignOut}
              className="w-full py-2.5 rounded-xl border border-danger/40 text-danger text-sm"
            >
              Sign out
            </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}

      <BillingModal open={showBilling} onClose={() => setShowBilling(false)} />
      <ReportModal open={showReport} onClose={() => setShowReport(false)} />
      <DeleteAccountModal open={showDelete} onClose={() => setShowDelete(false)} />
    </AnimatePresence>
  );
}
