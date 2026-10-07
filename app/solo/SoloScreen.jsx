'use client';

// ── Single-device mode ───────────────────────────────────────────────────────
//
// For a TV that is "dumb": the coach mirrors the phone's screen to it. Whatever
// is on the phone is what the room sees, so the phone IS the display — the same
// clock engine and the same StageView as /display, in landscape, with touch
// control on top:
//
//   tap          show / hide the control bar
//   swipe        next / previous drill
//   ✏️ עריכה     edit on a private draft; the stage keeps showing the last
//                 synced workout until the coach presses "סנכרן לשיקוף"
//
// Mirroring cannot hide the phone's own screen, so before the editor opens the
// coach is told to pause mirroring first.

import { useState, useEffect, useRef, useCallback } from "react";

import { supa, fmt } from "../lib/shared";
import { INIT_JUDOKAS, INIT_PAIRS, INIT_DRILLS } from "../lib/defaults";
import { useWorkoutClock } from "../lib/clock";
import { useWakeLock } from "../lib/wakeLock";
import StageView from "../lib/stage";
import EditorModal from "../lib/EditorModal";
import WorkoutModal from "../lib/WorkoutModal";

const STORE_KEY = "judo_solo_state";
const GUIDE_KEY = "judo_solo_guide_seen";
const ORANGE = "#FF6B00";
const FONT = "Heebo,sans-serif";

const initialData = () => ({
  drills: INIT_DRILLS, judokas: INIT_JUDOKAS, pairs: INIT_PAIRS,
  notes: "", soundType: "beep", globalAutoNext: true,
});

const barBtn = (extra) => ({
  minWidth: 64, minHeight: 64, padding: "0 14px", borderRadius: 14, cursor: "pointer",
  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.22)", color: "#fff",
  fontFamily: FONT, fontWeight: 800, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  touchAction: "manipulation", WebkitTapHighlightColor: "transparent", ...extra,
});

const overlay = { position: "fixed", inset: 0, zIndex: 150, background: "rgba(8,10,16,0.97)", direction: "rtl", fontFamily: FONT, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: 24, textAlign: "center", overflowY: "auto" };
const bigBtn = (primary) => ({
  minHeight: 56, padding: "0 26px", borderRadius: 14, fontFamily: FONT, fontWeight: 900, fontSize: 18, cursor: "pointer", color: "#fff",
  border: primary ? "none" : "1px solid rgba(255,255,255,0.3)",
  background: primary ? "linear-gradient(135deg,#FF6B00,#cc4400)" : "rgba(255,255,255,0.07)",
});

