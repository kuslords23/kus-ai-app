"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface AppleAccountSheetProps {
  open: boolean;
  onClose: () => void;
  /** The authenticated user profile to display. */
  userName?: string;
  userEmail?: string;
  musicProfile?: string;
}

/** Navigation item with chevron indicator. */
function NavItem({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-background/40 px-3 py-2.5 text-left transition-all hover:border-gold/30 hover:bg-surface/60 active:scale-[0.99]"
    >
      <span className="flex items-center gap-2.5">
        <span className="text-base">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
      </span>
      <svg
        className="h-4 w-4 text-muted/60"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5l7 7-7 7"
        />
      </svg>
    </button>
  );
}

/** Action button with icon and label. */
function ActionButton({
  icon,
  label,
  onClick,
  variant = "default",
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  variant?: "default" | "primary";
}) {
  const base =
    "flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 px-3 text-sm font-medium transition-all active:scale-[0.98]";
  const styles =
    variant === "primary"
      ? "border-gold/40 bg-gold/10 text-gold hover:bg-gold/15"
      : "border-border bg-background/40 text-foreground hover:border-gold/30 hover:text-gold";
  return (
    <button type="button" onClick={onClick} className={`${base} ${styles}`}>
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

/** Settings link with red accent typography. */
function SettingsLink({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-xs text-red-400/80 transition-colors hover:bg-red-500/10 hover:text-red-400"
    >
      <span className="text-sm">{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

export function AppleAccountSheet({
  open,
  onClose,
  userName = "Kus Lords",
  userEmail = "kuslords@example.com",
  musicProfile = "kuslords",
}: AppleAccountSheetProps) {
  const [mounted, setMounted] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Trap focus and handle escape key.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const content = (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Apple Account"
    >
      <div
        ref={sheetRef}
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-2xl sm:rounded-3xl"
        style={{ maxHeight: "92dvh" }}
      >
        {/* ── 1. Header ─────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-5 py-4">
          <p className="text-base font-semibold text-foreground">Apple Account</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Apple Account"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background/60 text-muted transition-all hover:border-gold/40 hover:text-gold hover:bg-surface"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* ── 2. Scrollable content ─────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Profile card */}
          <div className="flex items-center gap-4 rounded-2xl border border-border bg-background/50 p-4">
            {/* Avatar placeholder */}
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gold/15 border border-gold/30 text-lg font-bold text-gold">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{userName}</p>
              <p className="truncate text-xs text-muted">{userEmail}</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-soft/15 border border-purple-soft/30 px-2 py-0.5 text-[10px] font-medium text-purple-soft">
                  🎵 Music Profile
                </span>
                <span className="font-mono text-[10px] text-muted">
                  @{musicProfile}
                </span>
              </div>
            </div>
          </div>

          {/* Grouped navigation items */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted px-1">
              Account
            </p>
            <div className="space-y-1.5">
              <NavItem icon="📋" label="Subscription" onClick={() => {}} />
              <NavItem icon="🧾" label="Purchase History" onClick={() => {}} />
              <NavItem icon="🔔" label="Notifications" onClick={() => {}} />
              <NavItem icon="🔒" label="Privacy & Access" onClick={() => {}} />
            </div>
          </div>

          {/* Action banner */}
          <div className="rounded-2xl border border-border bg-background/30 p-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-base">
                🔄
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Transfer Music from Other Services</p>
                <p className="text-[11px] text-muted">
                  Import playlists from Spotify, YouTube, and more.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton icon="🎫" label="Redeem Code" variant="primary" onClick={() => {}} />
              <ActionButton icon="🎁" label="Send Gift Card" onClick={() => {}} />
            </div>
          </div>

          {/* Bottom settings links */}
          <div className="space-y-1 border-t border-border/60 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted px-1 mb-2">
              Settings
            </p>
            <SettingsLink icon="👨‍👩‍👧‍👦" label="Set Up Family" onClick={() => {}} />
            <SettingsLink icon="⚙️" label="Music Settings" onClick={() => {}} />
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-border/60 px-5 py-3 text-center">
          <p className="text-[10px] text-muted/60">
            Apple Account managed by Kus AI ·{" "}
            <button
              type="button"
              onClick={onClose}
              className="text-gold/80 underline hover:text-gold transition-colors"
            >
              Sign Out
            </button>
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}