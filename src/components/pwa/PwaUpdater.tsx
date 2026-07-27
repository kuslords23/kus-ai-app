"use client";

import { useEffect } from "react";

/**
 * Registers the service worker and applies new deployments automatically.
 * Checks for updates on load, focus, and every minute while the app is open.
 */
export function PwaUpdater() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let reloading = false;

    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );

    const activateWaitingWorker = (registration: ServiceWorkerRegistration) => {
      const waiting = registration.waiting;
      if (waiting && navigator.serviceWorker.controller) {
        waiting.postMessage({ type: "SKIP_WAITING" });
      }
    };

    const watchForUpdates = (registration: ServiceWorkerRegistration) => {
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;

        worker.addEventListener("statechange", () => {
          if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            worker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    };

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });

        watchForUpdates(registration);
        activateWaitingWorker(registration);
        await registration.update();
      } catch (error) {
        console.warn("Service worker registration failed", error);
      }
    };

    void register();

    const checkForUpdates = () => {
      void navigator.serviceWorker.ready.then((registration) =>
        registration.update()
      );
    };

    const interval = window.setInterval(checkForUpdates, 60_000);
    const onFocus = () => checkForUpdates();
    const onVisible = () => {
      if (document.visibilityState === "visible") checkForUpdates();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
    };
  }, []);

  return null;
}
