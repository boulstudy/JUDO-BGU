'use client';

// What the room sees.
//
// One component renders the projection in both places it appears: full screen
// on the TV, and shrunk inside the coach's phone. That is the whole point —
// the "הקרנה" tab is not a drawing of the TV, it is the TV, so a preview can
// never drift from the thing it previews. The same component with a different
// state object is also how "אחרי העדכון" works.
//
// Purely presentational: it takes a settled state and draws it. No clock, no
// network, no store. Whoever renders it decides what the state is.

import { useState, useEffect, useRef } from "react";
import { SEC_COLOR } from "./shared";
import { phasesOf, totalDrillTime, fmt, displaySeconds, totalWorkoutTime } from "./sessionEngine";

// The projection is laid out once, at this size, and scaled to whatever it
// lands in. Fixing the canvas is what makes the phone preview truthful: both
// surfaces get identical wrapping, identical line breaks, identical everything.
export const DESIGN_W = 1280;
export const DESIGN_H = 720;

const ORANGE = "#FF6B00";
const REST   = "#a8ff78";

// ── pair strip ───────────────────────────────────────────────────────────────

function SplitPanel({ pairs, athletes, who, showNames }) {
  const byId = Object.fromEntries((athletes || []).map(a => [a.id, a]));
  const rows = (pairs || []).map(p => (p || []).map(id => byId[id]).filter(Boolean)).filter(r => r.length);
  if (!rows.length) return null;

  const side = (a, active) => (
    <div key={a.id} style={{
      flex: 1, minWidth: 0,
      background: active ? (a.color === "blue" ? "rgba(0,110,255,0.22)" : "rgba(255,255,255,0.16)") : "rgba(255,255,255,0.03)",
      border: "1px solid " + (active ? (a.color === "blue" ? "rgba(0,140,255,0.6)" : "rgba(255,255,255,0.45)") : "rgba(255,255,255,0.06)"),
      borderRadius: 8, padding: "7px 9px",
      color: active ? "#fff" : "rgba(255,255,255,0.3)",
      fontSize: 14, fontWeight: active ? 700 : 400,
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      transition: "background 0.25s, border-color 0.25s",
    }}>
      {showNames ? a.name : (a.color === "blue" ? "כחול" : "לבן")}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((row, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
          {row.map(a => side(a, who === "both" || who === a.color))}
        </div>
      ))}
    </div>
  );
}

// ── the screen ───────────────────────────────────────────────────────────────

/**
 * @param {object}  state
 *   drills, athletes, pairs, notes, drillIdx, phaseIdx, timeLeft, running,
 *   totalElapsed, alert, clubName, groupName
 * @param {boolean} clean     projection mode: drop the chrome, keep the content
 * @param {boolean} muted     draw as a preview — no animation, dimmed alert
 */
