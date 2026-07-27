"use client";

import { useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { Header } from "@/components/layout/Header";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { LoginForm } from "@/components/auth/LoginForm";
import { COMPANION_PERSONA } from "@/lib/companion/persona";

export default function Home() {
  const { user, loading, signOut } = useAuth();
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-dvh bg-background">
        <div className="w-12 h-12 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh bg-background px-4">
        <LoginForm />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh max-h-dvh overflow-hidden">
      <Header
        companionName={COMPANION_PERSONA.name}
        voiceEnabled={voiceEnabled}
        onToggleVoice={() => setVoiceEnabled((v) => !v)}
        onOpenHistory={() => {
          setShowSettings(false);
          setShowHistory(true);
        }}
        onOpenSettings={() => {
          setShowHistory(false);
          setShowSettings(true);
        }}
        onSignOut={signOut}
      />
      <main className="flex-1 min-h-0 overflow-hidden">
        <ChatPanel
          showHistory={showHistory}
          showSettings={showSettings}
          onClosePanels={() => {
            setShowHistory(false);
            setShowSettings(false);
          }}
          voiceEnabled={voiceEnabled}
          setVoiceEnabled={setVoiceEnabled}
        />
      </main>
    </div>
  );
}
