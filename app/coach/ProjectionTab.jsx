'use client';

// "הקרנה" — what the room is seeing, on the coach's phone.
//
// This is not a diagram of the TV. It is the TV: the same ProjectionScreen
// component, laid out at the same fixed canvas and scaled down. So a preview
// cannot drift from the thing it previews, and "אחרי העדכון" is the identical
// render with the pending edits merged in — the coach can see exactly what a
// change will look like on the wall before pushing it there.

import { useState, useMemo } from "react";
import { C, FONT, NUM, Card, Btn, Label, Pill, Screen, Segmented, TextInput, Empty } from "../lib/mobileUI";
import { FittedProjection } from "../lib/ProjectionScreen";
import { normalizeRoomCode, isValidRoomCode, impossibleChars, ROOM_CODE_LEN } from "../lib/roomCode";

export default function ProjectionTab({
  room, onRoom, status, screenConnected,
  liveState, draftState, dirty, onPush, onDiscard,
}) {
  const [mode, setMode] = useState("live");
  const [typed, setTyped] = useState("");

  // With nothing staged there is nothing to compare, so the toggle stays away.
  const showToggle = dirty && !!draftState;
  const shown = showToggle && mode === "draft" ? draftState : liveState;

  const link = useMemo(() => {
    if (typeof window === "undefined" || !room) return "";
    return window.location.origin + "/tv#" + room;
  }, [room]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(link); } catch (e) {}
  };

  if (!room) {
    return (
      <Screen>
        <Card>
          <Label style={{ marginBottom: 10 }}>חיבור למסך</Label>
          <div style={{ color: C.ink2, fontSize: 15, lineHeight: 1.7, marginBottom: 14 }}>
            פתח <span style={{ color: C.accent, fontFamily: NUM }}>judo-bgu.vercel.app/tv</span> על
            הטלויזיה או על מחשב מחובר למקרן, והקלד כאן את הקוד שיופיע שם.
          </div>
          <CodeEntry typed={typed} setTyped={setTyped} onJoin={() => onRoom(normalizeRoomCode(typed))} />
        </Card>

        <Empty
          icon="📺"
          title="עדיין אין הקרנה"
          hint="אפשר להעביר אימון שלם בלי מסך — כל השליטה נמצאת בטאב ניהול אימון. המסך רק מראה לחניכים."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: screenConnected ? C.go : status === "online" ? "rgba(255,179,71,0.9)" : C.stop,
        }} />
        <span style={{ color: screenConnected ? C.go : C.ink3, fontSize: 13.5, fontWeight: 600 }}>
          {screenConnected ? "המסך מחובר" : status === "online" ? "ממתין למסך…" : "אין חיבור לרשת"}
        </span>
        <span style={{ marginInlineStart: "auto", fontFamily: NUM, color: C.accent, fontSize: 16, letterSpacing: 3, direction: "ltr" }}>{room}</span>
      </div>

      {showToggle && (
        <Segmented
          value={mode}
          onChange={setMode}
          options={[{ id: "live", label: "עכשיו על המסך" }, { id: "draft", label: "אחרי העדכון" }]}
        />
      )}

      <div style={{ position: "relative" }}>
        <FittedProjection
          state={shown}
          clean={!!(shown && shown.projection)}
          muted
          style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 14, border: "1px solid " + C.line, maxWidth: "100%" }}
        />
        {showToggle && mode === "draft" && (
          <div style={{
            position: "absolute", top: 8, insetInlineStart: 8,
            background: "rgba(255,107,0,0.9)", color: "#fff",
            borderRadius: 100, padding: "4px 11px", fontSize: 11.5, fontWeight: 800, fontFamily: FONT,
          }}>תצוגה מקדימה — עוד לא על המסך</div>
        )}
        {!screenConnected && (
          <div style={{
            position: "absolute", bottom: 8, insetInlineStart: 8,
            background: "rgba(0,0,0,0.7)", color: C.ink3,
            borderRadius: 100, padding: "4px 11px", fontSize: 11.5, fontFamily: FONT,
          }}>אין מסך מחובר — זו הדמיה</div>
        )}
      </div>

      {dirty && (
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="quiet" onClick={onDiscard} style={{ flexShrink: 0 }}>בטל</Btn>
          <Btn variant="primary" onClick={onPush} style={{ flex: 1 }}>✓ עדכן את המסך</Btn>
        </div>
      )}

      <Card>
        <Label style={{ marginBottom: 10 }}>קישור למסך</Label>
        <div style={{
          background: "rgba(255,255,255,0.04)", border: "1px solid " + C.line,
          borderRadius: 10, padding: "10px 12px", fontFamily: NUM, fontSize: 13,
          color: C.ink2, direction: "ltr", overflowX: "auto", whiteSpace: "nowrap",
        }}>{link}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
          <Btn onClick={copyLink}>העתק קישור</Btn>
          <Btn variant="quiet" onClick={() => onRoom("")}>נתק מסך</Btn>
        </div>
        <div style={{ color: C.ink3, fontSize: 12.5, marginTop: 10, lineHeight: 1.6 }}>
          פתיחת הקישור על מחשב מחברת אותו ישירות, בלי להקליד קוד.
        </div>
      </Card>
    </Screen>
  );
}

function CodeEntry({ typed, setTyped, onJoin }) {
  const bad  = impossibleChars(typed);
  const full = isValidRoomCode(typed);
  return (
    <>
      <TextInput
        id="pair-code"
        value={typed}
        onChange={e => setTyped(normalizeRoomCode(e.target.value))}
        onKeyDown={e => { if (e.key === "Enter" && full) onJoin(); }}
        placeholder={"·".repeat(ROOM_CODE_LEN)}
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        style={{
          fontFamily: NUM, fontSize: 30, letterSpacing: 9, textAlign: "center",
          direction: "ltr", padding: "14px 12px",
          borderColor: full ? "rgba(46,204,113,0.6)" : bad.length ? "rgba(255,68,68,0.6)" : C.line,
        }}
      />
      <div style={{ minHeight: 20, color: bad.length ? "#ff8080" : C.ink3, fontSize: 13, marginTop: 6 }}>
        {bad.length ? "אין " + bad.join(" ו־") + " בקוד" : ROOM_CODE_LEN + " תווים"}
      </div>
      <Btn variant="primary" onClick={onJoin} disabled={!full} style={{ width: "100%", marginTop: 6 }}>
        חבר את המסך
      </Btn>
    </>
  );
}
