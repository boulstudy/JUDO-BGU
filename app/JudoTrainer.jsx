'use client';

import { useState, useEffect, useRef, useCallback } from "react";

const SUPA_URL = "https://oakbpcjxjunppuyddpsj.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ha2JwY2p4anVucHB1eWRkcHNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyOTcwOTIsImV4cCI6MjA5NTg3MzA5Mn0.EoYTL3N_P5C05VyR2-EFKcQUk3dcZSE3l3kWeADzQnE";

const supa = async (path, opts = {}) => {
  const r = await fetch(SUPA_URL + "/rest/v1/" + path, {
    ...opts,
    headers: {
      "apikey": SUPA_KEY,
      "Authorization": "Bearer " + SUPA_KEY,
      "Content-Type": "application/json",
      "Prefer": opts.prefer || "return=representation",
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) return null;
  const text = await r.text();
  return text ? JSON.parse(text) : null;
};

// ── Patterns ──────────────────────────────────────────────────────────────────
// alternate: white works → rest → blue works → rest → repeat
// together:  both work  → rest → repeat
// together_then_alternate: both work → white rests blue works → both rest → repeat

const PATTERNS = [
  { id: "alternate", label: "לסירוגין", desc: "לבן עובד → כחול עובד → מנוחה" },
  { id: "together",  label: "יחד",      desc: "שניהם עובדים → מנוחה" },
  { id: "together_alt", label: "יחד + לסירוגין", desc: "שניהם עובדים → לבן נח כחול עובד → שניהם נחים" },
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
  { id:1, name:"חימום כללי",     durationWork:300, durationRest:0,  rounds:1, pattern:"together",  activeColor:"both",  type:"group",   note:"ריצה + תנועתיות" },
  { id:2, name:"נפילות",         durationWork:240, durationRest:30, rounds:1, pattern:"together",  activeColor:"both",  type:"group",   note:"אחיבת אחורה, צדדים" },
  { id:3, name:"נאגה גדן",       durationWork:60,  durationRest:20, rounds:5, pattern:"alternate", activeColor:"white", type:"partner", note:"זריקה לצד שמאל" },
  { id:4, name:"אוצ׳י גארי",     durationWork:60,  durationRest:20, rounds:5, pattern:"alternate", activeColor:"blue",  type:"partner", note:"נשענים חזרה" },
  { id:5, name:"ראנדורי עמידה", durationWork:300, durationRest:60, rounds:3, pattern:"together",  activeColor:"both",  type:"partner", note:"50% עוצמה" },
  { id:6, name:"עבודה אישית",    durationWork:300, durationRest:0,  rounds:1, pattern:"together",  activeColor:"both",  type:"personal",note:"כל אחד על התרגיל שלו" },
  { id:7, name:"ראנדורי קרקע",  durationWork:300, durationRest:60, rounds:3, pattern:"together",  activeColor:"both",  type:"partner", note:"100% מאמץ" },
  { id:8, name:"שושין",          durationWork:180, durationRest:0,  rounds:1, pattern:"together",  activeColor:"both",  type:"group",   note:"מדיטציה וסיכום" },
];

const fmt = s => {
  const neg = s < 0, abs = Math.abs(s);
  return (neg?"-":"") + String(Math.floor(abs/60)).padStart(2,"0") + ":" + String(abs%60).padStart(2,"0");
};

const TYPE_COLOR = { group:"#6ec6ff", partner:"#FF6B00", personal:"#a8ff78" };
const TYPE_LABEL = { group:"קבוצה", partner:"זוגות", personal:"אישי" };

// Compute phase sequence for a drill
// Returns array of { phase: "white"|"blue"|"both"|"rest", duration }
function getDrillPhases(drill) {
  const { durationWork, durationRest, rounds, pattern, activeColor } = drill;
  const phases = [];
  for (let r = 0; r < rounds; r++) {
    if (pattern === "together") {
      phases.push({ phase: activeColor || "both", duration: durationWork });
      if (durationRest > 0) phases.push({ phase: "rest", duration: durationRest });
    } else if (pattern === "alternate") {
      const first  = activeColor === "blue" ? "blue" : "white";
      const second = first === "white" ? "blue" : "white";
      phases.push({ phase: first,  duration: durationWork });
      if (durationRest > 0) phases.push({ phase: "rest", duration: durationRest });
      phases.push({ phase: second, duration: durationWork });
      if (durationRest > 0) phases.push({ phase: "rest", duration: durationRest });
    } else if (pattern === "together_alt") {
      phases.push({ phase: "both",  duration: durationWork });
      const resting = activeColor === "blue" ? "white" : "blue";
      const working = resting === "white" ? "blue" : "white";
      phases.push({ phase: working, duration: durationWork });
      if (durationRest > 0) phases.push({ phase: "rest",  duration: durationRest });
    }
  }
  return phases;
}

function totalDrillTime(drill) {
  return getDrillPhases(drill).reduce((a,p) => a + p.duration, 0);
}

// ── Components ────────────────────────────────────────────────────────────────

function SplitPairsPanel({ pairs, judokas, activeColor, showNames }) {
  const wActive = activeColor === "white" || activeColor === "both";
  const bActive = activeColor === "blue"  || activeColor === "both";
  if (!showNames) {
    return (
      <div style={{display:"flex",gap:10,justifyContent:"center",alignItems:"center",height:"100%"}}>
        <div style={{flex:1,borderRadius:14,height:120,background:wActive?"linear-gradient(145deg,#d8d8d8,#fff)":"rgba(255,255,255,0.04)",border:wActive?"2px solid #fff":"2px solid rgba(255,255,255,0.07)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,transition:"all 0.5s",boxShadow:wActive?"0 0 30px rgba(255,255,255,0.2)":"none"}}>
          <span style={{fontSize:32}}>🥋</span>
          <span style={{color:wActive?"#111":"rgba(255,255,255,0.2)",fontWeight:800,fontSize:18}}>לבן</span>
          {wActive && <span style={{fontSize:11,color:"rgba(0,0,0,0.4)",letterSpacing:2}}>עובד</span>}
        </div>
        <div style={{color:"rgba(255,255,255,0.2)",fontFamily:"monospace",fontSize:14}}>VS</div>
        <div style={{flex:1,borderRadius:14,height:120,background:bActive?"linear-gradient(145deg,#003b8e,#1a5fd6)":"rgba(255,255,255,0.04)",border:bActive?"2px solid #1a5fd6":"2px solid rgba(255,255,255,0.07)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,transition:"all 0.5s",boxShadow:bActive?"0 0 30px rgba(26,95,214,0.35)":"none"}}>
          <span style={{fontSize:32}}>🥋</span>
          <span style={{color:bActive?"#fff":"rgba(255,255,255,0.2)",fontWeight:800,fontSize:18}}>כחול</span>
          {bActive && <span style={{fontSize:11,color:"rgba(255,255,255,0.5)",letterSpacing:2}}>עובד</span>}
        </div>
      </div>
    );
  }
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {pairs.map(([wid,bid],pi) => {
        const w = judokas.find(j => j.id===wid);
        const b = judokas.find(j => j.id===bid);
        return (
          <div key={pi} style={{display:"flex",gap:8,height:80}}>
            <div style={{flex:1,borderRadius:10,background:wActive?"linear-gradient(145deg,#d0d0d0,#fff)":"rgba(255,255,255,0.04)",border:wActive?"2px solid #fff":"2px solid rgba(255,255,255,0.07)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,transition:"all 0.5s",boxShadow:wActive?"0 0 20px rgba(255,255,255,0.18)":"none"}}>
              <span style={{fontSize:18}}>🥋</span>
              <span style={{color:wActive?"#111":"rgba(255,255,255,0.22)",fontWeight:800,fontSize:15,transition:"color 0.5s"}}>{w?w.name:"?"}</span>
              {wActive && <span style={{fontSize:10,color:"rgba(0,0,0,0.4)",letterSpacing:1}}>עובד</span>}
            </div>
            <div style={{width:24,display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,0.18)",fontSize:11}}>VS</div>
            <div style={{flex:1,borderRadius:10,background:bActive?"linear-gradient(145deg,#003b8e,#1a5fd6)":"rgba(255,255,255,0.04)",border:bActive?"2px solid #1a5fd6":"2px solid rgba(255,255,255,0.07)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,transition:"all 0.5s",boxShadow:bActive?"0 0 20px rgba(26,95,214,0.3)":"none"}}>
              <span style={{fontSize:18}}>🥋</span>
              <span style={{color:bActive?"#fff":"rgba(255,255,255,0.22)",fontWeight:800,fontSize:15,transition:"color 0.5s"}}>{b?b.name:"?"}</span>
              {bActive && <span style={{fontSize:10,color:"rgba(255,255,255,0.5)",letterSpacing:1}}>עובד</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PersonalPanel({ judokas, personalTimers, showJudokas }) {
  const visible = showJudokas.length > 0 ? judokas.filter(j => showJudokas.includes(j.id)) : judokas;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:7}}>
      {visible.map(j => {
        const pt = personalTimers[j.id];
        const drill = j.personalDrills && j.personalDrills[pt ? pt.drillIdx : 0];
        const tl = pt ? pt.timeLeft : (drill ? drill.duration : 0);
        const total = drill ? drill.duration : 1;
        const urgent = (tl/total) < 0.25;
        return (
          <div key={j.id} style={{borderRadius:10,padding:"10px 14px",background:j.color==="white"?"linear-gradient(135deg,rgba(255,255,255,0.1),rgba(255,255,255,0.04))":"linear-gradient(135deg,rgba(26,95,214,0.2),rgba(0,59,142,0.1))",border:j.color==="white"?"1px solid rgba(255,255,255,0.22)":"1px solid rgba(26,95,214,0.4)",display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:9,height:9,borderRadius:"50%",background:j.color==="white"?"#ddd":"#1a5fd6",flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:"#fff",fontWeight:700,fontSize:15}}>{j.name}</div>
              <div style={{color:"rgba(255,255,255,0.38)",fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{drill?drill.name:"סיים"}</div>
            </div>
            <div style={{fontFamily:"Oswald,sans-serif",fontWeight:700,fontSize:26,color:urgent?"#ff3c3c":"#fff",minWidth:65,textAlign:"right"}}>{fmt(tl)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Drill Editor ──────────────────────────────────────────────────────────────

function DrillForm({ drill, onChange, onCancel, onSave, library, onSaveToLibrary }) {
  const d = drill;
  const inp = {background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,107,0,0.35)",borderRadius:8,color:"#fff",padding:"7px 11px",fontFamily:"Heebo,sans-serif",fontSize:14,outline:"none",width:"100%"};
  const lbl = {color:"rgba(255,255,255,0.45)",fontSize:12,marginBottom:4,display:"block"};
  const row = {display:"flex",gap:10,marginBottom:12};
  const col = {flex:1};
  return (
    <div style={{background:"rgba(255,107,0,0.06)",border:"1px solid rgba(255,107,0,0.3)",borderRadius:12,padding:16,marginBottom:8}}>
      <div style={row}>
        <div style={{flex:2}}>
          <span style={lbl}>שם התרגיל</span>
          <input value={d.name} onChange={e => onChange({...d,name:e.target.value})} style={inp} placeholder="שם" />
        </div>
        <div style={col}>
          <span style={lbl}>סוג</span>
          <select value={d.type} onChange={e => onChange({...d,type:e.target.value})} style={inp}>
            <option value="group">קבוצה</option>
            <option value="partner">זוגות</option>
            <option value="personal">אישי</option>
          </select>
        </div>
      </div>
      <div style={row}>
        <div style={col}>
          <span style={lbl}>זמן עבודה (שנ׳)</span>
          <input type="number" value={d.durationWork} onChange={e => onChange({...d,durationWork:parseInt(e.target.value)||30})} style={inp} />
        </div>
        <div style={col}>
          <span style={lbl}>זמן מנוחה (שנ׳)</span>
          <input type="number" value={d.durationRest} onChange={e => onChange({...d,durationRest:parseInt(e.target.value)||0})} style={inp} />
        </div>
        <div style={col}>
          <span style={lbl}>סבבים</span>
          <input type="number" value={d.rounds} onChange={e => onChange({...d,rounds:parseInt(e.target.value)||1})} style={inp} />
        </div>
      </div>
      {d.type === "partner" && (
        <div style={row}>
          <div style={col}>
            <span style={lbl}>תבנית</span>
            <select value={d.pattern} onChange={e => onChange({...d,pattern:e.target.value})} style={inp}>
              {PATTERNS.map(p => <option key={p.id} value={p.id}>{p.label} — {p.desc}</option>)}
            </select>
          </div>
          <div style={col}>
            <span style={lbl}>מי מתחיל</span>
            <select value={d.activeColor||"white"} onChange={e => onChange({...d,activeColor:e.target.value})} style={inp}>
              <option value="white">לבן</option>
              <option value="blue">כחול</option>
              <option value="both">שניהם</option>
            </select>
          </div>
        </div>
      )}
      <div style={{marginBottom:12}}>
        <span style={lbl}>הערות</span>
        <input value={d.note||""} onChange={e => onChange({...d,note:e.target.value})} style={inp} placeholder="הערות אופציונאליות" />
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",justifyContent:"space-between"}}>
        <div style={{color:"rgba(255,255,255,0.3)",fontSize:12}}>
          סה״כ: {fmt(totalDrillTime(d))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onSaveToLibrary} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.5)",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:13}}>+ ספרייה</button>
          <button onClick={onCancel} style={{background:"none",border:"1px solid rgba(255,255,255,0.15)",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:13}}>ביטול</button>
          <button onClick={onSave} style={{background:"#FF6B00",border:"none",color:"#fff",borderRadius:8,padding:"7px 18px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:14}}>שמור</button>
        </div>
      </div>
    </div>
  );
}

function DrillEditorModal({ drills, setDrills, currentIndex, judokas, setJudokas, pairs, setPairs, onClose }) {
  const [list, setList] = useState(drills.map(d => ({...d})));
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [newDrill, setNewDrill] = useState(null);
  const [library, setLibrary] = useState([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [tab, setTab] = useState("drills"); // drills | judokas | pairs

  useEffect(() => {
    supa("drill_library?order=created_at.desc").then(r => { if(r) setLibrary(r); });
  }, []);

  const blankDrill = () => ({ id: Date.now(), name:"", durationWork:60, durationRest:30, rounds:3, pattern:"alternate", activeColor:"white", type:"partner", note:"" });

  const saveToLibrary = async (d) => {
    const payload = { name:d.name, duration_work:d.durationWork, duration_rest:d.durationRest, rounds:d.rounds, pattern:d.pattern, active_color:d.activeColor, note:d.note||"" };
    const r = await supa("drill_library", { method:"POST", body:JSON.stringify(payload) });
    if (r) setLibrary(prev => [r[0], ...prev]);
  };

  const addFromLibrary = (lib) => {
    setList(prev => [...prev, { id:Date.now(), name:lib.name, durationWork:lib.duration_work, durationRest:lib.duration_rest, rounds:lib.rounds, pattern:lib.pattern, activeColor:lib.active_color, type:"partner", note:lib.note||"" }]);
  };

  const tabBtn = (key, label) => (
    <button onClick={() => setTab(key)} style={{background:tab===key?"#FF6B00":"rgba(255,255,255,0.05)",border:"none",color:tab===key?"#fff":"rgba(255,255,255,0.5)",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:14}}>{label}</button>
  );

  const inp = {background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,107,0,0.35)",borderRadius:8,color:"#fff",padding:"7px 11px",fontFamily:"Heebo,sans-serif",fontSize:14,outline:"none"};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#0d1020",border:"1px solid rgba(255,107,0,0.3)",borderRadius:18,width:"100%",maxWidth:740,maxHeight:"92vh",overflowY:"auto",padding:24,direction:"rtl"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{display:"flex",gap:8}}>
            {tabBtn("drills","תרגילים")}
            {tabBtn("judokas","גודוקות")}
            {tabBtn("pairs","זוגות")}
          </div>
          <button onClick={() => { setDrills(list); onClose(); }} style={{background:"#FF6B00",border:"none",color:"#fff",borderRadius:10,padding:"10px 22px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:15}}>שמור וסגור</button>
        </div>

        {tab === "drills" && (
          <div>
            {list.map((d,i) => (
              <div key={d.id}>
                {editId === d.id ? (
                  <DrillForm
                    drill={editData}
                    onChange={setEditData}
                    onCancel={() => setEditId(null)}
                    onSave={() => { setList(list.map(x => x.id===d.id ? editData : x)); setEditId(null); }}
                    onSaveToLibrary={() => saveToLibrary(editData)}
                  />
                ) : (
                  <div style={{background:i===currentIndex?"rgba(255,107,0,0.1)":"rgba(255,255,255,0.03)",border:i===currentIndex?"1px solid rgba(255,107,0,0.4)":"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"10px 14px",marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
                    <span style={{color:"rgba(255,107,0,0.55)",fontFamily:"monospace",fontSize:12,minWidth:18}}>{i+1}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <span style={{color:"#fff",fontSize:14,fontWeight:600}}>{d.name}</span>
                      <span style={{fontSize:11,marginRight:8,padding:"2px 8px",borderRadius:4,background:TYPE_COLOR[d.type]+"22",color:TYPE_COLOR[d.type]}}>{TYPE_LABEL[d.type]}</span>
                      <span style={{color:"rgba(255,255,255,0.28)",fontSize:12}}>{fmt(totalDrillTime(d))} · {d.rounds} סבבים</span>
                    </div>
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={() => { const a=[...list]; const t=i-1; if(t>=0){[a[i],a[t]]=[a[t],a[i]]; setList(a); }}} style={{background:"none",border:"1px solid rgba(255,255,255,0.1)",color:"#fff",borderRadius:6,width:26,height:26,cursor:"pointer",fontSize:12}}>↑</button>
                      <button onClick={() => { const a=[...list]; const t=i+1; if(t<a.length){[a[i],a[t]]=[a[t],a[i]]; setList(a); }}} style={{background:"none",border:"1px solid rgba(255,255,255,0.1)",color:"#fff",borderRadius:6,width:26,height:26,cursor:"pointer",fontSize:12}}>↓</button>
                      <button onClick={() => { setEditId(d.id); setEditData({...d}); }} style={{background:"rgba(255,107,0,0.15)",border:"none",color:"#FF6B00",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:12,fontFamily:"Heebo,sans-serif"}}>ערוך</button>
                      <button onClick={() => setList(list.filter(x => x.id!==d.id))} style={{background:"rgba(255,60,60,0.1)",border:"none",color:"#ff6060",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:12,fontFamily:"Heebo,sans-serif"}}>מחק</button>
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
                onSave={() => { setList([...list, newDrill]); setNewDrill(null); }}
                onSaveToLibrary={() => saveToLibrary(newDrill)}
              />
            ) : (
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <button onClick={() => setNewDrill(blankDrill())} style={{background:"rgba(255,107,0,0.12)",border:"1px dashed rgba(255,107,0,0.4)",color:"#FF6B00",borderRadius:10,padding:"10px 20px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:14,flex:1}}>+ תרגיל חדש</button>
                <button onClick={() => setShowLibrary(s => !s)} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.55)",borderRadius:10,padding:"10px 20px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:14}}>📚 ספרייה</button>
              </div>
            )}

            {showLibrary && (
              <div style={{marginTop:12,background:"rgba(0,0,0,0.2)",borderRadius:10,padding:12,border:"1px solid rgba(255,255,255,0.07)"}}>
                <div style={{color:"rgba(255,255,255,0.3)",fontSize:11,letterSpacing:3,textTransform:"uppercase",marginBottom:10}}>ספריית תרגילים</div>
                {library.length === 0 && <div style={{color:"rgba(255,255,255,0.2)",fontSize:13,textAlign:"center",padding:16}}>הספרייה ריקה — שמור תרגיל ראשון</div>}
                {library.map(lib => (
                  <div key={lib.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,background:"rgba(255,255,255,0.03)",marginBottom:5}}>
                    <div style={{flex:1}}>
                      <div style={{color:"#fff",fontSize:14}}>{lib.name}</div>
                      <div style={{color:"rgba(255,255,255,0.3)",fontSize:12}}>{fmt(lib.duration_work)} × {lib.rounds} · {lib.pattern}</div>
                    </div>
                    <button onClick={() => addFromLibrary(lib)} style={{background:"rgba(255,107,0,0.2)",border:"none",color:"#FF6B00",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:13}}>+ הוסף</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "judokas" && (
          <div>
            {judokas.map(j => (
              <div key={j.id} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,marginBottom:8,padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:j.color==="white"?"#eee":"#1a5fd6",flexShrink:0}}/>
                <span style={{color:"#fff",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:15,flex:1}}>{j.name}</span>
                <select value={j.color} onChange={e => setJudokas(judokas.map(x => x.id===j.id?{...x,color:e.target.value}:x))} style={{...inp,width:90,padding:"5px 8px",fontSize:13}}>
                  <option value="white">לבן</option>
                  <option value="blue">כחול</option>
                </select>
                <button onClick={() => setJudokas(judokas.filter(x => x.id!==j.id))} style={{background:"none",border:"none",color:"rgba(255,60,60,0.55)",cursor:"pointer",fontSize:17}}>✕</button>
              </div>
            ))}
            <button onClick={() => {
              const name = prompt("שם הגודוקה:");
              if (name) setJudokas([...judokas, {id:Date.now(),name,color:"white",personalDrills:[]}]);
            }} style={{background:"rgba(255,107,0,0.12)",border:"1px dashed rgba(255,107,0,0.4)",color:"#FF6B00",borderRadius:10,padding:"10px 20px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:14,width:"100%",marginTop:8}}>+ גודוקה חדש/ה</button>
          </div>
        )}

        {tab === "pairs" && (
          <div>
            {pairs.map(([wid,bid],pi) => {
              const w = judokas.find(j=>j.id===wid);
              const b = judokas.find(j=>j.id===bid);
              return (
                <div key={pi} style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
                  <span style={{color:"rgba(255,255,255,0.3)",fontSize:13,minWidth:50}}>זוג {pi+1}</span>
                  {[0,1].map(side => (
                    <select key={side} value={side===0?wid:bid} onChange={e => { const v=parseInt(e.target.value); setPairs(pairs.map((p,i) => i===pi ? p.map((x,s) => s===side?v:x) : p)); }} style={{...inp,flex:1}}>
                      {judokas.map(j => <option key={j.id} value={j.id}>{j.name} ({j.color==="white"?"לבן":"כחול"})</option>)}
                    </select>
                  ))}
                  <button onClick={() => setPairs(pairs.filter((_,i)=>i!==pi))} style={{background:"none",border:"none",color:"rgba(255,60,60,0.5)",cursor:"pointer",fontSize:17}}>✕</button>
                </div>
              );
            })}
            <button onClick={() => {
              const whites = judokas.filter(j=>j.color==="white");
              const blues  = judokas.filter(j=>j.color==="blue");
              if (whites.length && blues.length) setPairs([...pairs,[whites[0].id,blues[0].id]]);
            }} style={{background:"rgba(255,107,0,0.12)",border:"1px dashed rgba(255,107,0,0.4)",color:"#FF6B00",borderRadius:10,padding:"10px 20px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:14,width:"100%",marginTop:8}}>+ זוג חדש</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Workout Saver / Loader ────────────────────────────────────────────────────

function WorkoutManagerModal({ drills, judokas, pairs, onLoad, onClose }) {
  const [workouts, setWorkouts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0,10));

  useEffect(() => {
    supa("workouts?order=date.desc").then(r => { if(r) setWorkouts(r); });
  }, []);

  const save = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const payload = { date: newDate, name: newName, drills, judokas, pairs };
    const r = await supa("workouts", { method:"POST", body:JSON.stringify(payload) });
    if (r) setWorkouts(prev => [r[0], ...prev]);
    setSaving(false);
    setNewName("");
  };

  const del = async (id) => {
    await supa("workouts?id=eq."+id, { method:"DELETE", prefer:"" });
    setWorkouts(workouts.filter(w => w.id!==id));
  };

  const inp = {background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,107,0,0.35)",borderRadius:8,color:"#fff",padding:"8px 12px",fontFamily:"Heebo,sans-serif",fontSize:14,outline:"none"};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#0d1020",border:"1px solid rgba(255,107,0,0.3)",borderRadius:18,width:"100%",maxWidth:580,maxHeight:"90vh",overflowY:"auto",padding:24,direction:"rtl"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{color:"#FF6B00",fontFamily:"Heebo,sans-serif",fontSize:20,margin:0}}>📅 אימונים שמורים</h2>
          <button onClick={onClose} style={{background:"none",border:"1px solid rgba(255,255,255,0.15)",color:"#fff",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontFamily:"Heebo,sans-serif"}}>סגור</button>
        </div>

        <div style={{background:"rgba(255,107,0,0.07)",borderRadius:12,padding:16,marginBottom:18,border:"1px solid rgba(255,107,0,0.2)"}}>
          <div style={{color:"rgba(255,255,255,0.4)",fontSize:12,marginBottom:10}}>שמור את האימון הנוכחי</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="שם האימון" style={{...inp,flex:1,minWidth:120}}/>
            <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{...inp,width:150}}/>
            <button onClick={save} disabled={saving} style={{background:"#FF6B00",border:"none",color:"#fff",borderRadius:8,padding:"8px 20px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:14}}>{saving?"שומר...":"שמור"}</button>
          </div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          {workouts.length === 0 && <div style={{color:"rgba(255,255,255,0.2)",textAlign:"center",padding:20,fontSize:14}}>אין אימונים שמורים עדיין</div>}
          {workouts.map(w => (
            <div key={w.id} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1}}>
                <div style={{color:"#fff",fontWeight:700,fontSize:15}}>{w.name}</div>
                <div style={{color:"rgba(255,255,255,0.3)",fontSize:12}}>{w.date} · {w.drills ? w.drills.length : 0} תרגילים</div>
              </div>
              <button onClick={() => { onLoad(w); onClose(); }} style={{background:"rgba(255,107,0,0.2)",border:"none",color:"#FF6B00",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:13,fontWeight:700}}>טען</button>
              <button onClick={() => del(w.id)} style={{background:"none",border:"none",color:"rgba(255,60,60,0.5)",cursor:"pointer",fontSize:17}}>✕</button>
            </div>
          ))}
        </div>
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
  const [timeLeft,  setTimeLeft]  = useState(0);
  const [running,   setRunning]   = useState(false);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [alertActive,  setAlertActive]  = useState(false);
  const [personalTimers, setPersonalTimers] = useState({});
  const [modal, setModal] = useState(null);
  const [showJudokas, setShowJudokas] = useState([]);

  const intervalRef = useRef(null);
  const alertRef    = useRef(null);

  const current = drills[drillIdx] || drills[0];
  const phases  = current ? getDrillPhases(current) : [];
  const phase   = phases[phaseIdx] || { phase:"rest", duration:0 };
  const isPersonal = current && current.type === "personal";
  const isPartner  = current && current.type === "partner";
  const isRest = phase.phase === "rest";

  // When drill changes, reset phase
  useEffect(() => {
    if (!current) return;
    const ph = getDrillPhases(current);
    setPhaseIdx(0);
    setTimeLeft(ph[0] ? ph[0].duration : 0);
    setAlertActive(false);
  }, [drillIdx]);

  // Personal timers
  useEffect(() => {
    if (isPersonal) {
      const init = {};
      judokas.forEach(j => { init[j.id] = { drillIdx:0, timeLeft:(j.personalDrills&&j.personalDrills[0])?j.personalDrills[0].duration:0 }; });
      setPersonalTimers(init);
    }
  }, [drillIdx, isPersonal]);

  const triggerAlert = useCallback(() => {
    setAlertActive(true);
    clearTimeout(alertRef.current);
    alertRef.current = setTimeout(() => setAlertActive(false), 2500);
  }, []);

  const advancePhase = useCallback(() => {
    setPhaseIdx(pi => {
      const nextPi = pi + 1;
      if (nextPi < phases.length) {
        setTimeLeft(phases[nextPi].duration);
        triggerAlert();
        return nextPi;
      } else {
        triggerAlert();
        setTimeLeft(0);
        setRunning(false);
        return pi;
      }
    });
  }, [phases, triggerAlert]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(t => {
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
              } else { next[j.id] = {...pt,timeLeft:pt.timeLeft-1}; }
            });
            return next;
          });
        }
      }, 1000);
    } else { clearInterval(intervalRef.current); }
    return () => clearInterval(intervalRef.current);
  }, [running, isPersonal, judokas, advancePhase]);

  const goToDrill = i => { setDrillIdx(i); setRunning(false); };
  const addTime = s => setTimeLeft(t => Math.max(0,t+s));
  const resetPhase = () => { setTimeLeft(phase.duration); setAlertActive(false); };

  const pct = timeLeft / (phase.duration || 1);
  const urgent = pct < 0.2 || alertActive;
  const warning = pct < 0.35 && pct >= 0.2;
  const timerColor = isRest ? "#a8ff78" : alertActive ? "#ff3c3c" : urgent ? "#FF6B00" : warning ? "#ffb347" : "#00e5ff";

  const totalDur  = drills.reduce((a,d) => a+totalDrillTime(d), 0);
  const doneDur   = drills.slice(0,drillIdx).reduce((a,d) => a+totalDrillTime(d), 0);
  const drillDone = phases.slice(0,phaseIdx).reduce((a,p) => a+p.duration, 0);
  const progress  = ((doneDur + drillDone + (phase.duration - timeLeft)) / totalDur) * 100;

  const nextDrill = drills[drillIdx + 1];
  const nextPhase = phases[phaseIdx + 1];

  // Phase label
  const phaseLabel = isRest ? "מנוחה" : phase.phase === "white" ? "לבן עובד" : phase.phase === "blue" ? "כחול עובד" : "שניהם עובדים";
  const currentRound = Math.ceil((phaseIdx + 1) / (current && current.pattern === "alternate" ? 2 : 1));

  return (
    <div style={{width:"100vw",height:"100vh",overflow:"hidden",background:"#080a10",display:"flex",flexDirection:"column",direction:"rtl",fontFamily:"Heebo,sans-serif",position:"relative"}}>
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&family=Oswald:wght@700&display=swap" rel="stylesheet"/>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes alertBorder{0%,100%{opacity:0}50%{opacity:1}}
        @keyframes slideIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes restPulse{0%,100%{box-shadow:0 0 20px rgba(168,255,120,0.15)}50%{box-shadow:0 0 40px rgba(168,255,120,0.35)}}
        *{box-sizing:border-box;margin:0;padding:0}
      `}</style>

      <div style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden"}}>
        <div style={{position:"absolute",top:"-20%",right:"-10%",width:"55%",height:"70%",borderRadius:"50%",background:"radial-gradient(circle,rgba(255,107,0,0.05) 0%,transparent 65%)"}}/>
        <div style={{position:"absolute",bottom:"-20%",left:"-10%",width:"55%",height:"70%",borderRadius:"50%",background:"radial-gradient(circle,rgba(0,59,142,0.07) 0%,transparent 65%)"}}/>
        <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(255,255,255,0.01) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.01) 1px,transparent 1px)",backgroundSize:"80px 80px"}}/>
      </div>

      {alertActive && <div style={{position:"fixed",inset:0,border:"6px solid rgba(255,60,60,0.75)",pointerEvents:"none",zIndex:50,animation:"alertBorder 0.35s infinite"}}/>}

      {/* ── TOP BAR ── */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 32px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(0,0,0,0.35)",flexShrink:0,position:"relative",zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:46,height:46,borderRadius:11,background:"linear-gradient(135deg,#FF6B00,#cc4400)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,boxShadow:"0 4px 18px rgba(255,107,0,0.4)"}}>🥋</div>
          <div>
            <div style={{color:"#fff",fontSize:22,fontWeight:900,letterSpacing:-0.5}}>נבחרת יודו BGU</div>
            <div style={{color:"rgba(255,107,0,0.6)",fontSize:11,letterSpacing:4,textTransform:"uppercase"}}>Ben-Gurion University</div>
          </div>
        </div>

        <div style={{flex:1,maxWidth:460,margin:"0 32px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
            <span style={{color:"rgba(255,255,255,0.25)",fontSize:12}}>התקדמות האימון</span>
            <span style={{color:"rgba(255,255,255,0.35)",fontFamily:"monospace",fontSize:12}}>{Math.round(progress)}%</span>
          </div>
          <div style={{height:5,background:"rgba(255,255,255,0.06)",borderRadius:3,overflow:"hidden"}}>
            <div style={{height:"100%",width:progress+"%",background:"linear-gradient(90deg,#FF6B00,#ff9233)",borderRadius:3,transition:"width 1s linear"}}/>
          </div>
        </div>

        <div style={{display:"flex",gap:8}}>
          <button onClick={() => setModal("workouts")} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.6)",borderRadius:9,padding:"9px 16px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:14}}>📅 אימונים</button>
          <button onClick={() => { setRunning(false); setModal("edit"); }} style={{background:"rgba(255,107,0,0.1)",border:"1px solid rgba(255,107,0,0.3)",color:"#FF6B00",borderRadius:9,padding:"9px 16px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:14}}>✏️ ערוך</button>
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{flex:1,display:"flex",overflow:"hidden",padding:"16px 24px",gap:18,position:"relative",zIndex:1}}>

        {/* ── LEFT: drill list ── */}
        <div style={{width:240,display:"flex",flexDirection:"column",flexShrink:0,gap:0}}>
          <div style={{color:"rgba(255,255,255,0.2)",fontSize:11,letterSpacing:4,textTransform:"uppercase",marginBottom:10}}>מערך האימון</div>
          <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
            {drills.map((d,i) => {
              const done = i < drillIdx, curr = i === drillIdx;
              return (
                <div key={d.id} onClick={() => goToDrill(i)} style={{background:curr?"rgba(255,107,0,0.13)":done?"rgba(255,255,255,0.01)":"rgba(255,255,255,0.035)",border:curr?"1px solid rgba(255,107,0,0.5)":"1px solid rgba(255,255,255,0.05)",borderRadius:9,padding:"9px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,opacity:done?0.35:1,transition:"all 0.2s"}}>
                  <span style={{width:22,height:22,borderRadius:"50%",background:curr?"#FF6B00":done?"rgba(255,255,255,0.07)":"rgba(255,255,255,0.04)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:curr?"#fff":"rgba(255,255,255,0.3)",flexShrink:0}}>{done?"✓":i+1}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:curr?"#fff":"rgba(255,255,255,0.55)",fontSize:13,fontWeight:curr?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>
                    <div style={{color:TYPE_COLOR[d.type],fontSize:10,marginTop:1}}>{TYPE_LABEL[d.type]} · {d.rounds}× · {fmt(totalDrillTime(d))}</div>
                  </div>
                  {curr && running && <div style={{width:6,height:6,borderRadius:"50%",background:"#FF6B00",animation:"pulse 0.9s infinite",flexShrink:0}}/>}
                </div>
              );
            })}
          </div>
          <div style={{paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.05)",display:"flex",flexDirection:"column",gap:6,marginTop:8}}>
            {[["⏱ שעבר",fmt(totalElapsed)],["⏳ סה״כ",fmt(totalDur)]].map(([l,v]) => (
              <div key={l} style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{color:"rgba(255,255,255,0.25)",fontSize:12}}>{l}</span>
                <span style={{color:"#fff",fontFamily:"Oswald,sans-serif",fontSize:20}}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── CENTER: main stage ── */}
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:12,minWidth:0}}>

          {/* Drill title + phase */}
          <div style={{display:"flex",alignItems:"baseline",gap:14,flexWrap:"wrap"}}>
            <h1 style={{color:"#fff",fontSize:"clamp(24px,3.5vw,46px)",fontWeight:900,letterSpacing:-1,lineHeight:1}}>{current?current.name:""}</h1>
            <span style={{padding:"4px 14px",borderRadius:20,background:isRest?"rgba(168,255,120,0.15)":TYPE_COLOR[current?current.type:"group"]+"20",color:isRest?"#a8ff78":TYPE_COLOR[current?current.type:"group"],fontSize:15,fontWeight:700,flexShrink:0}}>{phaseLabel}</span>
            {current && current.rounds > 1 && !isRest && (
              <span style={{color:"rgba(255,255,255,0.25)",fontSize:14}}>סבב {Math.min(currentRound, current.rounds)}/{current.rounds}</span>
            )}
            {current && current.note && <span style={{color:"rgba(255,255,255,0.3)",fontSize:16}}>{current.note}</span>}
          </div>

          {/* Phase indicators */}
          <div style={{display:"flex",gap:6}}>
            {phases.map((p,i) => (
              <div key={i} onClick={() => { setPhaseIdx(i); setTimeLeft(p.duration); }} style={{flex:1,height:5,borderRadius:3,cursor:"pointer",background:i<phaseIdx?"rgba(255,107,0,0.5)":i===phaseIdx?"#FF6B00":p.phase==="rest"?"rgba(168,255,120,0.2)":"rgba(255,255,255,0.1)",transition:"background 0.3s"}}/>
            ))}
          </div>

          {/* MEGA TIMER */}
          <div style={{textAlign:"center",lineHeight:1,animation:alertActive?"pulse 0.35s infinite":"none",background:isRest?"rgba(168,255,120,0.04)":"none",borderRadius:16,padding:"8px 0",transition:"background 0.5s"}}>
            <div style={{fontSize:"clamp(90px,16vw,185px)",fontFamily:"Oswald,sans-serif",fontWeight:700,color:timerColor,textShadow:"0 0 60px "+timerColor+"44",transition:"color 0.4s",letterSpacing:-8}}>{fmt(timeLeft)}</div>
            {alertActive && !isRest && <div style={{color:"#ff3c3c",fontSize:24,fontWeight:900,letterSpacing:5,textTransform:"uppercase",animation:"pulse 0.4s infinite"}}>זמן לעבור</div>}
            {isRest && <div style={{color:"#a8ff78",fontSize:20,fontWeight:700,letterSpacing:3}}>מנוחה</div>}
          </div>

          {/* time adjust */}
          <div style={{display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>
            {[[-60,"-1:00"],[-30,"-:30"],[-10,"-:10"],[10,"+:10"],[30,"+:30"],[60,"+1:00"]].map(([s,l]) => (
              <button key={s} onClick={() => addTime(s)} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",color:s>0?"rgba(0,229,255,0.75)":"rgba(255,107,0,0.75)",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontFamily:"monospace",fontSize:15,fontWeight:700}}>{l}</button>
            ))}
          </div>

          {/* main controls */}
          <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
            <button onClick={() => goToDrill(drillIdx-1)} disabled={drillIdx===0} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",color:drillIdx===0?"rgba(255,255,255,0.12)":"#fff",borderRadius:11,padding:"14px 22px",cursor:drillIdx===0?"not-allowed":"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:18}}>← קודם</button>
            <button onClick={resetPhase} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",color:"#fff",borderRadius:11,padding:"14px 22px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:18}}>↺</button>
            <button onClick={() => setRunning(r => !r)} style={{background:running?"rgba(255,60,60,0.18)":"linear-gradient(135deg,#FF6B00,#cc4400)",border:running?"2px solid rgba(255,60,60,0.4)":"none",color:"#fff",borderRadius:13,padding:"14px 52px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:900,fontSize:22,boxShadow:running?"none":"0 6px 24px rgba(255,107,0,0.4)",minWidth:160}}>{running?"⏸ עצור":"▶ הפעל"}</button>
            <button onClick={() => { if(phaseIdx < phases.length-1){ setPhaseIdx(pi => { const n=pi+1; setTimeLeft(phases[n].duration); return n; }); } else { goToDrill(drillIdx+1); } }} disabled={drillIdx===drills.length-1 && phaseIdx===phases.length-1} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",color:"#fff",borderRadius:11,padding:"14px 22px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:18}}>הבא →</button>
          </div>

          {/* next hint */}
          {nextPhase && !isRest && <div style={{textAlign:"center",color:"rgba(255,255,255,0.18)",fontSize:13}}>הבא: <span style={{color:"rgba(255,255,255,0.4)",fontWeight:700}}>{nextPhase.phase==="rest"?"מנוחה "+fmt(nextPhase.duration):nextPhase.phase==="white"?"לבן עובד":nextPhase.phase==="blue"?"כחול עובד":"שניהם"}</span></div>}
          {!nextPhase && nextDrill && <div style={{textAlign:"center",color:"rgba(255,255,255,0.18)",fontSize:13}}>תרגיל הבא: <span style={{color:"rgba(255,255,255,0.4)",fontWeight:700}}>{nextDrill.name}</span></div>}
        </div>

        {/* ── RIGHT: pairs/personal ── */}
        <div style={{width:isPersonal?380:310,flexShrink:0,display:"flex",flexDirection:"column",gap:12}}>
          {!isPersonal ? (
            <div style={{background:"rgba(255,255,255,0.02)",border:isRest?"1px solid rgba(168,255,120,0.15)":"1px solid rgba(255,255,255,0.06)",borderRadius:14,padding:"16px 18px",flex:1,display:"flex",flexDirection:"column",animation:isRest?"restPulse 2s infinite":"none",transition:"border 0.5s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <span style={{color:"rgba(255,255,255,0.25)",fontSize:11,letterSpacing:3,textTransform:"uppercase"}}>זוגות</span>
                <span style={{color:isRest?"#a8ff78":TYPE_COLOR[current?current.type:"group"],fontSize:13,fontWeight:700}}>{isRest?"מנוחה":phaseLabel}</span>
              </div>
              <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center"}}>
                <SplitPairsPanel
                  pairs={pairs}
                  judokas={judokas}
                  activeColor={isRest?"none":phase.phase}
                  showNames={isPartner}
                />
              </div>
            </div>
          ) : (
            <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(160,255,120,0.18)",borderRadius:14,padding:"16px 18px",flex:1,display:"flex",flexDirection:"column"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <span style={{color:"rgba(160,255,120,0.7)",fontSize:11,letterSpacing:3,textTransform:"uppercase"}}>עבודה אישית</span>
                <button onClick={() => {
                  // toggle all/none
                  if (showJudokas.length === judokas.length || showJudokas.length === 0) setShowJudokas(judokas.map(j=>j.id));
                  else setShowJudokas([]);
                }} style={{background:"none",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.4)",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:12,fontFamily:"Heebo,sans-serif"}}>בחר</button>
              </div>
              <PersonalPanel judokas={judokas} personalTimers={personalTimers} showJudokas={showJudokas} />
            </div>
          )}
        </div>
      </div>

      {modal === "edit" && <DrillEditorModal drills={drills} setDrills={d => { setDrills(d); if(drillIdx>=d.length){setDrillIdx(d.length-1);} }} currentIndex={drillIdx} judokas={judokas} setJudokas={setJudokas} pairs={pairs} setPairs={setPairs} onClose={() => setModal(null)} />}
      {modal === "workouts" && <WorkoutManagerModal drills={drills} judokas={judokas} pairs={pairs} onLoad={w => { setDrills(w.drills); setJudokas(w.judokas); setPairs(w.pairs); setDrillIdx(0); setRunning(false); }} onClose={() => setModal(null)} />}
    </div>
  );
}
