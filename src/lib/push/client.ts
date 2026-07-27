"use client";

import { useCallback, useEffect } from "react";
import { notifyError } from "@/lib/errors/notify";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export async function subscribeToPush(userId: string): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    notifyError("Push not supported on this device");
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    notifyError("Notification permission denied");
    return false;
  }

  const keyRes = await fetch("/api/push/vapid-public-key");
  const { publicKey } = await keyRes.json();
  if (!publicKey) {
    notifyError("Push not configured yet");
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, subscription: subscription.toJSON() }),
  });

  if (!res.ok) {
    notifyError("Could not save push subscription");
    return false;
  }

  return true;
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
  } catch {
    // ignore
  }
}

export function usePushNotifications(
  enabled: boolean,
  userId: string | undefined,
  onChange: (enabled: boolean) => void
) {
  const toggle = useCallback(async () => {
    if (!userId) {
      notifyError("Sign in to enable notifications");
      return;
    }
    if (enabled) {
      await unsubscribeFromPush(userId);
      onChange(false);
      return;
    }
    const ok = await subscribeToPush(userId);
    if (ok) onChange(true);
  }, [enabled, onChange, userId]);

  useEffect(() => {
    if (!enabled || !userId) return;
    void subscribeToPush(userId);
  }, [enabled, userId]);

  return { toggle };
}
