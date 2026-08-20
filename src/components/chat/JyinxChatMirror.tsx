"use client";

/**
 * Lean, Text-and-Code-Focused Chat Mirror.
 *
 * A lightweight chat interface mirroring the core layout of the Sports Clan
 * Nexus messaging system, stripped of heavy audio/video calling. Optimized for
 * text discussions, code-sharing, and prompt engineering. Connects directly to
 * the shared Nexus chat backend (real-time), using the shared auth context.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { NEXUS_CHAT_TABLE } from "@/server/chat/nexusBridge";

interface MirrorMessage {
  id: string;
  room: string;
  userId: string;
  displayName: string;
  content: string;
  codeSnippet?: CodeShare | null;
  createdAt: string;
  isOwn: boolean;
}

interface CodeShare {
  language?: string;
  code: string;
  filename?: string;
}

const ROOMS = [
  { id: "general", label: "General", icon: "💬" },
  { id: "frontend", label: "Frontend", icon: "🎨" },
  { id: "backend", label: "Backend", icon: "⚙️" },
  { id: "ai-agents", label: "AI / Agents", icon: "🤖" },
  { id: "code-vault", label: "Code Vault", icon: "📦" },
];

export function JyinxChatMirror({
  activeRoom = "general",
}: {
  activeRoom?: string;
}) {
  const [messages, setMessages] = useState<MirrorMessage[]>([]);
  const [input, setInput] = useState("");
  const [room, setRoom] = useState(activeRoom);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("Guest");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeShare, setActiveShare] = useState<CodeShare | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const client = createClient();
    client.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setUserId(data.session.user.id);
        setDisplayName(
          data.session.user.user_metadata?.display_name ??
          data.session.user.email?.split("@")[0] ??
          `User-${data.session.user.id.slice(0, 8)}`
        );
      }
      setLoading(false);
    });
  }, []);

  // Realtime subscription (shared with Nexus).
  useEffect(() => {
    if (!userId) return;
    const client = createClient();
    const channel = client
      .channel(`nexus-chat-${room}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: NEXUS_CHAT_TABLE, filter: `room=eq.${room}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const msg = mapRow(row, room, userId);
          setMessages((prev) => [...prev, msg]);
          scrollToBottom();
        }
      )
      .subscribe();

    return () => { client.removeChannel(channel); };
  }, [room, userId]);

  // Initial load.
  useEffect(() => {
    if (!userId) return;
    const client = createClient();
    client
      .from(NEXUS_CHAT_TABLE)
      .select("*")
      .eq("room", room)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setMessages((data ?? []).reverse().map((row) => mapRow(row as Record<string, unknown>, room, userId)));
        scrollToBottom();
      });
  }, [room, userId]);

  function scrollToBottom() {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
  }

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || !userId || sending) return;
    setSending(true);
    try {
      const client = createClient();
      const payload: Record<string, unknown> = {
        room,
        user_id: userId,
        display_name: displayName,
        content: trimmed,
        created_at: new Date().toISOString(),
        platform: "jyinx",
      };
      if (activeShare) payload.code_snippet = JSON.stringify(activeShare);

      const { error } = await client.from(NEXUS_CHAT_TABLE).insert(payload);
      if (error) {
        toast.error("Failed to send message.");
        return;
      }
      setInput("");
      setActiveShare(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Send failed.");
    } finally {
      setSending(false);
    }
  }, [input, userId, sending, room, displayName, activeShare]);

  // Expose a global helper so OnlineCodeSearch can push snippets in.
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__jyinxChatMirror = {
      sendCode: (code: string, meta?: { language?: string; filename?: string }) => {
        setActiveShare({ code, language: meta?.language, filename: meta?.filename });
      },
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__jyinxChatMirror;
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Room tabs */}
      <div className="shrink-0 flex gap-0.5 px-2 py-1.5 overflow-x-auto border-b border-border">
        {ROOMS.map((r) => (
          <button
            key={r.id}
            onClick={() => setRoom(r.id)}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] transition-colors ${
              room === r.id
                ? "bg-gold/15 text-gold border border-gold/30"
                : "text-muted border border-transparent hover:border-border"
            }`}
          >
            {r.icon} {r.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {loading && <div className="py-8 text-center text-xs text-muted">Connecting…</div>}
        {!loading && messages.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-2xl">💬</p>
            <p className="text-xs text-muted mt-1">No messages in #{room} yet.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2 ${msg.isOwn ? "flex-row-reverse" : ""}`}>
            <div className="w-6 h-6 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-[11px] shrink-0">
              {msg.displayName.charAt(0).toUpperCase()}
            </div>
            <div className={`max-w-[75%] ${msg.isOwn ? "items-end" : ""}`}>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-medium">{msg.displayName}</span>
                <span className="text-[9px] text-muted">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="text-xs mt-0.5 break-words whitespace-pre-wrap">{msg.content}</p>
              {msg.codeSnippet && (
                <div className="mt-1.5 rounded-xl border border-gold/25 bg-gold/5 p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-medium text-gold">
                      📎 {msg.codeSnippet.filename ?? "code snippet"}
                    </span>
                    <span className="text-[9px] text-muted bg-background/40 px-1.5 py-0.5 rounded">
                      {msg.codeSnippet.language ?? "text"}
                    </span>
                  </div>
                  <pre className="text-[10px] bg-black/30 rounded-lg p-2 overflow-x-auto max-h-24">
                    <code>{msg.codeSnippet.code.slice(0, 400)}</code>
                  </pre>
                  <button
                    onClick={() => navigator.clipboard?.writeText(msg.codeSnippet!.code)}
                    className="mt-1.5 w-full text-[10px] text-gold border border-gold/30 rounded-lg py-1 hover:bg-gold/10 transition-colors"
                  >
                    Copy code
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Active share indicator */}
      {activeShare && (
        <div className="shrink-0 mx-3 mb-1 rounded-lg border border-gold/30 bg-gold/10 px-2.5 py-1.5 flex items-center justify-between">
          <span className="text-[10px] text-gold truncate">
            📎 {activeShare.filename ?? "Snippet"} · {activeShare.language ?? "text"}
          </span>
          <button onClick={() => setActiveShare(null)} className="text-[10px] text-muted hover:text-danger ml-2">✕</button>
        </div>
      )}

      {/* Composer */}
      <div className="shrink-0 border-t border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder={`Message #${room}…`}
            disabled={!userId}
            className="flex-1 text-xs px-3 py-2 rounded-xl bg-background/60 border border-border outline-none focus:border-gold/40 transition-colors disabled:opacity-40"
          />
          <button
            onClick={() => void send()}
            disabled={!input.trim() || sending || !userId}
            className="shrink-0 w-8 h-8 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-xs text-gold disabled:opacity-30 transition-opacity"
            aria-label="Send"
          >
            {sending ? "…" : "↑"}
          </button>
        </div>
      </div>
    </div>
  );
}

function mapRow(row: Record<string, unknown>, room: string, currentUserId: string): MirrorMessage {
  return {
    id: String(row.id ?? `${Date.now()}-${Math.random()}`),
    room: String(row.room ?? room),
    userId: String(row.user_id ?? ""),
    displayName: String(row.display_name ?? "Unknown"),
    content: String(row.content ?? ""),
    codeSnippet: parseShare(row.code_snippet as string | undefined),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    isOwn: String(row.user_id ?? "") === currentUserId,
  };
}

function parseShare(raw: string | undefined): CodeShare | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.code === "string") {
      return { code: parsed.code, language: parsed.language, filename: parsed.filename };
    }
  } catch {
    /* ignore */
  }
  return null;
}