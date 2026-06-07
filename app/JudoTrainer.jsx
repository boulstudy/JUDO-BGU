'use client';

import { useState, useEffect, useRef, useCallback } from "react";

const SUPA_URL = "https://oakbpcjxjunppuyddpsj.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ha2JwY2p4anVucHB1eWRkcHNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyOTcwOTIsImV4cCI6MjA5NTg3MzA5Mn0.EoYTL3N_P5C05VyR2-EFKcQUk3dcZSE3l3kWeADzQnE";

const supa = async (path, opts = {}) => {
  try {
    const r = await fetch(SUPA_URL + "/rest/v1/" + path, {
      ...opts,
      headers: {
        "apikey": SUPA_KEY,
        "Authorization": "Bearer " + SUPA_KEY,
        "Content-Type": "application/json",
        "Prefer": opts.prefer !== undefined ? opts.prefer : "return=representation",
        ...(opts.headers || {}),
      },
    });
    if (!r.ok) return null;
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  } catch(e) {
    return null;
  }
};

const DRILL_SECTIONS = [
  { id:"warmup",    label:"חימום",   color:"#6ec6ff" },
  { id:"technique", label:"טכניקה",  color:"#FF6B00" },
  { id:"randori",   label:"קרבות",   color:"#ff4444" },
  { id:"strength",  label:"כוח",     color:"#a8ff78" },
  { id:"mixed",     label:"משולב",   color:"#ffb347" },
  { id:"rest",      label:"מנוחה",   color:"#88ccff" },
];
const SEC_COLOR = Object.fromEntries(DRILL_SECTIONS.map(s => [s.id, s.color]));

const PATTERNS = [
  { id:"alternate", label:"לסירוגין", desc:"לבן עובד, אחר כך כחול" },
  { id:"together",  label:"יחד",      desc:"שניהם עובדים" },
];
const REST_TIMING = [
  { id:"none",        label:"ללא מנוחה פנימית" },
  { id:"after_each",  label:"אחרי כל עובד" },
  { id:"after_round", label:"אחרי כל סבב" },
];

const INIT_JUDOKAS = [
  { id:1, name:"יואב כ׳",  color:"white", personalDrills:[{id:101,name:"נאגה גדן שמאל",duration:180},{id:102,name:"אוצ׳י גארי",duration:120}]},
  { id:2, name:"ניר ל׳",   color:"blue",  personalDrills:[{id:201,name:"סאיה נאגה",duration:180},{id:202,name:"קו-סוטו גארי",duration:120}]},
  { id:3, name:"שיר מ׳",   color:"white", personalDrills:[{id:301,name:"אוצ׳ימטה",duration:150}]},
  { id:4, name:"תום א׳",   color:"blue",  personalDrills:[{id:401,name:"קו-אוצ׳י גארי",duration:150}]},
  { id:5, name:"עידן ב׳",  color:"white", personalDrills:[{id:501,name:"סיאו-אוצ׳י",duration:120}]},
  { id:6, name:"גל ש׳",    color:"blue",  personalDrills:[{id:601,name:"טאיו-נאגה",duration:120}]},
];
const INIT_PAIRS = [[1,2],[3,4],[5,6]];
const INIT_DRILLS = [
  { id:1, name:"חימום כללי",    section:"warmup",    durationWork:300, durationRest:0,  rounds:1, pattern:"together",  restTiming:"none",        activeColor:"both",  type:"group",    note:"ריצה + תנועתיות",         autoNext:true  },
  { id:2, name:"נאגה גדן",      section:"technique", durationWork:60,  durationRest:15, rounds:5, pattern:"alternate", restTiming:"after_each",  activeColor:"white", type:"partner",  note:"זריקה לצד שמאל",          autoNext:true  },
  { id:3, name:"מנוחה",         section:"rest",      durationWork:60,  durationRest:0,  rounds:1, pattern:"together",  restTiming:"none",        activeColor:"both",  type:"rest",     note:"",                         autoNext:true  },
  { id:4, name:"ראנדורי עמידה", section:"randori",   durationWork:300, durationRest:60, rounds:3, pattern:"together",  restTiming:"after_round", activeColor:"both",  type:"partner",  note:"50% עוצמה",                autoNext:false },
  { id:5, name:"עבודה אישית",   section:"mixed",     durationWork:300, durationRest:0,  rounds:1, pattern:"together",  restTiming:"none",        activeColor:"both",  type:"personal", note:"כל אחד על התרגיל שלו",    autoNext:false },
];

const fmt = s => {
  const neg = s < 0, abs = Math.abs(s);
  return (neg?"-":"") + String(Math.floor(abs/60)).padStart(2,"0") + ":" + String(abs%60).padStart(2,"0");
};

function getDrillPhases(drill) {
  if (!drill) return [];
  if (drill.type === "rest" || drill.type === "group" || drill.type === "personal") {
    return [{ phase:"work", who:"both", duration: drill.durationWork || 60, label: drill.type === "rest" ? "מנוחה" : "עבודה" }];
  }
  const { durationWork=60, durationRest=0, rounds=1, pattern="together", restTiming="none", activeColor="both" } = drill;
  const phases = [];
  for (let r = 0; r < rounds; r++) {
    if (pattern === "together") {
      phases.push({ phase:"work", who:"both", duration:durationWork, label:"שניהם עובדים", round:r+1 });
      if (restTiming !== "none" && durationRest > 0) phases.push({ phase:"rest", who:"none", duration:durationRest, label:"מנוחה" });
    } else {
      const first  = activeColor === "blue" ? "blue" : "white";
      const second = first === "white" ? "blue" : "white";
      phases.push({ phase:"work", who:first,  duration:durationWork, label:first==="white"?"לבן עובד":"כחול עובד", round:r+1 });
      if (restTiming === "after_each" && durationRest > 0) phases.push({ phase:"rest", who:"none", duration:durationRest, label:"מנוחה" });
      phases.push({ phase:"work", who:second, duration:durationWork, label:second==="white"?"לבן עובד":"כחול עובד", round:r+1 });
      if ((restTiming === "after_each" || restTiming === "after_round") && durationRest > 0) phases.push({ phase:"rest", who:"none", duration:durationRest, label:"מנוחה" });
    }
  }
  return phases;
}

function totalDrillTime(drill) {
  return getDrillPhases(drill).reduce((a,p) => a+p.duration, 0);
}


