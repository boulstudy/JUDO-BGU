'use client';

// ── The coach's phone ────────────────────────────────────────────────────────
//
// Two kinds of action live here:
//
//   * Immediate — התחל / עצור. These reach the TV the moment they are pressed,
//     because that is the point of them.
//   * Staged — everything else. Time changes, jumping between drills, editing
//     the workout, notes, settings. They are kept on the phone as a draft and
//     only reach the TV when the coach presses "עדכן טלויזיה", or presses
//     התחל/המשך, which pushes the draft and starts in one go.
//
// "שידור ישיר" flips the quick controls (time / navigation) back to immediate
// for when the coach is steering a live drill and has nothing to hide.

import { useState, useEffect, useRef, useCallback } from "react";

import { supa, SEC_COLOR, fmt, getDrillPhases, totalDrillTime } from "../lib/shared";
import { DrillForm, Toggle } from "../lib/ui";
import { useRemoteLink } from "../lib/link";
import { normalizeRoomCode } from "../lib/remoteBus";
import { COMMANDS } from "../lib/remoteProtocol";
import { useWakeLock } from "../lib/wakeLock";

const ORANGE = "#FF6B00";

const PATCH_LABELS = {
  drills: "מערך האימון",
  judokas: "חברי הנבחרת",
  pairs: "זוגות",
  notes: "הערות",
  timeLeft: "זמן",
  drillIdx: "תרגיל נוכחי",
  phaseIdx: "שלב נוכחי",
  globalAutoNext: "מעבר אוטומטי",
  soundType: "צליל",
  projection: "מצב הקרנה",
};

const card = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 14,
  padding: 14,
};

const btn = (bg, color, border) => ({
  background: bg,
  border: border || "1px solid rgba(255,255,255,0.09)",
  color,
  borderRadius: 11,
  padding: "13px 10px",
  cursor: "pointer",
  fontFamily: "Heebo,sans-serif",
  fontWeight: 700,
  fontSize: 15,
  WebkitTapHighlightColor: "transparent",
  touchAction: "manipulation",
});

