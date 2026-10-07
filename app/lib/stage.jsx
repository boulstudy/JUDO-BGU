'use client';

// StageView — what the trainees read from across the hall.
//
// Pure presentation: it draws the state it is handed and has no buttons of its
// own (the TV passes its control row through `controls`, /solo overlays its
// own). Everything is sized in viewport-height units so the same view is
// legible on a 4K TV and on a phone mirrored in landscape.
//
// Reading order, by importance: time left → what we are doing → who works →
// what is next → context (progress, list, coach's notes). Colour is never the
// only carrier of meaning; every state also has a word.

import { SEC_COLOR, fmt, getDrillPhases, totalDrillTime } from "./shared";
import GiIcon from "./GiIcon";

const WORK = "#35e88a";
const REST = "#5ec8ff";
const SWITCH = "#ff8a2a";
const U = n => `calc(var(--u) * ${n})`;

const CSS = `
.st-root{--u:1vh;position:relative;flex:1;min-height:0;width:100%;display:flex;flex-direction:column;overflow:hidden;font-family:Heebo,sans-serif;direction:rtl;color:#fff}
@supports (height:1dvh){.st-root{--u:1dvh}}
.st-root *{box-sizing:border-box}
.st-body{flex:1;min-height:0;display:flex;gap:${U(2.4)};padding:${U(1.8)} ${U(3)} ${U(2)}}
.st-main{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between;gap:${U(1.2)}}
.st-side{width:clamp(220px,27vw,560px);flex-shrink:0;display:flex;flex-direction:column;gap:${U(1.6)};min-height:0}
.st-list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:${U(0.8)}}
.st-item[role=button]{cursor:pointer}
.st-item:focus-visible{outline:3px solid #FF6B00;outline-offset:2px}
@keyframes stFlash{0%{opacity:.6}100%{opacity:0}}
@keyframes stPop{0%{transform:scale(1.18);opacity:.2}100%{transform:scale(1);opacity:1}}
@keyframes stBlink{0%,100%{opacity:1}50%{opacity:.45}}
@media (max-aspect-ratio:1/1){.st-side{display:none}.st-body{padding:${U(1.5)} ${U(2)}}}
@media (prefers-reduced-motion:reduce){.st-anim{animation:none!important}}
`;

