"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { SettingsPanel } from "./SettingsPanel";
import { HomeCanvas } from "./HomeCanvas";
import { ChatThreadView } from "@/components/chat/ChatThread";
import { useAuth } from "@/lib/hooks/useAuth";
import { useThreads } from "@/lib/hooks/useThreads";
import { useVoiceInput } from "@/lib/hooks/useVoice";
import { loadSettings, saveSettings, applyTheme, type AppSettings } from "@/lib/settings";
import { getAgent } from "@/lib/agents/registry";
import type { ChatAttachment } from "@/lib/attachments/types";
import { useKeyboardInset } from "@/lib/hooks/useKeyboardInset";

type View = "home" | "thread";

export function GrokShell() {
  const { user, signOut } = useAuth();
  const {
    threads,
    activeThread,
    activeId,
    ready,
    setActive,
    newThread,
    deleteThread,
    updateThread,
    search,
    syncing,
    refreshFromCloud,
  } = useThreads(user?.id ?? null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [view, setView] = useState<View>("home");
  const [bootstrapQuery, setBootstrapQuery] = useState<string | null>(null);
  const [bootstrapAttachments, setBootstrapAttachments] = useState<ChatAttachment[] | null>(null);

  const ensureThread = useCallback(() => {
    if (activeThread) return activeThread;
    return newThread();
  }, [activeThread, newThread]);

  const handleSend = useCallback(
    (text: string, attachments?: ChatAttachment[]) => {
      const t = ensureThread();
      setActive(t.id);
      setBootstrapQuery(text);
      setBootstrapAttachments(attachments ?? null);
      setView("thread");
    },
    [ensureThread, setActive]
  );

  const voice = useVoiceInput(
    useCallback(
      (text: string) => {
        if (text.trim()) handleSend(text);
      },
      [handleSend]
    )
  );

  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    applyTheme(s.theme);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (activeThread && activeThread.messages.length > 0) {
      setView("thread");
    }
  }, [ready, activeThread]);

  const patchSettings = useCallback((patch: Partial<AppSettings>) => {
    const next = saveSettings(patch);
    setSettings(next);
    if (patch.theme !== undefined) {
      applyTheme(next.theme);
    }
  }, []);

  const handleAgentChange = useCallback(
    (id: string) => {
      patchSettings({ activeAgentId: id });
    },
    [patchSettings]
  );

  const activeAgent = getAgent(settings.activeAgentId);

  useKeyboardInset();

  const showHome =
    view === "home" && !bootstrapQuery && !activeThread?.messages.length;

  return (
    <div className="flex flex-col h-[100dvh] max-h-[100dvh] overflow-hidden bg-background supports-[height:100dvh]:h-dvh">
      <header className="shrink-0 flex items-center justify-between px-3 pt-[max(0.65rem,env(safe-area-inset-top))] pb-2 border-b border-border glass">
        <button
          onClick={() => setSidebarOpen(true)}
          className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted hover:text-gold"
          aria-label="Menu"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="text-center min-w-0 px-2">
          <p className="text-sm font-semibold">Royal</p>
          <p className="text-[10px] text-muted truncate">
            {activeThread?.title && view === "thread"
              ? activeThread.title
              : `${activeAgent.icon} ${activeAgent.name}`}
          </p>
        </div>

        <button
          onClick={() => {
            newThread();
            setBootstrapQuery(null);
            setBootstrapAttachments(null);
            setView("home");
          }}
          className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted hover:text-gold"
          aria-label="New chat"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden">
        {showHome ? (
          <HomeCanvas
            onSend={handleSend}
            onSpeak={voice.toggle}
            listening={voice.listening}
            voiceSupported={voice.supported}
            settings={settings}
            activeAgentId={settings.activeAgentId}
            onAgentChange={handleAgentChange}
          />
        ) : (
          <ChatThreadView
            key={`${activeThread?.id}-${bootstrapQuery ?? "idle"}`}
            thread={activeThread}
            onUpdate={updateThread}
            voiceReplies={settings.voiceReplies}
            showWelcome={!activeThread?.messages.length && !bootstrapQuery}
            bootstrapQuery={bootstrapQuery}
            bootstrapAttachments={bootstrapAttachments}
            onBootstrapConsumed={() => {
              setBootstrapQuery(null);
              setBootstrapAttachments(null);
            }}
            activeAgentId={settings.activeAgentId}
            onAgentChange={handleAgentChange}
            settings={settings}
          />
        )}
      </main>

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        threads={threads}
        activeId={activeId}
        user={user}
        onSelect={(id) => {
          setActive(id);
          const t = threads.find((x) => x.id === id);
          setBootstrapQuery(null);
          setBootstrapAttachments(null);
          setView(t && t.messages.length > 0 ? "thread" : "home");
        }}
        onNew={() => {
          newThread();
          setBootstrapQuery(null);
          setBootstrapAttachments(null);
          setView("home");
        }}
        onDelete={deleteThread}
        onOpenSettings={() => setSettingsOpen(true)}
        searchFn={search}
        syncing={syncing}
        onRefresh={refreshFromCloud}
      />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={patchSettings}
        onSignOut={signOut}
      />
    </div>
  );
}