export default function RemoteControl() {
  // ── link ──────────────────────────────────────────────────────────────────
  const [room, setRoom]           = useState("");
  const [bootstrapped, setBoot]   = useState(false);
  const [codeInput, setCodeInput] = useState("");

  const [live,  setLive]  = useState(null);   // { rev, s, sAt, d }
  const [draft, setDraft] = useState(null);   // sparse — only what the coach touched

  const [liveMode, setLiveMode] = useState(false);
  const [tab, setTab]           = useState("control");
  const [toast, setToast]       = useState("");

  // workout editing
  const [editId, setEditId]     = useState(null);
  const [editData, setEditData] = useState(null);
  const [newDrill, setNewDrill] = useState(null);
  const [library, setLibrary]   = useState([]);
  const [showLib, setShowLib]   = useState(false);
  const [workouts, setWorkouts] = useState(null);

  const revRef   = useRef(0);
  const helloRef = useRef(0);
  const sendRef  = useRef(null);

  useWakeLock(!!room);

  // Re-render often enough for the mirrored clock to count down smoothly.
  const [, setBeat] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setBeat(b => b + 1), 300);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let code = "";
    try {
      const params = new URLSearchParams(window.location.search);
      code = normalizeRoomCode(params.get("code") || window.localStorage.getItem("judo_remote_room") || "");
    } catch(e) {}
    if (code.length >= 4) setRoom(code);
    setBoot(true);
  }, []);

  const requestFull = useCallback(() => {
    const now = Date.now();
    if (now - helloRef.current < 1500) return;
    helloRef.current = now;
    if (sendRef.current) sendRef.current({ t:"hello" });
  }, []);

  const onMessage = useCallback(m => {
    if (m.t === "full") {
      revRef.current = m.rev;
      setLive({ rev: m.rev, s: m.s, sAt: Date.now(), d: m.d });
      return;
    }
    if (m.t === "tick") {
      if (revRef.current !== m.rev) { revRef.current = m.rev; requestFull(); }
      setLive(prev => prev
        ? { ...prev, rev: m.rev, s: m.s, sAt: Date.now() }
        : { rev: m.rev, s: m.s, sAt: Date.now(), d: null });
    }
  }, [requestFull]);

  const link = useRemoteLink({ room, active: !!room, onMessage });
  sendRef.current = link.send;

  useEffect(() => {
    if (!room) { setLive(null); setDraft(null); revRef.current = 0; }
  }, [room]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (tab !== "workout" || library.length) return;
    supa("drill_library?order=created_at.desc").then(r => { if (r) setLibrary(r); });
  }, [tab, library.length]);

  // ── derived state ─────────────────────────────────────────────────────────
  const d = live && live.d ? live.d : null;
  const s = live && live.s ? live.s : null;
  const synced = !!d;

  const base = {
    drills:  d && Array.isArray(d.drills)  ? d.drills  : [],
    judokas: d && Array.isArray(d.judokas) ? d.judokas : [],
    pairs:   d && Array.isArray(d.pairs)   ? d.pairs   : [],
    notes:          d ? (d.notes || "")        : "",
    globalAutoNext: d ? !!d.globalAutoNext     : true,
    soundType:      d ? (d.soundType || "beep"): "beep",
    projection:     d ? !!d.projection         : false,
    drillIdx: s ? (s.drillIdx || 0) : 0,
    phaseIdx: s ? (s.phaseIdx || 0) : 0,
    timeLeft: s ? (s.timeLeft || 0) : 0,
  };
  const view = { ...base, ...(draft || {}) };

  const dirtyKeys = draft ? Object.keys(draft) : [];
  const isDirty   = dirtyKeys.length > 0;
  const running   = !!(s && s.running);

  // What the TV shows right now, ticked forward between packets.
  const liveTime = s
    ? (running ? Math.max(0, s.timeLeft - Math.floor((Date.now() - live.sAt) / 1000)) : s.timeLeft)
    : 0;

  const liveDrill  = base.drills[base.drillIdx];
  const livePhases = getDrillPhases(liveDrill);
  const livePhase  = livePhases[base.phaseIdx];

  const viewDrill  = view.drills[view.drillIdx];
  const viewPhases = getDrillPhases(viewDrill);
  const viewPhase  = viewPhases[view.phaseIdx];

  const stagedTime = draft && draft.timeLeft !== undefined ? draft.timeLeft : null;
  const shownTime  = stagedTime !== null ? stagedTime : liveTime;

  // ── actions ───────────────────────────────────────────────────────────────
  const stage = patch => setDraft(prev => ({ ...(prev || {}), ...patch }));

  const cmd = (c, extra) => link.send({ t:"cmd", c, ...(extra || {}) });

  const pushDraft = then => {
    const patch = draft || {};
    if (!Object.keys(patch).length && !then) return;
    link.send({ t:"apply", patch, then: then || null });
    setDraft(null);
    setToast(then === "play" ? "עודכן והופעל" : "המסך עודכן");
  };

  const onPlayPause = () => {
    if (running) { cmd(COMMANDS.PAUSE); return; }
    if (isDirty) pushDraft("play");
    else cmd(COMMANDS.PLAY);
  };

  const adjustTime = delta => {
    if (liveMode) { cmd(COMMANDS.ADD_TIME, { seconds: delta }); return; }
    stage({ timeLeft: Math.max(0, shownTime + delta) });
  };

  const onReset = () => {
    if (liveMode) { cmd(COMMANDS.RESET); return; }
    stage({ timeLeft: viewPhase ? viewPhase.duration : 60 });
  };

  const goDrill = i => {
    if (i < 0 || i >= view.drills.length) return;
    if (liveMode) { cmd(COMMANDS.GOTO, { drillIdx: i, phaseIdx: 0 }); return; }
    const ph = getDrillPhases(view.drills[i]);
    stage({ drillIdx: i, phaseIdx: 0, timeLeft: ph[0] ? ph[0].duration : 60 });
  };

  const onNextPhase = () => {
    if (liveMode) { cmd(COMMANDS.NEXT_PHASE); return; }
    const np = view.phaseIdx + 1;
    if (np < viewPhases.length) stage({ phaseIdx: np, timeLeft: viewPhases[np].duration });
    else goDrill(view.drillIdx + 1);
  };

  const setDrills = next => {
    // Keep the staged position inside the new list.
    const patch = { drills: next };
    if (view.drillIdx >= next.length) patch.drillIdx = Math.max(0, next.length - 1);
    stage(patch);
  };

  const disconnect = () => {
    try { window.localStorage.removeItem("judo_remote_room"); } catch(e) {}
    setRoom("");
    setCodeInput("");
  };

  const connect = () => {
    const code = normalizeRoomCode(codeInput);
    if (code.length < 4) return;
    try { window.localStorage.setItem("judo_remote_room", code); } catch(e) {}
    setRoom(code);
  };

  // ── screens ───────────────────────────────────────────────────────────────
  const shell = children => (
    <div style={{height:"100vh",maxHeight:"100dvh",overflow:"hidden",background:"#080a10",direction:"rtl",fontFamily:"Heebo,sans-serif",color:"#fff",display:"flex",flexDirection:"column"}}>
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&family=Oswald:wght@700&display=swap" rel="stylesheet"/>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        button{font-family:Heebo,sans-serif}
        input,textarea,select{font-family:Heebo,sans-serif}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
      `}</style>
      {children}
    </div>
  );

  if (!bootstrapped) return shell(null);

  if (!room) {
    return shell(
      <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",padding:26,gap:22}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:44,marginBottom:10}}>🥋</div>
          <div style={{fontSize:24,fontWeight:900}}>שלט אימון</div>
          <div style={{color:"rgba(255,255,255,0.35)",fontSize:14,marginTop:6}}>נבחרת ג׳ודו BGU</div>
        </div>
        <div style={{...card,padding:20}}>
          <div style={{color:"rgba(255,255,255,0.45)",fontSize:13,marginBottom:12,textAlign:"center"}}>
            הקלידו את הקוד שמופיע במסך הטלויזיה
          </div>
          <input
            value={codeInput}
            onChange={e => setCodeInput(normalizeRoomCode(e.target.value))}
            onKeyDown={e => { if (e.key === "Enter") connect(); }}
            placeholder="A7K2"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            style={{width:"100%",background:"rgba(0,0,0,0.35)",border:"1px solid rgba(255,107,0,0.4)",borderRadius:12,color:"#fff",padding:"16px",fontFamily:"Oswald,sans-serif",fontSize:38,letterSpacing:12,textAlign:"center",outline:"none"}}
          />
          <button
            onClick={connect}
            disabled={normalizeRoomCode(codeInput).length < 4}
            style={{...btn(normalizeRoomCode(codeInput).length < 4 ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg,#FF6B00,#cc4400)", "#fff", "none"),width:"100%",marginTop:14,padding:"16px",fontSize:18,fontWeight:900,opacity:normalizeRoomCode(codeInput).length < 4 ? 0.4 : 1}}
          >התחבר</button>
        </div>
        <div style={{color:"rgba(255,255,255,0.25)",fontSize:12,textAlign:"center",lineHeight:1.8}}>
          במסך הטלויזיה לוחצים על <span style={{color:"rgba(255,255,255,0.45)"}}>📱 שלט רחוק</span><br/>והקוד נפתח שם בחלון
        </div>
      </div>
    );
  }

  const connLabel = link.tvConnected ? "מחובר למסך"
    : link.status === "online" ? "מחפש את המסך…"
    : link.status === "connecting" ? "מתחבר…"
    : "אין חיבור לרשת";
  const connColor = link.tvConnected ? "#2ecc71"
    : link.status === "offline" ? "#ff4444" : "#ffb347";

  return shell(
    <>
      {/* header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"10px 14px",borderBottom:"1px solid rgba(255,255,255,0.07)",background:"rgba(0,0,0,0.4)",position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
          <span style={{width:8,height:8,borderRadius:"50%",background:connColor,flexShrink:0,animation:link.tvConnected?"none":"pulse 1.2s infinite"}}/>
          <span style={{color:"rgba(255,255,255,0.5)",fontSize:12,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{connLabel}</span>
          <span style={{color:"rgba(255,255,255,0.22)",fontFamily:"Oswald,sans-serif",fontSize:14,letterSpacing:2}}>{room}</span>
        </div>
        <div
          onClick={() => setLiveMode(v => !v)}
          style={{display:"flex",alignItems:"center",gap:7,background:liveMode?"rgba(255,68,68,0.14)":"rgba(255,255,255,0.05)",border:"1px solid "+(liveMode?"rgba(255,68,68,0.45)":"rgba(255,255,255,0.1)"),borderRadius:20,padding:"6px 12px",cursor:"pointer",flexShrink:0}}>
          <span style={{fontSize:13,color:liveMode?"#ff6060":"rgba(255,255,255,0.6)",fontWeight:700,whiteSpace:"nowrap"}}>
            {liveMode ? "🔴 שידור ישיר" : "🔒 מצב פרטי"}
          </span>
        </div>
      </div>

      {!synced && (
        <div style={{padding:"10px 14px",background:"rgba(255,179,71,0.1)",color:"#ffb347",fontSize:13,textAlign:"center"}}>
          מסתנכרן עם המסך…
        </div>
      )}

      {/* body */}
      <div style={{flex:1,overflowY:"auto",padding:"14px 14px 8px",display:"flex",flexDirection:"column",gap:12}}>
        {tab === "control" && (
          <ControlTab
            running={running} liveTime={liveTime} shownTime={shownTime} stagedTime={stagedTime}
            liveDrill={liveDrill} livePhase={livePhase} livePhases={livePhases} livePhaseIdx={base.phaseIdx}
            viewDrill={viewDrill} viewPhase={viewPhase} isDirty={isDirty} liveMode={liveMode}
            drillIdx={view.drillIdx} drillCount={view.drills.length}
            onAdjust={adjustTime} onReset={onReset} onPrev={() => goDrill(view.drillIdx - 1)}
            onNextPhase={onNextPhase} onPlayPause={onPlayPause}
          />
        )}

        {tab === "workout" && (
          <WorkoutTab
            drills={view.drills} currentIdx={view.drillIdx} liveIdx={base.drillIdx}
            onPick={goDrill} setDrills={setDrills}
            editId={editId} setEditId={setEditId} editData={editData} setEditData={setEditData}
            newDrill={newDrill} setNewDrill={setNewDrill}
            library={library} setLibrary={setLibrary} showLib={showLib} setShowLib={setShowLib}
          />
        )}

        {tab === "more" && (
          <MoreTab
            view={view} stage={stage} workouts={workouts} setWorkouts={setWorkouts}
            room={room} onDisconnect={disconnect}
          />
        )}
      </div>

      {/* pending changes */}
      {isDirty && (
        <div style={{padding:"10px 14px",borderTop:"1px solid rgba(255,107,0,0.3)",background:"rgba(255,107,0,0.09)",position:"sticky",bottom:0,zIndex:15}}>
          <div style={{color:"rgba(255,255,255,0.55)",fontSize:12,marginBottom:8}}>
            לא נשלח למסך: {dirtyKeys.map(k => PATCH_LABELS[k] || k).join(" · ")}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={() => setDraft(null)} style={{...btn("rgba(255,255,255,0.06)","rgba(255,255,255,0.55)"),flex:1}}>בטל</button>
            <button onClick={() => pushDraft(null)} style={{...btn("linear-gradient(135deg,#FF6B00,#cc4400)","#fff","none"),flex:2,fontWeight:900,fontSize:16}}>✓ עדכן טלויזיה</button>
          </div>
        </div>
      )}

      {/* tabs */}
      <div style={{display:"flex",borderTop:"1px solid rgba(255,255,255,0.08)",background:"rgba(0,0,0,0.45)",paddingBottom:"env(safe-area-inset-bottom)"}}>
        {[["control","🎛","שלט"],["workout","📋","מערך"],["more","⚙️","עוד"]].map(([k,icon,label]) => (
          <button key={k} onClick={() => setTab(k)} style={{flex:1,background:"none",border:"none",borderTop:"2px solid "+(tab===k?ORANGE:"transparent"),color:tab===k?ORANGE:"rgba(255,255,255,0.4)",padding:"11px 0 13px",cursor:"pointer",fontSize:12,fontWeight:700,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            <span style={{fontSize:19}}>{icon}</span>{label}
          </button>
        ))}
      </div>

      {toast && (
        <div style={{position:"fixed",bottom:96,left:"50%",transform:"translateX(-50%)",background:"rgba(46,204,113,0.95)",color:"#06210f",borderRadius:22,padding:"11px 22px",fontWeight:900,fontSize:15,zIndex:60,whiteSpace:"nowrap"}}>
          ✓ {toast}
        </div>
      )}
    </>
  );
}

// ── Control tab ───────────────────────────────────────────────────────────────
function ControlTab({
  running, liveTime, shownTime, stagedTime, liveDrill, livePhase, livePhases, livePhaseIdx,
  viewDrill, viewPhase, isDirty, liveMode, drillIdx, drillCount,
  onAdjust, onReset, onPrev, onNextPhase, onPlayPause,
}) {
  const secColor = SEC_COLOR[(liveDrill && liveDrill.section) || "warmup"];
  const isRest   = livePhase ? livePhase.phase === "rest" : (liveDrill && liveDrill.type === "rest");
  const timeColor = isRest ? "#a8ff78" : running ? "#00ff88" : "#ffffff";

  return (
    <>
      {/* what the room sees right now */}
      <div style={{...card,padding:"16px 14px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
          <span style={{width:4,height:18,borderRadius:2,background:secColor,flexShrink:0}}/>
          <span style={{color:"rgba(255,255,255,0.3)",fontSize:11,letterSpacing:3}}>על המסך</span>
          {running && <span style={{marginInlineStart:"auto",color:"#00ff88",fontSize:11,fontWeight:700}}>● רץ</span>}
          {!running && <span style={{marginInlineStart:"auto",color:"rgba(255,255,255,0.3)",fontSize:11}}>עצור</span>}
        </div>
        <div style={{fontSize:20,fontWeight:900,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {liveDrill ? liveDrill.name : "—"}
        </div>
        <div style={{color:"rgba(255,255,255,0.35)",fontSize:13,marginTop:2}}>
          {livePhase ? livePhase.label : ""}
          {livePhases.length > 1 ? "  ·  שלב " + (livePhaseIdx + 1) + "/" + livePhases.length : ""}
        </div>
        <div style={{textAlign:"center",fontFamily:"Oswald,sans-serif",fontSize:66,lineHeight:1.1,color:timeColor,letterSpacing:-2,marginTop:6}}>
          {fmt(liveTime)}
        </div>
      </div>

      {/* what will be pushed */}
      {isDirty && (
        <div style={{...card,background:"rgba(255,107,0,0.08)",border:"1px solid rgba(255,107,0,0.35)",padding:"12px 14px"}}>
          <div style={{color:"rgba(255,107,0,0.85)",fontSize:11,letterSpacing:3,marginBottom:6}}>טיוטה — עדיין לא על המסך</div>
          <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:10}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:16,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{viewDrill ? viewDrill.name : "—"}</div>
              <div style={{color:"rgba(255,255,255,0.35)",fontSize:12}}>{viewPhase ? viewPhase.label : ""}</div>
            </div>
            <div style={{fontFamily:"Oswald,sans-serif",fontSize:34,color:ORANGE,flexShrink:0}}>{fmt(shownTime)}</div>
          </div>
        </div>
      )}

      {/* time */}
      <div style={card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <span style={{color:"rgba(255,255,255,0.3)",fontSize:11,letterSpacing:3}}>זמן</span>
          <span style={{color:liveMode?"rgba(255,96,96,0.8)":"rgba(255,255,255,0.25)",fontSize:11}}>
            {liveMode ? "משפיע מיד על המסך" : "נשמר בטיוטה"}
          </span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7,marginBottom:7}}>
          {[[60,"+ דקה"],[30,"+ 30ש׳"],[10,"+ 10ש׳"]].map(([v,l]) => (
            <button key={v} onClick={() => onAdjust(v)} style={btn("rgba(0,229,255,0.07)","rgba(0,229,255,0.8)")}>{l}</button>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7,marginBottom:7}}>
          {[[-60,"− דקה"],[-30,"− 30ש׳"],[-10,"− 10ש׳"]].map(([v,l]) => (
            <button key={v} onClick={() => onAdjust(v)} style={btn("rgba(255,107,0,0.07)","rgba(255,107,0,0.8)")}>{l}</button>
          ))}
        </div>
        <button onClick={onReset} style={{...btn("rgba(255,255,255,0.05)","rgba(255,255,255,0.6)"),width:"100%"}}>↺ אפס שלב</button>
      </div>

      {/* navigation */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <button onClick={onPrev} disabled={drillIdx === 0} style={{...btn("rgba(255,255,255,0.05)",drillIdx===0?"rgba(255,255,255,0.15)":"#fff"),padding:"15px 10px"}}>← תרגיל קודם</button>
        <button onClick={onNextPhase} style={{...btn("rgba(255,255,255,0.05)","#fff"),padding:"15px 10px"}}>שלב הבא →</button>
      </div>
      <div style={{color:"rgba(255,255,255,0.2)",fontSize:12,textAlign:"center"}}>
        תרגיל {Math.min(drillIdx + 1, Math.max(drillCount, 1))} מתוך {drillCount}
      </div>

      {/* the one button everybody sees the result of */}
      <button
        onClick={onPlayPause}
        style={{
          ...btn(running ? "linear-gradient(135deg,#ff4444,#a82020)" : "linear-gradient(135deg,#2ecc71,#1f9c54)", "#fff", "none"),
          padding:"22px",fontSize:24,fontWeight:900,marginTop:2,
          boxShadow: running ? "0 6px 26px rgba(255,68,68,0.35)" : "0 6px 26px rgba(46,204,113,0.35)",
        }}>
        {running ? "⏸ עצור" : isDirty ? "▶ עדכן והתחל" : "▶ התחל"}
      </button>
    </>
  );
}

// ── Workout tab ───────────────────────────────────────────────────────────────
function WorkoutTab({
  drills, currentIdx, liveIdx, onPick, setDrills,
  editId, setEditId, editData, setEditData, newDrill, setNewDrill,
  library, setLibrary, showLib, setShowLib,
}) {
  const blankDrill = () => ({ id:Date.now(), name:"", section:"technique", durationWork:60, durationRest:15, rounds:3, pattern:"alternate", restTiming:"after_each", activeColor:"white", type:"partner", note:"", autoNext:true });
  const blankRest  = () => ({ id:Date.now(), name:"מנוחה", section:"rest", durationWork:60, durationRest:0, rounds:1, pattern:"together", restTiming:"none", activeColor:"both", type:"rest", note:"", autoNext:true });

  const move = (i, dir) => {
    const t = i + dir;
    if (t < 0 || t >= drills.length) return;
    const a = [...drills];
    [a[i], a[t]] = [a[t], a[i]];
    setDrills(a);
  };

  const saveToLib = async dr => {
    const p = { name:dr.name, duration_work:dr.durationWork, duration_rest:dr.durationRest||0, rounds:dr.rounds, pattern:dr.pattern, active_color:dr.activeColor||"both", note:dr.note||"" };
    const r = await supa("drill_library", { method:"POST", body:JSON.stringify(p) });
    if (r && r[0]) setLibrary(prev => [r[0], ...prev]);
  };

  const total = drills.reduce((a, dr) => a + totalDrillTime(dr), 0);

  return (
    <>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{color:"rgba(255,255,255,0.3)",fontSize:11,letterSpacing:3}}>מערך האימון</span>
        <span style={{color:"rgba(255,255,255,0.3)",fontSize:12}}>{drills.length} תרגילים · {fmt(total)}</span>
      </div>

      {drills.map((dr, i) => (
        <div key={dr.id}>
          {editId === dr.id ? (
            <DrillForm
              drill={editData}
              onChange={setEditData}
              onCancel={() => setEditId(null)}
              onSave={() => { setDrills(drills.map(x => x.id === dr.id ? editData : x)); setEditId(null); }}
              onSaveToLibrary={() => saveToLib(editData)}
            />
          ) : (
            <div style={{background:i===currentIdx?"rgba(255,107,0,0.11)":"rgba(255,255,255,0.03)",border:"1px solid "+(i===currentIdx?"rgba(255,107,0,0.45)":"rgba(255,255,255,0.06)"),borderRadius:12,padding:"10px 12px",display:"flex",flexDirection:"column",gap:9}}>
              <div onClick={() => onPick(i)} style={{display:"flex",alignItems:"center",gap:9,cursor:"pointer"}}>
                <span style={{width:4,height:34,borderRadius:2,background:SEC_COLOR[dr.section||"warmup"],flexShrink:0}}/>
                <span style={{width:22,height:22,borderRadius:"50%",background:i===currentIdx?ORANGE:"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0}}>{i+1}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:15,fontWeight:i===currentIdx?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{dr.name || "ללא שם"}</div>
                  <div style={{color:SEC_COLOR[dr.section||"warmup"],fontSize:11,marginTop:1}}>
                    {dr.type !== "rest" ? dr.rounds + "× · " : ""}{fmt(totalDrillTime(dr))}
                  </div>
                </div>
                {i === liveIdx && <span style={{color:"#00ff88",fontSize:10,fontWeight:700,flexShrink:0}}>על המסך</span>}
              </div>
              <div style={{display:"flex",gap:5}}>
                <button onClick={() => move(i,-1)} style={{...btn("rgba(255,255,255,0.05)","rgba(255,255,255,0.5)"),padding:"9px 0",flex:1,fontSize:14}}>↑</button>
                <button onClick={() => move(i,1)}  style={{...btn("rgba(255,255,255,0.05)","rgba(255,255,255,0.5)"),padding:"9px 0",flex:1,fontSize:14}}>↓</button>
                <button onClick={() => { setEditId(dr.id); setEditData({...dr}); }} style={{...btn("rgba(255,107,0,0.13)",ORANGE),padding:"9px 0",flex:2,fontSize:13}}>ערוך</button>
                <button onClick={() => { const c = {...dr, id:Date.now(), name:dr.name+" (עותק)"}; setDrills([...drills.slice(0,i+1), c, ...drills.slice(i+1)]); }} style={{...btn("rgba(255,255,255,0.05)","rgba(255,255,255,0.45)"),padding:"9px 0",flex:2,fontSize:13}}>שכפל</button>
                <button onClick={() => setDrills(drills.filter(x => x.id !== dr.id))} style={{...btn("rgba(255,60,60,0.1)","#ff6060"),padding:"9px 0",flex:2,fontSize:13}}>מחק</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {newDrill ? (
        <DrillForm
          drill={newDrill}
          onChange={setNewDrill}
          onCancel={() => setNewDrill(null)}
          onSave={() => { setDrills([...drills, newDrill]); setNewDrill(null); }}
          onSaveToLibrary={() => saveToLib(newDrill)}
        />
      ) : (
        <div style={{display:"flex",gap:7}}>
          <button onClick={() => setNewDrill(blankDrill())} style={{...btn("rgba(255,107,0,0.1)",ORANGE,"1px dashed rgba(255,107,0,0.4)"),flex:2}}>+ תרגיל</button>
          <button onClick={() => setNewDrill(blankRest())} style={{...btn("rgba(136,204,255,0.08)","#88ccff","1px dashed rgba(136,204,255,0.35)"),flex:2}}>+ מנוחה</button>
          <button onClick={() => setShowLib(v => !v)} style={{...btn("rgba(255,255,255,0.05)","rgba(255,255,255,0.45)"),flex:1}}>📚</button>
        </div>
      )}

      {showLib && (
        <div style={{...card,padding:12}}>
          <div style={{color:"rgba(255,255,255,0.25)",fontSize:10,letterSpacing:3,marginBottom:8}}>ספריית תרגילים</div>
          {library.length === 0 && <div style={{color:"rgba(255,255,255,0.2)",fontSize:13,textAlign:"center",padding:10}}>הספרייה ריקה</div>}
          {library.map(lib => (
            <div key={lib.id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 10px",borderRadius:9,background:"rgba(255,255,255,0.03)",marginBottom:5}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{lib.name}</div>
                <div style={{color:"rgba(255,255,255,0.25)",fontSize:11}}>{fmt(lib.duration_work)} × {lib.rounds}</div>
              </div>
              <button onClick={() => setDrills([...drills, { id:Date.now(), name:lib.name, section:"technique", durationWork:lib.duration_work, durationRest:lib.duration_rest||0, rounds:lib.rounds, pattern:lib.pattern, restTiming:"after_round", activeColor:lib.active_color||"both", type:"partner", note:lib.note||"", autoNext:true }])} style={{...btn("rgba(255,107,0,0.18)",ORANGE),padding:"8px 14px",fontSize:13,flexShrink:0}}>+</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── More tab ──────────────────────────────────────────────────────────────────
function MoreTab({ view, stage, workouts, setWorkouts, room, onDisconnect }) {
  const loadWorkouts = () => {
    setWorkouts([]);
    supa("workouts?order=date.desc&limit=20").then(r => setWorkouts(r || []));
  };

  return (
    <>
      <div style={card}>
        <div style={{color:"rgba(255,255,255,0.3)",fontSize:11,letterSpacing:3,marginBottom:9}}>הערות אימון</div>
        <textarea
          value={view.notes}
          onChange={e => stage({ notes: e.target.value })}
          placeholder="הערות, דגשים לאימון..."
          style={{width:"100%",minHeight:110,background:"rgba(0,0,0,0.25)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:10,color:"#fff",padding:11,fontSize:14,lineHeight:1.6,resize:"vertical",outline:"none",direction:"rtl"}}
        />
      </div>

      <div style={card}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{minWidth:0,marginInlineEnd:10}}>
            <div style={{fontSize:15}}>📺 מצב הקרנה</div>
            <div style={{color:"rgba(255,255,255,0.3)",fontSize:12,marginTop:2}}>מסתיר את כפתורי השליטה מהמסך</div>
          </div>
          <Toggle value={view.projection} onChange={v => stage({ projection: v })}/>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{minWidth:0,marginInlineEnd:10}}>
            <div style={{fontSize:15}}>⏭ מעבר אוטומטי</div>
            <div style={{color:"rgba(255,255,255,0.3)",fontSize:12,marginTop:2}}>מעבר לתרגיל הבא בסיום</div>
          </div>
          <Toggle value={view.globalAutoNext} onChange={v => stage({ globalAutoNext: v })}/>
        </div>
      </div>

      <div style={card}>
        <div style={{color:"rgba(255,255,255,0.3)",fontSize:11,letterSpacing:3,marginBottom:10}}>צליל במסך</div>
        <div style={{display:"flex",gap:7}}>
          {[["beep","🔔 ביפ"],["buzz","⚡ באזר"],["mute","🔇 שקט"]].map(([v,l]) => (
            <button key={v} onClick={() => stage({ soundType: v })} style={{...btn(view.soundType===v?"rgba(255,107,0,0.2)":"rgba(255,255,255,0.05)", view.soundType===v?ORANGE:"rgba(255,255,255,0.5)", view.soundType===v?"1px solid rgba(255,107,0,0.5)":undefined),flex:1,fontSize:13}}>{l}</button>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <span style={{color:"rgba(255,255,255,0.3)",fontSize:11,letterSpacing:3}}>אימונים שמורים</span>
          <button onClick={loadWorkouts} style={{...btn("rgba(255,255,255,0.05)","rgba(255,255,255,0.5)"),padding:"7px 13px",fontSize:12}}>טען רשימה</button>
        </div>
        {workouts === null && <div style={{color:"rgba(255,255,255,0.2)",fontSize:13}}>לחצו כדי לראות אימונים שמורים</div>}
        {workouts && workouts.length === 0 && <div style={{color:"rgba(255,255,255,0.2)",fontSize:13}}>אין אימונים שמורים</div>}
        {workouts && workouts.map(w => (
          <div key={w.id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 10px",borderRadius:9,background:"rgba(255,255,255,0.03)",marginBottom:5}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{w.name || "אימון"}</div>
              <div style={{color:"rgba(255,255,255,0.25)",fontSize:11}}>{w.date}</div>
            </div>
            <button
              onClick={() => {
                const patch = { drillIdx:0, phaseIdx:0 };
                if (w.drills  && w.drills.length)  patch.drills  = w.drills;
                if (w.judokas && w.judokas.length) patch.judokas = w.judokas;
                if (w.pairs   && w.pairs.length)   patch.pairs   = w.pairs;
                const ph = getDrillPhases((patch.drills || view.drills)[0]);
                patch.timeLeft = ph[0] ? ph[0].duration : 60;
                stage(patch);
              }}
              style={{...btn("rgba(255,107,0,0.18)",ORANGE),padding:"8px 14px",fontSize:13,flexShrink:0}}>טען</button>
          </div>
        ))}
        {workouts && workouts.length > 0 && (
          <div style={{color:"rgba(255,255,255,0.25)",fontSize:11,marginTop:6}}>
            הטעינה נכנסת לטיוטה — המסך מתעדכן רק כששולחים
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{color:"rgba(255,255,255,0.3)",fontSize:11,letterSpacing:3}}>קוד חיבור</div>
            <div style={{fontFamily:"Oswald,sans-serif",fontSize:26,letterSpacing:6,marginTop:3}}>{room}</div>
          </div>
          <button onClick={onDisconnect} style={{...btn("rgba(255,60,60,0.1)","#ff6060"),padding:"11px 16px",fontSize:14}}>התנתק</button>
        </div>
      </div>
    </>
  );
}
