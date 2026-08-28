"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ChatThread } from "@/lib/threads/types";
import type { User } from "@supabase/supabase-js";
import { COMPANIONS } from "@/lib/companions/registry";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { HierarchicalModelSelector } from "@/components/models/HierarchicalModelSelector";
import { findModel, type HierarchicalSelection } from "@/lib/models/catalog";
import Link from "next/link";

/** Shared Royal model storage — same keys used by ChatThread so both stay in sync. */
const ROYAL_MODEL_KEY = "royal:model-choice";
const ROYAL_GEMINI_MODEL_KEY = "royal:gemini-model-id";
const ROYAL_MODEL_CHANGE_EVENT = "royal:model-change";
type RoyalModel = "royal" | "gemini" | "kusai";

function readRoyalModel(): { model: RoyalModel; geminiId: string } {
  if (typeof window === "undefined") return { model: "royal", geminiId: "google/gemini-2.5-flash" };
  try {
    const saved = localStorage.getItem(ROYAL_MODEL_KEY) as RoyalModel | null;
    const geminiId = localStorage.getItem(ROYAL_GEMINI_MODEL_KEY) || "google/gemini-2.5-flash";
    if (saved === "gemini" || saved === "kusai" || saved === "royal") return { model: saved, geminiId };
    return { model: "royal", geminiId };
  } catch {
    return { model: "royal", geminiId: "google/gemini-2.5-flash" };
  }
}

function writeRoyalModel(model: RoyalModel, geminiId: string) {
  try {
    localStorage.setItem(ROYAL_MODEL_KEY, model);
    localStorage.setItem(ROYAL_GEMINI_MODEL_KEY, geminiId);
  } catch {
    // ignore quota errors
  }
  /* Notify the active chat so its model selection stays in sync. */
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ROYAL_MODEL_CHANGE_EVENT, { detail: { model, geminiId } }));
  }
}

/** Map stored Royal model state to a HierarchicalSelection (Kus AI provider). */
function royalStateToSelection(state: { model: RoyalModel; geminiId: string }): HierarchicalSelection {
  if (state.model === "gemini") {
    const found = findModel(state.geminiId);
    return {
      provider: "google",
      providerLabel: "Google Gemini",
      model: state.geminiId,
      modelLabel: found?.model.label ?? state.geminiId,
      agent: "auto",
      agentName: "Auto",
    };
  }
  return {
    provider: "kusai",
    providerLabel: "Kus AI (Custom)",
    model: "kus-ai/royal",
    modelLabel: state.model === "kusai" ? "Kus AI" : "Kus AI · Royal",
    agent: "auto",
    agentName: "Auto",
  };
}

function selectionToRoyalModel(sel: HierarchicalSelection): { model: RoyalModel; geminiId: string } {
  if (sel.provider === "google") {
    return { model: "gemini", geminiId: sel.model };
  }
  return { model: sel.model === "kus-ai/royal" ? "kusai" : "royal", geminiId: sel.model };
}

function lastMessagePreview(thread: ChatThread) {
  const last = [...thread.messages].reverse().find((m) => m.content.trim());
  if (!last) return "No messages yet";
  const text = last.content.replace(/\s+/g, " ").trim();
  const prefix = last.role === "user" ? "You: " : "Royal: ";
  const body = text.length > 56 ? `${text.slice(0, 56)}…` : text;
  return `${prefix}${body}`;
}

function formatWhen(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  threads: ChatThread[];
  activeId: string | null;
  user: User | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void | Promise<void>;
  onOpenSettings: () => void;
  searchFn: (q: string) => ChatThread[];
  syncing?: boolean;
  onRefresh?: () => void;
}

