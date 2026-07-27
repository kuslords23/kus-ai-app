"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { AppSettings } from "@/lib/settings";
import { AGENTS } from "@/lib/agents/registry";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onSignOut: () => void;
}

export function SettingsPanel({
  open,
  onClose,
  settings,
  onChange,
  onSignOut,
}: SettingsPanelProps) {
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
            <h2 className="text-lg font-semibold text-gold">Settings</h2>

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
              <p className="text-sm">Mode</p>
              <div className="flex gap-2">
                {(["royal", "fast"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => onChange({ mode: m })}
                    className={`px-3 py-1.5 rounded-full text-xs border capitalize ${
                      settings.mode === m
                        ? "border-gold bg-gold/15 text-gold"
                        : "border-border text-muted"
                    }`}
                  >
                    {m}
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

            <p className="text-xs text-muted leading-relaxed">
              Conversations sync to your account via Supabase — same credentials as
              Hub. Chats appear on both Kus AI and Hub when signed in.
            </p>

            <p className="text-xs text-muted leading-relaxed">
              Same hub assistant brain — answers from hub RAG + internet. Sign-in
              stays in this app. Never redirects to Hub for auth.
            </p>

            <button
              onClick={onSignOut}
              className="w-full py-2.5 rounded-xl border border-danger/40 text-danger text-sm"
            >
              Sign out
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
