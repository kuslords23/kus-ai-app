"use client";

import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { COMPANIONS } from "@/lib/companions/registry";
import { AGENTS } from "@/lib/agents/registry";
import type { ChatAttachment } from "@/lib/attachments/types";
import { fileToAttachment } from "@/lib/attachments/types";

interface AttachmentMenuProps {
  open: boolean;
  onClose: () => void;
  onAttachments: (files: ChatAttachment[]) => void;
  onSelectAgent?: (agentId: string) => void;
  onSelectCompanion?: (url: string) => void;
}

export function AttachmentMenu({
  open,
  onClose,
  onAttachments,
  onSelectAgent,
  onSelectCompanion,
}: AttachmentMenuProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const out: ChatAttachment[] = [];
    for (const file of Array.from(list).slice(0, 4)) {
      out.push(await fileToAttachment(file));
    }
    onAttachments(out);
    onClose();
  };

  const items = [
    {
      label: "Camera",
      icon: "📷",
      action: () => cameraRef.current?.click(),
    },
    {
      label: "Photos",
      icon: "🖼",
      action: () => photosRef.current?.click(),
    },
    {
      label: "Files",
      icon: "📎",
      action: () => filesRef.current?.click(),
    },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            className="fixed bottom-28 left-4 right-4 z-50 max-w-md mx-auto glass border border-border rounded-3xl p-4 shadow-2xl"
          >
            <div className="grid grid-cols-3 gap-3 mb-4">
              {items.map((item) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-surface-hover transition-colors"
                >
                  <span className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center text-xl">
                    {item.icon}
                  </span>
                  <span className="text-xs text-foreground">{item.label}</span>
                </button>
              ))}
            </div>

            <p className="text-[10px] uppercase tracking-wider text-muted mb-2 px-1">
              Connectors
            </p>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
              {COMPANIONS.filter((c) => c.status === "active").map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onSelectCompanion?.(c.url);
                    onClose();
                  }}
                  className="shrink-0 px-3 py-2 rounded-xl border border-border bg-surface/60 text-xs hover:border-gold/40"
                >
                  {c.shortName}
                </button>
              ))}
            </div>

            <p className="text-[10px] uppercase tracking-wider text-muted mb-2 px-1">
              Skills / Agents
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
              {AGENTS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    onSelectAgent?.(a.id);
                    onClose();
                  }}
                  className="text-left px-3 py-2 rounded-xl border border-border hover:border-gold/40 text-xs"
                >
                  <span className="mr-1">{a.icon}</span>
                  {a.name}
                </button>
              ))}
            </div>

            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <input
              ref={photosRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <input
              ref={filesRef}
              type="file"
              accept="*/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
