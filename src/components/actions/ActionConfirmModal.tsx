"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { PendingAction } from "@/lib/actions/executor";

interface ActionConfirmModalProps {
  pending: PendingAction | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ActionConfirmModal({
  pending,
  onConfirm,
  onCancel,
}: ActionConfirmModalProps) {
  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            className="w-full max-w-sm glass border border-border rounded-3xl p-5 space-y-4"
          >
            <h3 className="text-lg font-semibold text-gold">{pending.title}</h3>
            <p className="text-sm text-foreground">{pending.summary}</p>
            {pending.risk === "high" && (
              <p className="text-xs text-danger">
                This involves money or account changes. Please confirm carefully.
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={onCancel}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 py-2.5 rounded-xl bg-gold text-background text-sm font-medium"
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
