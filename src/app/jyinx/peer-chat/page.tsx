import type { Metadata } from "next";
import Link from "next/link";
import { NexusChatBridge } from "@/components/social/NexusChatBridge";

export const metadata: Metadata = {
  title: "Peer-to-Peer Chat | Jyinx",
  description: "Real-time community chat with Sports Clan Nexus integration.",
};

export default function PeerChatPage() {
  return (
    <div className="flex h-screen bg-background">
      <div className="flex flex-1 flex-col">
        <header className="shrink-0 border-b border-border bg-background/90 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/jyinx"
              className="shrink-0 rounded-lg border border-gold/30 bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/15"
            >
              ← Back
            </Link>
            <div>
              <h1 className="text-sm font-semibold">Peer-to-Peer Chat</h1>
              <p className="text-[10px] text-muted">Real-time community chat with Sports Clan Nexus</p>
            </div>
          </div>
        </header>
        <div className="flex-1">
          <NexusChatBridge />
        </div>
      </div>
    </div>
  );
}