export function Sidebar({
  open,
  onClose,
  threads,
  activeId,
  user,
  onSelect,
  onNew,
  onDelete,
  onOpenSettings,
  searchFn,
  syncing,
  onRefresh,
}: SidebarProps) {
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [companionsOpen, setCompanionsOpen] = useState(true);
  const [royalState, setRoyalState] = useState<{ model: RoyalModel; geminiId: string }>(() =>
    readRoyalModel()
  );
  const selection: HierarchicalSelection = useMemo(
    () => royalStateToSelection(royalState),
    [royalState]
  );

  // Keep sidebar model in sync if the user changes it elsewhere.
  useEffect(() => {
    const onChange = () => setRoyalState(readRoyalModel());
    window.addEventListener("storage", onChange);
    window.addEventListener(ROYAL_MODEL_CHANGE_EVENT as keyof WindowEventMap, onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener(ROYAL_MODEL_CHANGE_EVENT as keyof WindowEventMap, onChange);
    };
  }, []);

  const handleSelectionChange = (sel: HierarchicalSelection) => {
    const next = selectionToRoyalModel(sel);
    setRoyalState(next);
    writeRoyalModel(next.model, next.geminiId);
  };
  const filtered = useMemo(
    () => (query.trim() ? searchFn(query) : threads),
    [query, searchFn, threads]
  );

  const name =
    (user?.user_metadata?.full_name as string) ||
    (user?.user_metadata?.name as string) ||
    user?.email?.split("@")[0] ||
    "Guest";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed left-0 top-0 bottom-0 z-50 w-[min(88vw,320px)] glass border-r border-border flex flex-col pt-3"
          >
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center text-gold font-bold">
                  K
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{name}</p>
                  <p className="text-[10px] text-muted">Royal Assistant</p>
                </div>
              </div>
            </div>

            <div className="p-3 space-y-2">
              <button
                onClick={() => {
                  onNew();
                  onClose();
                }}
                className="w-full py-2.5 rounded-xl bg-gold/15 border border-gold/30 text-gold text-sm font-medium"
              >
                + New chat
              </button>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations…"
                className="w-full px-3 py-2 rounded-xl bg-background/60 border border-border text-sm outline-none focus:border-gold/40"
              />
            </div>

            <div className="px-3 pb-2 flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-muted">
                Conversations
              </p>
              {syncing ? (
                <span className="text-[10px] text-gold">Syncing…</span>
              ) : onRefresh ? (
                <button
                  onClick={onRefresh}
                  className="text-[10px] text-muted hover:text-gold"
                >
                  Refresh
                </button>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto px-2 space-y-1">
              {filtered.map((t) => (
                <div
                  key={t.id}
                  className={`group flex items-center gap-1 rounded-xl ${
                    activeId === t.id ? "bg-gold/10 border border-gold/25" : ""
                  }`}
                >
                  <button
                    onClick={() => {
                      onSelect(t.id);
                      onClose();
                    }}
                    className="flex-1 text-left px-3 py-2.5 min-w-0"
                  >
                    <p className="text-sm truncate">{t.title}</p>
                    <p className="text-[10px] text-muted truncate">
                      {lastMessagePreview(t)}
                    </p>
                    <p className="text-[10px] text-muted/70">{formatWhen(t.updatedAt)}</p>
                  </button>
                  <button
                    onClick={() => setPendingDelete(t.id)}
                    className="shrink-0 px-2.5 py-2 text-muted hover:text-danger text-sm sm:opacity-60 sm:group-hover:opacity-100"
                    aria-label={`Delete ${t.title}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="text-xs text-muted px-3 py-4">
                  {query.trim()
                    ? "No matching conversations"
                    : "No chats yet — start one from the home screen"}
                </p>
              )}
            </div>

            <div className="p-3 border-t border-border space-y-1 overflow-y-auto">
              <button
                type="button"
                onClick={() => setCompanionsOpen((v) => !v)}
                className="flex w-full items-center justify-between px-1 py-1"
              >
                <p className="text-[10px] uppercase tracking-wider text-muted">
                  Companions
                </p>
                <span className={`text-xs text-muted transition-transform ${companionsOpen ? "rotate-90" : ""}`}>
                  ›
                </span>
              </button>

              {companionsOpen && (
                <div className="space-y-1">
                  <Link
                    href="/jyinx"
                    onClick={onClose}
                    className="flex items-center justify-between rounded-lg border border-gold/25 bg-gold/10 px-3 py-2 text-sm text-gold hover:bg-gold/15"
                  >
                    <span>Jyinx Studio</span>
                    <span className="text-xs">↗</span>
                  </Link>
                  <Link
                    href="/jyinx/notebooks"
                    onClick={onClose}
                    className="flex items-center justify-between rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-400 hover:bg-amber-500/15"
                  >
                    <span>📓 Notebooks</span>
                    <span className="text-xs">Notes, files, plans</span>
                  </Link>
                  <Link
                    href="/jyinx/peer-chat"
                    onClick={onClose}
                    className="flex items-center justify-between rounded-lg border border-blue-500/25 bg-blue-500/10 px-3 py-2 text-sm text-blue-400 hover:bg-blue-500/15"
                  >
                    <span>Peer-to-Peer Chat</span>
                    <span className="text-xs">👥</span>
                  </Link>
                  <Link
                    href="/jyinx/code-library"
                    onClick={onClose}
                    className="flex items-center justify-between rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-500/15"
                  >
                    <span>Code Library</span>
                    <span className="text-xs">📦</span>
                  </Link>
                  <Link
                    href="/jyinx/marketplace"
                    onClick={onClose}
                    className="flex items-center justify-between rounded-lg border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-sm text-violet-300 hover:bg-violet-500/15"
                  >
                    <span>Marketplace</span>
                    <span className="text-xs">🏪</span>
                  </Link>
                  {COMPANIONS.map((c) => (
                    <a
                      key={c.id}
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-muted hover:text-gold hover:bg-gold/5"
                    >
                      <span>{c.shortName}</span>
                      {c.status === "planned" && (
                        <span className="text-[9px] uppercase text-muted/70">Soon</span>
                      )}
                    </a>
                  ))}
                </div>
              )}

              <div className="mt-2 pt-2 border-t border-border space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted px-1">
                  Royal model
                </p>
                <div className="px-1">
                  <HierarchicalModelSelector
                    value={selection}
                    onChange={handleSelectionChange}
                  />
                </div>
              </div>

              <button
                onClick={() => {
                  onOpenSettings();
                  onClose();
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-muted hover:text-gold hover:bg-gold/5"
              >
                Settings
              </button>
            </div>
          </motion.aside>
          <ConfirmDialog
            open={!!pendingDelete}
            title="Delete conversation?"
            message="This removes the chat from this device and the cloud. This cannot be undone."
            confirmLabel="Delete"
            danger
            onCancel={() => setPendingDelete(null)}
            onConfirm={() => {
              if (pendingDelete) void onDelete(pendingDelete);
              setPendingDelete(null);
            }}
          />
        </>
      )}
    </AnimatePresence>
  );
}