// Who is working right now. Each side is a gi in its own colour; the idle side
// says what it is doing instead of just fading out.
function Sides({ who, resting, compact }) {
  const sides = [["white", "לבן"], ["blue", "כחול"]];
  return (
    <div style={{ display: "flex", gap: U(1.6), height: compact ? U(13) : U(17), justifyContent: "center" }}>
      {sides.map(([color, label]) => {
        const active = !resting && (who === color || who === "both");
        const isWhite = color === "white";
        return (
          <div key={color} style={{
            flex: active ? 1.35 : 1, maxWidth: U(70), borderRadius: U(1.8),
            display: "flex", alignItems: "center", justifyContent: "center", gap: U(1.6),
            background: active
              ? (isWhite ? "linear-gradient(145deg,#d9dde6,#ffffff)" : "linear-gradient(145deg,#12408f,#2b6ff0)")
              : "#141824",
            border: active ? `${U(0.35)} solid ${isWhite ? "#fff" : "#8db6ff"}` : `${U(0.35)} solid #2a3142`,
            boxShadow: active ? `0 0 ${U(4)} ${isWhite ? "rgba(255,255,255,0.22)" : "rgba(43,111,240,0.45)"}` : "none",
            transition: "all .4s",
          }}>
            <GiIcon color={color} size={`calc(var(--u) * ${compact ? 8 : 11})`} style={{ opacity: active ? 1 : 0.6 }} />
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
              <span style={{ fontSize: U(compact ? 4 : 5.2), fontWeight: 900, color: active ? (isWhite ? "#111" : "#fff") : "#dfe4ee" }}>{label}</span>
              <span style={{ fontSize: U(compact ? 2.6 : 3.2), fontWeight: 700, marginTop: U(0.4), color: active ? (isWhite ? "#222" : "#e6efff") : "#b7c0d1" }}>
                {active ? "עובד ✓" : resting ? "מנוחה" : "ממתין"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Personal({ judokas, timers }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(" + U(30) + ",1fr))", gap: U(1) }}>
      {judokas.map(j => {
        const t = timers[j.id];
        const pd = j.personalDrills && j.personalDrills[t ? t.drillIdx : 0];
        return (
          <div key={j.id} style={{ background: "#141824", border: `${U(0.25)} solid #2a3142`, borderRadius: U(1.2), padding: `${U(1)} ${U(1.4)}`, display: "flex", alignItems: "center", gap: U(1.2) }}>
            <GiIcon color={j.color === "blue" ? "blue" : "white"} size={`calc(var(--u) * 4.4)`} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: U(2.6), fontWeight: 800 }}>{j.name}</div>
              <div style={{ fontSize: U(2.2), color: "#c3cada", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pd ? pd.name : "—"}</div>
            </div>
            <span style={{ fontFamily: "Oswald,sans-serif", fontSize: U(3.4), fontVariantNumeric: "tabular-nums" }}>{fmt(t ? t.timeLeft : 0)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function StageView({
  drills, drillIdx, phaseIdx, timeLeft, running, totalElapsed, alertActive,
  judokas = [], pairs = [], notes = "", personalTimers = {},
  controls = null,          // node under the sides panel (TV control row)
  onSelectDrill = null,     // (i) => void — makes the list clickable
  onSelectPhase = null,     // (i) => void — makes the phase segments clickable
}) {
  const current = drills[drillIdx] || drills[0];
  const phases  = getDrillPhases(current);
  const phase   = phases[phaseIdx] || { phase: "work", who: "both", duration: 60, label: "עבודה" };
  const isRest  = !!current && current.type === "rest";
  const isPersonal = !!current && current.type === "personal";
  const resting = isRest || phase.phase === "rest";

  const pct = timeLeft / (phase.duration || 1);
  const urgent  = pct < 0.2 || alertActive;
  const warning = pct < 0.35 && pct >= 0.2;
  const notStarted = timeLeft === phase.duration;
  const timerColor = resting ? REST : alertActive ? "#ff5a5a" : !running ? (notStarted ? "#ffffff" : "#ff7a7a") : urgent ? "#ff8a2a" : warning ? "#ffc15a" : "#35e88a";

  const totalDur  = drills.reduce((a, d) => a + totalDrillTime(d), 0);
  const doneDur   = drills.slice(0, drillIdx).reduce((a, d) => a + totalDrillTime(d), 0);
  const phaseDone = phases.slice(0, phaseIdx).reduce((a, p) => a + p.duration, 0);
  const progress  = totalDur > 0 ? Math.min(100, ((doneDur + phaseDone + (phase.duration - timeLeft)) / totalDur) * 100) : 0;

  const nextPhase = phases[phaseIdx + 1];
  const nextDrill = drills[drillIdx + 1];
  const secColor  = SEC_COLOR[current ? current.section || "warmup" : "warmup"] || "#FF6B00";

  const band = alertActive ? { text: "החלפה!", color: SWITCH }
    : resting ? { text: "מנוחה", color: REST }
    : { text: isPersonal ? "עבודה אישית" : phase.label || "עבודה", color: WORK };

  const stateWord = running ? null : notStarted ? "מוכנים?" : timeLeft === 0 ? "הסתיים" : "⏸ מושהה";
  const compact = !!controls;

  // What comes next, in words. During rest this becomes the headline.
  const upcomingPhase = nextPhase && nextPhase.phase !== "rest" ? nextPhase : phases.slice(phaseIdx + 1).find(p => p.phase !== "rest");
  const upcoming = upcomingPhase
    ? upcomingPhase.label
    : nextDrill ? nextDrill.name : "";
  const nextLine = nextPhase
    ? `הבא: ${nextPhase.label} ${fmt(nextPhase.duration)}`
    : nextDrill ? `תרגיל הבא: ${nextDrill.name}` : "סוף האימון";

  const countdown = running && timeLeft >= 1 && timeLeft <= 3;

  // Current + next three while running; the whole plan while paused.
  const listFrom = running ? Math.max(0, drillIdx) : 0;
  const visible = running ? drills.slice(listFrom, listFrom + 4) : drills;

  return (
    <div className="st-root">
      <style>{CSS}</style>

      {/* progress across the whole workout */}
      <div role="progressbar" aria-label="התקדמות האימון" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}
        style={{ height: U(1), background: "#1b2030", flexShrink: 0 }}>
        <div style={{ height: "100%", width: progress + "%", background: "linear-gradient(90deg,#FF6B00,#ff9233)", transition: "width 1s linear" }} />
      </div>

      <div className="st-body">
        <div className="st-main">
          {/* what are we doing */}
          <div style={{ display: "flex", alignItems: "center", gap: U(1.6), minWidth: 0 }}>
            <div style={{ width: U(1), alignSelf: "stretch", minHeight: U(6), borderRadius: 4, background: secColor, flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <h1 style={{ fontSize: U(compact ? 6 : 7.4), fontWeight: 900, lineHeight: 1.05, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {current ? current.name : ""}
              </h1>
              <div style={{ display: "flex", gap: U(2), alignItems: "baseline", flexWrap: "wrap", fontSize: U(2.8), color: "#c3cada", marginTop: U(0.6) }}>
                {current && current.rounds > 1 && !resting && <span style={{ fontWeight: 800, color: "#fff" }}>סבב {phase.round || 1} מתוך {current.rounds}</span>}
                {current && current.note && <span>{current.note}</span>}
              </div>
            </div>
          </div>

          {/* phase segments */}
          {phases.length > 1 && (
            <div style={{ display: "flex", gap: U(0.5) }}>
              {phases.map((p, i) => (
                <div key={i}
                  onClick={onSelectPhase ? () => onSelectPhase(i) : undefined}
                  style={{
                    flex: p.duration, height: U(1.1), borderRadius: 4, cursor: onSelectPhase ? "pointer" : "default",
                    background: i < phaseIdx ? "rgba(255,107,0,0.5)" : i === phaseIdx ? "#FF6B00" : p.phase === "rest" ? "rgba(94,200,255,0.4)" : "rgba(255,255,255,0.22)",
                  }} />
              ))}
            </div>
          )}

          {/* phase band + clock */}
          <div style={{ textAlign: "center", lineHeight: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: U(2) }}>
              <span key={band.text} className={alertActive ? "st-anim" : undefined} style={{
                display: "inline-block", padding: `${U(0.9)} ${U(3.2)}`, borderRadius: 999,
                fontSize: U(compact ? 4.2 : 5), fontWeight: 900, letterSpacing: 1,
                background: band.color, color: "#07110b",
                animation: alertActive ? "stBlink 1s ease-in-out 2" : "none",
              }}>{band.text}</span>
              {stateWord && <span style={{ fontSize: U(3.4), fontWeight: 800, color: "#dfe4ee" }}>{stateWord}</span>}
            </div>
            <div style={{
              fontSize: `min(${U(compact ? 27 : 34)}, 26vw)`, fontFamily: "Oswald,sans-serif", fontWeight: 700,
              color: timerColor, lineHeight: 1.02, letterSpacing: 0, fontVariantNumeric: "tabular-nums", direction: "ltr",
              textShadow: `0 0 ${U(5)} ${timerColor}44`, marginTop: U(0.6),
            }}>{fmt(timeLeft)}</div>
            {resting && (upcoming ? (
              <div style={{ fontSize: U(4), fontWeight: 800, color: "#fff", marginTop: U(0.4) }}>
                מתכוננים ל־<span style={{ color: WORK }}>{upcoming}</span>
              </div>
            ) : null)}
          </div>

          {/* who works */}
          {isPersonal
            ? <Personal judokas={judokas} timers={personalTimers} />
            : <Sides who={phase.who} resting={resting} compact={compact} />}

          {controls}

          <div style={{ textAlign: "center", color: "#c3cada", fontSize: U(3), fontWeight: 700, minHeight: U(3.6) }}>{nextLine}</div>
        </div>

        {/* context */}
        <aside className="st-side" aria-label="מערך האימון">
          <div style={{ fontSize: U(2.2), letterSpacing: 2, color: "#9aa6ba", fontWeight: 700 }}>מערך האימון</div>
          <div className="st-list">
            {visible.map((d, k) => {
              const i = running ? listFrom + k : k;
              const curr = i === drillIdx, done = i < drillIdx;
              const sc = SEC_COLOR[d.section || "warmup"] || "#FF6B00";
              const click = onSelectDrill ? () => onSelectDrill(i) : undefined;
              return (
                <div key={d.id} className="st-item"
                  role={click ? "button" : undefined} tabIndex={click ? 0 : undefined}
                  onClick={click} onKeyDown={click ? e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); click(); } } : undefined}
                  style={{
                    display: "flex", alignItems: "center", gap: U(1.2), padding: `${U(1.1)} ${U(1.4)}`, borderRadius: U(1.2), flexShrink: 0,
                    background: curr ? "rgba(255,107,0,0.16)" : "#10141f",
                    border: curr ? `${U(0.3)} solid #FF6B00` : `${U(0.3)} solid #1f2637`,
                    opacity: done ? 0.7 : 1,
                  }}>
                  <div style={{ width: U(0.7), alignSelf: "stretch", borderRadius: 3, background: sc, flexShrink: 0 }} />
                  <span style={{
                    width: U(3.6), height: U(3.6), borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: U(2), fontWeight: 800, background: curr ? "#FF6B00" : "#232b3f", color: "#fff",
                  }}>{done ? "✓" : i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: U(2.9), fontWeight: curr ? 900 : 600, color: curr ? "#fff" : "#dfe4ee", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                    <div style={{ fontSize: U(2.1), color: "#b7c0d1", marginTop: U(0.2) }}>{d.type !== "rest" && d.rounds > 1 ? d.rounds + "× · " : ""}{fmt(totalDrillTime(d))}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {notes && notes.trim() && (
            <div style={{ background: "rgba(255,179,71,0.1)", border: `${U(0.3)} solid rgba(255,179,71,0.5)`, borderRadius: U(1.2), padding: `${U(1.2)} ${U(1.6)}`, maxHeight: "34%", overflowY: "auto" }}>
              <div style={{ fontSize: U(2), fontWeight: 800, color: "#ffc15a", marginBottom: U(0.6) }}>דגשים</div>
              <div style={{ fontSize: U(2.8), lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{notes}</div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", gap: U(2), paddingTop: U(1), borderTop: "1px solid #1f2637", fontSize: U(2.4) }}>
            <span style={{ color: "#b7c0d1" }}>זמן שעבר <b style={{ color: "#fff", fontFamily: "Oswald,sans-serif", fontSize: U(3), marginInlineStart: U(0.6) }}>{fmt(totalElapsed)}</b></span>
            <span style={{ color: "#b7c0d1" }}>{"סה\"כ"} <b style={{ color: "#fff", fontFamily: "Oswald,sans-serif", fontSize: U(3), marginInlineStart: U(0.6) }}>{fmt(totalDur)}</b></span>
          </div>
        </aside>
      </div>

      {/* one flash on a switch — a single event, not a strobe */}
      {alertActive && <div key={"flash" + drillIdx + "-" + phaseIdx} className="st-anim" aria-hidden="true"
        style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "rgba(255,138,42,0.4)", animation: "stFlash 1.2s ease-out 1 forwards" }} />}

      {/* last three seconds, readable from the back of the hall */}
      {countdown && (
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(8,10,16,0.88)" }}>
          <span key={timeLeft} className="st-anim" style={{ fontFamily: "Oswald,sans-serif", fontWeight: 700, fontSize: U(58), lineHeight: 1, color: SWITCH, animation: "stPop .45s ease-out 1" }}>{timeLeft}</span>
        </div>
      )}

      {/* screen readers: announce changes of phase, not every second */}
      <div aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {current ? current.name + ", " + band.text : ""}
      </div>
    </div>
  );
}
