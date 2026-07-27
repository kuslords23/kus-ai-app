"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ChatThread } from "@/lib/threads/types";
import type { User } from "@supabase/supabase-js";

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
  onDelete: (id: string) => void;
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
            className="fixed left-0 top-0 bottom-0 z-50 w-[min(88vw,320px)] glass border-r border-border flex flex-col pt-[max(0.75rem,env(safe-area-inset-top))]"
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
                    <p className="text-[10px] text-muted">{formatWhen(t.updatedAt)}</p>
                  </button>
                  <button
                    onClick={() => onDelete(t.id)}
                    className="opacity-0 group-hover:opacity-100 px-2 text-muted hover:text-danger text-xs"
                    aria-label="Delete"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="text-xs text-muted px-3 py-4">No chats yet</p>
              )}
            </div>

            <div className="p-3 border-t border-border space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted px-1 mb-1">
                Companions
              </p>
              <a
                href={
                  process.env.NEXT_PUBLIC_SPORTS_COMPANION_URL ||
                  "https://kus-sports.vercel.app"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="block px-3 py-2 rounded-lg text-sm text-muted hover:text-gold hover:bg-gold/5"
              >
                Sports
              </a>
              <a
                href={
                  process.env.NEXT_PUBLIC_HUB_URL ||
                  "https://sport-clan-nexus.vercel.app"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="block px-3 py-2 rounded-lg text-sm text-muted hover:text-gold hover:bg-gold/5"
              >
                Hub
              </a>
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
        </>
      )}
    </AnimatePresence>
  );
}
