'use client';

// The TV's side of pairing. The TV owns the code and shows it; the phone only
// ever types it (or opens a link that carries it). Nothing is typed on the TV.

import { useState, useEffect } from "react";
import { Toggle } from "./ui";
import { encodeQR } from "./qr";

const ORANGE = "#FF6B00";

function useOrigin() {
  const [origin, setOrigin] = useState("");
  useEffect(() => { try { setOrigin(window.location.host); } catch(e) {} }, []);
  return origin;
}

// The pairing link as a QR code: the phone camera opens it and joins with no typing.
function PairQR({ code, size }) {
  const [matrix, setMatrix] = useState(null);
  useEffect(() => {
    try { setMatrix(encodeQR(window.location.origin + "/remote?code=" + code)); } catch(e) { setMatrix(null); }
  }, [code]);
  if (!matrix) return null;
  const quiet = 3, n = matrix.length + quiet * 2;
  let d = "";
  matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x + quiet} ${y + quiet}h1v1h-1z`; }));
  return (
    <svg role="img" aria-label="קוד QR לחיבור השלט" viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges"
      style={{ width: size, height: size, flexShrink: 0, borderRadius: 12, background: "#fff", display: "block" }}>
      <path d={d} fill="#000" />
    </svg>
  );
}

function Steps({ host, big }) {
  const fs = big ? "calc(var(--u,1vh) * 3.2)" : 15;
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: big ? "calc(var(--u,1vh) * 1.4)" : 8, color: "#dfe4ee", fontSize: fs, lineHeight: 1.5, textAlign: "start" }}>
      <li>1. סורקים את ה-QR במצלמה של הנייד — והשלט מתחבר</li>
      <li>2. או פותחים בנייד <b style={{ color: "#6ec6ff", direction: "ltr", unicodeBidi: "embed" }}>{host}/remote</b> ומקלידים את הקוד</li>
      <li>3. בפעם הבאה הוא יתחבר לבד</li>
    </ol>
  );
}

function Code({ code, big }) {
  return (
    <div aria-label={"קוד חיבור " + code.split("").join(" ")} style={{
      fontFamily: "Oswald,sans-serif", color: ORANGE, direction: "ltr", lineHeight: 1,
      fontSize: big ? "calc(var(--u,1vh) * 17)" : 48, letterSpacing: big ? "0.18em" : 14,
      textShadow: "0 0 40px rgba(255,107,0,0.35)",
    }}>{code}</div>
  );
}

// Full-screen welcome. Appears when the TV has no remote and nothing is running.
export function PairOverlay({ roomCode, onSkip }) {
  const host = useOrigin();
  return (
    <div role="dialog" aria-label="חיבור שלט" style={{
      position: "fixed", inset: 0, zIndex: 150, background: "rgba(8,10,16,0.99)", direction: "rtl",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "calc(var(--u,1vh) * 3)",
      fontFamily: "Heebo,sans-serif", color: "#fff", padding: 24, textAlign: "center",
    }}>
      <div style={{ fontSize: "calc(var(--u,1vh) * 5.5)", fontWeight: 900 }}>🥋 נבחרת ג׳ודו BGU</div>
      <div style={{ fontSize: "calc(var(--u,1vh) * 3.6)", fontWeight: 700, color: "#c3cada" }}>חברו את הנייד כשלט</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "calc(var(--u,1vh) * 6)", flexWrap: "wrap" }}>
        <PairQR code={roomCode} size="calc(var(--u,1vh) * 30)" />
        <Code code={roomCode} big />
      </div>
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
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><PairQR code={roomCode} size={170} /></div>
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
