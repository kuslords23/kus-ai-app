"use client";

import type { ChatAttachment } from "@/lib/attachments/types";

/**
 * Inline attachment chips shown inside a Jyinx composer before sending, with a
 * remove affordance per file.
 */
export function AttachmentChips({
  attachments,
  onRemove,
}: {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 border-t border-border/60 px-1 pt-2">
      {attachments.map((attachment) => (
        <span
          key={attachment.id}
          className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-gold/25 bg-gold/5 py-1 pl-1.5 pr-1 text-[11px] text-foreground"
        >
          {attachment.kind === "image" && attachment.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={attachment.previewUrl}
              alt={attachment.name}
              className="h-6 w-6 shrink-0 rounded-md object-cover"
            />
          ) : (
            <span className="shrink-0 text-xs">{attachment.kind === "video" ? "🎬" : attachment.kind === "image" ? "🖼" : "📄"}</span>
          )}
          <span className="max-w-[10rem] truncate">{attachment.name}</span>
          <button
            type="button"
            onClick={() => onRemove(attachment.id)}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted hover:bg-border/60 hover:text-foreground"
            aria-label={`Remove ${attachment.name}`}
          >
            ✕
          </button>
        </span>
      ))}
    </div>
  );
}

/** Paperclip-style attach button for the composer. */
export function AttachButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Attach files"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-border/50 hover:text-gold disabled:opacity-40"
    >
      <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
      </svg>
    </button>
  );
}