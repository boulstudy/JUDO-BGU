'use client';

// Service worker registration and the "add to home screen" prompt.
//
// Two different install stories, because the platforms genuinely differ:
// Chrome/Edge/Android fire `beforeinstallprompt` and can be triggered
// programmatically; iOS Safari fires nothing and has no programmatic install
// — the only path there is Share → Add to Home Screen, so that case gets
// static instructions instead of a button.

import { useState, useEffect, useCallback } from "react";

export function useServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // Registering after load, not before, so it never competes with the
    // first paint for bandwidth or main-thread time.
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };
    if (document.readyState === "complete") onLoad();
    else { window.addEventListener("load", onLoad); return () => window.removeEventListener("load", onLoad); }
  }, []);
}

const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true);

/**
 * @returns {{ installed, platform: "android"|"ios"|"other", canPrompt, promptInstall }}
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    const onPrompt = e => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome === "accepted";
  }, [deferred]);

  return {
    installed,
    platform: isIOS() ? "ios" : "other",
    canPrompt: !!deferred,
    promptInstall,
  };
}
