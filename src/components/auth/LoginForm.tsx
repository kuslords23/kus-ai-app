"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/hooks/useAuth";
import { toast } from "sonner";
import { hubLoginUrl } from "@/lib/auth/hubBridge";
import { DemoAccountButton } from "@/components/auth/DemoAccountButton";

export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password);

    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else if (isSignUp) {
      toast.success("Check your email to confirm your account");
    } else {
      onSuccess?.();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-sm mx-auto px-6"
    >
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-full bg-gold/10 border-2 border-gold/30 flex items-center justify-center mx-auto mb-4 pulse-gold">
          <svg className="w-7 h-7 text-gold" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-foreground">Kus-lords AI</h1>
        <p className="text-sm text-muted mt-1">
          {isSignUp ? "Create your account" : "Sign in to the kingdom"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-foreground text-sm placeholder:text-muted outline-none focus:border-gold/50 transition-colors"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          minLength={6}
          className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-foreground text-sm placeholder:text-muted outline-none focus:border-gold/50 transition-colors"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-gold text-background font-medium text-sm hover:bg-gold-light transition-colors disabled:opacity-50"
        >
          {loading ? "Loading..." : isSignUp ? "Create Account" : "Sign In"}
        </button>
      </form>

      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] text-muted uppercase">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <button
          type="button"
          onClick={() => {
            window.location.href = hubLoginUrl();
          }}
          className="w-full py-3 rounded-xl border border-gold/40 text-gold text-sm font-medium hover:bg-gold/10 transition-colors"
        >
          Sign in via Hub
        </button>
        <DemoAccountButton onSuccess={onSuccess} />
        <p className="text-[10px] text-center text-muted leading-relaxed">
          Hub unlocks wallet, sports, and kingdom actions. A{" "}
          <strong className="text-gold">← Royal</strong> button on Hub brings you back here.
        </p>
      </div>

      <button
        onClick={() => setIsSignUp(!isSignUp)}
        className="w-full text-center text-xs text-muted mt-4 hover:text-gold transition-colors"
      >
        {isSignUp
          ? "Already have an account? Sign in"
          : "Need an account? Sign up"}
      </button>

      <p className="text-[10px] text-center text-muted mt-4 leading-relaxed">
        By continuing you agree to the{" "}
        <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-gold underline">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-gold underline">
          Privacy Policy
        </a>
        .
      </p>
    </motion.div>
  );
}
