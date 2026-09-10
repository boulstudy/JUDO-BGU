'use client';

// One drill, edited on a phone.
//
// The form only shows the fields that matter for the type chosen: a rest has no
// rounds, a group drill has no working side. Hiding the rest is not decoration
// — a coach setting this up between drills has a few seconds, and every field
// that cannot apply is a field they have to read and dismiss.

import { useState, useEffect } from "react";
import { C, NUM, Btn, Label, Sheet, TextInput, Segmented, Toggle, Card, Num } from "../lib/mobileUI";
import { DRILL_SECTIONS } from "../lib/shared";
import { fmt, totalDrillTime, phasesOf } from "../lib/sessionEngine";

const TYPES = [
  { id: "partner",  label: "בזוגות" },
  { id: "group",    label: "קבוצתי" },
  { id: "rest",     label: "מנוחה" },
  { id: "personal", label: "אישי" },
];

export const blankDrill = () => ({
  name: "", section: "technique", type: "partner",
  durationWork: 60, durationRest: 15, rounds: 3,
  pattern: "alternate", restTiming: "after_each", activeColor: "white",
  note: "", autoNext: true, visibility: "shared",
});

// A minute/second stepper. Typing a duration on a phone keyboard mid-training
// is slower and more error-prone than tapping it up and down.
function Duration({ label, value, onChange, step = 15, min = 0 }) {
  const bump = d => onChange(Math.max(min, (value || 0) + d));
  return (
    <div>
      <Label style={{ marginBottom: 7 }}>{label}</Label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Btn onClick={() => bump(-step)} style={{ flexShrink: 0, minWidth: 52 }}>−</Btn>
        <div style={{
          flex: 1, textAlign: "center", fontFamily: NUM, fontSize: 26,
          color: C.ink, background: "rgba(255,255,255,0.04)",
          border: "1px solid " + C.line, borderRadius: 11, padding: "9px 0",
          fontVariantNumeric: "tabular-nums",
        }}>{fmt(value || 0)}</div>
        <Btn onClick={() => bump(step)} style={{ flexShrink: 0, minWidth: 52 }}>+</Btn>
      </div>
    </div>
  );
}

function Counter({ label, value, onChange, min = 1, max = 30 }) {
  return (
    <div>
      <Label style={{ marginBottom: 7 }}>{label}</Label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Btn onClick={() => onChange(Math.max(min, value - 1))} style={{ flexShrink: 0, minWidth: 52 }}>−</Btn>
        <div style={{
          flex: 1, textAlign: "center", fontFamily: NUM, fontSize: 26, color: C.ink,
          background: "rgba(255,255,255,0.04)", border: "1px solid " + C.line,
          borderRadius: 11, padding: "9px 0",
        }}>{value}</div>
        <Btn onClick={() => onChange(Math.min(max, value + 1))} style={{ flexShrink: 0, minWidth: 52 }}>+</Btn>
      </div>
    </div>
  );
}

