'use client';

import { useEffect } from "react";

// Keeps the screen awake for the length of a training session. Silently does
// nothing on browsers without the Wake Lock API.
export function useWakeLock(active) {
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !navigator.wakeLock) return;

    let lock = null;
    let cancelled = false;

    const acquire = async () => {
      if (lock || cancelled) return;
      try {
        lock = await navigator.wakeLock.request("screen");
        lock.addEventListener("release", () => { lock = null; });
      } catch(e) { lock = null; }
    };

    // The lock is dropped whenever the tab goes to the background.
    const onVisible = () => { if (document.visibilityState === "visible") acquire(); };

    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (lock) { try { lock.release(); } catch(e) {} }
    };
  }, [active]);
}
