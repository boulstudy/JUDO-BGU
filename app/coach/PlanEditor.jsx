'use client';

// Building or editing a workout plan (a "מערך אימון") — the ordered list of
// drills a session will run. Reordering happens by up/down buttons rather than
// drag-and-drop: drag gestures conflict with scrolling on a phone and are hard
// to hit precisely with a thumb, while a button is unambiguous.

import { useState } from "react";
import { C, NUM, Btn, Label, Card, Screen, Header, Sheet, TextInput, Empty, Pill } from "../lib/mobileUI";
import DrillEditor, { blankDrill } from "./DrillEditor";
import { SEC_COLOR } from "../lib/shared";
import { fmt, totalDrillTime, totalWorkoutTime } from "../lib/sessionEngine";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export default function PlanEditor({ plan, catalog, onChange, onClose, onPickFromCatalog }) {
  const [editing, setEditing] = useState(null);   // drill being edited, or "new"
  const [showCatalog, setShowCatalog] = useState(false);
  const drills = plan.drills || [];

  const setDrills = next => onChange({ ...plan, drills: next });

  const move = (i, dir) => {
    const t = i + dir;
    if (t < 0 || t >= drills.length) return;
    const next = [...drills];
    [next[i], next[t]] = [next[t], next[i]];
    setDrills(next);
  };

  const remove = i => setDrills(drills.filter((_, idx) => idx !== i));

  const saveDrill = d => {
    if (editing && editing.id) {
      setDrills(drills.map(x => (x.id === editing.id ? { ...d, id: editing.id } : x)));
    } else {
      setDrills([...drills, { ...d, id: uid() }]);
    }
    setEditing(null);
  };

  const addFromCatalog = c => {
    setDrills([...drills, { ...c, id: uid() }]);
    setShowCatalog(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250, background: C.bg, display: "flex", flexDirection: "column" }}>
      <Header
        title={plan.name || "מערך חדש"}
        sub={drills.length + " תרגילים · " + fmt(totalWorkoutTime(drills))}
        right={<Btn variant="quiet" size="sm" onClick={onClose}>סגור</Btn>}
      />
      <Screen bottom={78}>
        <TextInput
          value={plan.name || ""}
          onChange={e => onChange({ ...plan, name: e.target.value })}
          placeholder="שם המערך"
        />

        {drills.length === 0 ? (
          <Empty icon="📋" title="אין עדיין תרגילים" hint="הוסף מהקטלוג או בנה תרגיל חדש" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {drills.map((d, i) => {
              const sc = SEC_COLOR[d.section || "warmup"];
              return (
                <Card key={d.id != null ? d.id : i} style={{ padding: "10px 11px", display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ width: 3, height: 30, borderRadius: 2, background: sc, flexShrink: 0 }} />
                  <button onClick={() => setEditing(d)} style={{
                    flex: 1, minWidth: 0, background: "none", border: "none", cursor: "pointer",
                    textAlign: "start", fontFamily: "Heebo,sans-serif", padding: "6px 0",
                  }}>
                    <div style={{ color: C.ink, fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                    <div style={{ color: sc, fontSize: 11.5, marginTop: 1 }}>
                      {d.type !== "rest" && d.rounds > 1 ? d.rounds + "x · " : ""}{fmt(totalDrillTime(d))}
                      {d.visibility === "private" ? " · 🔒" : ""}
                    </div>
                  </button>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                    <button onClick={() => move(i, -1)} disabled={i === 0} style={{
                      background: "none", border: "none", color: i === 0 ? C.ink3 : C.ink2,
                      cursor: i === 0 ? "default" : "pointer", fontSize: 16, padding: "3px 8px", opacity: i === 0 ? 0.3 : 1,
                    }}>▲</button>
                    <button onClick={() => move(i, 1)} disabled={i === drills.length - 1} style={{
                      background: "none", border: "none", color: i === drills.length - 1 ? C.ink3 : C.ink2,
                      cursor: i === drills.length - 1 ? "default" : "pointer", fontSize: 16, padding: "3px 8px", opacity: i === drills.length - 1 ? 0.3 : 1,
                    }}>▼</button>
                  </div>
                  <button onClick={() => remove(i)} style={{
                    background: "none", border: "none", color: "rgba(255,68,68,0.6)",
                    cursor: "pointer", fontSize: 20, padding: "4px 6px", flexShrink: 0,
                  }}>✕</button>
                </Card>
              );
            })}
          </div>
        )}
      </Screen>

      <div style={{
        position: "absolute", insetInline: 0, bottom: 0, padding: "10px 14px",
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
        background: "linear-gradient(to top, rgba(8,10,16,0.98) 65%, rgba(8,10,16,0))",
        paddingBottom: "calc(10px + env(safe-area-inset-bottom,0px))",
      }}>
        <Btn onClick={() => setShowCatalog(true)}>📚 מהקטלוג</Btn>
        <Btn variant="primary" onClick={() => setEditing("new")}>+ תרגיל חדש</Btn>
      </div>

      <DrillEditor
        open={!!editing}
        drill={editing === "new" ? null : editing}
        onSave={saveDrill}
        onClose={() => setEditing(null)}
        onDelete={d => { setDrills(drills.filter(x => x.id !== d.id)); setEditing(null); }}
      />

      <Sheet open={showCatalog} onClose={() => setShowCatalog(false)} title="בחר מהקטלוג">
        {(catalog || []).filter(c => !c.archivedAt).length === 0 ? (
          <Empty icon="📚" title="הקטלוג ריק" hint="תרגילים שתיצור יופיעו כאן אוטומטית" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(catalog || []).filter(c => !c.archivedAt).map(c => {
              const sc = SEC_COLOR[c.section || "warmup"];
              return (
                <Card key={c.id} onClick={() => addFromCatalog(c)} style={{ padding: "11px 12px", display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ width: 3, height: 28, borderRadius: 2, background: sc, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                    <div style={{ color: sc, fontSize: 11.5, marginTop: 1 }}>{fmt(totalDrillTime(c))}</div>
                  </div>
                  {c.visibility === "private" ? <Pill>🔒</Pill> : <Pill color={C.ink3}>👥 משותף</Pill>}
                </Card>
              );
            })}
          </div>
        )}
      </Sheet>
    </div>
  );
}