export default function DrillEditor({ open, drill, onSave, onClose, onDelete, showVisibility = true }) {
  const [d, setD] = useState(drill || blankDrill());
  useEffect(() => { if (open) setD(drill || blankDrill()); }, [open, drill]);

  const set = patch => setD(prev => ({ ...prev, ...patch }));
  const isRest    = d.type === "rest";
  const isPartner = d.type === "partner";
  const phases    = phasesOf(d);

  const valid = (d.name || "").trim().length > 0 && (d.durationWork || 0) > 0;

  return (
    <Sheet
      open={open} onClose={onClose}
      title={drill && drill.id ? "עריכת תרגיל" : "תרגיל חדש"}
      footer={<>
        {onDelete && drill && drill.id
          ? <Btn variant="danger" onClick={() => onDelete(drill)} style={{ flexShrink: 0 }}>מחק</Btn>
          : null}
        <Btn variant="primary" disabled={!valid} onClick={() => onSave(d)} style={{ flex: 1 }}>שמור</Btn>
      </>}
    >
      <div>
        <Label style={{ marginBottom: 7 }}>שם התרגיל</Label>
        <TextInput
          id="drill-name" value={d.name} autoFocus={!(drill && drill.id)}
          onChange={e => set({ name: e.target.value })}
          placeholder="נאגה קומי, אוצ׳יקומי, ראנדורי…"
        />
      </div>

      <div>
        <Label style={{ marginBottom: 7 }}>סוג</Label>
        <Segmented value={d.type} onChange={v => set({ type: v })} options={TYPES} />
      </div>

      <div>
        <Label style={{ marginBottom: 7 }}>מקטע</Label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {DRILL_SECTIONS.map(s => {
            const on = d.section === s.id;
            return (
              <button key={s.id} onClick={() => set({ section: s.id })} style={{
                background: on ? s.color + "22" : "rgba(255,255,255,0.04)",
                border: "1px solid " + (on ? s.color : C.line),
                color: on ? s.color : C.ink2, borderRadius: 100,
                padding: "9px 15px", minHeight: 42, cursor: "pointer",
                fontFamily: "Heebo,sans-serif", fontSize: 14, fontWeight: on ? 700 : 400,
              }}>{s.label}</button>
            );
          })}
        </div>
      </div>

      <Duration label={isRest ? "משך המנוחה" : "משך עבודה"} value={d.durationWork} onChange={v => set({ durationWork: v })} />

      {!isRest && (
        <>
          <Counter label="סבבים" value={d.rounds || 1} onChange={v => set({ rounds: v })} />

          {isPartner && (
            <div>
              <Label style={{ marginBottom: 7 }}>מי עובד</Label>
              <Segmented
                value={d.pattern}
                onChange={v => set({ pattern: v })}
                options={[{ id: "alternate", label: "לסירוגין" }, { id: "together", label: "שניהם יחד" }]}
              />
              {d.pattern === "alternate" && (
                <div style={{ marginTop: 8 }}>
                  <Segmented
                    value={d.activeColor === "blue" ? "blue" : "white"}
                    onChange={v => set({ activeColor: v })}
                    options={[{ id: "white", label: "לבן מתחיל" }, { id: "blue", label: "כחול מתחיל" }]}
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <Label style={{ marginBottom: 7 }}>מנוחה בתוך התרגיל</Label>
            <Segmented
              value={d.restTiming}
              onChange={v => set({ restTiming: v })}
              options={[
                { id: "none", label: "ללא" },
                { id: "after_each", label: "אחרי כל עובד" },
                { id: "after_round", label: "אחרי סבב" },
              ]}
            />
          </div>

          {d.restTiming !== "none" && (
            <Duration label="משך מנוחה" value={d.durationRest} onChange={v => set({ durationRest: v })} step={5} />
          )}
        </>
      )}

      <div>
        <Label style={{ marginBottom: 7 }}>הערה</Label>
        <TextInput value={d.note || ""} onChange={e => set({ note: e.target.value })} placeholder="דגש שיופיע על המסך" />
      </div>

      <Toggle
        on={d.autoNext !== false}
        onChange={v => set({ autoNext: v })}
        label="להמשיך לתרגיל הבא לבד"
        hint="כשכבוי, האימון עוצר בסוף התרגיל וממתין ללחיצה"
      />

      {showVisibility && (
        <Toggle
          on={d.visibility === "private"}
          onChange={v => set({ visibility: v ? "private" : "shared" })}
          label="🔒 פרטי"
          hint="כברירת מחדל התרגיל משותף לשאר המאמנים במועדון"
        />
      )}

      {/* What the coach just built, in the terms the session will use it. */}
      <Card style={{ background: "rgba(255,255,255,0.03)" }}>
        <Label style={{ marginBottom: 6 }}>מה ייצא מזה</Label>
        <div style={{ fontFamily: NUM, fontSize: 24, color: C.accent }}>{fmt(totalDrillTime(d))}</div>
        <div style={{ color: C.ink3, fontSize: 13, marginTop: 3 }}>
          {phases.length} {phases.length === 1 ? "שלב" : "שלבים"}
          {phases.length > 1 ? <> · <Num>{phases.slice(0, 4).map(p => fmt(p.duration)).join(" · ") + (phases.length > 4 ? " …" : "")}</Num></> : ""}
        </div>
      </Card>
    </Sheet>
  );
}