// ── Sound — Flex Timer / GymNext style (client-only) ─────────────────────────
// soundType: "beep" | "buzz" | "mute"
function useSound(soundType) {
  const ctxRef = useRef(null);

  // Must be called directly inside a user gesture (tap/click) to work on iOS
  const initCtx = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      if (!ctxRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctxRef.current = new AC();
      }
      if (ctxRef.current.state === "suspended") {
        ctxRef.current.resume();
      }
      return ctxRef.current;
    } catch(e) { return null; }
  }, []);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) return null;
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  // Sharp electronic beep — Flex Timer style
  // Uses sine + slight distortion via gain clipping for that crisp gym-timer sound
  const playBeep = useCallback((freq, dur, vol, offset) => {
    try {
      const ctx = getCtx();
      if (!ctx) return;
      const t = ctx.currentTime + (offset || 0);

      // Primary tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      // Hard attack, flat sustain, fast release — gym timer character
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.004);
      gain.gain.setValueAtTime(vol, t + dur - 0.015);
      gain.gain.linearRampToValueAtTime(0, t + dur);
      osc.start(t); osc.stop(t + dur + 0.02);

      // Click transient at attack — makes it feel punchy
      const click = ctx.createOscillator();
      const clickGain = ctx.createGain();
      click.connect(clickGain); clickGain.connect(ctx.destination);
      click.type = "square";
      click.frequency.value = freq * 1.5;
      clickGain.gain.setValueAtTime(vol * 0.25, t);
      clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
      click.start(t); click.stop(t + 0.02);
    } catch(e) {}
  }, [getCtx]);

  // Buzz — lower, more aggressive sound for rest end
  const playBuzz = useCallback((freq, dur, vol, offset) => {
    try {
      const ctx = getCtx();
      if (!ctx) return;
      const t = ctx.currentTime + (offset || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.005);
      gain.gain.setValueAtTime(vol, t + dur - 0.02);
      gain.gain.linearRampToValueAtTime(0, t + dur);
      osc.start(t); osc.stop(t + dur + 0.02);
    } catch(e) {}
  }, [getCtx]);

  // Flex Timer countdown: 3 identical short sharp beeps at t=3,2,1
  // Then a distinct longer end signal
  const tickBeep = useCallback((t) => {
    if (soundType === "mute") return;
    if (soundType === "buzz") {
      playBuzz(180, 0.08, 0.3, 0);
    } else {
      // 1000Hz — the classic gym timer warning tone
      playBeep(1000, 0.09, 0.5, 0);
    }
  }, [soundType, playBeep, playBuzz]);

  // Flex Timer end signal:
  // "beep" mode: one long high beep (800Hz, 0.8s) — clean and authoritative
  // "buzz" mode: long sawtooth buzz like an electric buzzer
  const endBeep = useCallback(() => {
    if (soundType === "mute") return;
    if (soundType === "buzz") {
      playBuzz(150, 0.7, 0.5, 0);
    } else {
      // Long single beep — Flex Timer / GymNext end-of-round signature
      playBeep(800, 0.75, 0.65, 0);
    }
  }, [soundType, playBeep, playBuzz]);

  return { tickBeep, endBeep, initCtx };
}

