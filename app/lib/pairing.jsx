'use client';

// The TV's side of pairing. The TV owns the code and shows it; the phone only
// ever types it (or opens a link that carries it). Nothing is typed on the TV.

import { useState, useEffect } from "react";
import { Toggle } from "./ui";

const ORANGE = "#FF6B00";

function useOrigin() {
  const [origin, setOrigin] = useState("");
  useEffect(() => { try { setOrigin(window.location.host); } catch(e) {} }, []);
  return origin;
}

function Steps({ host, big }) {
  const fs = big ? "calc(var(--u,1vh) * 3.2)" : 15;
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: big ? "calc(var(--u,1vh) * 1.4)" : 8, color: "#dfe4ee", fontSize: fs, lineHeight: 1.5, textAlign: "start" }}>
      <li>1. בנייד פותחים <b style={{ color: "#6ec6ff", direction: "ltr", unicodeBidi: "embed" }}>{host}/remote</b></li>
      <li>2. מקלידים את הקוד שלמעלה</li>
      <li>3. השלט מתחבר לבד, ובפעם הבאה לא צריך להקליד שוב</li>
    </ol>
  );
}

function Code({ code, big }) {
  return (
    <div aria-label={"קוד חיבור " + code.split("").join(" ")} style={{
      fontFamily: "Oswald,sans-serif", color: ORANGE, direction: "ltr", lineHeight: 1,
      fontSize: big ? "calc(var(--u,1vh) * 20)" : 56, letterSpacing: big ? "0.18em" : 14,
      textShadow: "0 0 40px rgba(255,107,0,0.35)",
    }}>{code}</div>
  );
}

// Full-screen welcome. Appears when the TV has no remote and nothing is running.
export function PairOverlay({ roomCode, onSkip }) {
  const host = useOrigin();
  return (
    <div role="dialog" aria-label="חיבור שלט" style={{
      position: "fixed", inset: 0, zIndex: 150, background: "rgba(8,10,16,0.97)", direction: "rtl",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "calc(var(--u,1vh) * 3)",
      fontFamily: "Heebo,sans-serif", color: "#fff", padding: 24, textAlign: "center",
    }}>
      <div style={{ fontSize: "calc(var(--u,1vh) * 5.5)", fontWeight: 900 }}>🥋 נבחרת ג׳ודו BGU</div>
      <div style={{ fontSize: "calc(var(--u,1vh) * 3.6)", fontWeight: 700, color: "#c3cada" }}>חברו את הנייד כשלט</div>
      <Code code={roomCode} big />
      <Steps host={host} big />
      <button autoFocus onClick={onSkip} style={{
        marginTop: "calc(var(--u,1vh) * 1.5)", padding: "calc(var(--u,1vh) * 2) calc(var(--u,1vh) * 5)",
        fontSize: "calc(var(--u,1vh) * 3)", fontWeight: 900, borderRadius: 14, cursor: "pointer",
        fontFamily: "Heebo,sans-serif", color: "#fff", background: "rgba(255,255,255,0.08)", border: "2px solid rgba(255,255,255,0.35)",
      }}>המשך בלי שלט</button>
    </div>
  );
}

// Settings window behind "📱 שלט" — shows the code again, rotates it, switches the link off.
export function PairingModal({ roomCode, remoteOn, setRemoteOn, onNewCode, status, connected, onClose }) {
  const host = useOrigin();
  const statusLabel = connected ? "השלט מחובר"
    : status === "online" ? "ממתין לשלט…"
    : status === "connecting" ? "מתחבר…"
    : "אין חיבור לשרת";
  const statusColor = connected ? "#2ecc71" : status === "online" ? "#ffb347" : "#ff4444";

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0d1020", border: "1px solid rgba(255,107,0,0.28)", borderRadius: 18, width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", padding: 26, direction: "rtl", fontFamily: "Heebo,sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ color: "#fff", fontSize: 20, fontWeight: 900 }}>📱 שלט רחוק</span>
          <button onClick={onClose} aria-label="סגור" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 22 }}>✕</button>
        </div>

        {remoteOn && roomCode && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 16 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: statusColor }} />
              <span style={{ color: statusColor, fontSize: 15, fontWeight: 700 }}>{statusLabel}</span>
            </div>
            <div style={{ background: "rgba(255,107,0,0.07)", border: "1px solid rgba(255,107,0,0.3)", borderRadius: 14, padding: 18, textAlign: "center", marginBottom: 16 }}>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, letterSpacing: 3, marginBottom: 8 }}>קוד חיבור</div>
              <Code code={roomCode} />
            </div>
            <Steps host={host} />
          </>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "12px 15px", marginTop: 16, marginBottom: 10 }}>
          <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 15 }}>שלט רחוק פעיל</span>
          <Toggle value={remoteOn} onChange={setRemoteOn} />
        </div>

        {remoteOn && roomCode && (
          <button onClick={onNewCode} style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.75)", borderRadius: 11, padding: 12, cursor: "pointer", fontFamily: "Heebo,sans-serif", fontSize: 14 }}>
            🔄 קוד חדש — מנתק שלטים קיימים
          </button>
        )}
      </div>
    </div>
  );
}
