'use client';

import { useState, useEffect, useRef, useCallback } from "react";

import { supa, fmt, getDrillPhases } from "./lib/shared";
import { useTvLink } from "./lib/link";
import { INIT_JUDOKAS, INIT_PAIRS, INIT_DRILLS } from "./lib/defaults";
import EditorModal from "./lib/EditorModal";
import WorkoutModal from "./lib/WorkoutModal";
import { makeRoomCode } from "./lib/remoteBus";
import { PairOverlay, PairingModal } from "./lib/pairing";
import { COMMANDS, pickPatch } from "./lib/remoteProtocol";
import { useWorkoutClock } from "./lib/clock";
import StageView from "./lib/stage";

// ── Notes Modal ───────────────────────────────────────────────────────────────
// The coach's emphasis for the session. It shows on the stage as read-only
// "דגשים"; this is where it is typed on the TV itself.
function NotesModal({ notes, setNotes, onClose }) {
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",direction:"rtl"}}>
      <div onClick={e => e.stopPropagation()} style={{width:"min(560px,92vw)",background:"#0d1020",border:"1px solid rgba(255,107,0,0.3)",borderRadius:16,padding:20,fontFamily:"Heebo,sans-serif"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{color:"#fff",fontWeight:900,fontSize:18}}>📝 דגשים לאימון</span>
          <button onClick={onClose} aria-label="סגור" style={{background:"none",border:"none",color:"rgba(255,255,255,0.6)",cursor:"pointer",fontSize:22}}>✕</button>
        </div>
        <textarea
          value={notes} onChange={e => setNotes(e.target.value)} autoFocus
          placeholder={"דגשים שיופיעו על המסך..."}
          style={{width:"100%",minHeight:180,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,color:"#fff",padding:12,fontFamily:"Heebo,sans-serif",fontSize:17,lineHeight:1.6,resize:"vertical",outline:"none",direction:"rtl",boxSizing:"border-box"}}
        />
        <button onClick={onClose} style={{width:"100%",marginTop:12,padding:14,fontSize:17,fontWeight:900,borderRadius:11,border:"none",cursor:"pointer",fontFamily:"Heebo,sans-serif",color:"#fff",background:"linear-gradient(135deg,#FF6B00,#cc4400)"}}>סיום</button>
      </div>
    </div>
  );
}

