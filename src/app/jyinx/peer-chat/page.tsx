import type { Metadata } from "next";
import { NexusChatBridge } from "@/components/social/NexusChatBridge";

export const metadata: Metadata = {
  title: "Peer-to-Peer Chat | Jyinx",
  description: "Real-time community chat with Sports Clan Nexus integration.",
};

export default function PeerChatPage() {
  return (
    <div className="flex h-screen bg-background">
      <NexusChatBridge />
    </div>
  );
}