"use client";

import { useState } from "react";
import { AppleAccountSheet, useAppleAccountSheet } from "@/components/music/AppleAccountSheet";

interface MusicAppLayoutProps {
  children: React.ReactNode;
  userName?: string;
  userEmail?: string;
  musicProfile?: string;
}

/**
 * Music app layout wrapper that provides the Apple Account sheet context
 * and a trigger button for opening the sheet. Wrap your music app pages
 * with this component to get the Apple Account modal integration.
 */
export function MusicAppLayout({
  children,
  userName = "Kus Lords",
  userEmail = "kuslords@example.com",
  musicProfile = "kuslords",
}: MusicAppLayoutProps) {
  const { sheetOpen, openSheet, closeSheet } = useAppleAccountSheet();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Example header trigger — replace with your actual music nav */}
      <header className="flex items-center justify-between border-b border-border bg-surface/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/15 text-gold font-bold">
            🎵
          </div>
          <div>
            <p className="text-sm font-semibold">Kus Music</p>
            <p className="text-[10px] text-muted">Streaming</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Apple Account trigger */}
          <button
            type="button"
            onClick={openSheet}
            className="flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-muted transition-all hover:border-gold/40 hover:text-gold"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gold/15 text-[10px] font-bold text-gold">
              {userName.charAt(0).toUpperCase()}
            </div>
            <span className="hidden sm:block">Account</span>
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main content area */}
      <main className="px-4 py-4">{children}</main>

      {/* Apple Account modal sheet */}
      <AppleAccountSheet
        open={sheetOpen}
        onClose={closeSheet}
        userName={userName}
        userEmail={userEmail}
        musicProfile={musicProfile}
      />
    </div>
  );
}