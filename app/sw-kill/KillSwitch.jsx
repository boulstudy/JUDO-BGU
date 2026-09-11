'use client';

// Emergency recovery: unregisters every service worker for this origin and
// clears every cache this app created. Reached by URL directly
// (judo-bgu.vercel.app/sw-kill) — deliberately not linked from inside the app,
// because the one time this matters is exactly when the app itself might be
// stuck on a broken cached version and unable to show its own UI.

import { useState, useCallback } from "react";

export default function KillSwitch() {
  const [status, setStatus] = useState("idle");
  const [log, setLog] = useState([]);

  const push = line => setLog(l => [...l, line]);

  const run = useCallback(async () => {
    setStatus("running");
    setLog([]);
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        push(`נמצאו ${regs.length} service workers`);
        for (const r of regs) { await r.unregister(); push("בוטל: " + r.scope); }
      }
      if ("caches" in window) {
        const names = await caches.keys();
        push(`נמצאו ${names.length} caches`);
        for (const n of names) { await caches.delete(n); push("נמחק: " + n); }
      }
      try {
        Object.keys(window.localStorage).filter(k => k.startsWith("judo.")).forEach(k => window.localStorage.removeItem(k));
        push("נוקה אחסון מקומי של האפליקציה");
      } catch (e) {}
      push("הושלם. אפשר לחזור לאפליקציה.");
      setStatus("done");
    } catch (e) {
      push("שגיאה: " + (e && e.message));
      setStatus("error");
    }
  }, []);

  return (
    <div style={{
      minHeight: "100vh", background: "#080a10", color: "#f2f4f8",
      direction: "rtl", fontFamily: "Heebo,system-ui,sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "40px 20px", gap: 18,
    }}>
      <div style={{ fontSize: 40 }}>🛠️</div>
      <div style={{ fontSize: 22, fontWeight: 900, textAlign: "center" }}>איפוס אפליקציה</div>
      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 14.5, lineHeight: 1.7, maxWidth: 380, textAlign: "center" }}>
        זה מבטל את כל ה-service workers ומנקה את המטמון של האפליקציה — לשימוש
        רק אם המסך תקוע על גרסה ישנה או שבורה. לא מוחק אימונים או מערכים
        שכבר נשמרו לענן.
      </div>
      <button onClick={run} disabled={status === "running"} style={{
        background: "linear-gradient(135deg,#FF6B00,#cc4400)", border: "none",
        color: "#fff", borderRadius: 12, padding: "14px 32px", fontSize: 16,
        fontWeight: 800, cursor: status === "running" ? "default" : "pointer",
        fontFamily: "Heebo,sans-serif", opacity: status === "running" ? 0.6 : 1,
      }}>{status === "running" ? "מנקה…" : "אפס עכשיו"}</button>

      {log.length > 0 && (
        <div style={{
          width: "100%", maxWidth: 420, background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
          padding: "12px 14px", fontFamily: "ui-monospace,monospace", fontSize: 12.5,
          color: "rgba(255,255,255,0.6)", direction: "ltr", textAlign: "left",
        }}>
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      {status === "done" && (
        <a href="/" style={{
          color: "#FF6B00", fontFamily: "Heebo,sans-serif", fontSize: 15,
          textDecoration: "none", fontWeight: 700,
        }}>← חזרה לאפליקציה</a>
      )}
    </div>
  );
}
