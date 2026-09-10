'use client';

// The screen in the hall.
//
// It holds no session of its own. It joins a room by code, renders whatever the
// coach's phone last published, and derives the clock locally so the picture
// stays right when the phone stops talking. Two things it does own, because
// they belong to the device with the speakers and the physical screen:
// the sound, and the decision to hand itself to a different phone.

import { useState, useEffect, useRef, useCallback } from "react";
import { FittedProjection } from "../lib/ProjectionScreen";
import { useProjectionLink } from "../lib/projectionLink";
import { useSound } from "../lib/useSound";
import { useWakeLock } from "../lib/wakeLock";
import { makeRoomCode, normalizeRoomCode, isValidRoomCode, impossibleChars, ROOM_CODE_LEN } from "../lib/roomCode";
import { displaySeconds } from "../lib/sessionEngine";

const STORE_KEY = "judo.tv.room";
const ORANGE = "#FF6B00";

const shell = {
  width: "100vw", height: "100vh", overflow: "hidden",
  background: "#080a10", color: "#fff",
  fontFamily: "Heebo,sans-serif", direction: "rtl",
  display: "flex", alignItems: "center", justifyContent: "center",
  position: "relative",
};

export default function ProjectionReceiver() {
  const [room, setRoom]   = useState("");
  const [typed, setTyped] = useState("");
  const [ready, setReady] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const [soundType, setSoundType] = useState("beep");

  const link = useProjectionLink(room);
  const { tickBeep, endBeep, startBeep, initCtx } = useSound(soundType);

  useWakeLock(!!room);

  // The code can arrive in the URL (a link the coach opened on this screen), or
  // be remembered from last time so a TV that reboots rejoins on its own.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromHash = normalizeRoomCode((window.location.hash || "").replace(/^#/, ""));
    let stored = "";
    try { stored = normalizeRoomCode(window.localStorage.getItem(STORE_KEY) || ""); } catch (e) {}
    const initial = isValidRoomCode(fromHash) ? fromHash : isValidRoomCode(stored) ? stored : "";
    if (initial) setRoom(initial);
    setReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !room) return;
    try { window.localStorage.setItem(STORE_KEY, room); } catch (e) {}
  }, [room]);

  // ── sound, driven by the locally derived clock ─────────────────────────────
  // Never by an incoming message: a beep is only useful if it lands on the
  // second, and the network cannot promise that.
  const heard = useRef({ sec: -1, cursor: "" });
  const [alert, setAlert] = useState(false);
  const alertTimer = useRef(null);

  useEffect(() => {
    const v = link.view;
    if (!v || !audioOn) return;
    const cursor = v.drillIdx + ":" + v.phaseIdx;
    const sec = displaySeconds(v.timeLeft);

    if (cursor !== heard.current.cursor) {
      // A phase boundary — but not the very first render, which is just us
      // arriving mid-session.
      if (heard.current.cursor !== "") {
        endBeep();
        setAlert(true);
        clearTimeout(alertTimer.current);
        alertTimer.current = setTimeout(() => setAlert(false), 2200);
      }
      heard.current = { cursor, sec };
      return;
    }
    if (v.running && sec !== heard.current.sec) {
      if (sec > 0 && sec <= 3) tickBeep(sec);
      heard.current = { cursor, sec };
    }
  }, [link.view, audioOn, tickBeep, endBeep]);

  useEffect(() => () => clearTimeout(alertTimer.current), []);

  const unlockAudio = useCallback(() => {
    const ctx = initCtx();
    if (ctx && ctx.state === "running") { setAudioOn(true); startBeep(); }
  }, [initCtx, startBeep]);

  // Settings the phone controls.
  useEffect(() => {
    if (link.heavy && link.heavy.soundType) setSoundType(link.heavy.soundType);
  }, [link.heavy]);

  const join = useCallback(() => {
    const c = normalizeRoomCode(typed);
    if (!isValidRoomCode(c)) return;
    setRoom(c);
    setTyped("");
  }, [typed]);

  const leave = useCallback(() => {
    setRoom("");
    try { window.localStorage.removeItem(STORE_KEY); } catch (e) {}
  }, []);

  if (!ready) return <div style={shell} />;

  // ── not paired yet ─────────────────────────────────────────────────────────
  if (!room) return <PairingScreen typed={typed} setTyped={setTyped} onJoin={join} />;

  const state = link.heavy ? {
    ...link.heavy,
    drillIdx: link.view ? link.view.drillIdx : 0,
    phaseIdx: link.view ? link.view.phaseIdx : 0,
    timeLeft: link.view ? link.view.timeLeft : 0,
    running:  link.view ? link.view.running : false,
    totalElapsed: link.view ? link.view.totalElapsed : 0,
    alert,
  } : null;

  return (
    <div style={shell} onClick={audioOn ? undefined : unlockAudio}>
      {state ? (
        <FittedProjection
          state={state}
          clean={!!link.heavy.projection}
          style={{ width: "100vw", height: "100vh" }}
        />
      ) : (
        <WaitingScreen room={room} status={link.status} onLeave={leave} />
      )}

      {/* The AudioContext can only start from a tap on this device — a "play"
          pressed on the coach's phone is not a gesture here. */}
      {!audioOn && (
        <button onClick={unlockAudio} style={{
          position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)",
          zIndex: 120, background: "rgba(255,107,0,0.16)", border: "1px solid rgba(255,107,0,0.5)",
          color: ORANGE, borderRadius: 11, padding: "12px 20px", cursor: "pointer",
          fontFamily: "Heebo,sans-serif", fontSize: 15, fontWeight: 700, direction: "rtl",
        }}>🔊 לחצו כאן להפעלת הצלילים במסך</button>
      )}

      {state && !link.phoneConnected && (
        <div style={{
          position: "fixed", top: 14, left: 14, zIndex: 120,
          background: "rgba(255,68,68,0.14)", border: "1px solid rgba(255,68,68,0.45)",
          color: "#ff8080", borderRadius: 9, padding: "7px 12px", fontSize: 13,
        }}>אין קשר עם השלט — השעון ממשיך</div>
      )}

      {link.claimant && (
        <TakeoverPrompt onAccept={link.acceptClaim} onReject={link.rejectClaim} />
      )}

      <CornerCode room={room} onLeave={leave} connected={link.phoneConnected} />
    </div>
  );
}

