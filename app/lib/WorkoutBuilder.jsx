'use client';

// ── Workout builder ──────────────────────────────────────────────────────────
//
//   right  — the catalog: the coach's own folders of saved drills (and variations)
//   centre — the workout (a list of drills), or one drill opened into its steps
//   left   — the basics: work / rest per side, and a repeating group
//
// Drag from either side into the centre, or just tap "+". A drill can hold other
// drills (a group of steps, repeated), and any drill can be saved to the catalog —
// that is how variations (and per-athlete presets) accumulate.
//
// The component is controlled: it edits `drills` and reports every change through
// onChange; the host decides where that goes (a phone draft, /solo's draft, …).

import { useState, useEffect, useCallback } from "react";

import { DRILL_SECTIONS, SEC_COLOR, fmt, getDrillPhases, totalDrillTime } from "./shared";
import { DrillForm } from "./ui";
import { useCatalog, itemTotal } from "./catalog";
import { useDragDrop } from "./dnd";
import {
  uid, makeStep, makeGroup, makeStepsDrill, cloneNodes, drillToSteps, totalSteps,
  getAt, insertAt, removeAt, updateAt, stepLabel, fmtDur, parseDur, WHO_LABEL,
} from "./steps";

const ORANGE = "#FF6B00";
const FONT = "Heebo,sans-serif";
const MUTED = "rgba(255,255,255,0.7)";
const LINE = "rgba(255,255,255,0.14)";

const btn = (extra) => ({
  minHeight: 44, minWidth: 44, padding: "0 12px", borderRadius: 10, cursor: "pointer", fontFamily: FONT, fontWeight: 700, fontSize: 14,
  background: "rgba(255,255,255,0.07)", border: "1px solid " + LINE, color: "#fff",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, touchAction: "manipulation", ...extra,
});
const input = { background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 8, color: "#fff", padding: "8px 10px", fontFamily: FONT, fontSize: 15, outline: "none", minWidth: 0 };

const SIDE_COLOR = { white: "#e8ecf4", blue: "#5b94ff", both: "#35e88a", none: "#5ec8ff" };

function Grip({ label, payload, startDrag, id }) {
  return (
    <span data-grip={id} role="img" aria-label={"גרור " + label} title="גרור"
      onPointerDown={e => startDrag(e, payload, label)}
      style={{ cursor: "grab", touchAction: "none", userSelect: "none", WebkitUserSelect: "none", color: "rgba(255,255,255,0.55)", fontSize: 20, padding: "6px 4px", flexShrink: 0, lineHeight: 1 }}>⠿</span>
  );
}

// −/+ and a typed mm:ss — for step lengths.
function Dur({ value, onChange, label }) {
  const [text, setText] = useState(fmtDur(value));
  useEffect(() => setText(fmtDur(value)), [value]);
  const commit = () => { const v = parseDur(text); if (v) onChange(v); else setText(fmtDur(value)); };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, direction: "ltr" }}>
      <button aria-label={"הפחת " + label} onClick={() => onChange(Math.max(5, value - (value > 60 ? 15 : 5)))} style={btn({ minWidth: 40, padding: 0 })}>−</button>
      <input aria-label={label} value={text} onChange={e => setText(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
        style={{ ...input, width: 66, textAlign: "center", fontFamily: "Oswald,sans-serif", fontSize: 18, padding: "6px 4px" }} inputMode="numeric" />
      <button aria-label={"הוסף " + label} onClick={() => onChange(value + (value >= 60 ? 15 : 5))} style={btn({ minWidth: 40, padding: 0 })}>+</button>
    </span>
  );
}

function InsertMark() {
  return <div aria-hidden="true" style={{ height: 4, borderRadius: 2, background: ORANGE, margin: "2px 0", boxShadow: "0 0 10px rgba(255,107,0,0.7)" }} />;
}