export default function SoloScreen() {
  const [data, setData]     = useState(initialData);
  const [loaded, setLoaded] = useState(false);

  // ── persistence: the last synced workout survives a reload ────────────────
  useEffect(() => {
    let restored = false;
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && Array.isArray(d.drills) && d.drills.length) {
          setData(prev => ({ ...prev, ...d }));
          restored = true;
        }
      }
    } catch(e) {}
    if (!restored) {
      supa("workouts?order=date.desc&limit=1").then(r => {
        if (r && r[0]) {
          const w = r[0];
          setData(prev => ({
            ...prev,
            drills: w.drills && w.drills.length ? w.drills : prev.drills,
            judokas: w.judokas && w.judokas.length ? w.judokas : prev.judokas,
            pairs: w.pairs && w.pairs.length ? w.pairs : prev.pairs,
          }));
        }
      });
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch(e) {}
  }, [data, loaded]);

  const clock = useWorkoutClock({
    drills: data.drills, judokas: data.judokas, globalAutoNext: data.globalAutoNext, soundType: data.soundType,
  });
  const { running, drillIdx, phase, current, goToDrill, toggleRunning, nextPhaseManual, addTime, initCtx } = clock;

  useWakeLock(true);

  // ── control bar ───────────────────────────────────────────────────────────
  const [barOpen, setBarOpen] = useState(true);
  const [stamp, setStamp]     = useState(0);
  const touchBar = () => { setBarOpen(true); setStamp(s => s + 1); };
  useEffect(() => {
    if (!barOpen || !running) return;
    const id = setTimeout(() => setBarOpen(false), 4000);
    return () => clearTimeout(id);
  }, [barOpen, running, stamp]);

  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const say = useCallback(msg => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  const enterFullscreen = () => {
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
        el.requestFullscreen().then(() => {
          try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {}); } catch(e) {}
        }).catch(() => {});
      } else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
    } catch(e) {}
  };

  // ── gestures ──────────────────────────────────────────────────────────────
  const g = useRef(null);
  const onPointerDown = e => {
    if (e.target.closest && e.target.closest("[data-solo-ui]")) { g.current = null; return; }
    g.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };
  const onPointerUp = e => {
    const s = g.current; g.current = null;
    if (!s) return;
    initCtx();
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const to = drillIdx + (dx < 0 ? 1 : -1);
      if (to >= 0 && to < data.drills.length) {
        goToDrill(to);
        say((dx < 0 ? "▶ תרגיל הבא: " : "◀ תרגיל קודם: ") + data.drills[to].name);
      } else say(dx < 0 ? "זה התרגיל האחרון" : "זה התרגיל הראשון");
      touchBar();
    } else if (Math.hypot(dx, dy) < 14 && Date.now() - s.t < 500) {
      setBarOpen(o => { if (!o) setStamp(x => x + 1); return !o; });
    }
  };

  const play = () => { initCtx(); toggleRunning(); touchBar(); };

  // ── orientation + first-run guide ─────────────────────────────────────────
  const [portrait, setPortrait] = useState(false);
  const [rotateIgnored, setRotateIgnored] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const on = () => setPortrait(mq.matches);
    on();
    mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on); };
  }, []);
  const [guide, setGuide] = useState(false);
  useEffect(() => { try { if (!window.localStorage.getItem(GUIDE_KEY)) setGuide(true); } catch(e) { setGuide(true); } }, []);
  const closeGuide = () => {
    try { window.localStorage.setItem(GUIDE_KEY, "1"); } catch(e) {}
    setGuide(false);
    enterFullscreen();
  };

  // ── private editing ───────────────────────────────────────────────────────
  // null → "warn" (pause mirroring first) → "edit" (the editor) → "review" (sync or discard)
  const [editStep, setEditStep] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showLib, setShowLib] = useState(false);
  const [justSynced, setJustSynced] = useState(false);

  const startEdit = () => { if (running) clock.setRunning(false); setEditStep("warn"); };
  const openEditor = () => {
    setDraft({ drills: data.drills, judokas: data.judokas, pairs: data.pairs, notes: data.notes });
    setEditStep("edit");
  };
  const changed = !!draft && JSON.stringify(draft) !== JSON.stringify({ drills: data.drills, judokas: data.judokas, pairs: data.pairs, notes: data.notes });
  useEffect(() => { if (editStep === "review" && !changed) { setEditStep(null); setDraft(null); } }, [editStep, changed]);

  const sync = () => {
    setData(prev => ({ ...prev, ...draft }));
    if (clock.drillIdx >= draft.drills.length) clock.setDrillIdx(Math.max(0, draft.drills.length - 1));
    setEditStep(null); setDraft(null);
    setJustSynced(true);
  };
  const discard = () => { setEditStep(null); setDraft(null); };

  const uiProps = { "data-solo-ui": "1" };

  return (
    <div
      onPointerDown={onPointerDown} onPointerUp={onPointerUp}
      style={{ height: "100vh", maxHeight: "100dvh", width: "100%", maxWidth: "100vw", display: "flex", background: "#080a10", overflow: "hidden", touchAction: "pan-y", overscrollBehavior: "none", position: "relative" }}
    >
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&family=Oswald:wght@700&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0} html,body{overflow:hidden;overscroll-behavior:none;background:#080a10} button:focus-visible{outline:3px solid #FF6B00;outline-offset:2px} @media (max-height:520px){.solo-bar{gap:8px!important;padding-top:6px!important} .solo-bar button{min-height:50px!important;min-width:54px!important;font-size:16px!important;padding:0 10px!important}}`}</style>

      <div style={{ flex: 1, minWidth: 0, display: "flex", userSelect: "none", WebkitUserSelect: "none" }}>
      <StageView
        drills={data.drills} drillIdx={drillIdx} phaseIdx={clock.phaseIdx} timeLeft={clock.timeLeft}
        running={running} totalElapsed={clock.totalElapsed} alertActive={clock.alertActive}
        judokas={data.judokas} pairs={data.pairs} notes={data.notes} personalTimers={clock.personalTimers}
      />
      </div>

      {/* control bar */}
      {barOpen && (
        <div {...uiProps} className="solo-bar" role="toolbar" aria-label="שליטה באימון" style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 100, direction: "rtl",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap",
          padding: "10px 14px calc(10px + env(safe-area-inset-bottom))", background: "rgba(8,10,16,0.94)", borderTop: "1px solid rgba(255,255,255,0.18)",
        }}>
          <button aria-label="תרגיל קודם" onClick={() => { goToDrill(drillIdx - 1); touchBar(); }} disabled={drillIdx === 0} style={barBtn({ opacity: drillIdx === 0 ? 0.35 : 1 })}>⏮</button>
          <button aria-label={running ? "עצור" : "הפעל"} onClick={play} style={barBtn({ minWidth: 150, fontSize: 24, background: running ? "linear-gradient(135deg,#ff4444,#a82020)" : "linear-gradient(135deg,#2ecc71,#1f9c54)", border: "none" })}>{running ? "⏸ עצור" : "▶ הפעל"}</button>
          <button aria-label="שלב הבא" onClick={() => { nextPhaseManual(); touchBar(); }} style={barBtn()}>⏭</button>
          <span style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.2)" }}/>
          <button aria-label="הפחת 30 שניות" onClick={() => { addTime(-30); touchBar(); }} style={barBtn()}>−30</button>
          <button aria-label="הוסף 30 שניות" onClick={() => { addTime(30); touchBar(); }} style={barBtn()}>+30</button>
          <span style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.2)" }}/>
          <button aria-label="עריכת האימון" onClick={startEdit} style={barBtn({ color: ORANGE, borderColor: "rgba(255,107,0,0.6)" })}>✏️ עריכה</button>
          <button aria-label={data.soundType === "mute" ? "הפעל צליל" : "השתק"} onClick={() => { setData(d => ({ ...d, soundType: d.soundType === "mute" ? "beep" : "mute" })); touchBar(); }} style={barBtn()}>{data.soundType === "mute" ? "🔇" : "🔔"}</button>
          <button aria-label="מסך מלא" onClick={() => { enterFullscreen(); touchBar(); }} style={barBtn()}>⛶</button>
        </div>
      )}

      {toast && <div role="status" style={{ position: "fixed", top: "6vh", left: "50%", transform: "translateX(-50%)", zIndex: 160, background: "rgba(8,10,16,0.92)", border: "2px solid " + ORANGE, color: "#fff", borderRadius: 14, padding: "10px 24px", fontFamily: FONT, fontWeight: 800, fontSize: 22, direction: "rtl", whiteSpace: "nowrap" }}>{toast}</div>}

      {justSynced && (
        <div {...uiProps} role="status" style={{ position: "fixed", top: "6vh", left: "50%", transform: "translateX(-50%)", zIndex: 160, background: "rgba(8,28,18,0.97)", border: "2px solid #2ecc71", color: "#dfffe9", borderRadius: 14, padding: "12px 20px", fontFamily: FONT, fontWeight: 800, fontSize: 18, direction: "rtl", display: "flex", alignItems: "center", gap: 14 }}>
          ✓ הסנכרון הושלם — אפשר לחדש את השיקוף
          <button onClick={() => setJustSynced(false)} style={{ ...barBtn(), minHeight: 44, minWidth: 0, fontSize: 16 }}>בסדר</button>
        </div>
      )}

      {/* rotate */}
      {portrait && !rotateIgnored && !guide && (
        <div {...uiProps} style={overlay}>
          <div style={{ fontSize: 64 }}>🔄</div>
          <div style={{ fontSize: 26, fontWeight: 900 }}>סובבו את הנייד לרוחב</div>
          <div style={{ fontSize: 16, color: "#c3cada", maxWidth: 320, lineHeight: 1.6 }}>המסך באולם הוא לרוחב. בכיוון אורך יופיעו פסים שחורים משני הצדדים.</div>
          <button onClick={() => setRotateIgnored(true)} style={bigBtn(false)}>המשך בכל זאת</button>
        </div>
      )}

      {/* first-run guide */}
      {guide && (
        <div {...uiProps} role="dialog" aria-label="הוראות שיקוף" style={overlay}>
          <div style={{ fontSize: 40 }}>🪞</div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>מצב שיקוף</div>
          <ol style={{ listStyle: "none", maxWidth: 520, textAlign: "start", display: "flex", flexDirection: "column", gap: 12, fontSize: 17, lineHeight: 1.6, color: "#dfe4ee" }}>
            <li>1. הפעילו <b>״נא לא להפריע״</b> — אחרת התראות יופיעו על המסך באולם.</li>
            <li>2. שקפו את הנייד לטלויזיה: <b>אייפון</b> — מרכז הבקרה ← שיקוף מסך. <b>אנדרואיד</b> — Smart View / Cast.</li>
            <li>3. סובבו לרוחב. נגיעה במסך פותחת את כפתורי השליטה, החלקה עוברת בין תרגילים.</li>
            <li>4. לעריכת האימון עוצרים את השיקוף, עורכים, ולוחצים <b>״סנכרן לשיקוף״</b>.</li>
          </ol>
          <button autoFocus onClick={closeGuide} style={bigBtn(true)}>הבנתי, מתחילים</button>
        </div>
      )}

      {/* editing: warn → edit → review */}
      {editStep === "warn" && (
        <div {...uiProps} role="dialog" aria-label="עריכה" style={overlay}>
          <div style={{ fontSize: 40 }}>✏️</div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>העריכה תופיע בטלויזיה</div>
          <div style={{ fontSize: 17, color: "#dfe4ee", maxWidth: 460, lineHeight: 1.7 }}>
            בשיקוף, הטלויזיה מציגה בדיוק את מה שעל הנייד. כדי שהמתאמנים לא יראו את העריכה — עצרו את השיקוף עכשיו
            (אייפון: מרכז הבקרה ← שיקוף מסך ← הפסק). אחרי הסנכרון תוכלו לחדש אותו.
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <button autoFocus onClick={openEditor} style={bigBtn(true)}>עצרתי את השיקוף — פתח עריכה</button>
            <button onClick={openEditor} style={bigBtn(false)}>ערוך בכל זאת</button>
            <button onClick={() => setEditStep(null)} style={bigBtn(false)}>ביטול</button>
          </div>
        </div>
      )}

      {editStep === "edit" && draft && (
        <div {...uiProps} style={{ display: "contents" }}>
        <EditorModal
          drills={draft.drills} setDrills={d => setDraft(p => ({ ...p, drills: d }))}
          currentIndex={drillIdx}
          judokas={draft.judokas} setJudokas={j => setDraft(p => ({ ...p, judokas: j }))}
          pairs={draft.pairs} setPairs={pr => setDraft(p => ({ ...p, pairs: pr }))}
          onClose={() => setEditStep("review")}
        />
        </div>
      )}

      {editStep === "review" && draft && changed && (
        <div {...uiProps} role="dialog" aria-label="סנכרון" style={overlay}>
          <div style={{ fontSize: 26, fontWeight: 900 }}>השינויים שמורים בטיוטה</div>
          <div style={{ fontSize: 16, color: "#dfe4ee" }}>
            המסך המוקרן עדיין מציג את הגרסה הקודמת. {draft.drills.length} תרגילים · {fmt(draft.drills.reduce((a, d) => a + (d.durationWork + (d.durationRest || 0)) * (d.rounds || 1), 0))}
          </div>
          <label style={{ width: "100%", maxWidth: 520, textAlign: "start", fontSize: 14, color: "#c3cada" }}>
            דגשים לאימון
            <textarea
              value={draft.notes || ""} onChange={e => setDraft(p => ({ ...p, notes: e.target.value }))}
              placeholder="דגשים שיופיעו על המסך..."
              style={{ display: "block", width: "100%", minHeight: 90, marginTop: 6, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 10, color: "#fff", padding: 12, fontFamily: FONT, fontSize: 16, lineHeight: 1.5, resize: "vertical", direction: "rtl", userSelect: "text", WebkitUserSelect: "text" }}
            />
          </label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <button autoFocus onClick={sync} style={bigBtn(true)}>🔄 סנכרן לשיקוף</button>
            <button onClick={() => setEditStep("edit")} style={bigBtn(false)}>המשך לערוך</button>
            <button onClick={() => setShowLib(true)} style={bigBtn(false)}>📂 מערכים שמורים</button>
            <button onClick={discard} style={bigBtn(false)}>בטל שינויים</button>
          </div>
        </div>
      )}

      {showLib && draft && (
        <div {...uiProps} style={{ display: "contents" }}>
        <WorkoutModal
          drills={draft.drills} judokas={draft.judokas} pairs={draft.pairs}
          onLoad={w => setDraft(p => ({ ...p, drills: w.drills || p.drills, judokas: w.judokas || p.judokas, pairs: w.pairs || p.pairs }))}
          onClose={() => setShowLib(false)}
        />
        </div>
      )}
    </div>
  );
}