export function ProjectionScreen({ state = {}, clean = false, muted = false }) {
  const {
    drills = [], athletes = [], pairs = [], notes = "",
    drillIdx = 0, phaseIdx = 0, timeLeft = 0, running = false,
    totalElapsed = 0, alert = false,
    clubName = "נבחרת ג׳ודו BGU", groupName = "",
  } = state;

  const current  = drills[drillIdx] || null;
  const phases   = phasesOf(current);
  const phase    = phases[phaseIdx] || { phase: "work", who: "both", duration: 60, label: "עבודה" };
  const secColor = SEC_COLOR[(current && current.section) || "warmup"];

  const isPersonal  = current && current.type === "personal";
  const isRestDrill = current && current.type === "rest";
  const isRestPhase = phase.phase === "rest";
  const resting     = isRestPhase || isRestDrill;

  const totalDur = totalWorkoutTime(drills);
  const progress = totalDur > 0 ? Math.min(100, (totalElapsed / totalDur) * 100) : 0;

  const timerColor = alert ? "#ff3c3c" : resting ? REST : running ? "#fff" : "rgba(255,255,255,0.5)";
  const shown = displaySeconds(timeLeft);

  const nextPhase = phases[phaseIdx + 1] || null;
  const nextDrill = !nextPhase ? drills[drillIdx + 1] || null : null;

  const anim = muted ? "none" : undefined;

  return (
    <div style={{
      width: DESIGN_W, height: DESIGN_H,
      background: "#080a10", color: "#fff",
      direction: "rtl", fontFamily: "Heebo,sans-serif",
      display: "flex", flexDirection: "column",
      position: "relative", overflow: "hidden",
    }}>
      <style>{`
        @keyframes projPulse{0%,100%{opacity:1}50%{opacity:0.28}}
        @keyframes projAlert{0%,100%{opacity:0}50%{opacity:1}}
      `}</style>

      {/* ambient wash */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-20%", right: "-10%", width: "55%", height: "70%", borderRadius: "50%", background: "radial-gradient(circle,rgba(255,107,0,0.045) 0%,transparent 65%)" }} />
        <div style={{ position: "absolute", bottom: "-20%", left: "-10%", width: "55%", height: "70%", borderRadius: "50%", background: "radial-gradient(circle,rgba(0,59,142,0.06) 0%,transparent 65%)" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.009) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.009) 1px,transparent 1px)", backgroundSize: "80px 80px" }} />
      </div>

      {alert && (
        <div style={{
          position: "absolute", inset: 0, border: "5px solid rgba(255,60,60,0.7)",
          pointerEvents: "none", zIndex: 50,
          animation: muted ? "none" : "projAlert 0.35s infinite",
          opacity: muted ? 0.6 : undefined,
        }} />
      )}

      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "11px 28px", borderBottom: "1px solid rgba(255,255,255,0.055)",
        background: "rgba(0,0,0,0.32)", flexShrink: 0, position: "relative", zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: "linear-gradient(135deg,#FF6B00,#cc4400)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: "0 4px 16px rgba(255,107,0,0.38)" }}>🥋</div>
          <div>
            <div style={{ fontSize: 21, fontWeight: 900, letterSpacing: -0.5 }}>{clubName}</div>
            <div style={{ color: "rgba(255,107,0,0.58)", fontSize: 11, letterSpacing: 3 }}>{groupName || ""}</div>
          </div>
        </div>

        <div style={{ flex: 1, maxWidth: 440, margin: "0 28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ color: "rgba(255,255,255,0.22)", fontSize: 11 }}>התקדמות האימון</span>
            <span style={{ color: "rgba(255,255,255,0.32)", fontFamily: "Oswald,monospace", fontSize: 11 }}>{Math.round(progress)}%</span>
          </div>
          <div style={{ height: 5, background: "rgba(255,255,255,0.055)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: progress + "%", background: "linear-gradient(90deg,#FF6B00,#ff9233)", borderRadius: 3, transition: muted ? "none" : "width 1s linear" }} />
          </div>
        </div>

        <div style={{ minWidth: 150, textAlign: "left" }}>
          <div style={{ color: "rgba(255,255,255,0.22)", fontSize: 11 }}>תרגיל</div>
          {/* Two numbers either side of a neutral "/" get reordered by the RTL
              bidi algorithm ("1 / 4" renders as "4 / 1") unless the run is
              pinned to ltr explicitly. */}
          <div style={{ fontFamily: "Oswald,sans-serif", fontSize: 19, direction: "ltr" }}>
            {drills.length ? Math.min(drillIdx + 1, drills.length) + " / " + drills.length : "—"}
          </div>
        </div>
      </div>

      {/* body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", padding: "14px 22px", gap: 16, position: "relative", zIndex: 1 }}>

        {/* notes */}
        {!clean && notes ? (
          <div style={{ width: 220, display: "flex", flexDirection: "column", flexShrink: 0, gap: 8 }}>
            <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 10, letterSpacing: 4 }}>הערות אימון</span>
            <div style={{
              flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10, padding: 12, fontSize: 14, lineHeight: 1.6,
              color: "rgba(255,255,255,0.8)", whiteSpace: "pre-wrap", overflow: "hidden",
            }}>{notes}</div>
            <div style={{ paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.045)", display: "flex", flexDirection: "column", gap: 5 }}>
              {[["זמן שעבר", fmt(totalElapsed)], ["סה\"כ", fmt(totalDur)]].map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "rgba(255,255,255,0.22)", fontSize: 11 }}>{l}</span>
                  <span style={{ fontFamily: "Oswald,sans-serif", fontSize: 19 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* centre */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, minWidth: 0, justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div style={{ width: 5, height: 40, borderRadius: 3, background: secColor, flexShrink: 0, alignSelf: "center" }} />
            <h1 data-proj="drill" style={{ margin: 0, fontSize: 42, fontWeight: 900, letterSpacing: -1, lineHeight: 1 }}>{current ? current.name : "—"}</h1>
            <span style={{
              padding: "4px 13px", borderRadius: 18,
              background: resting ? "rgba(168,255,120,0.13)" : secColor + "1a",
              color: resting ? REST : secColor, fontSize: 14, fontWeight: 700, flexShrink: 0,
            }} data-proj="phase">{resting ? "מנוחה" : phase.label}</span>
            {current && current.rounds > 1 && !isRestPhase && (
              <span style={{ color: "rgba(255,255,255,0.22)", fontSize: 13 }}>סבב {phase.round || 1}/{current.rounds}</span>
            )}
            {current && current.note && (
              <span style={{ color: "rgba(255,255,255,0.28)", fontSize: 15 }}>{current.note}</span>
            )}
          </div>

          {phases.length > 1 && (
            <div style={{ display: "flex", gap: 4 }}>
              {phases.map((p, i) => (
                <div key={i} style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: i < phaseIdx ? "rgba(255,107,0,0.45)"
                    : i === phaseIdx ? ORANGE
                    : p.phase === "rest" ? "rgba(168,255,120,0.18)" : "rgba(255,255,255,0.09)",
                  transition: muted ? "none" : "background 0.28s",
                }} />
              ))}
            </div>
          )}

          <div style={{ textAlign: "center", lineHeight: 1, animation: alert && !muted ? "projPulse 0.35s infinite" : anim }}>
            <div data-proj="clock" style={{
              fontSize: 170, fontFamily: "Oswald,sans-serif", fontWeight: 700,
              color: timerColor, textShadow: "0 0 55px " + timerColor + "44",
              transition: muted ? "none" : "color 0.38s", letterSpacing: -8,
              fontVariantNumeric: "tabular-nums",
            }}>{fmt(shown)}</div>
            {alert && <div style={{ color: "#ff3c3c", fontSize: 22, fontWeight: 900, letterSpacing: 5, marginTop: 4 }}>זמן לעבור</div>}
            {resting && !alert && <div style={{ color: REST, fontSize: 18, fontWeight: 700, letterSpacing: 3, marginTop: 4 }}>מנוחה</div>}
          </div>

          {!isPersonal && (
            <div style={{ maxWidth: 420, width: "100%", margin: "0 auto" }}>
              <SplitPanel pairs={pairs} athletes={athletes} who={resting ? "none" : phase.who} showNames={false} />
            </div>
          )}

          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.17)", fontSize: 13, minHeight: 20 }}>
            {nextPhase ? "הבא: " + nextPhase.label + " " + fmt(nextPhase.duration)
              : nextDrill ? "תרגיל הבא: " + nextDrill.name : ""}
          </div>
        </div>

        {/* drill list */}
        {!clean && (
          <div style={{ width: 240, display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <div style={{ color: "rgba(255,255,255,0.18)", fontSize: 10, letterSpacing: 4, marginBottom: 9 }}>מערך האימון</div>
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", gap: 3 }}>
              {drills.map((d, i) => {
                const done = i < drillIdx, curr = i === drillIdx;
                const sc = SEC_COLOR[d.section || "warmup"];
                return (
                  <div key={d.id != null ? d.id : i} style={{
                    background: curr ? "rgba(255,107,0,0.11)" : done ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.03)",
                    border: curr ? "1px solid rgba(255,107,0,0.45)" : "1px solid rgba(255,255,255,0.045)",
                    borderRadius: 9, padding: "8px 11px", display: "flex", alignItems: "center", gap: 7,
                    opacity: done ? 0.33 : 1, flexShrink: 0,
                  }}>
                    <div style={{ width: 3, height: 28, borderRadius: 2, background: sc, flexShrink: 0 }} />
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%",
                      background: curr ? ORANGE : "rgba(255,255,255,0.045)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, color: curr ? "#fff" : "rgba(255,255,255,0.28)", flexShrink: 0,
                    }}>{done ? "✓" : i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: curr ? "#fff" : "rgba(255,255,255,0.52)", fontSize: 13, fontWeight: curr ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                      <div style={{ color: sc, fontSize: 10, marginTop: 1 }}>
                        {d.type !== "rest" && d.rounds > 1 ? d.rounds + "x · " : ""}{fmt(totalDrillTime(d))}
                      </div>
                    </div>
                    {curr && running && <div style={{ width: 5, height: 5, borderRadius: "50%", background: ORANGE, animation: muted ? "none" : "projPulse 0.9s infinite", flexShrink: 0 }} />}
                  </div>
                );
              })}
            </div>
            <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.045)", marginTop: 7, display: "flex", flexDirection: "column", gap: 5 }}>
              {[["זמן שעבר", fmt(totalElapsed)], ["סה\"כ", fmt(totalDur)]].map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "rgba(255,255,255,0.22)", fontSize: 11 }}>{l}</span>
                  <span style={{ fontFamily: "Oswald,sans-serif", fontSize: 19 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The same screen, scaled to fill whatever box it is given.
 *
 * Because the projection is laid out at one fixed size and only ever scaled,
 * the phone preview and the TV cannot disagree about where anything sits.
 */
export function FittedProjection({ style, ...props }) {
  const boxRef = useRef(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      setScale(Math.min(r.width / DESIGN_W, r.height / DESIGN_H));
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={boxRef} style={{ position: "relative", overflow: "hidden", background: "#080a10", ...style }}>
      {scale > 0 && (
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          width: DESIGN_W, height: DESIGN_H,
          transform: "translate(-50%,-50%) scale(" + scale + ")",
          transformOrigin: "center center",
        }}>
          <ProjectionScreen {...props} />
        </div>
      )}
    </div>
  );
}

export default ProjectionScreen;