// ── a list of steps / groups, recursive ──────────────────────────────────────
function StepList({ nodes, path, over, dragging, startDrag, onUpdate, onRemove, depth = 0 }) {
  const zone = "steps:" + path.join(".");
  const here = over && over.zone === zone ? over.index : -1;
  const rows = [];
  nodes.forEach((n, i) => {
    if (here === i) rows.push(<InsertMark key={"m" + i} />);
    const p = [...path, i];
    if (n.type === "group") {
      rows.push(
        <div key={n.id} data-item data-node={"group:" + n.name} style={{ border: "1px solid rgba(255,107,0,0.5)", background: "rgba(255,107,0,0.07)", borderRadius: 12, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Grip id={"node:" + p.join(".")} label={n.name} payload={{ t: "node", path, index: i }} startDrag={startDrag} />
            <span aria-hidden="true">🔁</span>
            <input aria-label="שם הקבוצה" value={n.name} onChange={e => onUpdate(path, i, { name: e.target.value })} style={{ ...input, flex: 1, minWidth: 90, fontWeight: 800 }} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <button aria-label="פחות חזרות" onClick={() => onUpdate(path, i, { repeat: Math.max(1, n.repeat - 1) })} style={btn({ minWidth: 40, padding: 0 })}>−</button>
              <span style={{ fontWeight: 900, minWidth: 44, textAlign: "center" }} aria-label={"חזרות: " + n.repeat}>×{n.repeat}</span>
              <button aria-label="יותר חזרות" onClick={() => onUpdate(path, i, { repeat: n.repeat + 1 })} style={btn({ minWidth: 40, padding: 0 })}>+</button>
            </span>
            <span style={{ color: MUTED, fontSize: 13 }}>{fmtDur(totalSteps([n]))}</span>
            <button aria-label={"מחק " + n.name} onClick={() => onRemove(path, i)} style={btn({ color: "#ff8080", minWidth: 40, padding: 0 })}>🗑</button>
          </div>
          <StepList nodes={n.steps} path={p} over={over} dragging={dragging} startDrag={startDrag} onUpdate={onUpdate} onRemove={onRemove} depth={depth + 1} />
        </div>
      );
    } else {
      const rest = n.kind === "rest";
      const sideColor = SIDE_COLOR[rest ? "none" : n.who] || "#fff";
      rows.push(
        <div key={n.id} data-item data-node={"step:" + stepLabel(n)} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: "rgba(255,255,255,0.05)", border: "1px solid " + LINE, borderInlineStart: "5px solid " + sideColor, borderRadius: 10, padding: "6px 8px" }}>
          <Grip id={"node:" + p.join(".")} label={stepLabel(n)} payload={{ t: "node", path, index: i }} startDrag={startDrag} />
          <span style={{ fontWeight: 800, minWidth: 62 }}>{rest ? "מנוחה" : "עבודה"}</span>
          {!rest && (
            <select aria-label="מי עובד" value={n.who} onChange={e => onUpdate(path, i, { who: e.target.value })} style={{ ...input, padding: "8px 6px" }}>
              {Object.entries(WHO_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          )}
          <span style={{ flex: 1 }} />
          <Dur value={n.duration} label="משך" onChange={d => onUpdate(path, i, { duration: d })} />
          <button aria-label="מחק צעד" onClick={() => onRemove(path, i)} style={btn({ color: "#ff8080", minWidth: 40, padding: 0 })}>🗑</button>
        </div>
      );
    }
  });
  if (here >= nodes.length) rows.push(<InsertMark key="mend" />);

  return (
    <div data-zone={zone} style={{
      display: "flex", flexDirection: "column", gap: 6, minHeight: 44, borderRadius: 10, padding: depth ? "2px 0 2px 0" : 0,
      outline: dragging && over && over.zone === zone ? "2px dashed " + ORANGE : (dragging ? "1px dashed rgba(255,255,255,0.25)" : "none"), outlineOffset: 2,
    }}>
      {rows}
      {!nodes.length && <div style={{ color: MUTED, fontSize: 14, textAlign: "center", padding: "10px 6px" }}>{depth ? "גררו לכאן צעדים לתוך הקבוצה" : "ריק — גררו לכאן רכיבים או תרגילים מהקטלוג"}</div>}
    </div>
  );
}

// ── the builder ──────────────────────────────────────────────────────────────
export default function WorkoutBuilder({ drills, onChange, onClose, title = "בונה מערך אימון" }) {
  const cat = useCatalog();
  const [openId, setOpenId] = useState(null);          // drill opened into its steps
  const [formId, setFormId] = useState(null);          // older parametric drill in the form
  const [formData, setFormData] = useState(null);
  const [workDur, setWorkDur] = useState(60);
  const [restDur, setRestDur] = useState(15);
  const [panel, setPanel] = useState(null);            // narrow screens: "catalog" | "basics"
  const [narrow, setNarrow] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [saving, setSaving] = useState(null);          // { folderId, name }
  const [toast, setToast] = useState("");

  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 860);
    on(); window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const say = msg => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  const open = drills.find(d => d.id === openId) || null;
  useEffect(() => { if (openId && !open) setOpenId(null); }, [openId, open]);

  const setDrill = (id, patch) => onChange(drills.map(d => d.id === id ? { ...d, ...(typeof patch === "function" ? patch(d) : patch) } : d));
  const withSteps = (d, steps) => ({ steps, durationWork: totalSteps(steps) });

  // ── things that can be created from the side panels ──
  const basicNode = b => b.t === "group" ? makeGroup("חזרות", 3, []) : makeStep(b.kind, b.who, b.kind === "rest" ? restDur : workDur);
  const drillFromItem = item => makeStepsDrill({ name: item.name, section: item.section || "technique", steps: cloneNodes(item.steps), note: item.note || "", sourceId: item.id });
  const drillFromBasic = b => makeStepsDrill({
    name: b.t === "group" ? "קבוצת חזרות" : b.kind === "rest" ? "מנוחה" : "תרגיל חדש",
    section: b.kind === "rest" ? "rest" : "technique",
    steps: b.t === "group" ? [makeGroup("חזרות", 3, [])] : [basicNode(b)],
  });

  // ── tree edits on the open drill ──
  const onUpdate = (path, index, patch) => { if (open) setDrill(open.id, d => withSteps(d, updateAt(d.steps, path, index, patch))); };
  const onRemove = (path, index) => { if (open) setDrill(open.id, d => withSteps(d, removeAt(d.steps, path, index))); };

  const moveNode = (src, targetPath, targetIndex) => {
    if (!open) return;
    const srcFull = [...src.path, src.index];
    // never drop a group into itself
    if (targetPath.length >= srcFull.length && srcFull.every((v, k) => targetPath[k] === v)) return;
    setDrill(open.id, d => {
      const node = getAt(d.steps, src.path)[src.index];
      let steps = removeAt(d.steps, src.path, src.index);
      // removing shifted siblings: adjust the target path / index that go through that list
      let tp = [...targetPath], ti = targetIndex;
      const depth = src.path.length;
      if (tp.length === depth && src.path.every((v, k) => tp[k] === v)) { if (src.index < ti) ti -= 1; }
      else if (tp.length > depth && src.path.every((v, k) => tp[k] === v) && tp[depth] > src.index) tp[depth] -= 1;
      steps = insertAt(steps, tp, ti, node);
      return withSteps(d, steps);
    });
  };

  const onDrop = useCallback((payload, zone, index) => {
    if (zone === "workout") {
      if (payload.t === "drill") {
        const from = drills.findIndex(d => d.id === payload.id);
        if (from < 0) return;
        const a = [...drills]; const [it] = a.splice(from, 1);
        a.splice(index > from ? index - 1 : index, 0, it);
        onChange(a);
        return;
      }
      const nd = payload.t === "item" ? (() => { const it = cat.catalog.items.find(i => i.id === payload.id); return it && drillFromItem(it); })() : drillFromBasic(payload);
      if (!nd) return;
      const a = [...drills]; a.splice(index, 0, nd); onChange(a);
      return;
    }
    if (zone.startsWith("steps:") && open) {
      const path = zone.slice(6) === "" ? [] : zone.slice(6).split(".").map(Number);
      if (payload.t === "node") { moveNode(payload, path, index); return; }
      let node = null;
      if (payload.t === "item") {
        const it = cat.catalog.items.find(i => i.id === payload.id);
        if (it) node = makeGroup(it.name, 1, cloneNodes(it.steps));
      } else node = basicNode(payload);
      if (node) setDrill(open.id, d => withSteps(d, insertAt(d.steps, path, index, node)));
    }
  }, [drills, open, cat.catalog, workDur, restDur]);   // eslint-disable-line react-hooks/exhaustive-deps

  const { startDrag, layer, over, dragging } = useDragDrop(onDrop);

  // tap-to-add (phones, and anyone who prefers it)
  const addBasic = b => {
    if (open) setDrill(open.id, d => withSteps(d, [...d.steps, basicNode(b)]));
    else onChange([...drills, drillFromBasic(b)]);
    if (narrow) setPanel(null);
  };
  const addItem = it => {
    if (open) setDrill(open.id, d => withSteps(d, [...d.steps, makeGroup(it.name, 1, cloneNodes(it.steps))]));
    else onChange([...drills, drillFromItem(it)]);
    if (narrow) setPanel(null);
  };

  // ── catalog actions ──
  const newFolder = () => { const n = window.prompt("שם התיקייה:"); if (n && n.trim()) cat.addFolder(n.trim()); };
  const renameFolder = f => { const n = window.prompt("שם חדש לתיקייה:", f.name); if (n && n.trim()) cat.renameFolder(f.id, n.trim()); };
  const removeFolder = f => { if (window.confirm("למחוק את התיקייה \"" + f.name + "\" ואת כל מה שבתוכה?")) cat.removeFolder(f.id); };
  const duplicateItem = it => { cat.saveItem({ ...it, id: undefined, name: it.name + " (וריאציה)", steps: cloneNodes(it.steps) }); say("נוצרה וריאציה"); };
  const moveItem = it => {
    const names = cat.catalog.folders.map((f, i) => (i + 1) + ". " + f.name).join("\n");
    const n = parseInt(window.prompt("להעביר לאיזו תיקייה? (מספר)\n" + names), 10);
    const f = cat.catalog.folders[n - 1];
    if (f) cat.moveItem(it.id, f.id);
  };
  const startSave = () => {
    if (!open) return;
    setSaving({ folderId: cat.catalog.folders[0] ? cat.catalog.folders[0].id : "", name: open.name });
  };
  const doSave = () => {
    if (!saving || !open) return;
    let folderId = saving.folderId;
    if (!folderId || folderId === "__new") {
      const n = window.prompt("שם התיקייה החדשה:");
      if (!n || !n.trim()) return;
      folderId = cat.addFolder(n.trim()).id;
    }
    cat.saveItem({ folderId, name: saving.name.trim() || open.name, section: open.section, steps: cloneNodes(open.steps), note: open.note || "" });
    setSaving(null);
    say("נשמר בקטלוג");
  };

  // ── pieces ──
  const total = drills.reduce((a, d) => a + totalDrillTime(d), 0);

  const BasicChip = ({ b, label, color, id }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.06)", border: "1px solid " + LINE, borderInlineStart: "5px solid " + color, borderRadius: 10, padding: "4px 6px" }}>
      <Grip id={id} label={label} payload={b} startDrag={startDrag} />
      <span style={{ flex: 1, fontWeight: 800, fontSize: 15 }}>{label}</span>
      <button aria-label={"הוסף " + label} onClick={() => addBasic(b)} style={btn({ minWidth: 40, padding: 0, color: ORANGE })}>＋</button>
    </div>
  );

  const basics = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontWeight: 900, fontSize: 16 }}>🧩 רכיבים</div>
      <div style={{ color: MUTED, fontSize: 13 }}>גררו למרכז, או לחצו ＋</div>
      <BasicChip id="basic:work-both" b={{ t: "basic", kind: "work", who: "both" }} label="עבודה — שניהם" color={SIDE_COLOR.both} />
      <BasicChip id="basic:work-white" b={{ t: "basic", kind: "work", who: "white" }} label="עבודה — לבן" color={SIDE_COLOR.white} />
      <BasicChip id="basic:work-blue" b={{ t: "basic", kind: "work", who: "blue" }} label="עבודה — כחול" color={SIDE_COLOR.blue} />
      <BasicChip id="basic:rest" b={{ t: "basic", kind: "rest", who: "none" }} label="מנוחה" color={SIDE_COLOR.none} />
      <BasicChip id="basic:group" b={{ t: "group" }} label="🔁 קבוצת חזרות" color={ORANGE} />
      <div style={{ borderTop: "1px solid " + LINE, paddingTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ color: MUTED, fontSize: 13 }}>משך ברירת מחדל</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}><span>עבודה</span><Dur value={workDur} label="משך עבודה" onChange={setWorkDur} /></div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}><span>מנוחה</span><Dur value={restDur} label="משך מנוחה" onChange={setRestDur} /></div>
      </div>
    </div>
  );

  const catalogPanel = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontWeight: 900, fontSize: 16 }}>📚 הקטלוג שלי</span>
        <button onClick={newFolder} aria-label="תיקייה חדשה" style={btn({ color: ORANGE })}>＋ תיקייה</button>
      </div>
      {!cat.catalog.folders.length && <div style={{ color: MUTED, fontSize: 14 }}>אין תיקיות עדיין. פתחו תיקייה (למשל "ראנדורי" או שם של מתאמן).</div>}
      {cat.catalog.folders.map(f => {
        const items = cat.catalog.items.filter(i => i.folderId === f.id);
        const shut = collapsed[f.id];
        return (
          <div key={f.id} data-folder={f.name} style={{ border: "1px solid " + LINE, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.06)", padding: "4px 6px" }}>
              <button aria-expanded={!shut} aria-label={(shut ? "פתח " : "סגור ") + f.name} onClick={() => setCollapsed(c => ({ ...c, [f.id]: !shut }))} style={btn({ background: "none", border: "none", minWidth: 36, padding: 0 })}>{shut ? "📁" : "📂"}</button>
              <span style={{ flex: 1, fontWeight: 800 }}>{f.name} <span style={{ color: MUTED, fontWeight: 400, fontSize: 13 }}>({items.length})</span></span>
              <button aria-label={"שנה שם " + f.name} onClick={() => renameFolder(f)} style={btn({ background: "none", border: "none", minWidth: 36, padding: 0 })}>✎</button>
              <button aria-label={"מחק תיקייה " + f.name} onClick={() => removeFolder(f)} style={btn({ background: "none", border: "none", minWidth: 36, padding: 0, color: "#ff8080" })}>🗑</button>
            </div>
            {!shut && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 6 }}>
                {!items.length && <div style={{ color: MUTED, fontSize: 13, padding: 4 }}>ריקה — שמרו תרגיל לכאן מתוך העורך</div>}
                {items.map(it => (
                  <div key={it.id} data-catalog-item={it.name} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid " + LINE, borderInlineStart: "5px solid " + (SEC_COLOR[it.section] || ORANGE), borderRadius: 10, padding: "4px 6px", display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Grip id={"item:" + it.name} label={it.name} payload={{ t: "item", id: it.id }} startDrag={startDrag} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.25 }}>{it.name}</div>
                        <div style={{ color: MUTED, fontSize: 12 }}>{fmtDur(itemTotal(it))}</div>
                      </div>
                      <button aria-label={"הוסף " + it.name} onClick={() => addItem(it)} style={btn({ minWidth: 40, padding: 0, color: ORANGE })}>＋</button>
                    </div>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <button aria-label={"וריאציה של " + it.name} onClick={() => duplicateItem(it)} style={btn({ minHeight: 34, fontSize: 12, padding: "0 8px" })}>⧉ וריאציה</button>
                      <button aria-label={"העבר " + it.name} onClick={() => moveItem(it)} style={btn({ minHeight: 34, fontSize: 12, padding: "0 8px" })}>↪ העבר</button>
                      <button aria-label={"מחק " + it.name} onClick={() => cat.removeItem(it.id)} style={btn({ minHeight: 34, minWidth: 34, padding: 0, color: "#ff8080" })}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // ── centre ──
  const workoutView = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontWeight: 900, fontSize: 18 }}>מערך האימון</span>
        <span style={{ color: MUTED, fontSize: 14 }}>{drills.length} תרגילים · {fmt(total)}</span>
      </div>
      <div data-zone="workout" style={{
        display: "flex", flexDirection: "column", gap: 8, minHeight: 120, borderRadius: 12, padding: 2,
        outline: dragging && over && over.zone === "workout" ? "2px dashed " + ORANGE : (dragging ? "1px dashed rgba(255,255,255,0.25)" : "none"), outlineOffset: 2,
      }}>
        {(() => {
          const rows = [];
          const here = over && over.zone === "workout" ? over.index : -1;
          drills.forEach((d, i) => {
            if (here === i) rows.push(<InsertMark key={"m" + i} />);
            const stepsKind = Array.isArray(d.steps);
            rows.push(
              <div key={d.id} data-item data-drill={d.name} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid " + LINE, borderInlineStart: "6px solid " + (SEC_COLOR[d.section] || ORANGE), borderRadius: 12, padding: 8 }}>
                {formId === d.id ? (
                  <DrillForm drill={formData} onChange={setFormData} onCancel={() => setFormId(null)}
                    onSave={() => { onChange(drills.map(x => x.id === d.id ? formData : x)); setFormId(null); }} />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Grip id={"drill:" + d.name} label={d.name} payload={{ t: "drill", id: d.id }} startDrag={startDrag} />
                    <span style={{ width: 26, height: 26, borderRadius: "50%", background: "#232b3f", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{d.name || "ללא שם"}</div>
                      <div style={{ color: MUTED, fontSize: 13 }}>{fmt(totalDrillTime(d))}{stepsKind ? " · " + getDrillPhases(d).length + " שלבים" : " · רגיל"}</div>
                    </div>
                    <button onClick={() => {
                      if (!stepsKind) onChange(drills.map(x => x.id === d.id ? { ...x, type: "steps", steps: drillToSteps(x, getDrillPhases) } : x));
                      setOpenId(d.id);
                    }} aria-label={"ערוך צעדים של " + d.name} style={btn({ color: ORANGE })}>✏️ צעדים</button>
                    {!stepsKind && <button aria-label={"פרמטרים של " + d.name} onClick={() => { setFormId(d.id); setFormData({ ...d }); }} style={btn()}>⚙️</button>}
                    <button aria-label={d.autoNext ? "מעבר אוטומטי פעיל" : "מעבר אוטומטי כבוי"} aria-pressed={!!d.autoNext} title="מעבר אוטומטי לתרגיל הבא" onClick={() => setDrill(d.id, { autoNext: !d.autoNext })} style={btn({ background: d.autoNext ? "rgba(46,204,113,0.2)" : "rgba(255,255,255,0.07)", borderColor: d.autoNext ? "#2ecc71" : LINE })}>⏭</button>
                    <button aria-label={"שכפל " + d.name} onClick={() => { const c = { ...d, id: uid(), name: d.name + " (עותק)", steps: stepsKind ? cloneNodes(d.steps) : undefined }; if (!stepsKind) delete c.steps; const a = [...drills]; a.splice(i + 1, 0, c); onChange(a); }} style={btn({ minWidth: 44, padding: 0 })}>⧉</button>
                    <button aria-label={"מחק " + d.name} onClick={() => onChange(drills.filter(x => x.id !== d.id))} style={btn({ minWidth: 44, padding: 0, color: "#ff8080" })}>🗑</button>
                  </div>
                )}
              </div>
            );
          });
          if (here >= drills.length) rows.push(<InsertMark key="mend" />);
          return rows;
        })()}
        {!drills.length && <div style={{ color: MUTED, textAlign: "center", padding: 24, fontSize: 15 }}>המערך ריק — גררו תרגיל מהקטלוג או רכיב מהצד, או לחצו ＋</div>}
      </div>
    </>
  );

  const drillView = open && (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setOpenId(null)} style={btn()}>→ חזרה למערך</button>
        <input aria-label="שם התרגיל" value={open.name} onChange={e => setDrill(open.id, { name: e.target.value })} style={{ ...input, flex: 1, minWidth: 140, fontWeight: 900, fontSize: 18 }} />
        <select aria-label="סוג התרגיל" value={open.section} onChange={e => setDrill(open.id, { section: e.target.value })} style={{ ...input }}>
          {DRILL_SECTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <span style={{ color: MUTED }}>{fmtDur(totalSteps(open.steps))}</span>
      </div>
      <input aria-label="הערה לתרגיל" placeholder="הערה שתוצג על המסך (למשל: זריקה לצד שמאל)" value={open.note || ""} onChange={e => setDrill(open.id, { note: e.target.value })} style={{ ...input, width: "100%" }} />
      <StepList nodes={open.steps} path={[]} over={over} dragging={dragging} startDrag={startDrag} onUpdate={onUpdate} onRemove={onRemove} />
      {saving ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", border: "1px solid rgba(255,107,0,0.5)", borderRadius: 12, padding: 8 }}>
          <input aria-label="שם בקטלוג" value={saving.name} onChange={e => setSaving({ ...saving, name: e.target.value })} style={{ ...input, flex: 1, minWidth: 120 }} />
          <select aria-label="תיקייה" value={saving.folderId} onChange={e => setSaving({ ...saving, folderId: e.target.value })} style={input}>
            {cat.catalog.folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            <option value="__new">＋ תיקייה חדשה…</option>
          </select>
          <button onClick={doSave} style={btn({ background: "linear-gradient(135deg,#FF6B00,#cc4400)", border: "none" })}>שמור</button>
          <button onClick={() => setSaving(null)} style={btn()}>ביטול</button>
        </div>
      ) : (
        <button onClick={startSave} style={btn({ alignSelf: "flex-start", color: ORANGE, borderColor: "rgba(255,107,0,0.6)" })}>💾 שמור בקטלוג</button>
      )}
    </>
  );

  const centre = (
    <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      {open ? drillView : workoutView}
      {!open && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => addBasic({ t: "basic", kind: "work", who: "both" })} style={btn({ color: ORANGE, borderStyle: "dashed", borderColor: "rgba(255,107,0,0.5)" })}>＋ תרגיל חדש</button>
          <button onClick={() => addBasic({ t: "basic", kind: "rest", who: "none" })} style={btn({ color: "#5ec8ff", borderStyle: "dashed", borderColor: "rgba(94,200,255,0.5)" })}>＋ מנוחה</button>
        </div>
      )}
    </div>
  );

  const sideStyle = { width: 270, flexShrink: 0, overflowY: "auto", padding: 12, background: "rgba(0,0,0,0.3)" };

  return (
    <div role="dialog" aria-label={title} style={{ position: "fixed", inset: 0, zIndex: 250, background: "#0a0d16", color: "#fff", direction: "rtl", fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <style>{`*{box-sizing:border-box} button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #FF6B00;outline-offset:2px}`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid " + LINE, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 900, fontSize: 18, flex: 1 }}>📐 {title}</span>
        {narrow && <button onClick={() => setPanel(p => p === "catalog" ? null : "catalog")} aria-pressed={panel === "catalog"} style={btn()}>📚 קטלוג</button>}
        {narrow && <button onClick={() => setPanel(p => p === "basics" ? null : "basics")} aria-pressed={panel === "basics"} style={btn()}>🧩 רכיבים</button>}
        <button onClick={onClose} style={btn({ background: "linear-gradient(135deg,#2ecc71,#1f9c54)", border: "none", fontSize: 16 })}>✓ סיום</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", position: "relative" }}>
        {!narrow && <div data-panel="catalog" style={{ ...sideStyle, width: 300, borderInlineEnd: "1px solid " + LINE }}>{catalogPanel}</div>}
        {centre}
        {!narrow && <div data-panel="basics" style={{ ...sideStyle, borderInlineStart: "1px solid " + LINE }}>{basics}</div>}
        {narrow && panel && (
          <div data-panel={panel} style={{ position: "absolute", top: 0, bottom: 0, [panel === "catalog" ? "right" : "left"]: 0, width: "min(88vw,340px)", background: "#0d1120", borderInline: "1px solid " + LINE, boxShadow: "0 0 40px rgba(0,0,0,0.6)", zIndex: 5, overflowY: "auto", padding: 12 }}>
            {panel === "catalog" ? catalogPanel : basics}
          </div>
        )}
      </div>
      {toast && <div role="status" style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", background: "#0d1120", border: "2px solid " + ORANGE, borderRadius: 12, padding: "10px 20px", fontWeight: 800, zIndex: 300 }}>{toast}</div>}
      {layer}
    </div>
  );
}
