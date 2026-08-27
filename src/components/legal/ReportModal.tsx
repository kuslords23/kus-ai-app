"use client";

import { useState } from "react";

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  messageId?: string;
  chatId?: string;
  snippet?: string;
}

const REASONS = [
  { value: "harmful_content", label: "Harmful content" },
  { value: "hate_speech", label: "Hate speech" },
  { value: "harassment", label: "Harassment" },
  { value: "spam", label: "Spam" },
  { value: "misinformation", label: "Misinformation" },
  { value: "violence", label: "Violent content" },
  { value: "sexual_content", label: "Sexual content" },
  { value: "self_harm", label: "Self-harm" },
  { value: "illegal", label: "Illegal activity" },
  { value: "copyright", label: "Copyright violation" },
  { value: "other", label: "Other" },
];

export function ReportModal({ open, onClose, messageId, chatId, snippet }: ReportModalProps) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/legal/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: messageId ?? undefined,
          chatId: chatId ?? undefined,
          reason,
          details: details || undefined,
          flaggedContent: snippet ?? "Reported content from chat interface",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit report");
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-background p-5 shadow-2xl animate-in fade-in zoom-in-95">
        {done ? (
          <div className="text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="h-6 w-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium">Report submitted</p>
            <p className="text-xs text-muted">Thank you. Our team will review this content.</p>
            <button onClick={onClose} className="mt-2 w-full rounded-xl bg-gold/15 border border-gold/30 py-2 text-xs font-medium text-gold">
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Report Content</h2>
              <button onClick={onClose} className="rounded-lg p-1 text-muted hover:text-foreground">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-xs text-muted mb-3">Select the reason this content should be flagged for review.</p>

            <div className="space-y-2 mb-3">
              <label className="text-[11px] font-medium text-muted uppercase tracking-wide">Reason</label>
              <div className="grid grid-cols-2 gap-1.5">
                {REASONS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setReason(r.value)}
                    className={`rounded-lg px-2 py-1.5 text-[11px] text-left border transition-colors ${
                      reason === r.value
                        ? "border-gold/50 bg-gold/15 text-gold"
                        : "border-border bg-background/50 text-muted hover:border-muted"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <label className="text-[11px] font-medium text-muted uppercase tracking-wide">Additional details (optional)</label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Add any context..."
                className="w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-xs resize-none h-20 focus:outline-none focus:border-gold/50"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 mb-3">{error}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={!reason || submitting}
              className="w-full rounded-xl bg-gold py-2 text-xs font-semibold text-black disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Submit Report"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}