// ── screens ──────────────────────────────────────────────────────────────────

function PairingScreen({ typed, setTyped, onJoin }) {
  const bad = impossibleChars(typed);
  const full = isValidRoomCode(typed);
  return (
    <div style={{ ...shell, flexDirection: "column", gap: 26, padding: 24 }}>
      <div style={{ fontSize: 54 }}>🥋</div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 30, fontWeight: 900 }}>מסך הקרנה</div>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 16, marginTop: 6 }}>
          הקלד כאן את הקוד שמופיע באפליקציה בנייד
        </div>
      </div>

      <input
        id="tv-room-code"
        value={typed}
        onChange={e => setTyped(normalizeRoomCode(e.target.value))}
        onKeyDown={e => { if (e.key === "Enter") onJoin(); }}
        placeholder={"·".repeat(ROOM_CODE_LEN)}
        autoFocus
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "2px solid " + (full ? "rgba(46,204,113,0.6)" : bad.length ? "rgba(255,68,68,0.6)" : "rgba(255,107,0,0.4)"),
          borderRadius: 16, color: "#fff", outline: "none",
          fontFamily: "Oswald,monospace", fontSize: 54, letterSpacing: 14,
          textAlign: "center", padding: "16px 22px", width: "min(90vw, 420px)",
          direction: "ltr",
        }}
      />

      <div style={{ minHeight: 24, color: bad.length ? "#ff8080" : "rgba(255,255,255,0.3)", fontSize: 15 }}>
        {bad.length
          ? "אין " + bad.join(" ו־") + " בקוד — נסה שוב"
          : "הקוד באורך " + ROOM_CODE_LEN + " תווים"}
      </div>

      <button onClick={onJoin} disabled={!full} style={{
        background: full ? "linear-gradient(135deg,#FF6B00,#cc4400)" : "rgba(255,255,255,0.05)",
        border: "none", color: full ? "#fff" : "rgba(255,255,255,0.25)",
        borderRadius: 13, padding: "16px 52px",
        cursor: full ? "pointer" : "not-allowed",
        fontFamily: "Heebo,sans-serif", fontSize: 20, fontWeight: 900,
      }}>התחבר</button>
    </div>
  );
}

