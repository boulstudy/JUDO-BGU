'use client';

import { useState, useEffect, useRef, useCallback } from "react";

import {
  supa,
  DRILL_SECTIONS, SEC_COLOR,
  fmt, getDrillPhases, totalDrillTime, drillClockSignature,
} from "./lib/shared";
import { DrillForm, Toggle } from "./lib/ui";
import { useTvLink } from "./lib/link";
import { makeRoomCode, normalizeRoomCode } from "./lib/remoteBus";
import { COMMANDS, pickPatch } from "./lib/remoteProtocol";

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

  // Interval-Timer style countdown: 3 short sharp beeps at t=3,2,1
  const tickBeep = useCallback((t) => {
    if (soundType === "mute") return;
    if (soundType === "buzz") {
      playBuzz(180, 0.08, 0.3, 0);
    } else {
      playBeep(1000, 0.09, 0.5, 0);
    }
  }, [soundType, playBeep, playBuzz]);

  // Start-of-time signal — one long beep
  const startBeep = useCallback(() => {
    if (soundType === "mute") return;
    if (soundType === "buzz") {
      playBuzz(150, 0.7, 0.5, 0);
    } else {
      playBeep(800, 0.75, 0.65, 0);
    }
  }, [soundType, playBeep, playBuzz]);

  // End-of-time signal — two short beeps fired together, right after the 3 countdown beeps
  const endBeep = useCallback(() => {
    if (soundType === "mute") return;
    if (soundType === "buzz") {
      playBuzz(180, 0.08, 0.3, 0);
      playBuzz(180, 0.32, 0.3, 0.16);
    } else {
      playBeep(1000, 0.09, 0.5, 0);
      playBeep(1000, 0.32, 0.5, 0.16);
    }
  }, [soundType, playBeep, playBuzz]);

  return { tickBeep, endBeep, startBeep, initCtx };
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
  const [judokaGroupFilter, setJudokaGroupFilter] = useState("כל הנבחרת");
  const [newGroupName, setNewGroupName] = useState("");

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

  const tabBtn = (key, label, id) => (
    <button id={id} onClick={() => setTab(key)} style={{background:tab===key?"#FF6B00":"rgba(255,255,255,0.05)",border:"none",color:tab===key?"#fff":"rgba(255,255,255,0.45)",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:14}}>{label}</button>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#0d1020",border:"1px solid rgba(255,107,0,0.28)",borderRadius:18,width:"100%",maxWidth:760,maxHeight:"92vh",overflowY:"auto",padding:22,direction:"rtl"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{display:"flex",gap:6}}>{tabBtn("drills","תרגילים")}{tabBtn("judokas","חברי הנבחרת","tab-judokas")}{tabBtn("pairs","זוגות")}</div>
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
            {/* Group filter */}
            <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
              {["כל הנבחרת",...new Set(localJudokas.map(j=>j.group).filter(Boolean))].map(g => (
                <button key={g} onClick={() => setJudokaGroupFilter(g)} style={{background:judokaGroupFilter===g?"#FF6B00":"rgba(255,255,255,0.05)",border:"none",color:judokaGroupFilter===g?"#fff":"rgba(255,255,255,0.5)",borderRadius:20,padding:"5px 14px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:13}}>{g}</button>
              ))}
              <button onClick={() => { const g=prompt("שם הקבוצה:"); if(g) setNewGroupName(g); }} style={{background:"rgba(255,255,255,0.04)",border:"1px dashed rgba(255,255,255,0.15)",color:"rgba(255,255,255,0.4)",borderRadius:20,padding:"5px 14px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:13}}>+ קבוצה חדשה</button>
            </div>
            {localJudokas.filter(j => judokaGroupFilter==="כל הנבחרת" || j.group===judokaGroupFilter).map(j => (
              <div key={j.id} style={{background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,marginBottom:7,padding:"11px 15px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:"#FF6B00",flexShrink:0}}/>
                <span style={{color:"#fff",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:15,flex:1}}>{j.name}</span>
                {j.group && <span style={{color:"rgba(255,255,255,0.3)",fontSize:12,background:"rgba(255,255,255,0.06)",borderRadius:12,padding:"3px 10px"}}>{j.group}</span>}
                <select value={j.group||""} onChange={e => setLocalJudokas(localJudokas.map(x=>x.id===j.id?{...x,group:e.target.value}:x))} style={{...inp,width:100,padding:"4px 7px",fontSize:12}}>
                  <option value="">ללא קבוצה</option>
                  {[...new Set(localJudokas.map(j=>j.group).filter(Boolean))].map(g=><option key={g} value={g}>{g}</option>)}
                </select>
                <button onClick={() => setLocalJudokas(localJudokas.filter(x=>x.id!==j.id))} style={{background:"none",border:"none",color:"rgba(255,60,60,0.5)",cursor:"pointer",fontSize:17}}>x</button>
              </div>
            ))}
            <button onClick={() => { const name=prompt("שם חבר/ת נבחרת:"); if(name) setLocalJudokas([...localJudokas,{id:Date.now(),name,color:"white",group:"",personalDrills:[]}]); }} style={{background:"rgba(255,107,0,0.1)",border:"1px dashed rgba(255,107,0,0.35)",color:"#FF6B00",borderRadius:10,padding:"10px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:14,width:"100%",marginTop:6}}>+ הוסף חבר/ת נבחרת</button>
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
          <div key={color} style={{
            flex: active ? 1.4 : 0.6,
            borderRadius:12,
            background:active?(color==="white"?"linear-gradient(145deg,#ccc,#fff)":"linear-gradient(145deg,#003b8e,#1a5fd6)"):"rgba(255,255,255,0.025)",
            border:active?(color==="white"?"2px solid #fff":"2px solid #1a5fd6"):"2px solid rgba(255,255,255,0.04)",
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,
            transition:"all 0.5s",
            opacity: active ? 1 : 0.3,
            filter: active ? "none" : "brightness(0.35)",
            boxShadow:active?(color==="white"?"0 0 28px rgba(255,255,255,0.18)":"0 0 28px rgba(26,95,214,0.32)"):"none"
          }}>
            <span style={{fontSize:active?32:20,transition:"font-size 0.4s"}}>🥋</span>
            <span style={{color:active?(color==="white"?"#111":"#fff"):"rgba(255,255,255,0.25)",fontWeight:800,fontSize:active?19:13,transition:"all 0.5s"}}>{label}</span>
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
              <div key={color} style={{
                flex: active ? 1.4 : 0.6,
                borderRadius:10,
                background:active?(color==="white"?"linear-gradient(145deg,#ccc,#fff)":"linear-gradient(145deg,#003b8e,#1a5fd6)"):"rgba(255,255,255,0.02)",
                border:active?(color==="white"?"2px solid #fff":"2px solid #1a5fd6"):"2px solid rgba(255,255,255,0.04)",
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,
                transition:"all 0.5s",
                opacity: active ? 1 : 0.3,
                filter: active ? "none" : "brightness(0.4)",
                boxShadow:active?(color==="white"?"0 0 18px rgba(255,255,255,0.15)":"0 0 18px rgba(26,95,214,0.28)"):"none"
              }}>
                <span style={{fontSize:active?19:14,transition:"font-size 0.4s"}}>🥋</span>
                <span style={{color:active?(color==="white"?"#111":"#fff"):"rgba(255,255,255,0.2)",fontWeight:800,fontSize:active?15:12,transition:"all 0.5s"}}>{person?person.name:""}</span>
                {active && <span style={{fontSize:9,color:color==="white"?"rgba(0,0,0,0.38)":"rgba(255,255,255,0.48)",letterSpacing:1}}>עובד</span>}
              </div>
            ))}
          </div>
        );
      })}
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
// The code lives here and nowhere else. It is deliberately not on the always-on
// display, so nobody can memorise it off the projection and join mid-training.
function RemotePairingModal({ roomCode, remoteOn, setRemoteOn, onNewCode, status, connected, onClose }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => { try { setOrigin(window.location.origin); } catch(e) {} }, []);

  // Once a remote is on the line the code has done its job — get it off screen.
  // onClose is a fresh closure on every render of the TV, so it is held in a ref;
  // depending on it directly would restart the timeout before it ever fires.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!connected) return;
    const id = setTimeout(() => closeRef.current(), 2500);
    return () => clearTimeout(id);
  }, [connected]);

  const remoteUrl = (origin || "") + "/remote";
  const pairUrl   = remoteUrl + (roomCode ? "?code=" + roomCode : "");

  const copy = (text, what) => {
    const done = () => { setCopied(what); setTimeout(() => setCopied(""), 1800); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, () => {});
        return;
      }
    } catch(e) {}
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done();
    } catch(e) {}
  };

  const statusLabel = connected ? "השלט התחבר — סוגר"
    : status === "online" ? "ממתין לשלט…"
    : status === "connecting" ? "מתחבר…"
    : "אין חיבור לשרת";
  const statusColor = connected ? "#2ecc71" : status === "online" ? "#ffb347" : "#ff4444";

  const linkBtn = {background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.65)",borderRadius:10,padding:"11px 12px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:13,fontWeight:700,flex:1};

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e => e.stopPropagation()} style={{background:"#0d1020",border:"1px solid rgba(255,107,0,0.28)",borderRadius:18,width:"100%",maxWidth:520,maxHeight:"92vh",overflowY:"auto",padding:26,direction:"rtl"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <span style={{color:"#fff",fontSize:20,fontWeight:900}}>📱 חיבור שלט רחוק</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:"rgba(255,255,255,0.4)",cursor:"pointer",fontSize:22}}>✕</button>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:16}}>
          <span style={{width:9,height:9,borderRadius:"50%",background:statusColor}}/>
          <span style={{color:statusColor,fontSize:14,fontWeight:700}}>{statusLabel}</span>
        </div>

        <div style={{background:"rgba(255,107,0,0.07)",border:"1px solid rgba(255,107,0,0.3)",borderRadius:14,padding:"18px",textAlign:"center",marginBottom:8}}>
          <div style={{color:"rgba(255,255,255,0.35)",fontSize:12,letterSpacing:3,marginBottom:8}}>קוד חיבור</div>
          <div style={{color:"#FF6B00",fontFamily:"Oswald,sans-serif",fontSize:56,letterSpacing:14,lineHeight:1}}>{roomCode || "····"}</div>
        </div>
        <div style={{color:"rgba(255,255,255,0.28)",fontSize:12,textAlign:"center",marginBottom:16}}>
          הקוד מוצג רק בחלון הזה — לא על המסך המוקרן
        </div>

        {/* the separate way in, for the phone */}
        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"14px 15px",marginBottom:14}}>
          <div style={{color:"rgba(255,255,255,0.35)",fontSize:11,letterSpacing:3,marginBottom:9}}>ממשק הנייד</div>
          <a href={remoteUrl} target="_blank" rel="noopener noreferrer"
             style={{color:"#6ec6ff",fontFamily:"monospace",fontSize:14,wordBreak:"break-all",display:"block",marginBottom:12}}>
            {remoteUrl || "/remote"}
          </a>
          <div style={{display:"flex",gap:8}}>
            <button onClick={() => copy(pairUrl, "link")} style={linkBtn}>
              {copied === "link" ? "✓ הועתק" : "🔗 העתק קישור עם הקוד"}
            </button>
            <button onClick={() => copy(roomCode, "code")} style={{...linkBtn,flex:0,minWidth:110}}>
              {copied === "code" ? "✓ הועתק" : "📋 העתק קוד"}
            </button>
          </div>
          <div style={{color:"rgba(255,255,255,0.25)",fontSize:11,marginTop:9,lineHeight:1.7}}>
            הקישור עם הקוד נכנס ישירות לשלט בלי להקליד — שולחים אותו לנייד פעם אחת והוא נשמר שם.
          </div>
        </div>

        <ol style={{color:"rgba(255,255,255,0.55)",fontSize:14,lineHeight:1.9,paddingInlineStart:20,marginBottom:16}}>
          <li>פותחים בנייד את הקישור שלמעלה</li>
          <li>מקלידים את הקוד (או משתמשים בקישור שכולל אותו)</li>
          <li>מה שעורכים בנייד לא מוצג על המסך עד ששולחים</li>
        </ol>

        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(255,255,255,0.03)",borderRadius:12,padding:"12px 15px",marginBottom:10}}>
          <span style={{color:"rgba(255,255,255,0.55)",fontSize:14}}>שלט רחוק פעיל</span>
          <Toggle value={remoteOn} onChange={setRemoteOn}/>
        </div>

        <button onClick={onNewCode} style={{width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.5)",borderRadius:11,padding:"12px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:14}}>🔄 צור קוד חדש — מנתק שלטים קיימים</button>
      </div>
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
  const [leftW,  setLeftW]  = useState(220);
  const [rightW, setRightW] = useState(240);
  const [soundType, setSoundType] = useState("beep");
  const [scale, setScale] = useState(1.0);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesOpen, setNotesOpen] = useState(true);

  // ── Remote control ──────────────────────────────────────────────────────────
  const [roomCode,    setRoomCode]    = useState("");
  const [remoteOn,    setRemoteOn]    = useState(true);
  const [projection,  setProjection]  = useState(false); // clean screen: hide the controls
  const [audioReady,  setAudioReady]  = useState(false);

  const intervalRef = useRef(null);
  const alertRef    = useRef(null);
  const { tickBeep, endBeep, startBeep, initCtx } = useSound(soundType);

  const current    = drills[drillIdx] || drills[0];
  const phases     = getDrillPhases(current);
  const phase      = phases[phaseIdx] || { phase:"work", who:"both", duration:60, label:"עבודה" };
  const isPersonal = current && current.type === "personal";
  const isRest     = current && current.type === "rest";
  const isPartner  = current && current.type === "partner";
  const isRestPhase = phase.phase === "rest";

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

  // Reset the clock when the drill — or its phase layout — actually changed.
  // Renaming a drill or editing a later one from the remote must not knock the
  // running clock back to the start.
  const clockSigRef      = useRef(null);
  const clockOverrideRef = useRef(null);
  const [clockApplyTick, setClockApplyTick] = useState(0);

  useEffect(() => {
    const d = drills[drillIdx];
    if (!d) return;
    const sig = drillClockSignature(d);
    if (clockSigRef.current === sig) return;
    clockSigRef.current = sig;
    const ph = getDrillPhases(d);
    setPhaseIdx(0);
    setTimeLeft(ph[0] ? ph[0].duration : 60);
    setAlertActive(false);
  }, [drillIdx, drills]);

  // Declared after the reset effect on purpose: a clock position pushed from the
  // remote has to win over that reset when both land in the same commit.
  useEffect(() => {
    const o = clockOverrideRef.current;
    if (!o) return;
    clockOverrideRef.current = null;
    if (o.phaseIdx !== undefined) setPhaseIdx(o.phaseIdx);
    if (o.timeLeft !== undefined) setTimeLeft(o.timeLeft);
    setAlertActive(false);
  }, [clockApplyTick]);

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

  // The ticker reads everything it needs through a ref. Depending on those
  // values directly would tear down and restart the interval on every render —
  // and since the remote link re-renders the page between ticks, that used to
  // push the next tick a further second away and run the clock slow.
  const tickCtxRef = useRef(null);
  tickCtxRef.current = { advancePhase, tickBeep, isPersonal, judokas };

  useEffect(() => {
    if (!running) { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      const { advancePhase, tickBeep, isPersonal, judokas } = tickCtxRef.current;
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
    return () => clearInterval(intervalRef.current);
  }, [running]);

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

  const startPlaying = useCallback(() => {
    setRunning(r => { if (!r) startBeep(); return true; });
  }, [startBeep]);

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
  useEffect(() => {
    let code = "";
    try {
      code = normalizeRoomCode(window.localStorage.getItem("judo_room") || "");
      if (code.length < 4) { code = makeRoomCode(4); window.localStorage.setItem("judo_room", code); }
      if (window.localStorage.getItem("judo_remote_on") === "0") setRemoteOn(false);
    } catch(e) { code = makeRoomCode(4); }
    setRoomCode(code);
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem("judo_remote_on", remoteOn ? "1" : "0"); } catch(e) {}
  }, [remoteOn]);

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
      case COMMANDS.RESET: setTimeLeft(phase.duration); setAlertActive(false); break;
      case COMMANDS.NEXT_PHASE: nextPhaseManual(); break;
      case COMMANDS.PREV_DRILL: goToDrill(drillIdx - 1); break;
      case COMMANDS.NEXT_DRILL: goToDrill(drillIdx + 1); break;
      case COMMANDS.ADD_TIME: setTimeLeft(t => Math.max(0, t + (Number(m.seconds) || 0))); break;
      case COMMANDS.GOTO: {
        const di = Math.max(0, Math.min(Number(m.drillIdx) || 0, drills.length - 1));
        const ph = getDrillPhases(drills[di]);
        const pi = Math.max(0, Math.min(Number(m.phaseIdx) || 0, Math.max(0, ph.length - 1)));
        clockOverrideRef.current = { phaseIdx: pi, timeLeft: ph[pi] ? ph[pi].duration : 60 };
        setDrillIdx(di);
        setRunning(false);
        setClockApplyTick(t => t + 1);
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
      clockOverrideRef.current = override;
      setClockApplyTick(t => t + 1);
    }

    if (then === "play")       startPlaying();
    else if (then === "pause") setRunning(false);
  }, [drills, drillIdx, startPlaying]);

  const tvLink = useTvLink({
    room: roomCode,
    active: remoteOn && !!roomCode,
    light: { drillIdx, phaseIdx, timeLeft, running, totalElapsed },
    heavyRef,
    rev,
    onCommand: handleRemoteCommand,
    onPatch: handleRemotePatch,
  });

  const pct = timeLeft / (phase.duration || 1);
  const urgent  = pct < 0.2 || alertActive;
  const warning = pct < 0.35 && pct >= 0.2;
  const notStarted = timeLeft === phase.duration;
  const timerColor = (isRestPhase||isRest) ? "#a8ff78" : alertActive ? "#ff3c3c" : !running ? (notStarted ? "#ffffff" : "#ff4444") : urgent ? "#FF6B00" : warning ? "#ffb347" : "#00ff88";

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

      {/* Audio can only be unlocked by a tap on the TV itself */}
      {!audioReady && remoteOn && (
        <div onClick={unlockAudio} style={{position:"fixed",bottom:14,left:"50%",transform:"translateX(-50%)",zIndex:120,background:"rgba(255,107,0,0.16)",border:"1px solid rgba(255,107,0,0.5)",color:"#FF6B00",borderRadius:11,padding:"10px 16px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:14,fontWeight:700,direction:"rtl"}}>
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
          {remoteOn && roomCode && (
            <button onClick={() => setModal("remote")} title="חיבור שלט רחוק בנייד" style={{display:"flex",alignItems:"center",gap:7,background:"rgba(255,255,255,0.04)",border:"1px solid "+(tvLink.remoteConnected?"rgba(46,204,113,0.45)":"rgba(255,255,255,0.08)"),borderRadius:9,padding:"8px 12px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:13,fontWeight:700,color:tvLink.remoteConnected?"rgba(46,204,113,0.9)":"rgba(255,255,255,0.5)"}}>
              <span style={{width:7,height:7,borderRadius:"50%",flexShrink:0,background:tvLink.remoteConnected?"#2ecc71":tvLink.status==="online"?"rgba(255,179,71,0.8)":"rgba(255,68,68,0.7)"}}/>
              📱 שלט רחוק
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

      {/* BODY */}
      <div style={{flex:1,display:"flex",overflow:"hidden",padding:"14px 22px",gap:16,position:"relative",zIndex:1,flexDirection:"row"}}>

        {/* LEFT: Notes panel (collapsible) */}
        {notesOpen ? (
          <div style={{width:leftW,display:"flex",flexDirection:"column",flexShrink:0,gap:8,position:"relative",minWidth:140,maxWidth:360}}>
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
              style={{position:"absolute",left:-10,top:0,bottom:0,width:20,cursor:"col-resize",zIndex:10,display:"flex",alignItems:"center",justifyContent:"center",touchAction:"none"}}>
              <div style={{width:3,height:40,borderRadius:2,background:"rgba(255,107,0,0.4)"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{color:"rgba(255,255,255,0.18)",fontSize:10,letterSpacing:4,textTransform:"uppercase"}}>הערות אימון</span>
              <button onClick={() => setNotesOpen(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.3)",cursor:"pointer",fontSize:18,padding:4,lineHeight:1}}>✕</button>
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={"הערות, דגשים לאימון..."}
              style={{
                flex:1,minHeight:220,
                background:"rgba(255,255,255,0.04)",
                border:"1px solid rgba(255,255,255,0.08)",
                borderRadius:10,color:"#fff",
                padding:"12px",fontFamily:"Heebo,sans-serif",
                fontSize:14,lineHeight:1.6,
                resize:"none",outline:"none",direction:"rtl",
              }}
            />
            <div style={{paddingTop:8,borderTop:"1px solid rgba(255,255,255,0.045)",display:"flex",flexDirection:"column",gap:5}}>
              {[["זמן שעבר",fmt(totalElapsed)],["סה\"כ",fmt(totalDur)]].map(([l,v]) => (
                <div key={l} style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{color:"rgba(255,255,255,0.22)",fontSize:11}}>{l}</span>
                  <span style={{color:"#fff",fontFamily:"Oswald,sans-serif",fontSize:19}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <button onClick={() => setNotesOpen(true)} style={{
            width:32,flexShrink:0,
            background:"rgba(255,255,255,0.04)",
            border:"1px solid rgba(255,255,255,0.08)",
            borderRadius:10,color:"rgba(255,255,255,0.35)",
            cursor:"pointer",display:"flex",alignItems:"center",
            justifyContent:"center",fontFamily:"Heebo,sans-serif",
            fontSize:11,letterSpacing:2,padding:"12px 0",
            writingMode:"vertical-rl",
          }}>📝 הערות</button>
        )}

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

          {!isPersonal && (
            <div style={{maxWidth:420,width:"100%",margin:"0 auto"}}>
              <SplitPanel pairs={pairs} judokas={judokas} who={(isRestPhase||isRest)?"none":phase.who} showNames={false}/>
            </div>
          )}

          {!projection && (
          <>
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
            <button onClick={() => { unlockAudio(); setRunning(r => { const next = !r; if (next) startBeep(); return next; }); }} style={{background:running?"linear-gradient(135deg,#ff4444,#a82020)":"linear-gradient(135deg,#2ecc71,#1f9c54)",border:"none",color:"#fff",borderRadius:13,padding:"13px 48px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:900,fontSize:21,boxShadow:running?"0 5px 22px rgba(255,68,68,0.38)":"0 5px 22px rgba(46,204,113,0.38)",minWidth:150}}>{running?"⏸ עצור":"▶ הפעל"}</button>
            <button onClick={nextPhaseManual} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#fff",borderRadius:11,padding:"13px 20px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:17}}>הבא</button>
          </div>
          </>
          )}

          <div style={{textAlign:"center",color:"rgba(255,255,255,0.17)",fontSize:13,minHeight:20}}>
            {nextPhase ? "הבא: "+nextPhase.label+" "+fmt(nextPhase.duration) : nextDrill ? "תרגיל הבא: "+nextDrill.name : ""}
          </div>

        </div>

        {/* RIGHT: drill list */}
        <div style={{width:rightW,display:"flex",flexDirection:"column",flexShrink:0,position:"relative",minWidth:180,maxWidth:500}}>
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
            style={{position:"absolute",right:-10,top:0,bottom:0,width:20,cursor:"col-resize",zIndex:10,display:"flex",alignItems:"center",justifyContent:"center",touchAction:"none"}}>
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
                  <span style={{width:20,height:20,borderRadius:"50%",background:curr?"#FF6B00":"rgba(255,255,255,0.045)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:curr?"#fff":"rgba(255,255,255,0.28)",flexShrink:0}}>{done?"✓":i+1}</span>
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

      </div>

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
            </div>

            {/* Row 3: TV / remote */}
            <div style={{display:"flex",gap:12}}>
              <button onClick={() => { setProjection(p=>!p); setToolbarOpen(false); }} style={{flex:1,background:projection?"rgba(255,107,0,0.2)":"rgba(255,255,255,0.05)",border:projection?"1px solid rgba(255,107,0,0.5)":"1px solid rgba(255,255,255,0.1)",color:projection?"#FF6B00":"rgba(255,255,255,0.7)",borderRadius:12,padding:"14px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:16}}>📺 מצב הקרנה {projection?"— פעיל":""}</button>
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
      {modal==="attendance" && <AttendanceModal judokas={judokas} onClose={()=>setModal(null)}/>}
      {modal==="remote" && (
        <RemotePairingModal
          roomCode={roomCode}
          remoteOn={remoteOn}
          setRemoteOn={setRemoteOn}
          onNewCode={newRoomCode}
          status={tvLink.status}
          connected={tvLink.remoteConnected}
          onClose={()=>setModal(null)}
        />
      )}
      </div>
    </div>
  );
}