// ── Time Picker ───────────────────────────────────────────────────────────────
function TimeWheel({ value, onChange, max, label }) {
  const items = Array.from({length: max+1}, (_,i) => i);
  const ref = useRef(null);
  const isScrolling = useRef(false);

  useEffect(() => {
    if (ref.current && !isScrolling.current) {
      ref.current.scrollTop = value * 44;
    }
  }, [value]);

  const handleScroll = () => {
    isScrolling.current = true;
    if (ref.current) {
      const v = Math.round(ref.current.scrollTop / 44);
      onChange(Math.min(max, Math.max(0, v)));
    }
    setTimeout(() => { isScrolling.current = false; }, 200);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
      <span style={{color:"rgba(255,255,255,0.35)",fontSize:11,letterSpacing:2}}>{label}</span>
      <div style={{position:"relative",width:64,height:132,overflow:"hidden",borderRadius:10,background:"rgba(0,0,0,0.3)",border:"1px solid rgba(255,107,0,0.3)"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:44,background:"linear-gradient(to bottom,rgba(13,16,32,0.95),transparent)",pointerEvents:"none",zIndex:2}}/>
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:44,background:"linear-gradient(to top,rgba(13,16,32,0.95),transparent)",pointerEvents:"none",zIndex:2}}/>
        <div style={{position:"absolute",top:"50%",left:0,right:0,height:44,transform:"translateY(-50%)",background:"rgba(255,107,0,0.12)",borderTop:"1px solid rgba(255,107,0,0.4)",borderBottom:"1px solid rgba(255,107,0,0.4)",pointerEvents:"none",zIndex:1}}/>
        <div ref={ref} onScroll={handleScroll} style={{height:"100%",overflowY:"scroll",scrollSnapType:"y mandatory",scrollbarWidth:"none",msOverflowStyle:"none",paddingTop:44,paddingBottom:44,WebkitOverflowScrolling:"touch",touchAction:"pan-y"}}>
          {items.map(i => (
            <div key={i} onClick={() => onChange(i)} style={{height:44,display:"flex",alignItems:"center",justifyContent:"center",scrollSnapAlign:"center",color:i===value?"#fff":"rgba(255,255,255,0.3)",fontSize:i===value?22:17,fontFamily:"Oswald,sans-serif",fontWeight:700,transition:"all 0.15s",cursor:"pointer"}}>
              {String(i).padStart(2,"0")}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimePicker({ seconds, onChange }) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return (
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <TimeWheel value={mins} onChange={m => onChange(m*60+secs)} max={59} label="דק׳"/>
      <span style={{color:"rgba(255,107,0,0.6)",fontSize:28,fontFamily:"Oswald,sans-serif",marginTop:16}}>:</span>
      <TimeWheel value={secs} onChange={s => onChange(mins*60+s)} max={59} label="שנ׳"/>
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{width:44,height:24,borderRadius:12,background:value?"#FF6B00":"rgba(255,255,255,0.1)",cursor:"pointer",position:"relative",transition:"background 0.3s",border:"1px solid rgba(255,255,255,0.15)",flexShrink:0}}>
      <div style={{position:"absolute",top:2,left:value?22:2,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left 0.3s"}}/>
    </div>
  );
}

// ── Drill Form ────────────────────────────────────────────────────────────────
function DrillForm({ drill, onChange, onCancel, onSave, onSaveToLibrary }) {
  const d = drill;
  const isRest = d.type === "rest";
  const inp = {background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,107,0,0.3)",borderRadius:8,color:"#fff",padding:"7px 11px",fontFamily:"Heebo,sans-serif",fontSize:14,outline:"none",width:"100%"};
  const lbl = {color:"rgba(255,255,255,0.4)",fontSize:11,marginBottom:4,display:"block",letterSpacing:1};
  return (
    <div style={{background:"rgba(255,107,0,0.05)",border:"1px solid rgba(255,107,0,0.25)",borderRadius:12,padding:16,marginBottom:8}}>
      <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
        <div style={{flex:2,minWidth:130}}>
          <span style={lbl}>שם התרגיל</span>
          <input value={d.name} onChange={e => onChange({...d,name:e.target.value})} style={inp} placeholder="שם"/>
        </div>
        <div style={{flex:1,minWidth:90}}>
          <span style={lbl}>סוג</span>
          <select value={d.type} onChange={e => {
            const t = e.target.value;
            const defaults = t==="rest"
              ? {type:t,section:"rest",pattern:"together",restTiming:"none",activeColor:"both",rounds:1}
              : t==="personal"
              ? {type:t,section:"mixed",pattern:"together",restTiming:"none",activeColor:"both"}
              : t==="group"
              ? {type:t,section:"warmup",pattern:"together",restTiming:"none",activeColor:"both"}
              : {type:t,section:"technique",pattern:"alternate",restTiming:"after_each",activeColor:"white"};
            onChange({...d,...defaults});
          }} style={inp}>
            <option value="group">קבוצה</option>
            <option value="partner">זוגות</option>
            <option value="personal">אישי</option>
            <option value="rest">מנוחה</option>
          </select>
        </div>
        <div style={{flex:1,minWidth:90}}>
          <span style={lbl}>חלק באימון</span>
          <select value={d.section||"warmup"} onChange={e => onChange({...d,section:e.target.value})} style={inp}>
            {DRILL_SECTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{display:"flex",gap:16,marginBottom:12,flexWrap:"wrap",alignItems:"flex-end"}}>
        <div>
          <span style={lbl}>זמן {isRest?"מנוחה":"עבודה"}</span>
          <TimePicker seconds={d.durationWork||60} onChange={v => onChange({...d,durationWork:v})}/>
        </div>
        {!isRest && (
          <div style={{flex:1,minWidth:80}}>
            <span style={lbl}>סבבים</span>
            <input type="number" min="1" max="20" value={d.rounds||1} onChange={e => onChange({...d,rounds:parseInt(e.target.value)||1})} style={{...inp,width:70}}/>
          </div>
        )}
      </div>

      {!isRest && (
        <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:120}}>
            <span style={lbl}>תבנית</span>
            <select value={d.pattern||"together"} onChange={e => onChange({...d,pattern:e.target.value})} style={inp}>
              {PATTERNS.map(p => <option key={p.id} value={p.id}>{p.label} — {p.desc}</option>)}
            </select>
          </div>
          {d.pattern === "alternate" && (
            <div style={{flex:1,minWidth:100}}>
              <span style={lbl}>מי מתחיל</span>
              <select value={d.activeColor||"white"} onChange={e => onChange({...d,activeColor:e.target.value})} style={inp}>
                <option value="white">לבן</option>
                <option value="blue">כחול</option>
              </select>
            </div>
          )}
          <div style={{flex:1,minWidth:130}}>
            <span style={lbl}>מנוחה פנימית</span>
            <select value={d.restTiming||"none"} onChange={e => onChange({...d,restTiming:e.target.value})} style={inp}>
              {REST_TIMING.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          {d.restTiming !== "none" && (
            <div>
              <span style={lbl}>זמן מנוחה</span>
              <TimePicker seconds={d.durationRest||0} onChange={v => onChange({...d,durationRest:v})}/>
            </div>
          )}
        </div>
      )}

      {!isRest && (
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <span style={lbl}>מעבר אוטומטי לתרגיל הבא</span>
          <Toggle value={!!d.autoNext} onChange={v => onChange({...d,autoNext:v})}/>
          <span style={{color:"rgba(255,255,255,0.3)",fontSize:12}}>{d.autoNext?"פעיל":"כבוי"}</span>
        </div>
      )}

      <div style={{marginBottom:12}}>
        <span style={lbl}>הערות</span>
        <input value={d.note||""} onChange={e => onChange({...d,note:e.target.value})} style={inp} placeholder="הערות אופציונאליות"/>
      </div>

      <div style={{display:"flex",gap:8,alignItems:"center",justifyContent:"space-between"}}>
        <div style={{color:"rgba(255,255,255,0.25)",fontSize:12}}>סה״כ: {fmt(totalDrillTime(d))}</div>
        <div style={{display:"flex",gap:8}}>
          {onSaveToLibrary && <button onClick={onSaveToLibrary} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.45)",borderRadius:8,padding:"7px 12px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:12}}>📚 ספרייה</button>}
          <button onClick={onCancel} style={{background:"none",border:"1px solid rgba(255,255,255,0.12)",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:13}}>ביטול</button>
          <button onClick={onSave} style={{background:"#FF6B00",border:"none",color:"#fff",borderRadius:8,padding:"7px 18px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:14}}>שמור</button>
        </div>
      </div>
    </div>
  );
}

// ── Editor Modal ──────────────────────────────────────────────────────────────
function EditorModal({ drills, setDrills, currentIndex, judokas, setJudokas, pairs, setPairs, onClose }) {
  const [list, setList] = useState(drills.map(d => ({...d})));
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [newDrill, setNewDrill] = useState(null);
  const [library, setLibrary] = useState([]);
  const [showLib, setShowLib] = useState(false);
  const [tab, setTab] = useState("drills");
  const [localJudokas, setLocalJudokas] = useState(judokas.map(j=>({...j})));
  const [localPairs, setLocalPairs] = useState(pairs.map(p=>[...p]));

  useEffect(() => {
    supa("drill_library?order=created_at.desc").then(r => { if(r) setLibrary(r); });
  }, []);

  const blankDrill = () => ({ id:Date.now(), name:"", section:"technique", durationWork:60, durationRest:15, rounds:3, pattern:"alternate", restTiming:"after_each", activeColor:"white", type:"partner", note:"", autoNext:true });
  const blankRest  = () => ({ id:Date.now(), name:"מנוחה", section:"rest", durationWork:60, durationRest:0, rounds:1, pattern:"together", restTiming:"none", activeColor:"both", type:"rest", note:"", autoNext:true });

  const saveToLib = async (d) => {
    const p = { name:d.name, duration_work:d.durationWork, duration_rest:d.durationRest||0, rounds:d.rounds, pattern:d.pattern, active_color:d.activeColor||"both", note:d.note||"" };
    const r = await supa("drill_library", { method:"POST", body:JSON.stringify(p) });
    if(r && r[0]) setLibrary(prev=>[r[0],...prev]);
  };

  const inp = {background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,107,0,0.3)",borderRadius:8,color:"#fff",padding:"7px 10px",fontFamily:"Heebo,sans-serif",fontSize:14,outline:"none"};

  const tabBtn = (key, label) => (
    <button onClick={() => setTab(key)} style={{background:tab===key?"#FF6B00":"rgba(255,255,255,0.05)",border:"none",color:tab===key?"#fff":"rgba(255,255,255,0.45)",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:14}}>{label}</button>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#0d1020",border:"1px solid rgba(255,107,0,0.28)",borderRadius:18,width:"100%",maxWidth:760,maxHeight:"92vh",overflowY:"auto",padding:22,direction:"rtl"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{display:"flex",gap:6}}>{tabBtn("drills","תרגילים")}{tabBtn("judokas","גודוקות")}{tabBtn("pairs","זוגות")}</div>
          <button onClick={() => { setDrills(list); setJudokas(localJudokas); setPairs(localPairs); onClose(); }} style={{background:"#FF6B00",border:"none",color:"#fff",borderRadius:10,padding:"10px 22px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:15}}>שמור וסגור</button>
        </div>

        {tab === "drills" && (
          <div>
            {list.map((d,i) => (
              <div key={d.id}>
                {editId === d.id ? (
                  <DrillForm drill={editData} onChange={setEditData}
                    onCancel={() => setEditId(null)}
                    onSave={() => { setList(list.map(x => x.id===d.id?editData:x)); setEditId(null); }}
                    onSaveToLibrary={() => saveToLib(editData)}/>
                ) : (
                  <div
                    draggable
                    onDragStart={e => { e.dataTransfer.setData("text/plain", String(i)); }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault();
                      const from = parseInt(e.dataTransfer.getData("text/plain"));
                      if (from === i) return;
                      const a = [...list];
                      const item = a.splice(from, 1)[0];
                      a.splice(i, 0, item);
                      setList(a);
                    }}
                    style={{background:i===currentIndex?"rgba(255,107,0,0.09)":"rgba(255,255,255,0.025)",border:i===currentIndex?"1px solid rgba(255,107,0,0.4)":"1px solid rgba(255,255,255,0.05)",borderRadius:10,padding:"9px 13px",marginBottom:5,display:"flex",alignItems:"center",gap:9,cursor:"grab",touchAction:"manipulation"}}>
                    <div style={{color:"rgba(255,255,255,0.2)",fontSize:14,cursor:"grab",flexShrink:0,userSelect:"none"}}>⠿</div>
                    <div style={{width:4,height:32,borderRadius:2,background:SEC_COLOR[d.section||"warmup"],flexShrink:0}}/>
                    <span style={{color:"rgba(255,107,0,0.5)",fontFamily:"monospace",fontSize:12,minWidth:18}}>{i+1}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <span style={{color:"#fff",fontSize:14,fontWeight:600}}>{d.name}</span>
                      <span style={{fontSize:11,marginRight:6,color:SEC_COLOR[d.section||"warmup"]}}>{DRILL_SECTIONS.find(s=>s.id===d.section)?.label||""}</span>
                      <span style={{color:"rgba(255,255,255,0.25)",fontSize:12}}>{fmt(totalDrillTime(d))}{d.type!=="rest"?" · "+d.rounds+"×":""}</span>
                    </div>
                    <div style={{display:"flex",gap:4,alignItems:"center"}}>
                      <div title="מעבר אוטומטי" style={{width:6,height:6,borderRadius:"50%",background:d.autoNext?"#a8ff78":"rgba(255,255,255,0.15)"}}/>
                      <button onClick={() => { const a=[...list]; const t=i-1; if(t>=0){[a[i],a[t]]=[a[t],a[i]]; setList(a);}}} style={{background:"none",border:"1px solid rgba(255,255,255,0.08)",color:"#fff",borderRadius:5,width:32,height:32,cursor:"pointer",fontSize:13}}>↑</button>
                      <button onClick={() => { const a=[...list]; const t=i+1; if(t<a.length){[a[i],a[t]]=[a[t],a[i]]; setList(a);}}} style={{background:"none",border:"1px solid rgba(255,255,255,0.08)",color:"#fff",borderRadius:5,width:32,height:32,cursor:"pointer",fontSize:13}}>↓</button>
                      <button onClick={() => { setEditId(d.id); setEditData({...d}); }} style={{background:"rgba(255,107,0,0.14)",border:"none",color:"#FF6B00",borderRadius:6,padding:"4px 9px",cursor:"pointer",fontSize:12,fontFamily:"Heebo,sans-serif"}}>ערוך</button>
                      <button onClick={() => { const copy={...d,id:Date.now(),name:d.name+" (עותק)"}; setList([...list.slice(0,i+1),copy,...list.slice(i+1)]); }} style={{background:"rgba(255,255,255,0.06)",border:"none",color:"rgba(255,255,255,0.45)",borderRadius:6,padding:"4px 9px",cursor:"pointer",fontSize:12,fontFamily:"Heebo,sans-serif"}}>שכפל</button>
                      <button onClick={() => setList(list.filter(x=>x.id!==d.id))} style={{background:"rgba(255,60,60,0.1)",border:"none",color:"#ff6060",borderRadius:6,padding:"4px 9px",cursor:"pointer",fontSize:12,fontFamily:"Heebo,sans-serif"}}>מחק</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {newDrill ? (
              <DrillForm drill={newDrill} onChange={setNewDrill}
                onCancel={() => setNewDrill(null)}
                onSave={() => { setList([...list,newDrill]); setNewDrill(null); }}
                onSaveToLibrary={() => saveToLib(newDrill)}/>
            ) : (
              <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
                <button onClick={() => setNewDrill(blankDrill())} style={{background:"rgba(255,107,0,0.1)",border:"1px dashed rgba(255,107,0,0.35)",color:"#FF6B00",borderRadius:9,padding:"9px 16px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:13,flex:1}}>+ תרגיל</button>
                <button onClick={() => setNewDrill(blankRest())} style={{background:"rgba(136,204,255,0.08)",border:"1px dashed rgba(136,204,255,0.3)",color:"#88ccff",borderRadius:9,padding:"9px 16px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:13,flex:1}}>+ מנוחה</button>
                <button onClick={() => setShowLib(s=>!s)} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.45)",borderRadius:9,padding:"9px 14px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:13}}>📚</button>
              </div>
            )}
            {showLib && (
              <div style={{marginTop:10,background:"rgba(0,0,0,0.2)",borderRadius:10,padding:12,border:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{color:"rgba(255,255,255,0.25)",fontSize:10,letterSpacing:3,textTransform:"uppercase",marginBottom:8}}>ספריית תרגילים</div>
                {library.length===0 && <div style={{color:"rgba(255,255,255,0.18)",fontSize:13,textAlign:"center",padding:12}}>הספרייה ריקה</div>}
                {library.map(lib => (
                  <div key={lib.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:7,background:"rgba(255,255,255,0.025)",marginBottom:4}}>
                    <div style={{flex:1}}>
                      <div style={{color:"#fff",fontSize:13}}>{lib.name}</div>
                      <div style={{color:"rgba(255,255,255,0.25)",fontSize:11}}>{fmt(lib.duration_work)} x {lib.rounds}</div>
                    </div>
                    <button onClick={() => { setList([...list,{id:Date.now(),name:lib.name,section:"technique",durationWork:lib.duration_work,durationRest:lib.duration_rest||0,rounds:lib.rounds,pattern:lib.pattern,restTiming:"after_round",activeColor:lib.active_color||"both",type:"partner",note:lib.note||"",autoNext:true}]); }} style={{background:"rgba(255,107,0,0.18)",border:"none",color:"#FF6B00",borderRadius:6,padding:"4px 11px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:12}}>+ הוסף</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "judokas" && (
          <div>
            {localJudokas.map(j => (
              <div key={j.id} style={{background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,marginBottom:7,padding:"11px 15px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:j.color==="white"?"#eee":"#1a5fd6",flexShrink:0}}/>
                <span style={{color:"#fff",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:15,flex:1}}>{j.name}</span>
                <select value={j.color} onChange={e => setLocalJudokas(localJudokas.map(x=>x.id===j.id?{...x,color:e.target.value}:x))} style={{...inp,width:85,padding:"5px 8px",fontSize:13}}>
                  <option value="white">לבן</option>
                  <option value="blue">כחול</option>
                </select>
                <button onClick={() => setLocalJudokas(localJudokas.filter(x=>x.id!==j.id))} style={{background:"none",border:"none",color:"rgba(255,60,60,0.5)",cursor:"pointer",fontSize:17}}>x</button>
              </div>
            ))}
            <button onClick={() => { const name=prompt("שם הגודוקה:"); if(name) setLocalJudokas([...localJudokas,{id:Date.now(),name,color:"white",personalDrills:[]}]); }} style={{background:"rgba(255,107,0,0.1)",border:"1px dashed rgba(255,107,0,0.35)",color:"#FF6B00",borderRadius:10,padding:"10px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:14,width:"100%",marginTop:6}}>+ גודוקה חדש/ה</button>
          </div>
        )}

        {tab === "pairs" && (
          <div>
            {localPairs.map(([wid,bid],pi) => (
              <div key={pi} style={{display:"flex",gap:8,alignItems:"center",marginBottom:9}}>
                <span style={{color:"rgba(255,255,255,0.3)",fontSize:13,minWidth:46}}>זוג {pi+1}</span>
                {[0,1].map(side => (
                  <select key={side} value={side===0?wid:bid} onChange={e => { const v=parseInt(e.target.value); setLocalPairs(localPairs.map((p,i)=>i===pi?p.map((x,s)=>s===side?v:x):p)); }} style={{...inp,flex:1}}>
                    {localJudokas.map(j=><option key={j.id} value={j.id}>{j.name} ({j.color==="white"?"לבן":"כחול"})</option>)}
                  </select>
                ))}
                <button onClick={() => setLocalPairs(localPairs.filter((_,i)=>i!==pi))} style={{background:"none",border:"none",color:"rgba(255,60,60,0.45)",cursor:"pointer",fontSize:17}}>x</button>
              </div>
            ))}
            <button onClick={() => { const w=localJudokas.find(j=>j.color==="white"); const b=localJudokas.find(j=>j.color==="blue"); if(w&&b) setLocalPairs([...localPairs,[w.id,b.id]]); }} style={{background:"rgba(255,107,0,0.1)",border:"1px dashed rgba(255,107,0,0.35)",color:"#FF6B00",borderRadius:10,padding:"10px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:14,width:"100%",marginTop:6}}>+ זוג חדש</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Workout Modal ─────────────────────────────────────────────────────────────
function WorkoutModal({ drills, judokas, pairs, onLoad, onClose }) {
  const [workouts, setWorkouts] = useState([]);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0,10);
    setNewDate(today);
    supa("workouts?order=date.desc").then(r=>{ if(r) setWorkouts(r); });
  }, []);

  const inp = {background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,107,0,0.3)",borderRadius:8,color:"#fff",padding:"8px 11px",fontFamily:"Heebo,sans-serif",fontSize:14,outline:"none"};

  const save = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const r = await supa("workouts", { method:"POST", body:JSON.stringify({date:newDate,name:newName,drills,judokas,pairs}) });
    if(r && r[0]) setWorkouts(prev=>[r[0],...prev]);
    setSaving(false);
    setNewName("");
  };

  const update = async (id) => {
    setUpdatingId(id);
    await supa("workouts?id=eq."+id, { method:"PATCH", body:JSON.stringify({drills,judokas,pairs}) });
    setWorkouts(prev => prev.map(w => w.id===id ? {...w,drills,judokas,pairs} : w));
    setUpdatingId(null);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#0d1020",border:"1px solid rgba(255,107,0,0.28)",borderRadius:18,width:"100%",maxWidth:560,maxHeight:"90vh",overflowY:"auto",padding:22,direction:"rtl"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <h2 style={{color:"#FF6B00",fontFamily:"Heebo,sans-serif",fontSize:20,margin:0}}>אימונים שמורים</h2>
          <button onClick={onClose} style={{background:"none",border:"1px solid rgba(255,255,255,0.12)",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontFamily:"Heebo,sans-serif"}}>סגור</button>
        </div>
        <div style={{background:"rgba(255,107,0,0.06)",borderRadius:11,padding:14,marginBottom:16,border:"1px solid rgba(255,107,0,0.18)"}}>
          <div style={{color:"rgba(255,255,255,0.35)",fontSize:11,marginBottom:9}}>שמור את האימון הנוכחי</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="שם האימון" style={{...inp,flex:1,minWidth:110}}/>
            <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} style={{...inp,width:148}}/>
            <button onClick={save} disabled={saving} style={{background:"#FF6B00",border:"none",color:"#fff",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:14}}>{saving?"...":"שמור"}</button>
          </div>
        </div>
        {workouts.length===0 && <div style={{color:"rgba(255,255,255,0.18)",textAlign:"center",padding:20,fontSize:14}}>אין אימונים שמורים</div>}
        {workouts.map(w => (
          <div key={w.id} style={{background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"11px 15px",marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
            <div style={{flex:1}}>
              <div style={{color:"#fff",fontWeight:700,fontSize:15}}>{w.name}</div>
              <div style={{color:"rgba(255,255,255,0.28)",fontSize:12}}>{w.date} · {w.drills?w.drills.length:0} תרגילים</div>
            </div>
            <button onClick={() => { onLoad(w); onClose(); }} style={{background:"rgba(255,107,0,0.18)",border:"none",color:"#FF6B00",borderRadius:7,padding:"6px 13px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:13,fontWeight:700}}>טען</button>
            <button onClick={() => update(w.id)} style={{background:"rgba(0,229,255,0.12)",border:"1px solid rgba(0,229,255,0.25)",color:"#00e5ff",borderRadius:7,padding:"6px 13px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:13,fontWeight:700}}>{updatingId===w.id?"...":"עדכן"}</button>
            <button onClick={async () => { await supa("workouts?id=eq."+w.id,{method:"DELETE",prefer:""}); setWorkouts(workouts.filter(x=>x.id!==w.id)); }} style={{background:"none",border:"none",color:"rgba(255,60,60,0.45)",cursor:"pointer",fontSize:17}}>x</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Split Panel ───────────────────────────────────────────────────────────────
function SplitPanel({ pairs, judokas, who, showNames }) {
  const wActive = who==="white"||who==="both";
  const bActive = who==="blue"||who==="both";

  if (!showNames) {
    return (
      <div style={{display:"flex",gap:12,height:110,justifyContent:"center"}}>
        {[["white","לבן",wActive],["blue","כחול",bActive]].map(([color,label,active]) => (
          <div key={color} style={{flex:1,borderRadius:12,background:active?(color==="white"?"linear-gradient(145deg,#ccc,#fff)":"linear-gradient(145deg,#003b8e,#1a5fd6)"):"rgba(255,255,255,0.03)",border:active?(color==="white"?"2px solid #fff":"2px solid #1a5fd6"):"2px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,transition:"all 0.5s",boxShadow:active?(color==="white"?"0 0 28px rgba(255,255,255,0.18)":"0 0 28px rgba(26,95,214,0.32)"):"none"}}>
            <span style={{fontSize:28}}>🥋</span>
            <span style={{color:active?(color==="white"?"#111":"#fff"):"rgba(255,255,255,0.2)",fontWeight:800,fontSize:17,transition:"color 0.5s"}}>{label}</span>
            {active && <span style={{fontSize:10,color:color==="white"?"rgba(0,0,0,0.4)":"rgba(255,255,255,0.5)",letterSpacing:2}}>עובד</span>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:7}}>
      {pairs.map(([wid,bid],pi) => {
        const w=judokas.find(j=>j.id===wid), b=judokas.find(j=>j.id===bid);
        return (
          <div key={pi} style={{display:"flex",gap:7,height:76}}>
            {[[w,"white",wActive],[b,"blue",bActive]].map(([person,color,active]) => (
              <div key={color} style={{flex:1,borderRadius:10,background:active?(color==="white"?"linear-gradient(145deg,#ccc,#fff)":"linear-gradient(145deg,#003b8e,#1a5fd6)"):"rgba(255,255,255,0.03)",border:active?(color==="white"?"2px solid #fff":"2px solid #1a5fd6"):"2px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,transition:"all 0.5s",boxShadow:active?(color==="white"?"0 0 18px rgba(255,255,255,0.15)":"0 0 18px rgba(26,95,214,0.28)"):"none"}}>
                <span style={{fontSize:17}}>🥋</span>
                <span style={{color:active?(color==="white"?"#111":"#fff"):"rgba(255,255,255,0.2)",fontWeight:800,fontSize:14,transition:"color 0.5s"}}>{person?person.name:"?"}</span>
                {active && <span style={{fontSize:9,color:color==="white"?"rgba(0,0,0,0.38)":"rgba(255,255,255,0.48)",letterSpacing:1}}>עובד</span>}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function JudoTV() {
  const [drills,  setDrills]  = useState(INIT_DRILLS);
  const [judokas, setJudokas] = useState(INIT_JUDOKAS);
  const [pairs,   setPairs]   = useState(INIT_PAIRS);
  const [drillIdx,  setDrillIdx]  = useState(0);
  const [phaseIdx,  setPhaseIdx]  = useState(0);
  const [timeLeft,  setTimeLeft]  = useState(INIT_DRILLS[0].durationWork);
  const [running,   setRunning]   = useState(false);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [alertActive,  setAlertActive]  = useState(false);
  const [personalTimers, setPersonalTimers] = useState({});
  const [modal,  setModal]  = useState(null);
  const [globalAutoNext, setGlobalAutoNext] = useState(true);
  const [leftW,  setLeftW]  = useState(230);
  const [rightW, setRightW] = useState(300);
  const [soundType, setSoundType] = useState("beep");
  const [scale, setScale] = useState(1.0);

  const intervalRef = useRef(null);
  const alertRef    = useRef(null);
  const { tickBeep, endBeep, initCtx } = useSound(soundType);

  const current    = drills[drillIdx] || drills[0];
  const phases     = getDrillPhases(current);
  const phase      = phases[phaseIdx] || { phase:"work", who:"both", duration:60, label:"עבודה" };
  const isPersonal = current && current.type === "personal";
  const isRest     = current && current.type === "rest";
  const isPartner  = current && current.type === "partner";
  const isRestPhase = phase.phase === "rest";

  useEffect(() => {
    if (!current) return;
    const ph = getDrillPhases(current);
    setPhaseIdx(0);
    setTimeLeft(ph[0] ? ph[0].duration : 60);
    setAlertActive(false);
  }, [drillIdx, drills]);

  useEffect(() => {
    if (isPersonal) {
      const init = {};
      judokas.forEach(j => {
        init[j.id] = { drillIdx:0, timeLeft:(j.personalDrills&&j.personalDrills[0])?j.personalDrills[0].duration:60 };
      });
      setPersonalTimers(init);
    }
  }, [drillIdx, isPersonal, judokas]);

  const triggerAlert = useCallback(() => {
    setAlertActive(true);
    endBeep();
    clearTimeout(alertRef.current);
    alertRef.current = setTimeout(() => setAlertActive(false), 2500);
  }, [endBeep]);

  const advancePhase = useCallback(() => {
    setPhaseIdx(pi => {
      const nextPi = pi + 1;
      if (nextPi < phases.length) {
        setTimeLeft(phases[nextPi].duration);
        triggerAlert();
        return nextPi;
      }
      triggerAlert();
      const shouldAutoNext = globalAutoNext && current && current.autoNext;
      if (shouldAutoNext) {
        setDrillIdx(di => {
          const nextDi = di + 1;
          if (nextDi < drills.length) return nextDi;
          setRunning(false);
          return di;
        });
      } else {
        setRunning(false);
        setTimeLeft(0);
      }
      return pi;
    });
  }, [phases, triggerAlert, globalAutoNext, current, drills]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 3 && t > 0) tickBeep(t);
          if (t <= 1) { advancePhase(); return 0; }
          return t - 1;
        });
        setTotalElapsed(e => e + 1);
        if (isPersonal) {
          setPersonalTimers(prev => {
            const next = {...prev};
            judokas.forEach(j => {
              const pt = next[j.id]; if(!pt) return;
              if (pt.timeLeft <= 1) {
                const ni = pt.drillIdx + 1;
                const nd = j.personalDrills && j.personalDrills[ni];
                next[j.id] = nd ? {drillIdx:ni,timeLeft:nd.duration} : {drillIdx:pt.drillIdx,timeLeft:0};
              } else {
                next[j.id] = {...pt,timeLeft:pt.timeLeft-1};
              }
            });
            return next;
          });
        }
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running, isPersonal, judokas, advancePhase, tickBeep]);

  const goToDrill = useCallback(i => {
    if (i >= 0 && i < drills.length) { setDrillIdx(i); setRunning(false); }
  }, [drills.length]);

  const addTime = s => setTimeLeft(t => Math.max(0, t+s));
  const resetPhase = () => { setTimeLeft(phase.duration); setAlertActive(false); };
  const nextPhaseManual = () => {
    const nextPi = phaseIdx + 1;
    if (nextPi < phases.length) { setPhaseIdx(nextPi); setTimeLeft(phases[nextPi].duration); }
    else goToDrill(drillIdx + 1);
  };

  const pct = timeLeft / (phase.duration || 1);
  const urgent  = pct < 0.2 || alertActive;
  const warning = pct < 0.35 && pct >= 0.2;
  const timerColor = (isRestPhase||isRest) ? "#a8ff78" : alertActive ? "#ff3c3c" : urgent ? "#FF6B00" : warning ? "#ffb347" : "#00e5ff";

  const totalDur  = drills.reduce((a,d) => a+totalDrillTime(d), 0);
  const doneDur   = drills.slice(0,drillIdx).reduce((a,d) => a+totalDrillTime(d), 0);
  const phaseDone = phases.slice(0,phaseIdx).reduce((a,p) => a+p.duration, 0);
  const progress  = totalDur > 0 ? Math.min(100, ((doneDur + phaseDone + (phase.duration - timeLeft)) / totalDur) * 100) : 0;

  const nextPhase = phases[phaseIdx + 1];
  const nextDrill = drills[drillIdx + 1];
  const secColor  = SEC_COLOR[current ? current.section || "warmup" : "warmup"];

  return (
    <div style={{width:"100vw",height:"100vh",overflow:"hidden",background:"#080a10",position:"relative"}}>
      <div style={{width:"100vw",height:"100vh",display:"flex",flexDirection:"column",direction:"rtl",fontFamily:"Heebo,sans-serif",position:"relative",transform:"scale("+scale+")",transformOrigin:"top right",width:(100/scale)+"%",height:(100/scale)+"%"}}>
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&family=Oswald:wght@700&display=swap" rel="stylesheet"/>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.28}}
        @keyframes alertBorder{0%,100%{opacity:0}50%{opacity:1}}
        @keyframes restGlow{0%,100%{box-shadow:0 0 20px rgba(168,255,120,0.1)}50%{box-shadow:0 0 40px rgba(168,255,120,0.28)}}
        *{box-sizing:border-box;margin:0;padding:0}
      `}</style>

      <div style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden"}}>
        <div style={{position:"absolute",top:"-20%",right:"-10%",width:"55%",height:"70%",borderRadius:"50%",background:"radial-gradient(circle,rgba(255,107,0,0.045) 0%,transparent 65%)"}}/>
        <div style={{position:"absolute",bottom:"-20%",left:"-10%",width:"55%",height:"70%",borderRadius:"50%",background:"radial-gradient(circle,rgba(0,59,142,0.06) 0%,transparent 65%)"}}/>
        <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(255,255,255,0.009) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.009) 1px,transparent 1px)",backgroundSize:"80px 80px"}}/>
      </div>

      {alertActive && <div style={{position:"fixed",inset:0,border:"5px solid rgba(255,60,60,0.7)",pointerEvents:"none",zIndex:50,animation:"alertBorder 0.35s infinite"}}/>}

      {/* TOP BAR */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 28px",borderBottom:"1px solid rgba(255,255,255,0.055)",background:"rgba(0,0,0,0.32)",flexShrink:0,position:"relative",zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:13}}>
          <div style={{width:44,height:44,borderRadius:11,background:"linear-gradient(135deg,#FF6B00,#cc4400)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,boxShadow:"0 4px 16px rgba(255,107,0,0.38)"}}>🥋</div>
          <div>
            <div style={{color:"#fff",fontSize:21,fontWeight:900,letterSpacing:-0.5}}>נבחרת ג׳ודו BGU</div>
            <div style={{color:"rgba(255,107,0,0.58)",fontSize:10,letterSpacing:4,textTransform:"uppercase"}}>Ben-Gurion University</div>
          </div>
        </div>

        <div style={{flex:1,maxWidth:440,margin:"0 28px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
            <span style={{color:"rgba(255,255,255,0.22)",fontSize:11}}>התקדמות האימון</span>
            <span style={{color:"rgba(255,255,255,0.32)",fontFamily:"monospace",fontSize:11}}>{Math.round(progress)}%</span>
          </div>
          <div style={{height:5,background:"rgba(255,255,255,0.055)",borderRadius:3,overflow:"hidden"}}>
            <div style={{height:"100%",width:progress+"%",background:"linear-gradient(90deg,#FF6B00,#ff9233)",borderRadius:3,transition:"width 1s linear"}}/>
          </div>
        </div>

        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:9,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.03)"}}>
            <span style={{color:"rgba(255,255,255,0.35)",fontSize:12}}>מעבר אוטו׳</span>
            <Toggle value={globalAutoNext} onChange={setGlobalAutoNext}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:9,padding:"4px 6px"}}>
            <button onClick={() => setScale(s => Math.max(0.5, Math.round((s-0.1)*10)/10))} style={{background:"none",border:"none",color:"rgba(255,255,255,0.55)",cursor:"pointer",fontSize:18,fontWeight:700,width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:6}}>−</button>
            <span style={{color:"rgba(255,255,255,0.35)",fontFamily:"monospace",fontSize:12,minWidth:36,textAlign:"center"}}>{Math.round(scale*100)}%</span>
            <button onClick={() => setScale(s => Math.min(1.5, Math.round((s+0.1)*10)/10))} style={{background:"none",border:"none",color:"rgba(255,255,255,0.55)",cursor:"pointer",fontSize:18,fontWeight:700,width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:6}}>+</button>
          </div>
          <select value={soundType} onChange={e => setSoundType(e.target.value)} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.5)",borderRadius:9,padding:"8px 10px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:13,outline:"none"}}>
            <option value="beep">🔔 ביפ</option>
            <option value="buzz">⚡ באזר</option>
            <option value="mute">🔇 שקט</option>
          </select>
          <button onClick={() => setModal("workouts")} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.5)",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:13}}>📅</button>
          <button onClick={() => { setRunning(false); setModal("edit"); }} style={{background:"rgba(255,107,0,0.1)",border:"1px solid rgba(255,107,0,0.28)",color:"#FF6B00",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:13}}>✏️ ערוך</button>
        </div>
      </div>

      {/* BODY */}
      <div style={{flex:1,display:"flex",overflow:"hidden",padding:"14px 22px",gap:16,position:"relative",zIndex:1}}>

        {/* LEFT: drill list */}
        <div style={{width:leftW,display:"flex",flexDirection:"column",flexShrink:0,position:"relative",minWidth:140,maxWidth:360}}>
          <div
            onMouseDown={e => {
              const startX = e.clientX, startW = leftW;
              const move = ev => setLeftW(Math.min(360, Math.max(140, startW + (ev.clientX - startX))));
              const up = () => { window.removeEventListener("mousemove",move); window.removeEventListener("mouseup",up); };
              window.addEventListener("mousemove",move); window.addEventListener("mouseup",up);
            }}
            onTouchStart={e => {
              const startX = e.touches[0].clientX, startW = leftW;
              const move = ev => setLeftW(Math.min(360, Math.max(140, startW + (ev.touches[0].clientX - startX))));
              const up = () => { window.removeEventListener("touchmove",move); window.removeEventListener("touchend",up); };
              window.addEventListener("touchmove",move,{passive:false}); window.addEventListener("touchend",up);
            }}
            style={{position:"absolute",left:-4,top:0,bottom:0,width:16,cursor:"col-resize",zIndex:10,display:"flex",alignItems:"center",justifyContent:"center",touchAction:"none"}}>
            <div style={{width:3,height:40,borderRadius:2,background:"rgba(255,107,0,0.4)"}}/>
          </div>
          <div style={{color:"rgba(255,255,255,0.18)",fontSize:10,letterSpacing:4,textTransform:"uppercase",marginBottom:9}}>מערך האימון</div>
          <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:3}}>
            {drills.map((d,i) => {
              const done=i<drillIdx, curr=i===drillIdx;
              const sc=SEC_COLOR[d.section||"warmup"];
              return (
                <div key={d.id} onClick={() => goToDrill(i)} style={{background:curr?"rgba(255,107,0,0.11)":done?"rgba(255,255,255,0.01)":"rgba(255,255,255,0.03)",border:curr?"1px solid rgba(255,107,0,0.45)":"1px solid rgba(255,255,255,0.045)",borderRadius:9,padding:"8px 11px",cursor:"pointer",display:"flex",alignItems:"center",gap:7,opacity:done?0.33:1,transition:"all 0.18s"}}>
                  <div style={{width:3,height:28,borderRadius:2,background:sc,flexShrink:0}}/>
                  <span style={{width:20,height:20,borderRadius:"50%",background:curr?"#FF6B00":"rgba(255,255,255,0.045)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:curr?"#fff":"rgba(255,255,255,0.28)",flexShrink:0}}>{done?"v":i+1}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:curr?"#fff":"rgba(255,255,255,0.52)",fontSize:13,fontWeight:curr?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>
                    <div style={{color:sc,fontSize:10,marginTop:1}}>{d.type!=="rest"?d.rounds+"x · ":""}{fmt(totalDrillTime(d))}</div>
                  </div>
                  {curr&&running&&<div style={{width:5,height:5,borderRadius:"50%",background:"#FF6B00",animation:"pulse 0.9s infinite",flexShrink:0}}/>}
                  {d.autoNext&&<div style={{width:5,height:5,borderRadius:"50%",background:"rgba(168,255,120,0.5)",flexShrink:0}}/>}
                </div>
              );
            })}
          </div>
          <div style={{paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.045)",marginTop:7,display:"flex",flexDirection:"column",gap:5}}>
            {[["זמן שעבר",fmt(totalElapsed)],["סה\"כ",fmt(totalDur)]].map(([l,v]) => (
              <div key={l} style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{color:"rgba(255,255,255,0.22)",fontSize:11}}>{l}</span>
                <span style={{color:"#fff",fontFamily:"Oswald,sans-serif",fontSize:19}}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CENTER */}
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:10,minWidth:0}}>
          <div style={{display:"flex",alignItems:"baseline",gap:12,flexWrap:"wrap"}}>
            <div style={{width:5,height:40,borderRadius:3,background:secColor,flexShrink:0,alignSelf:"center"}}/>
            <h1 style={{color:"#fff",fontSize:"clamp(22px,3.2vw,44px)",fontWeight:900,letterSpacing:-1,lineHeight:1}}>{current?current.name:""}</h1>
            <span style={{padding:"4px 13px",borderRadius:18,background:(isRestPhase||isRest)?"rgba(168,255,120,0.13)":secColor+"1a",color:(isRestPhase||isRest)?"#a8ff78":secColor,fontSize:14,fontWeight:700,flexShrink:0}}>{isRestPhase||isRest?"מנוחה":phase.label}</span>
            {current&&current.rounds>1&&!isRestPhase&&<span style={{color:"rgba(255,255,255,0.22)",fontSize:13}}>סבב {phase.round||1}/{current.rounds}</span>}
            {current&&current.note&&<span style={{color:"rgba(255,255,255,0.28)",fontSize:15}}>{current.note}</span>}
          </div>

          {phases.length > 1 && (
            <div style={{display:"flex",gap:4}}>
              {phases.map((p,i) => (
                <div key={i} onClick={() => { setPhaseIdx(i); setTimeLeft(p.duration); }} style={{flex:1,height:4,borderRadius:2,cursor:"pointer",background:i<phaseIdx?"rgba(255,107,0,0.45)":i===phaseIdx?"#FF6B00":p.phase==="rest"?"rgba(168,255,120,0.18)":"rgba(255,255,255,0.09)",transition:"background 0.28s"}}/>
              ))}
            </div>
          )}

          <div style={{textAlign:"center",lineHeight:1,animation:alertActive?"pulse 0.35s infinite":"none"}}>
            <div style={{fontSize:"clamp(88px,15vw,180px)",fontFamily:"Oswald,sans-serif",fontWeight:700,color:timerColor,textShadow:"0 0 55px "+timerColor+"44",transition:"color 0.38s",letterSpacing:-8}}>{fmt(timeLeft)}</div>
            {alertActive&&<div style={{color:"#ff3c3c",fontSize:22,fontWeight:900,letterSpacing:5,textTransform:"uppercase",animation:"pulse 0.4s infinite",marginTop:4}}>זמן לעבור</div>}
            {(isRestPhase||isRest)&&!alertActive&&<div style={{color:"#a8ff78",fontSize:18,fontWeight:700,letterSpacing:3,marginTop:4}}>מנוחה</div>}
          </div>

          <div style={{display:"flex",gap:5,justifyContent:"center",flexWrap:"wrap"}}>
            {[[-60,"-1:00"],[-30,"-:30"],[-10,"-:10"],[10,"+:10"],[30,"+:30"],[60,"+1:00"]].map(([s,l]) => (
              <button key={s} onClick={() => addTime(s)} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:s>0?"rgba(0,229,255,0.72)":"rgba(255,107,0,0.72)",borderRadius:8,padding:"8px 13px",cursor:"pointer",fontFamily:"monospace",fontSize:15,fontWeight:700}}>{l}</button>
            ))}
          </div>

          <div style={{display:"flex",gap:9,justifyContent:"center",flexWrap:"wrap"}}>
            <button onClick={() => goToDrill(drillIdx-1)} disabled={drillIdx===0} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:drillIdx===0?"rgba(255,255,255,0.1)":"#fff",borderRadius:11,padding:"13px 20px",cursor:drillIdx===0?"not-allowed":"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:17}}>קודם</button>
            <button onClick={resetPhase} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#fff",borderRadius:11,padding:"13px 20px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:17}}>אפס</button>
            <button onClick={() => { initCtx(); setRunning(r=>!r); }} style={{background:running?"rgba(255,60,60,0.17)":"linear-gradient(135deg,#FF6B00,#cc4400)",border:running?"2px solid rgba(255,60,60,0.38)":"none",color:"#fff",borderRadius:13,padding:"13px 48px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:900,fontSize:21,boxShadow:running?"none":"0 5px 22px rgba(255,107,0,0.38)",minWidth:150}}>{running?"עצור":"הפעל"}</button>
            <button onClick={nextPhaseManual} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#fff",borderRadius:11,padding:"13px 20px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:17}}>הבא</button>
          </div>

          <div style={{textAlign:"center",color:"rgba(255,255,255,0.17)",fontSize:13,minHeight:20}}>
            {nextPhase ? "הבא: "+nextPhase.label+" "+fmt(nextPhase.duration) : nextDrill ? "תרגיל הבא: "+nextDrill.name : ""}
          </div>
        </div>

        {/* RIGHT */}
        <div style={{width:rightW,flexShrink:0,display:"flex",flexDirection:"column",gap:10,position:"relative",minWidth:180,maxWidth:500}}>
          <div
            onMouseDown={e => {
              const startX = e.clientX, startW = rightW;
              const move = ev => setRightW(Math.min(500, Math.max(180, startW - (ev.clientX - startX))));
              const up = () => { window.removeEventListener("mousemove",move); window.removeEventListener("mouseup",up); };
              window.addEventListener("mousemove",move); window.addEventListener("mouseup",up);
            }}
            onTouchStart={e => {
              const startX = e.touches[0].clientX, startW = rightW;
              const move = ev => setRightW(Math.min(500, Math.max(180, startW - (ev.touches[0].clientX - startX))));
              const up = () => { window.removeEventListener("touchmove",move); window.removeEventListener("touchend",up); };
              window.addEventListener("touchmove",move,{passive:false}); window.addEventListener("touchend",up);
            }}
            style={{position:"absolute",right:-4,top:0,bottom:0,width:16,cursor:"col-resize",zIndex:10,display:"flex",alignItems:"center",justifyContent:"center",touchAction:"none"}}>
            <div style={{width:3,height:40,borderRadius:2,background:"rgba(255,107,0,0.4)"}}/>
          </div>
          {!isPersonal ? (
            <div style={{background:"rgba(255,255,255,0.018)",border:(isRestPhase||isRest)?"1px solid rgba(168,255,120,0.14)":"1px solid rgba(255,255,255,0.055)",borderRadius:14,padding:"15px 16px",flex:1,display:"flex",flexDirection:"column",animation:(isRestPhase||isRest)?"restGlow 2s infinite":"none",transition:"border 0.5s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <span style={{color:"rgba(255,255,255,0.22)",fontSize:10,letterSpacing:3,textTransform:"uppercase"}}>זוגות</span>
                <span style={{color:(isRestPhase||isRest)?"#a8ff78":secColor,fontSize:12,fontWeight:700}}>{(isRestPhase||isRest)?"מנוחה":phase.label}</span>
              </div>
              <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center"}}>
                <SplitPanel pairs={pairs} judokas={judokas} who={(isRestPhase||isRest)?"none":phase.who} showNames={isPartner}/>
              </div>
            </div>
          ) : (
            <div style={{background:"rgba(255,255,255,0.018)",border:"1px solid rgba(160,255,120,0.16)",borderRadius:14,padding:"15px 16px",flex:1,display:"flex",flexDirection:"column"}}>
              <div style={{color:"rgba(160,255,120,0.7)",fontSize:10,letterSpacing:3,textTransform:"uppercase",marginBottom:12}}>עבודה אישית</div>
              <div style={{display:"flex",flexDirection:"column",gap:6,flex:1,justifyContent:"center"}}>
                {judokas.map(j => {
                  const pt=personalTimers[j.id];
                  const drill=j.personalDrills&&j.personalDrills[pt?pt.drillIdx:0];
                  const tl=pt?pt.timeLeft:(drill?drill.duration:0);
                  const urgent=(tl/(drill?drill.duration:1))<0.25;
                  return (
                    <div key={j.id} style={{borderRadius:10,padding:"10px 13px",background:j.color==="white"?"linear-gradient(135deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))":"linear-gradient(135deg,rgba(26,95,214,0.18),rgba(0,59,142,0.09))",border:j.color==="white"?"1px solid rgba(255,255,255,0.2)":"1px solid rgba(26,95,214,0.38)",display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:j.color==="white"?"#ccc":"#1a5fd6",flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:"#fff",fontWeight:700,fontSize:14}}>{j.name}</div>
                        <div style={{color:"rgba(255,255,255,0.35)",fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{drill?drill.name:"סיים"}</div>
                      </div>
                      <div style={{fontFamily:"Oswald,sans-serif",fontWeight:700,fontSize:24,color:urgent?"#ff3c3c":"#fff",minWidth:62,textAlign:"right"}}>{fmt(tl)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      </div>
      {modal==="edit" && <EditorModal drills={drills} setDrills={d=>{setDrills(d);if(drillIdx>=d.length)setDrillIdx(Math.max(0,d.length-1));}} currentIndex={drillIdx} judokas={judokas} setJudokas={setJudokas} pairs={pairs} setPairs={setPairs} onClose={()=>setModal(null)}/>}
      {modal==="workouts" && <WorkoutModal drills={drills} judokas={judokas} pairs={pairs} onLoad={w=>{if(w.drills)setDrills(w.drills);if(w.judokas)setJudokas(w.judokas);if(w.pairs)setPairs(w.pairs);setDrillIdx(0);setRunning(false);}} onClose={()=>setModal(null)}/>}
    </div>
  );
}