function WaitingScreen({ room, status, onLeave }) {
  const label = status === "online" ? "מחובר — ממתין לשלט" :
                status === "connecting" ? "מתחבר…" : "אין חיבור לרשת";
  return (
    <div style={{ ...shell, flexDirection: "column", gap: 20 }}>
      <div style={{ fontSize: 44 }}>📺</div>
      <div style={{
        fontFamily: "Oswald,monospace", fontSize: 78, letterSpacing: 16,
        color: ORANGE, direction: "ltr",
      }}>{room}</div>
      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 18 }}>{label}</div>
      <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 15, maxWidth: 460, textAlign: "center", lineHeight: 1.7 }}>
        פתח את האפליקציה בנייד, בחר אימון ולחץ "התחל אימון" — ואז הזן את הקוד הזה בטאב ההקרנה.
      </div>
      <button onClick={onLeave} style={{
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
        color: "rgba(255,255,255,0.5)", borderRadius: 10, padding: "10px 20px",
        cursor: "pointer", fontFamily: "Heebo,sans-serif", fontSize: 14, marginTop: 8,
      }}>קוד אחר</button>
    </div>
  );
}

function TakeoverPrompt({ onAccept, onReject }) {
  // Another phone knows the code and is asking for the screen. The screen never
  // switches on its own — a broadcast channel means anyone holding the code
  // could otherwise walk in mid-session.
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200, direction: "rtl",
      background: "rgba(0,0,0,0.72)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        background: "#0d1020", border: "1px solid rgba(255,107,0,0.4)",
        borderRadius: 18, padding: "28px 32px", maxWidth: 480, textAlign: "center",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ fontSize: 34 }}>📱</div>
        <div style={{ fontSize: 22, fontWeight: 900 }}>שלט אחר מבקש להתחבר</div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 15, lineHeight: 1.7 }}>
          מכשיר נוסף עם אותו קוד מנסה לשלוט במסך. אם זה לא אתה — אל תאשר, ואפשר להחליף קוד באפליקציה.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onReject} style={{
            flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.65)", borderRadius: 11, padding: "14px",
            cursor: "pointer", fontFamily: "Heebo,sans-serif", fontSize: 16,
          }}>לא עכשיו</button>
          <button onClick={onAccept} style={{
            flex: 1, background: "linear-gradient(135deg,#FF6B00,#cc4400)", border: "none",
            color: "#fff", borderRadius: 11, padding: "14px",
            cursor: "pointer", fontFamily: "Heebo,sans-serif", fontSize: 16, fontWeight: 700,
          }}>העבר לשלט החדש</button>
        </div>
      </div>
    </div>
  );
}

function CornerCode({ room, onLeave, connected }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "fixed", top: 12, right: 12, zIndex: 110, direction: "rtl" }}>
      <button onClick={() => setOpen(o => !o)} title="קוד ההקרנה" style={{
        display: "flex", alignItems: "center", gap: 7,
        background: "rgba(0,0,0,0.4)",
        border: "1px solid " + (connected ? "rgba(46,204,113,0.4)" : "rgba(255,255,255,0.1)"),
        borderRadius: 9, padding: "7px 11px", cursor: "pointer",
        fontFamily: "Heebo,sans-serif", fontSize: 13,
        color: connected ? "rgba(46,204,113,0.85)" : "rgba(255,255,255,0.4)",
      }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#2ecc71" : "rgba(255,255,255,0.3)" }} />
        {open ? room : "קוד"}
      </button>
      {open && (
        <div style={{
          marginTop: 6, background: "rgba(0,0,0,0.75)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 9, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div style={{ fontFamily: "Oswald,monospace", fontSize: 26, letterSpacing: 6, color: ORANGE, direction: "ltr", textAlign: "center" }}>{room}</div>
          <button onClick={onLeave} style={{
            background: "none", border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.5)", borderRadius: 7, padding: "6px 10px",
            cursor: "pointer", fontFamily: "Heebo,sans-serif", fontSize: 12,
          }}>נתק</button>
        </div>
      )}
    </div>
  );
}
