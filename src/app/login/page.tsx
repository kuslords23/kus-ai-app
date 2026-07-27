"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "auth_failed") {
      toast.error("Sign-in failed", {
        description: "Please try again or use Sign in via Hub.",
      });
    }
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-background px-4">
      <LoginForm onSuccess={() => router.push("/")} />
    </div>
  );
}
