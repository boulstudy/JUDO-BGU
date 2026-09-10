'use client';

// "ניהול אימון" — the tab the coach actually drives from.
//
// Laid out bottom-heavy on purpose. The controls used every thirty seconds
// (play, pause, ± time, next) sit where a thumb reaches while holding the phone
// one-handed; the things consulted occasionally (the drill list, the notes) sit
// above them and scroll.

import { useState } from "react";
import { C, FONT, NUM, Card, Btn, Label, Pill, Screen, Sheet, TextArea, Toggle, Segmented, Num } from "../lib/mobileUI";
import { SEC_COLOR } from "../lib/shared";
import { fmt, phasesOf, totalDrillTime, displaySeconds } from "../lib/sessionEngine";

const ADJUST = [
  [-60, "− דקה"], [-30, "− 30ש׳"], [-10, "− 10ש׳"],
  [+10, "+ 10ש׳"], [+30, "+ 30ש׳"], [+60, "+ דקה"],
];

export default function ManageTab({
  drills, view, controls, notes, onNotes, settings, onSettings, onEndSession,
}) {
  const [sheet, setSheet] = useState(null);

  const drillIdx = view ? view.drillIdx : 0;
  const phaseIdx = view ? view.phaseIdx : 0;
  const running  = view ? view.running : false;
  const current  = drills[drillIdx] || null;
  const phases   = phasesOf(current);
  const phase    = phases[phaseIdx] || { label: "—", phase: "work" };
  const secColor = SEC_COLOR[(current && current.section) || "warmup"];
  const resting  = phase.phase === "rest" || (current && current.type === "rest");
  const shown    = displaySeconds(view ? view.timeLeft : 0);

  const timeColor = resting ? C.rest : running ? C.ink : C.ink3;

  return (
    <>
      <Screen bottom={72}>
        {/* what the room is seeing right now */}
        <Card style={{ padding: "16px 15px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
            <span style={{ width: 4, height: 17, borderRadius: 2, background: secColor, flexShrink: 0 }} />
            <Label>על המסך</Label>
            <span style={{ marginInlineStart: "auto" }}>
              {running
                ? <Pill color={C.go} bg="rgba(46,204,113,0.14)">● רץ</Pill>
                : <Pill>עצור</Pill>}
            </span>
          </div>

          <div style={{ fontSize: 21, fontWeight: 900, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {current ? current.name : "—"}
          </div>
          <div style={{ color: C.ink3, fontSize: 13.5, marginTop: 2 }}>
            {resting ? "מנוחה" : phase.label}
            {phases.length > 1 ? <>{"  ·  שלב "}<Num>{(phaseIdx + 1) + "/" + phases.length}</Num></> : ""}
            {current && current.rounds > 1 && !resting ? <>{"  ·  סבב "}<Num>{(phase.round || 1) + "/" + current.rounds}</Num></> : ""}
          </div>

          <div style={{
            textAlign: "center", fontFamily: NUM, fontSize: 74, lineHeight: 1.05,
            color: timeColor, letterSpacing: -2, marginTop: 8,
            fontVariantNumeric: "tabular-nums",
          }}>{fmt(shown)}</div>

          {phases.length > 1 && (
            <div style={{ display: "flex", gap: 3, marginTop: 10 }}>
              {phases.map((p, i) => (
                <div key={i} style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: i < phaseIdx ? "rgba(255,107,0,0.45)"
                    : i === phaseIdx ? C.accent
                    : p.phase === "rest" ? "rgba(168,255,120,0.2)" : "rgba(255,255,255,0.09)",
                }} />
              ))}
            </div>
          )}
        </Card>

        {/* time */}
        <Card>
          <Label style={{ marginBottom: 10 }}>זמן</Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7 }}>
            {ADJUST.map(([v, l]) => (
              <Btn key={v} onClick={() => controls.addTime(v)} style={{
                color: v > 0 ? "rgba(0,229,255,0.85)" : "rgba(255,140,60,0.9)",
                background: v > 0 ? "rgba(0,229,255,0.06)" : "rgba(255,107,0,0.06)",
              }}>{l}</Btn>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginTop: 7 }}>
            <Btn onClick={controls.resetPhase}>↺ אפס שלב</Btn>
            <Btn onClick={controls.skipPhase}>שלב הבא →</Btn>
          </div>
        </Card>

        {/* drills */}
        <Card style={{ padding: "12px 12px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <Label>מערך האימון</Label>
            <span style={{ marginInlineStart: "auto", color: C.ink3, fontSize: 12 }}>
              {drills.length ? "תרגיל " + Math.min(drillIdx + 1, drills.length) + " מתוך " + drills.length : ""}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {drills.map((d, i) => {
              const curr = i === drillIdx, done = i < drillIdx;
              const sc = SEC_COLOR[d.section || "warmup"];
              return (
                <button key={d.id != null ? d.id : i} onClick={() => controls.goto(i, 0)} style={{
                  display: "flex", alignItems: "center", gap: 9, width: "100%",
                  background: curr ? "rgba(255,107,0,0.12)" : "rgba(255,255,255,0.03)",
                  border: "1px solid " + (curr ? "rgba(255,107,0,0.45)" : "transparent"),
                  borderRadius: 10, padding: "10px 11px", minHeight: 52,
                  cursor: "pointer", fontFamily: FONT, textAlign: "start",
                  opacity: done ? 0.45 : 1,
                }}>
                  <span style={{ width: 3, height: 26, borderRadius: 2, background: sc, flexShrink: 0 }} />
                  <span style={{
                    width: 21, height: 21, borderRadius: "50%", flexShrink: 0,
                    background: curr ? C.accent : "rgba(255,255,255,0.06)",
                    color: curr ? "#fff" : C.ink3, fontSize: 11,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{done ? "✓" : i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", color: curr ? C.ink : C.ink2, fontSize: 14.5, fontWeight: curr ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                    <span style={{ display: "block", color: sc, fontSize: 11, marginTop: 1 }}>
                      {d.type !== "rest" && d.rounds > 1 ? d.rounds + "x · " : ""}{fmt(totalDrillTime(d))}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Btn onClick={() => setSheet("notes")}>📝 הערות</Btn>
          <Btn onClick={() => setSheet("settings")}>⚙️ הגדרות</Btn>
        </div>

        <Btn variant="danger" onClick={() => setSheet("end")}>סיים אימון</Btn>
      </Screen>

      {/* the two controls that matter, always within reach */}
      <div style={{
        position: "absolute", insetInline: 0, bottom: 0, zIndex: 20,
        padding: "10px 14px", display: "flex", gap: 8,
        background: "linear-gradient(to top, rgba(8,10,16,0.98) 60%, rgba(8,10,16,0))",
        pointerEvents: "none",
      }}>
        <Btn onClick={controls.prevDrill} disabled={drillIdx === 0}
             style={{ pointerEvents: "auto", flexShrink: 0, paddingInline: 15 }}>◀</Btn>
        <Btn
          variant={running ? "stop" : "go"} size="lg"
          onClick={controls.toggle}
          style={{ pointerEvents: "auto", flex: 1 }}
        >{running ? "⏸ עצור" : "▶ התחל"}</Btn>
        <Btn onClick={controls.nextDrill} disabled={drillIdx >= drills.length - 1}
             style={{ pointerEvents: "auto", flexShrink: 0, paddingInline: 15 }}>▶</Btn>
      </div>

      <Sheet open={sheet === "notes"} onClose={() => setSheet(null)} title="הערות לאימון">
        <TextArea
          id="session-notes"
          value={notes}
          onChange={e => onNotes(e.target.value)}
          placeholder="דגשים, מה לזכור לפעם הבאה…"
          style={{ minHeight: 180 }}
        />
        <div style={{ color: C.ink3, fontSize: 13 }}>ההערות מופיעות גם על המסך המוקרן.</div>
      </Sheet>

      <Sheet open={sheet === "settings"} onClose={() => setSheet(null)} title="הגדרות אימון">
        <Toggle
          on={settings.globalAutoNext !== false}
          onChange={v => onSettings({ globalAutoNext: v })}
          label="מעבר אוטומטי בין תרגילים"
          hint="כשתרגיל נגמר, לעבור לבא בלי לחכות ללחיצה"
        />
        <div>
          <Label style={{ marginBottom: 8 }}>צליל במסך</Label>
          <Segmented
            value={settings.soundType || "beep"}
            onChange={v => onSettings({ soundType: v })}
            options={[{ id: "beep", label: "🔔 ביפ" }, { id: "buzz", label: "⚡ באזר" }, { id: "mute", label: "🔇 שקט" }]}
          />
        </div>
        <div>
          <Label style={{ marginBottom: 8 }}>תצוגת המסך</Label>
          <Toggle
            on={!!settings.projection}
            onChange={v => onSettings({ projection: v })}
            label="מצב הקרנה נקי"
            hint="להסתיר את ההערות ואת רשימת המערך מהמסך המוקרן"
          />
        </div>
      </Sheet>

      <Sheet
        open={sheet === "end"} onClose={() => setSheet(null)} title="לסיים את האימון?"
        footer={<>
          <Btn style={{ flex: 1 }} onClick={() => setSheet(null)}>חזרה</Btn>
          <Btn variant="danger" style={{ flex: 1 }} onClick={() => { setSheet(null); onEndSession(); }}>סיים ושמור</Btn>
        </>}
      >
        <div style={{ color: C.ink2, fontSize: 15, lineHeight: 1.7 }}>
          האימון יישמר בהיסטוריה עם המערך כפי שהוא עכשיו, והמסך יחזור להמתנה.
        </div>
      </Sheet>
    </>
  );
}
