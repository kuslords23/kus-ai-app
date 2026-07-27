"use client";

import { useAuth } from "@/lib/hooks/useAuth";
import { Header } from "@/components/layout/Header";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { LoginForm } from "@/components/auth/LoginForm";
import { FloatingAIBubble } from "@/components/ai/FloatingAIBubble";

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="w-12 h-12 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <LoginForm />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header />
      <main className="flex-1 overflow-hidden">
        <ChatPanel />
      </main>
      <FloatingAIBubble />
    </div>
  );
}