// ── Attendance Modal ──────────────────────────────────────────────────────────
function AttendanceModal({ judokas, onClose }) {
  const today = new Date().toISOString().slice(0,10);
  const [date, setDate] = useState(today);
  const [present, setPresent] = useState([]);
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supa("attendance?order=date.desc&limit=30").then(r => { if(r) setHistory(r); });
  }, []);

  const toggle = id => setPresent(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);

  const save = async () => {
    setSaving(true);
    const r = await supa("attendance", { method:"POST", body:JSON.stringify({ date, present_ids: present, total: present.length }) });
    if(r && r[0]) setHistory(prev => [r[0], ...prev]);
    setSaving(false);
  };

  const inp = {background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,107,0,0.3)",borderRadius:8,color:"#fff",padding:"8px 11px",fontFamily:"Heebo,sans-serif",fontSize:14,outline:"none"};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#0d1020",border:"1px solid rgba(255,107,0,0.28)",borderRadius:18,width:"100%",maxWidth:520,maxHeight:"90vh",overflowY:"auto",padding:22,direction:"rtl"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <h2 style={{color:"#FF6B00",fontFamily:"Heebo,sans-serif",fontSize:20,margin:0}}>👥 נוכחות</h2>
          <button onClick={onClose} style={{background:"none",border:"1px solid rgba(255,255,255,0.12)",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontFamily:"Heebo,sans-serif"}}>סגור</button>
        </div>

        <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...inp,flex:1}}/>
          <button onClick={save} disabled={saving} style={{background:"#FF6B00",border:"none",color:"#fff",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:14}}>{saving?"...":"שמור"}</button>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:20}}>
          {judokas.map(j => (
            <div key={j.id} onClick={() => toggle(j.id)} style={{
              background: present.includes(j.id) ? "rgba(0,200,100,0.12)" : "rgba(255,255,255,0.025)",
              border: present.includes(j.id) ? "1px solid rgba(0,200,100,0.4)" : "1px solid rgba(255,255,255,0.07)",
              borderRadius:10, padding:"12px 16px", cursor:"pointer",
              display:"flex", alignItems:"center", gap:12, transition:"all 0.2s"
            }}>
              <div style={{width:20,height:20,borderRadius:"50%",border:"2px solid",borderColor:present.includes(j.id)?"#00c864":"rgba(255,255,255,0.2)",background:present.includes(j.id)?"#00c864":"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s",flexShrink:0}}>
                {present.includes(j.id) && <span style={{color:"#fff",fontSize:12,fontWeight:700}}>✓</span>}
              </div>
              <div style={{width:10,height:10,borderRadius:"50%",background:j.color==="white"?"#ddd":"#1a5fd6",flexShrink:0}}/>
              <span style={{color:present.includes(j.id)?"#fff":"rgba(255,255,255,0.6)",fontWeight:700,fontSize:15,flex:1}}>{j.name}</span>
            </div>
          ))}
        </div>
        <div style={{color:"rgba(255,255,255,0.3)",fontSize:13,marginBottom:10}}>נוכחים: {present.length}/{judokas.length}</div>

        {history.length > 0 && (
          <div style={{borderTop:"1px solid rgba(255,255,255,0.07)",paddingTop:14}}>
            <div style={{color:"rgba(255,255,255,0.25)",fontSize:11,letterSpacing:3,textTransform:"uppercase",marginBottom:10}}>היסטוריה</div>
            {history.map(h => (
              <div key={h.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",borderRadius:8,background:"rgba(255,255,255,0.02)",marginBottom:5}}>
                <span style={{color:"rgba(255,255,255,0.6)",fontSize:13}}>{h.date}</span>
                <span style={{color:"#FF6B00",fontSize:13,fontWeight:700}}>{h.total} נוכחים</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Remote pairing ────────────────────────────────────────────────────────────
// The code is created on the phone (app/remote) and typed in here. This modal
// is where the coach enters it — it never invents a code of its own.
// ── Main ──────────────────────────────────────────────────────────────────────
export default function JudoTV() {
  const [drills,  setDrills]  = useState(INIT_DRILLS);
  const [judokas, setJudokas] = useState(INIT_JUDOKAS);
  const [pairs,   setPairs]   = useState(INIT_PAIRS);
  const [modal,  setModal]  = useState(null);
  const [globalAutoNext, setGlobalAutoNext] = useState(true);
  const [soundType, setSoundType] = useState("beep");
  const [scale, setScale] = useState(1.0);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [notes, setNotes] = useState("");

  // ── Remote control ──────────────────────────────────────────────────────────
  const [roomCode,    setRoomCode]    = useState("");
  const [remoteOn,    setRemoteOn]    = useState(true);
  const [projection,  setProjection]  = useState(false); // clean screen: hide the controls
  const [audioReady,  setAudioReady]  = useState(false);

  const {
    drillIdx, setDrillIdx, phaseIdx, setPhaseIdx, timeLeft, setTimeLeft,
    running, setRunning, totalElapsed, alertActive, personalTimers,
    current, phases, phase, isPersonal, isRest, isPartner, isRestPhase,
    goToDrill, addTime, resetPhase, nextPhaseManual,
    startPlaying, toggleRunning, applyClock, initCtx,
  } = useWorkoutClock({ drills, judokas, globalAutoNext, soundType });


  // Load last workout on first open
  useEffect(() => {
    supa("workouts?order=date.desc&limit=1").then(r => {
      if (r && r[0]) {
        const w = r[0];
        if (w.drills && w.drills.length) setDrills(w.drills);
        if (w.judokas && w.judokas.length) setJudokas(w.judokas);
        if (w.pairs && w.pairs.length) setPairs(w.pairs);
      }
    });
  }, []);

  // The browser only lets us open an AudioContext from inside a real tap, so a
  // play command arriving from the phone cannot unlock it. Track whether the TV
  // has been tapped once, and nag until it has.
  const unlockAudio = useCallback(() => {
    const ctx = initCtx();
    if (!ctx) return;
    if (ctx.state === "running") setAudioReady(true);
    else setTimeout(() => setAudioReady(ctx.state === "running"), 250);
  }, [initCtx]);

  // ── Remote control link ─────────────────────────────────────────────────────
  // The TV owns the code: it makes one the first time it opens and keeps it, so
  // a phone that paired once finds the TV again by itself. The phone is the one
  // that types it — nothing is ever typed on the TV.
  useEffect(() => {
    let code = "";
    try {
      code = (window.localStorage.getItem("judo_room") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (window.localStorage.getItem("judo_remote_on") === "0") setRemoteOn(false);
      if (code.length < 4) { code = makeRoomCode(4); window.localStorage.setItem("judo_room", code); }
    } catch(e) { code = makeRoomCode(4); }
    setRoomCode(code);
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem("judo_remote_on", remoteOn ? "1" : "0"); } catch(e) {}
  }, [remoteOn]);

  // A new code cuts off every phone that had the old one.
  const newRoomCode = () => {
    const code = makeRoomCode(4);
    try { window.localStorage.setItem("judo_room", code); } catch(e) {}
    setRoomCode(code);
  };

  const heavy = { drills, judokas, pairs, notes, globalAutoNext, soundType, projection };
  const heavyRef = useRef(heavy);
  heavyRef.current = heavy;

  const [rev, setRev] = useState(1);
  useEffect(() => { setRev(r => r + 1); },
    [drills, judokas, pairs, notes, globalAutoNext, soundType, projection]);

  const handleRemoteCommand = m => {
    switch (m.c) {
      case COMMANDS.PLAY:  startPlaying(); break;
      case COMMANDS.PAUSE: setRunning(false); break;
      case COMMANDS.RESET: resetPhase(); break;
      case COMMANDS.NEXT_PHASE: nextPhaseManual(); break;
      case COMMANDS.PREV_DRILL: goToDrill(drillIdx - 1); break;
      case COMMANDS.NEXT_DRILL: goToDrill(drillIdx + 1); break;
      case COMMANDS.ADD_TIME: setTimeLeft(t => Math.max(0, t + (Number(m.seconds) || 0))); break;
      case COMMANDS.GOTO: {
        const di = Math.max(0, Math.min(Number(m.drillIdx) || 0, drills.length - 1));
        const ph = getDrillPhases(drills[di]);
        const pi = Math.max(0, Math.min(Number(m.phaseIdx) || 0, Math.max(0, ph.length - 1)));
        setDrillIdx(di);
        setRunning(false);
        applyClock({ phaseIdx: pi, timeLeft: ph[pi] ? ph[pi].duration : 60 });
        break;
      }
      default: break;
    }
  };

  // Everything the coach staged on the phone lands here in one go.
  const handleRemotePatch = useCallback((patch, then) => {
    const p = pickPatch(patch);
    const nextDrills = Array.isArray(p.drills) && p.drills.length ? p.drills : drills;

    if (nextDrills !== drills)        setDrills(nextDrills);
    if (Array.isArray(p.judokas))     setJudokas(p.judokas);
    if (Array.isArray(p.pairs))       setPairs(p.pairs);
    if (typeof p.notes === "string")  setNotes(p.notes);
    if (p.globalAutoNext !== undefined) setGlobalAutoNext(!!p.globalAutoNext);
    if (p.soundType)                  setSoundType(p.soundType);
    if (p.projection !== undefined)   setProjection(!!p.projection);

    const di = Math.max(0, Math.min(
      p.drillIdx !== undefined ? Number(p.drillIdx) || 0 : drillIdx,
      nextDrills.length - 1
    ));
    setDrillIdx(di);

    const ph = getDrillPhases(nextDrills[di]);
    const override = {};
    if (p.phaseIdx !== undefined) {
      override.phaseIdx = Math.max(0, Math.min(Number(p.phaseIdx) || 0, Math.max(0, ph.length - 1)));
    }
    if (p.timeLeft !== undefined) {
      override.timeLeft = Math.max(0, Number(p.timeLeft) || 0);
    } else if (override.phaseIdx !== undefined) {
      override.timeLeft = ph[override.phaseIdx] ? ph[override.phaseIdx].duration : 60;
    }
    if (override.phaseIdx !== undefined || override.timeLeft !== undefined) {
      applyClock(override);
    }

    if (then === "play")       startPlaying();
    else if (then === "pause") setRunning(false);
  }, [drills, drillIdx, startPlaying, applyClock]);

  const tvLink = useTvLink({
    room: roomCode,
    active: remoteOn && !!roomCode,
    light: { drillIdx, phaseIdx, timeLeft, running, totalElapsed },
    heavyRef,
    rev,
    onCommand: handleRemoteCommand,
    onPatch: handleRemotePatch,
  });

  // With a phone connected the controls are redundant on the big screen, so they
  // hide themselves; any touch, mouse move or key brings them back for a moment.
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef(null);
  const wake = useCallback(() => {
    setPeek(true);
    clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeek(false), 6000);
  }, []);
  const showControls = !projection && (!tvLink.remoteConnected || peek);

  // Welcome screen with the code — only while there is nobody on the other end,
  // and not for the first few seconds, so a phone that remembers this TV
  // reconnects without the screen ever flashing up.
  const [pairSkipped, setPairSkipped] = useState(false);
  const [pairReady, setPairReady] = useState(false);
  useEffect(() => { const id = setTimeout(() => setPairReady(true), 3500); return () => clearTimeout(id); }, []);
  const showPair = remoteOn && !!roomCode && pairReady && !pairSkipped && !tvLink.remoteConnected && !running && !modal;

  const [connToast, setConnToast] = useState(false);
  const wasConn = useRef(false);
  useEffect(() => {
    if (tvLink.remoteConnected && !wasConn.current) {
      setConnToast(true);
      const id = setTimeout(() => setConnToast(false), 2500);
      wasConn.current = true;
      return () => clearTimeout(id);
    }
    if (!tvLink.remoteConnected) { wasConn.current = false; setConnToast(false); }
  }, [tvLink.remoteConnected]);

  // Keyboard / presentation clicker / TV remote arrows. Read through a ref so the
  // listener is attached once.
  const keysRef = useRef(null);
  keysRef.current = { toggleRunning, goToDrill, drillIdx, addTime, unlockAudio, modal, wake };
  useEffect(() => {
    const onKey = e => {
      const k = keysRef.current;
      k.wake();
      const t = e.target, tag = t && t.tagName;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A" || (t && t.getAttribute && t.getAttribute("role") === "button")) return;
      if (k.modal) return;
      let used = true;
      switch (e.key) {
        case " ": case "Enter": k.unlockAudio(); k.toggleRunning(); break;
        case "ArrowLeft": case "PageDown": case "n": case "N": k.goToDrill(k.drillIdx + 1); break;
        case "ArrowRight": case "PageUp": case "p": case "P": k.goToDrill(k.drillIdx - 1); break;
        case "ArrowUp": k.addTime(10); break;
        case "ArrowDown": k.addTime(-10); break;
        case "f": case "F":
          try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch(err) {}
          break;
        default: used = false;
      }
      if (used) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div onPointerMove={wake} onPointerDown={wake} style={{width:"100vw",height:"100vh",overflow:"hidden",background:"#080a10",position:"relative"}}>
      <div style={{width:"100vw",height:"100vh",display:"flex",flexDirection:"column",direction:"rtl",fontFamily:"Heebo,sans-serif",position:"relative",transform:"scale("+scale+")",transformOrigin:"top right",width:(100/scale)+"%",height:(100/scale)+"%"}}>
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&family=Oswald:wght@700&display=swap" rel="stylesheet"/>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        button:focus-visible,input:focus-visible{outline:3px solid #FF6B00;outline-offset:2px}
      `}</style>

      {/* Audio can only be unlocked by a tap on the TV itself */}
      {!audioReady && remoteOn && (
        <div onClick={unlockAudio} style={{position:"fixed",top:14,left:"50%",transform:"translateX(-50%)",zIndex:120,background:"rgba(255,107,0,0.16)",border:"1px solid rgba(255,107,0,0.5)",color:"#FF6B00",borderRadius:11,padding:"10px 16px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:14,fontWeight:700,direction:"rtl"}}>
          🔊 לחצו כאן להפעלת הצלילים במסך
        </div>
      )}

      {/* TOP BAR */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 28px",borderBottom:"1px solid rgba(255,255,255,0.055)",background:"rgba(0,0,0,0.32)",flexShrink:0,position:"relative",zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:13}}>
          <div style={{width:44,height:44,borderRadius:11,background:"linear-gradient(135deg,#FF6B00,#cc4400)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,boxShadow:"0 4px 16px rgba(255,107,0,0.38)"}}>🥋</div>
          <div>
            <div style={{color:"#fff",fontSize:21,fontWeight:900,letterSpacing:-0.5}}>נבחרת ג׳ודו BGU</div>
            <div style={{color:"rgba(255,107,0,0.58)",fontSize:10,letterSpacing:4,textTransform:"uppercase"}}>Ben-Gurion University</div>
          </div>
        </div>

        <div style={{flex:1}}/>

        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {remoteOn && (
            <button onClick={() => setModal("remote")} title="חיבור שלט רחוק בנייד" style={{display:"flex",alignItems:"center",gap:7,background:"rgba(255,255,255,0.04)",border:"1px solid "+(tvLink.remoteConnected?"rgba(46,204,113,0.45)":"rgba(255,255,255,0.08)"),borderRadius:9,padding:"8px 12px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:13,fontWeight:700,color:tvLink.remoteConnected?"rgba(46,204,113,0.9)":"rgba(255,255,255,0.5)"}}>
              <span style={{width:7,height:7,borderRadius:"50%",flexShrink:0,background:!roomCode?"rgba(255,255,255,0.3)":tvLink.remoteConnected?"#2ecc71":tvLink.status==="online"?"rgba(255,179,71,0.8)":"rgba(255,68,68,0.7)"}}/>
              {roomCode ? "📱 שלט רחוק" : "📱 חבר שלט"}
            </button>
          )}
          {!projection && (
            <>
              <div style={{display:"flex",alignItems:"center",gap:4,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:9,padding:"4px 6px"}}>
                <button onClick={() => setScale(s => Math.max(0.5, Math.round((s-0.1)*10)/10))} style={{background:"none",border:"none",color:"rgba(255,255,255,0.55)",cursor:"pointer",fontSize:18,fontWeight:700,width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:6}}>−</button>
                <span style={{color:"rgba(255,255,255,0.35)",fontFamily:"monospace",fontSize:12,minWidth:36,textAlign:"center"}}>{Math.round(scale*100)}%</span>
                <button onClick={() => setScale(s => Math.min(1.5, Math.round((s+0.1)*10)/10))} style={{background:"none",border:"none",color:"rgba(255,255,255,0.55)",cursor:"pointer",fontSize:18,fontWeight:700,width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:6}}>+</button>
              </div>
              <button onClick={() => { setRunning(false); setModal("edit"); }} style={{background:"rgba(255,107,0,0.1)",border:"1px solid rgba(255,107,0,0.28)",color:"#FF6B00",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:13}}>✏️ ערוך אימון</button>
            </>
          )}
          <button onClick={() => setToolbarOpen(o=>!o)} style={{background:toolbarOpen?"rgba(255,107,0,0.2)":"rgba(255,255,255,0.05)",border:toolbarOpen?"1px solid rgba(255,107,0,0.5)":"1px solid rgba(255,255,255,0.1)",color:toolbarOpen?"#FF6B00":"rgba(255,255,255,"+(projection?"0.22":"0.6")+")",borderRadius:9,padding:"8px 16px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:15,opacity:projection?0.5:1}}>☰</button>
        </div>
      </div>

      {/* STAGE — everything the trainees read lives in lib/stage.jsx */}
      <StageView
        drills={drills} drillIdx={drillIdx} phaseIdx={phaseIdx} timeLeft={timeLeft}
        running={running} totalElapsed={totalElapsed} alertActive={alertActive}
        judokas={judokas} pairs={pairs} notes={notes} personalTimers={personalTimers}
        onSelectDrill={goToDrill}
        onSelectPhase={i => { setPhaseIdx(i); setTimeLeft(phases[i].duration); }}
        controls={showControls ? (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>

          <div style={{display:"flex",gap:5,justifyContent:"center",flexWrap:"wrap",alignItems:"center"}}>
            {[[-60,"- דקה"],[-30,"- 30ש׳"],[-10,"- 10ש׳"],[10,"+ 10ש׳"],[30,"+ 30ש׳"],[60,"+ דקה"]].map(([s,l]) => (
              <button key={s} onClick={() => addTime(s)} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:s>0?"rgba(0,229,255,0.72)":"rgba(255,107,0,0.72)",borderRadius:8,padding:"8px 13px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:14,fontWeight:700}}>{l}</button>
            ))}
          </div>

          <div style={{display:"flex",gap:9,justifyContent:"center",flexWrap:"wrap",alignItems:"center"}}>
            <input
              type="text"
              value={fmt(timeLeft)}
              onChange={e => {
                const parts = e.target.value.replace(/[^0-9:]/g,"").split(":");
                if (parts.length === 2) {
                  const m = parseInt(parts[0])||0, s = parseInt(parts[1])||0;
                  setTimeLeft(m*60+s);
                }
              }}
              style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,107,0,0.35)",borderRadius:8,color:"#fff",padding:"8px 12px",fontFamily:"Oswald,sans-serif",fontSize:18,width:90,textAlign:"center",outline:"none"}}
            />
            <button onClick={resetPhase} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#fff",borderRadius:11,padding:"13px 20px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:17}}>אפס</button>
          </div>

          <div style={{display:"flex",gap:9,justifyContent:"center",flexWrap:"wrap"}}>
            <button onClick={() => goToDrill(drillIdx-1)} disabled={drillIdx===0} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:drillIdx===0?"rgba(255,255,255,0.1)":"#fff",borderRadius:11,padding:"13px 20px",cursor:drillIdx===0?"not-allowed":"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:17}}>קודם</button>
            <button onClick={() => { unlockAudio(); toggleRunning(); }} style={{background:running?"linear-gradient(135deg,#ff4444,#a82020)":"linear-gradient(135deg,#2ecc71,#1f9c54)",border:"none",color:"#fff",borderRadius:13,padding:"13px 48px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:900,fontSize:21,boxShadow:running?"0 5px 22px rgba(255,68,68,0.38)":"0 5px 22px rgba(46,204,113,0.38)",minWidth:150}}>{running?"⏸ עצור":"▶ הפעל"}</button>
            <button onClick={nextPhaseManual} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#fff",borderRadius:11,padding:"13px 20px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:17}}>הבא</button>
          </div>
                    </div>
        ) : null}
      />

      {/* BOTTOM TOOLBAR */}
      {toolbarOpen && (
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,direction:"rtl"}}>
          <div onClick={() => setToolbarOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)"}}/>
          <div style={{position:"relative",background:"#0d1020",borderTop:"1px solid rgba(255,107,0,0.3)",borderRadius:"18px 18px 0 0",padding:"20px 24px 32px",display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <span style={{color:"rgba(255,255,255,0.4)",fontSize:12,letterSpacing:3,textTransform:"uppercase"}}>כלים</span>
              <button onClick={() => setToolbarOpen(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.4)",cursor:"pointer",fontSize:20}}>✕</button>
            </div>

            {/* Row 1: Edit + Workouts */}
            <div style={{display:"flex",gap:12}}>
              <button onClick={() => { setRunning(false); setModal("edit"); setToolbarOpen(false); }} style={{flex:1,background:"rgba(255,107,0,0.12)",border:"1px solid rgba(255,107,0,0.3)",color:"#FF6B00",borderRadius:12,padding:"14px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:16}}>✏️ ערוך מערך</button>
              <button onClick={() => { setModal("workouts"); setToolbarOpen(false); }} style={{flex:1,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.7)",borderRadius:12,padding:"14px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:16}}>📅 אימונים שמורים</button>
            </div>

            {/* Row 2: Attendance */}
            <div style={{display:"flex",gap:12}}>
              <button onClick={() => { setModal("attendance"); setToolbarOpen(false); }} style={{flex:1,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.7)",borderRadius:12,padding:"14px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:16}}>📋 נוכחות היום</button>
              <button onClick={() => { setRunning(false); setModal("edit"); setToolbarOpen(false); setTimeout(()=>document.getElementById("tab-judokas")?.click(),100); }} style={{flex:1,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.7)",borderRadius:12,padding:"14px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:16}}>👥 חברי הנבחרת</button>
              <button onClick={() => { setModal("notes"); setToolbarOpen(false); }} style={{flex:1,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.7)",borderRadius:12,padding:"14px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:16}}>📝 דגשים</button>
            </div>

            {/* Row 3: TV / remote */}
            <div style={{display:"flex",gap:12}}>
              <button onClick={() => { setProjection(p=>!p); setToolbarOpen(false); }} style={{flex:1,background:projection?"rgba(255,107,0,0.2)":"rgba(255,255,255,0.05)",border:projection?"1px solid rgba(255,107,0,0.5)":"1px solid rgba(255,255,255,0.1)",color:projection?"#FF6B00":"rgba(255,255,255,0.7)",borderRadius:12,padding:"14px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:16}}>🧼 מסך נקי {projection?"— פעיל":""}</button>
              <button onClick={() => { setModal("remote"); setToolbarOpen(false); }} style={{flex:1,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.7)",borderRadius:12,padding:"14px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:16}}>📱 שלט רחוק</button>
            </div>

            {/* Row 4: Sound settings */}
            <div style={{background:"rgba(255,255,255,0.03)",borderRadius:12,padding:"14px 16px"}}>
              <div style={{color:"rgba(255,255,255,0.4)",fontSize:12,marginBottom:10}}>הגדרות צליל</div>
              <div style={{display:"flex",gap:8}}>
                {[["beep","🔔 ביפ"],["buzz","⚡ באזר"],["mute","🔇 שקט"]].map(([v,l]) => (
                  <button key={v} onClick={() => setSoundType(v)} style={{flex:1,background:soundType===v?"rgba(255,107,0,0.2)":"rgba(255,255,255,0.04)",border:soundType===v?"1px solid rgba(255,107,0,0.5)":"1px solid rgba(255,255,255,0.08)",color:soundType===v?"#FF6B00":"rgba(255,255,255,0.5)",borderRadius:10,padding:"10px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:14}}>{l}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {modal==="edit" && <EditorModal drills={drills} setDrills={d=>{setDrills(d);if(drillIdx>=d.length)setDrillIdx(Math.max(0,d.length-1));}} currentIndex={drillIdx} judokas={judokas} setJudokas={setJudokas} pairs={pairs} setPairs={setPairs} onClose={()=>setModal(null)}/>}
      {modal==="workouts" && <WorkoutModal drills={drills} judokas={judokas} pairs={pairs} onLoad={w=>{if(w.drills)setDrills(w.drills);if(w.judokas)setJudokas(w.judokas);if(w.pairs)setPairs(w.pairs);setDrillIdx(0);setRunning(false);}} onClose={()=>setModal(null)}/>}
      {modal==="notes" && <NotesModal notes={notes} setNotes={setNotes} onClose={()=>setModal(null)}/>}
      {modal==="attendance" && <AttendanceModal judokas={judokas} onClose={()=>setModal(null)}/>}
      {modal==="remote" && (
        <PairingModal
          roomCode={roomCode}
          remoteOn={remoteOn}
          setRemoteOn={setRemoteOn}
          onNewCode={newRoomCode}
          status={tvLink.status}
          connected={tvLink.remoteConnected}
          onClose={()=>setModal(null)}
        />
      )}
      {showPair && <PairOverlay roomCode={roomCode} onSkip={() => setPairSkipped(true)}/>}
      {connToast && (
        <div role="status" style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:160,background:"rgba(46,204,113,0.18)",border:"1px solid rgba(46,204,113,0.7)",color:"#7dffb0",borderRadius:12,padding:"10px 22px",fontWeight:800,fontSize:20}}>📱 שלט התחבר ✓</div>
      )}
      </div>
    </div>
  );
}
