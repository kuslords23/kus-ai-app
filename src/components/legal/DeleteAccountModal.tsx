"use client";

import { useState } from "react";

interface DeleteAccountModalProps {
  open: boolean;
  onClose: () => void;
}

export function DeleteAccountModal({ open, onClose }: DeleteAccountModalProps) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string[] | null>(null);

  if (!open) return null;

  const handleDelete = async () => {
    if (confirmText !== "DELETE_MY_ACCOUNT") return;
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch("/api/legal/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE_MY_ACCOUNT" }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Deletion failed");

      setResult(data.details ?? []);
      setStep(2);

      // Sign out and redirect to home after a brief pause
      setTimeout(() => {
        window.location.href = "/";
      }, 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const reset = () => {
    setStep(0);
    setConfirmText("");
    setError(null);
    setResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="relative w-full max-w-sm rounded-2xl border border-red-500/30 bg-background p-5 shadow-2xl">
        {step === 2 ? (
          // Step 2: Done
          <div className="text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="h-6 w-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium">Account Deleted</p>
            <p className="text-xs text-muted">All your data has been permanently purged.</p>
            {result && (
              <div className="bg-background/50 rounded-lg p-2 text-left">
                {result.map((r, i) => (
                  <p key={i} className="text-[10px] text-muted">✓ {r}</p>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted">Redirecting...</p>
          </div>
        ) : step === 1 ? (
          // Step 1: Confirm
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-red-400">Delete Account</h2>
              <button onClick={reset} className="rounded-lg p-1 text-muted hover:text-foreground">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
              <p className="text-xs text-red-300 font-medium mb-1">This action is irreversible.</p>
              <p className="text-[11px] text-red-300/70">
                Your account, chat history, code vault files, connector credentials, token ledger, and all associated data will be permanently deleted within 7 days.
              </p>
            </div>

            <p className="text-xs text-muted mb-3">
              Type <code className="bg-background/50 px-1 rounded text-red-300">DELETE_MY_ACCOUNT</code> to confirm:
            </p>

            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE_MY_ACCOUNT"
              className="w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-xs mb-4 focus:outline-none focus:border-red-500/50"
            />

            {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

            <div className="flex gap-2">
              <button onClick={() => setStep(0)} className="flex-1 rounded-xl border border-border py-2 text-xs text-muted">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={confirmText !== "DELETE_MY_ACCOUNT" || deleting}
                className="flex-1 rounded-xl bg-red-600 py-2 text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? "Deleting..." : "Delete Forever"}
              </button>
            </div>
          </>
        ) : (
          // Step 0: Warning
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Delete Account</h2>
              <button onClick={reset} className="rounded-lg p-1 text-muted hover:text-foreground">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
              <p className="text-xs text-red-300 font-medium mb-1">Warning: This permanently deletes:</p>
              <ul className="text-[11px] text-red-300/70 space-y-1 list-disc pl-4">
                <li>Your account and authentication data</li>
                <li>All chat history (Royal + Jyinx)</li>
                <li>Code vault files and repository clones</li>
                <li>Connector credentials (GitHub, Vercel, etc.)</li>
                <li>Token ledger and usage logs</li>
              </ul>
            </div>

            <p className="text-xs text-muted mb-4">
              This action cannot be undone. Your data will be purged within 7 days. You may want to export your data first.
            </p>

            <div className="flex gap-2">
              <button onClick={reset} className="flex-1 rounded-xl border border-border py-2 text-xs text-muted">
                Cancel
              </button>
              <button onClick={() => setStep(1)} className="flex-1 rounded-xl bg-red-600/80 py-2 text-xs font-semibold text-white">
                Continue
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}