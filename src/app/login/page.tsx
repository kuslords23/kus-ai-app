"use client";

import { useRouter } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-background px-4">
      <LoginForm onSuccess={() => router.push("/")} />
    </div>
  );
}
