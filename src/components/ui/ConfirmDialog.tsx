"use client";

import { motion, AnimatePresence } from "framer-motion";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm glass border border-border rounded-2xl p-5 space-y-4"
          >
            <div>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="text-sm text-muted mt-1">{message}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${
                  danger
                    ? "bg-danger/20 border border-danger/40 text-danger"
                    : "bg-gold/15 border border-gold/30 text-gold"
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
