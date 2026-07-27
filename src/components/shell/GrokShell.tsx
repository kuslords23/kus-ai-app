"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { HubBridgeFab } from "@/components/hub/HubBridgeFab";
import { useVisualViewport } from "@/lib/hooks/useVisualViewport";

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
  const pendingThreadRef = useRef<import("@/lib/threads/types").ChatThread | null>(null);

  const ensureThread = useCallback(() => {
    if (activeThread) return activeThread;
    const t = newThread();
    pendingThreadRef.current = t;
    return t;
  }, [activeThread, newThread]);

  const chatThread = useMemo(() => {
    if (activeThread) {
      if (pendingThreadRef.current?.id === activeThread.id) {
        pendingThreadRef.current = null;
      }
      return activeThread;
    }
    return pendingThreadRef.current;
  }, [activeThread]);

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
    if (activeThread?.messages.length) {
      setView("thread");
    }
  }, [ready, activeThread?.id, activeThread?.messages.length]);

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

  useVisualViewport();

  const showHome =
    view === "home" && !bootstrapQuery && !chatThread?.messages.length;

  return (
    <div className="app-shell">
      <header className="app-header flex items-center justify-between px-3 pb-2 border-b border-border glass">
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
            key={chatThread?.id ?? "no-thread"}
            thread={chatThread}
            onUpdate={updateThread}
            voiceReplies={settings.voiceReplies}
            showWelcome={
              !bootstrapQuery && !chatThread?.messages.length && view === "thread"
            }
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
        userId={user?.id}
      />

      <HubBridgeFab />
    </div>
  );
}
