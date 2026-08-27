"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/hooks/useAuth";

/**
 * DemoAccountButton — provisions and signs into a sandbox reviewer account.
 * Only active when NEXT_PUBLIC_DEMO_MODE="true" (store review builds).
 */
export function DemoAccountButton({ onSuccess }: { onSuccess?: () => void }) {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [enabled] = useState(() => process.env.NEXT_PUBLIC_DEMO_MODE === "true");

  if (!enabled) return null;

  const handleDemo = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/demo/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Demo provisioning failed");

      const { error } = await signIn(data.email, data.password);
      if (error) throw error;

      toast.success("Signed into demo sandbox", {
        description: "Pre-loaded Jyinx workspace and code vault are ready.",
      });
      onSuccess?.();
    } catch (e) {
      toast.error("Demo login failed", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDemo}
      disabled={loading}
      className="w-full py-3 rounded-xl border border-gold/40 bg-gold/5 text-gold text-sm font-medium hover:bg-gold/10 transition-colors disabled:opacity-50"
    >
      {loading ? "Provisioning sandbox..." : "Open Demo Sandbox (Reviewer)"}
    </button>
  );
}