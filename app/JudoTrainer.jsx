'use client';

import { useState, useEffect, useRef, useCallback } from "react";

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
  { id:1, name:"חימום כללי",      duration:300, type:"group",   note:"ריצה + תנועתיות" },
  { id:2, name:"נפילות – Ukemi",  duration:240, type:"group",   note:"אחיבת אחורה, צדדים" },
  { id:3, name:"נאגה גדן",         duration:360, type:"partner", note:"זריקה לצד שמאל", activeColor:"white" },
  { id:4, name:"אוצ׳י גארי",       duration:360, type:"partner", note:"נשענים חזרה",    activeColor:"blue"  },
  { id:5, name:"ראנדורי עמידה",   duration:300, type:"partner", note:"50% עוצמה",      activeColor:"both"  },
  { id:6, name:"עבודה אישית",      duration:300, type:"personal",note:"כל אחד על התרגיל שלו"},
  { id:7, name:"ראנדורי קרקע",    duration:300, type:"partner", note:"100% מאמץ",      activeColor:"both"  },
  { id:8, name:"שוֹשין",            duration:180, type:"group",   note:"מדיטציה וסיכום" },
];

const fmt = s => {
  const neg=s<0, abs=Math.abs(s);
  return `${neg?"-":""}${String(Math.floor(abs/60)).padStart(2,"0")}:${String(abs%60).padStart(2,"0")}`;
};

const TYPE_LABEL = { group:"קבוצה", partner:"זוגות", personal:"אישי" };
const TYPE_COLOR = { group:"#6ec6ff", partner:"#FF6B00", personal:"#a8ff78" };


function DrillEditorModal({ drills, setDrills, currentIndex, onClose }) {
  const [list, setList] = useState(drills.map(d=>({...d})));
  const [editId, setEditId] = useState(null);
  const [ed, setEd] = useState({});
  const [nd, setNd] = useState({name:"",duration:60,type:"group",note:"",activeColor:"both"});
  const inp = {background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,107,0,0.4)",borderRadius:8,color:"#fff",padding:"8px 12px",fontFamily:"'Heebo',sans-serif",fontSize:15,outline:"none"};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#0d1020",border:"1px solid rgba(255,107,0,0.35)",borderRadius:18,width:"100%",maxWidth:700,maxHeight:"90vh",overflowY:"auto",padding:28,direction:"rtl"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{color:"#FF6B00",fontFamily:"'Heebo',sans-serif",fontSize:22,margin:0}}>✏️ מערך האימון</h2>
          <button onClick={()=>{setDrills(list);onClose();}} style={{background:"#FF6B00",border:"none",color:"#fff",borderRadius:10,padding:"10px 22px",cursor:"pointer",fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:15}}>שמור וסגור</button>
        </div>
        {list.map((d,i)=>(
          <div key={d.id} style={{background:i===currentIndex?"rgba(255,107,0,0.12)":"rgba(255,255,255,0.03)",border:i===currentIndex?"1px solid rgba(255,107,0,0.5)":"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"12px 16px",marginBottom:7}}>
            {editId===d.id?(
              <div style={{display:"flex",flexDirection:"column",gap:9}}>
                <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                  <input value={ed.name} onChange={e=>setEd({...ed,name:e.target.value})} style={{...inp,flex:1,minWidth:120}} placeholder="שם"/>
                  <input type="number" value={ed.duration} onChange={e=>setEd({...ed,duration:e.target.value})} style={{...inp,width:75}}/>
                  <select value={ed.type} onChange={e=>setEd({...ed,type:e.target.value})} style={inp}>
                    <option value="group">קבוצה</option><option value="partner">זוגות</option><option value="personal">אישי</option>
                  </select>
                  {ed.type==="partner"&&<select value={ed.activeColor||"both"} onChange={e=>setEd({...ed,activeColor:e.target.value})} style={inp}>
                    <option value="both">שניהם</option><option value="white">לבן</option><option value="blue">כחול</option>
                  </select>}
                </div>
                <input value={ed.note||""} onChange={e=>setEd({...ed,note:e.target.value})} style={inp} placeholder="הערות"/>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{setList(list.map(x=>x.id===editId?{...ed,duration:parseInt(ed.duration)||60}:x));setEditId(null);}} style={{...inp,background:"#FF6B00",cursor:"pointer",border:"none",padding:"8px 18px"}}>שמור</button>
                  <button onClick={()=>setEditId(null)} style={{...inp,cursor:"pointer"}}>ביטול</button>
                </div>
              </div>
            ):(
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{color:"rgba(255,107,0,0.6)",fontFamily:"monospace",fontSize:13,minWidth:20}}>{i+1}</span>
                <div style={{flex:1}}>
                  <span style={{color:"#fff",fontFamily:"'Heebo',sans-serif",fontSize:15}}>{d.name}</span>
                  <span style={{fontSize:12,marginRight:8,padding:"2px 9px",borderRadius:5,background:`${TYPE_COLOR[d.type]}22`,color:TYPE_COLOR[d.type]}}>{TYPE_LABEL[d.type]}</span>
                  <span style={{color:"rgba(255,255,255,0.3)",fontSize:13}}>{fmt(d.duration)}</span>
                </div>
                <div style={{display:"flex",gap:5}}>
                  {[["↑",-1],["↓",1]].map(([l,dir])=>(
                    <button key={dir} onClick={()=>{const a=[...list];const t=i+dir;if(t>=0&&t<a.length){[a[i],a[t]]=[a[t],a[i]];setList(a);}}} style={{background:"none",border:"1px solid rgba(255,255,255,0.12)",color:"#fff",borderRadius:6,width:28,height:28,cursor:"pointer",fontSize:13}}>{l}</button>
                  ))}
                  <button onClick={()=>{setEditId(d.id);setEd({...d});}} style={{background:"rgba(255,107,0,0.15)",border:"none",color:"#FF6B00",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:13,fontFamily:"'Heebo',sans-serif"}}>ערוך</button>
                  <button onClick={()=>setList(list.filter(x=>x.id!==d.id))} style={{background:"
function JudokaManagerModal({ judokas, setJudokas, onClose }) {
  const [list, setList] = useState(judokas.map(j=>({...j,personalDrills:[...(j.personalDrills||[])]})));
  const [newName,setNewName]=useState(""); const [newColor,setNewColor]=useState("white");
  const [expandedId,setExpandedId]=useState(null);
  const [newDrill,setNewDrill]=useState({name:"",duration:120});
  const inp={background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,107,0,0.4)",borderRadius:8,color:"#fff",padding:"8px 12px",fontFamily:"'Heebo',sans-serif",fontSize:15,outline:"none"};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#0d1020",border:"1px solid rgba(255,107,0,0.35)",borderRadius:18,width:"100%",maxWidth:580,maxHeight:"90vh",overflowY:"auto",padding:28,direction:"rtl"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{color:"#FF6B00",fontFamily:"'Heebo',sans-serif",fontSize:22,margin:0}}>👥 ג'ודוקות</h2>
          <button onClick={()=>{setJudokas(list);onClose();}} style={{background:"#FF6B00",border:"none",color:"#fff",borderRadius:10,padding:"10px 22px",cursor:"pointer",fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:15}}>שמור וסגור</button>
        </div>
        {list.map(j=>(
          <div key={j.id} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,marginBottom:8,overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px"}}>
              <div style={{width:12,height:12,borderRadius:"50%",background:j.color==="white"?"#eee":"#1a5fd6",flexShrink:0}}/>
              <span style={{color:"#fff",fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:16,flex:1}}>{j.name}</span>
              <select value={j.color} onChange={e=>setList(list.map(x=>x.id===j.id?{...x,color:e.target.value}:x))} style={{...inp,padding:"5px 9px",fontSize:13}}>
                <option value="white">לבן</option><option value="blue">כחול</option>
              </select>
              <button onClick={()=>setExpandedId(expandedId===j.id?null:j.id)} style={{background:"rgba(255,255,255,0.06)",border:"none",color:"rgba(255,255,255,0.6)",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:13,fontFamily:"'Heebo',sans-serif"}}>{expandedId===j.id?"▲":"▼ תרגילים"}</button>
              <button onClick={()=>setList(list.filter(x=>x.id!==j.id))} style={{background:"none",border:"none",color:"rgba(255,60,60,0.6)",cursor:"pointer",fontSize:18}}>✕</button>
            </div>
            {expandedId===j.id&&(
              <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",padding:"12px 16px",background:"rgba(0,0,0,0.2)"}}>
                {(j.personalDrills||[]).map((pd,pi)=>(
                  <div key={pd.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                    <span style={{color:"rgba(255,255,255,0.65)",fontSize:14,fontFamily:"'Heebo',sans-serif",flex:1}}>{pd.name}</span>
                    <span style={{color:"rgba(255,255,255,0.3)",fontFamily:"monospace",fontSize:13}}>{fmt(pd.duration)}</span>
                    <button onClick={()=>setList(list.map(x=>x.id===j.id?{...x,personalDrills:x.personalDrills.filter((_,k)=>k!==pi)}:x))} style={{background:"none",border:"none",color:"rgba(255,60,60,0.5)",cursor:"pointer",fontSize:15}}>✕</button>
                  </div>
                ))}
                <div style={{display:"flex",gap:7,marginTop:9}}>
                  <input value={newDrill.name} onChange={e=>setNewDrill({...newDrill,name:e.target.value})} placeholder="שם תרגיל" style={{...inp,flex:1,fontSize:13,padding:"6px 9px"}}/>
                  <input type="number" value={newDrill.duration} onChange={e=>setNewDrill({...newDrill,duration:e.target.value})} style={{...inp,width:65,fontSize:13,padding:"6px 9px"}}/>
                  <button onClick={()=>{if(!newDrill.name.trim())return;setList(list.map(x=>x.id===j.id?{...x,personalDrills:[...(x.personalDrills||[]),{id:Date.now(),name:newDrill.name,duration:parseInt(newDrill.duration)||60}]}:x));setNewDrill({name:"",duration:120});}} style={{background:"rgba(255,107,0,0.3)",border:"none",color:"#FF6B00",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontFamily:"'Heebo',sans-serif",fontSize:14}}>+</button>
                </div>
              </div>
            )}
          </div>
        ))}
        <div style={{borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:16,marginTop:8,display:"flex",gap:8,alignItems:"center"}}>
          <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="שם ג'ודוקה חדש/ה" style={{...inp,flex:1}}/>
          <select value={newColor} onChange={e=>setNewColor(e.target.value)} style={inp}><option value="white">לבן</option><option value="blue">כחול</option></select>
          <button onClick={()=>{if(!newName.trim())return;setList([...list,{id:Date.now(),name:newName,color:newColor,personalDrills:[]}]);setNewName("");}} style={{background:"#FF6B00",border:"none",color:"#fff",borderRadius:9,padding:"9px 18px",cursor:"pointer",fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:15}}>+ הוסף</button>
        </div>
      </div>
    </div>
  );
}

function PairEditorModal({ pairs, judokas, onSave, onClose }) {
  const [local, setLocal] = useState(pairs.map(p=>[...p]));
  const inp={background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,107,0,0.4)",borderRadius:8,color:"#fff",padding:"8px 10px",fontFamily:"'Heebo',sans-serif",fontSize:14,outline:"none"};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#0d1020",border:"1px solid rgba(255,107,0,0.35)",borderRadius:18,padding:28,width:420,direction:"rtl"}}>
        <h3 style={{color:"#FF6B00",fontFamily:"'Heebo',sans-serif",marginBottom:18,fontSize:20}}>🔀 עריכת זוגות</h3>
        
        {local.map((pair,pi)=>(
          <div key={pi} style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}>
            <span style={{color:"rgba(255,255,255,0.4)",fontFamily:"monospace",fontSize:14,minWidth:50}}>זוג {pi+1}</span>
            {[0,1].map(side=>(
              <select key={side} value={pair[side]} onChange={e=>{const v=parseInt(e.target.value);setLocal(local.map((p,i)=>i===pi?p.map((x,s)=>s===side?v:x):p));}} style={{...inp,flex:1}}>
                {judokas.map(j=><option key={j.id} value={j.id}>{j.name} ({j.color==="white"?"לבן":"כחול"})</option>)}
              </select>
            ))}
          </div>
        ))}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:18}}>
          <button onClick={onClose} style={{background:"none",border:"1px solid rgba(255,255,255,0.15)",color:"#fff",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontFamily:"'Heebo',sans-serif",fontSize:14}}>ביטול</button>
          <button onClick={()=>{onSave(local);onClose();}} style={{background:"#FF6B00",border:"none",color:"#fff",borderRadius:8,padding:"9px 22px",cursor:"pointer",fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:15}}>שמור</button>
        </div>
      </div>
    </div>
  );
}

export default function JudoTV() {
  const [drills,   setDrills]   = useState(INIT_DRILLS);
  const [judokas,  setJudokas]  = useState(INIT_JUDOKAS);
  const [pairs,    setPairs]    = useState(INIT_PAIRS);
  const [idx,      setIdx]      = useState(0);
  const [timeLeft, setTimeLeft] = useState(INIT_DRILLS[0].duration);
  const [running,  setRunning]  = useState(false);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [alertActive,  setAlertActive]  = useState(false);
  const [personalTimers, setPersonalTimers] = useState({});
  const [modal, setModal] = useState(null);
  const intervalRef = useRef(null);
  const alertRef    = useRef(null);

  const current    = drills[idx] ?? drills[0];
  const isPersonal = current?.type === "personal";
  const isPartner  = current?.type === "partner";
  const activeColor= current?.activeColor || "both";

  useEffect(() => {
    if (isPersonal) {
      const init = {};
      judokas.forEach(j => { init[j.id] = { drillIdx:0, timeLeft: j.personalDrills?.[0]?.duration ?? 0 }; });
      setPersonalTimers(init);
    }
  }, [idx, isPersonal]);

  const triggerAlert = useCallback(() => {
    setAlertActive(true);
    clearTimeout(alertRef.current);
    alertRef.current = setTimeout(() => setAlertActive(false), 3000);
  }, []);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(t => { if (t <= 1) { triggerAlert(); return 0; } return t - 1; });
        setTotalElapsed(e => e + 1);
        if (isPersonal) {
          setPersonalTimers(prev => {
            const next = { ...prev };
            judokas.forEach(j => {
              const pt = next[j.id]; if (!pt) return;
              if (pt.timeLeft <= 1) {
                const ni = pt.drillIdx + 1;
                const nd = j.personalDrills?.[ni];
                next[j.id] = nd ? { drillIdx:ni, timeLeft:nd.duration } : { drillIdx:pt.drillIdx, timeLeft:0 };
              } else { next[j.id] = { ...pt, timeLeft: pt.timeLeft - 1 }; }
            });
            return next;
          });
        }
      }, 1000);
    } else { clearInterval(intervalRef.current); }
    return () => clearInterval(intervalRef.current);
  }, [running, isPersonal, judokas, triggerAlert]);

  const goTo = i => { setIdx(i); setTimeLeft(drills[i].duration); setAlertActive(false); };
  const addTime = s => setTimeLeft(t => Math.max(0, t + s));

  const pct     = timeLeft / (current?.duration || 1);
  const urgent  = pct < 0.2 || alertActive;
  const warning = pct < 0.35 && pct >= 0.2;
  const timerColor = alertActive ? "#ff3c3c" : urgent ? "#FF6B00" : warning ? "#ffb347" : "#00e5ff";

  const totalDur  = drills.reduce((a,d)=>a+d.duration,0);
  const doneTime  = drills.slice(0,idx).reduce((a,d)=>a+d.duration,0);
  const progress  = ((doneTime + (current.duration - timeLeft)) / totalDur) * 100;

  const whiteActive = activeColor === "white" || activeColor === "both";
  const blueActive  = activeColor === "blue"  || activeColor === "both";
  const nextDrill   = drills[idx + 1];

  return (
    <div style={{width:"100vw",height:"100vh",overflow:"hidden",background:"#080a10",display:"flex",flexDirection:"column",direction:"rtl",fontFamily:"'Heebo',sans-serif",position:"relative"}}>
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&family=Oswald:wght@700&display=swap" rel="stylesheet"/>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes alertBorder { 0%,100%{opacity:0} 50%{opacity:1} }
        @keyframes slideIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        * { box-sizing:border-box; margin:0; padding:0; }
      `}</style>

      <div style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden"}}>
        <div style={{position:"absolute",top:"-20%",right:"-10%",width:"55%",height:"70%",borderRadius:"50%",background:"radial-gradient(circle,rgba(255,107,0,0.05) 0%,transparent 65%)"}}/>
        <div style={{position:"absolute",bottom:"-20%",left:"-10%",width:"55%",height:"70%",borderRadius:"50%",background:"radial-gradient(circle,rgba(0,59,142,0.07) 0%,transparent 65%)"}}/>
        <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(255,255,255,0.012) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.012) 1px,transparent 1px)",backgroundSize:"80px 80px"}}/>
      </div>

      {alertActive && <div style={{position:"fixed",inset:0,border:"6px solid rgba(255,60,60,0.8)",pointerEvents:"none",zIndex:50,animation:"alertBorder 0.35s infinite"}}/>}

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 40px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(0,0,0,0.3)",flexShrink:0,position:"relative",zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{width:52,height:52,borderRadius:12,background:"linear-gradient(135deg,#FF6B00,#cc4400)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,boxShadow:"0 4px 20px rgba(255,107,0,0.4)"}}>🥋</div>
          <div>
            <div style={{color:"#fff",fontSize:26,fontWeight:900,letterSpacing:-0.5}}>נבחרת יודו BGU</div>
            <div style={{color:"rgba(255,107,0,0.65)",fontSize:13,letterSpacing:4,textTransform:"uppercase"}}>Ben-Gurion University · מנהל אימונים</div>
          </div>
        </div>
        <div style={{flex:1,maxWidth:500,margin:"0 40px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{color:"rgba(255,255,255,0.3)",fontSize:13}}>התקדמות האימון</span>
            <span style={{color:"rgba(255,255,255,0.4)",fontFamily:"monospace",fontSize:13}}>{Math.round(progress)}%</span>
          </div>
          <div style={{height:6,background:"rgba(255,255,255,0.07)",borderRadius:3,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${progress}%`,background:"linear-gradient(90deg,#FF6B00,#ff9233)",borderRadius:3,transition:"width 1s linear"}}/>
          </div>
        </div>
        <div style={{display:"flex",gap:10}}>
          {[["✏️ מערך","drills"],["👥 ג'ודוקות","judokas"],["🔀 זוגות","pairs"]].map(([label,key])=>(
            <button key={key} onClick={()=>{setRunning(false);setModal(key);}} style={{background:"rgba(255,107,0,0.1)",border:"1px solid rgba(255,107,0,0.3)",color:"#FF6B00",borderRadius:10,padding:"10px 18px",cursor:"pointer",fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:15}}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{flex:1,display:"flex",overflow:"hidden",padding:"20px 32px",gap:24,position:"relative",zIndex:1}}>
        <div style={{width:260,display:"flex",flexDirection:"column",gap:0,overflowY:"auto",flexShrink:0}}>
          <div style={{color:"rgba(255,255,255,0.25)",fontSize:12,letterSpacing:4,textTransform:"uppercase",marginBottom:12}}>מערך האימון</div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {drills.map((d,i) => {
              const done=i<idx, curr=i===idx;
              return (
                <div key={d.id} onClick={()=>goTo(i)} style={{background:curr?"rgba(255,107,0,0.14)":done?"rgba(255,255,255,0.015)":"rgba(255,255,255,0.04)",border:curr?"1px solid rgba(255,107,0,0.5)":"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"11px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,opacity:done?0.38:1,transition:"all 0.2s"}}>
                  <span style={{width:26,height:26,borderRadius:"50%",background:curr?"#FF6B00":done?"rgba(255,255,255,0.07)":"rgba(255,255,255,0.05)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:curr?"#fff":"rgba(255,255,255,0.3)",flexShrink:0}}>{done?"✓":i+1}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:curr?"#fff":"rgba(255,255,255,0.6)",fontWeight:curr?700:400,fontSize:15,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>
                    <div style={{color:TYPE_COLOR[d.type],fontSize:11,marginTop:1}}>{TYPE_LABEL[d.type]} · {fmt(d.duration)}</div>
                  </div>
                  {curr && running && <div style={{width:7,height:7,borderRadius:"50%",background:"#FF6B00",animation:"pulse 0.9s infinite",flexShrink:0}}/>}
                </div>
              );
            })}
          </div>
          <div style={{marginTop:"auto",paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",gap:8}}>
            {[["⏱ זמן שעבר",fmt(totalElapsed)],["⏳ סה״כ אימון",fmt(totalDur)]].map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{color:"rgba(255,255,255,0.3)",fontSize:13}}>{l}</span>
                <span style={{color:"#fff",fontFamily:"'Oswald',sans-serif",fontSize:22}}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{flex:1,display:"flex",flexDirection:"column",gap:16,minWidth:0}}>
          <div style={{display:"flex",alignItems:"baseline",gap:16,animation:"slideIn 0.3s ease"}}>
            <h1 style={{color:"#fff",fontSize:"clamp(28px,4vw,52px)",fontWeight:900,letterSpacing:-1,lineHeight:1}}>{current.name}</h1>
            <span style={{padding:"5px 16px",borderRadius:20,background:`${TYPE_COLOR[current.type]}20`,color:TYPE_COLOR[current.type],fontSize:16,fontWeight:700,flexShrink:0}}>{TYPE_LABEL[current.type]}</span>
            {current.note && <span style={{color:"rgba(255,255,255,0.35)",fontSize:18}}>{current.note}</span>}
          </div>
          <div style={{textAlign:"center",lineHeight:1,animation:alertActive?"pulse 0.35s infinite":"none"}}>
            <div style={{fontSize:"clamp(100px,18vw,200px)",fontFamily:"'Oswald',sans-serif",fontWeight:700,color:timerColor,textShadow:`0 0 60px ${timerColor}55`,transition:"color 0.4s",letterSpacing:-8}}>{fmt(timeLeft)}</div>
            {alertActive && <div style={{color:"#ff3c3c",fontSize:28,fontWeight:900,letterSpacing:6,textTransform:"uppercase",animation:"pulse 0.4s infinite"}}>⚡ זמן לעבור ⚡</div>}
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
            {[[-60,"-1:00"],[-30,"-:30"],[-10,"-:10"],[10,"+:10"],[30,"+:30"],[60,"+1:00"]].map(([s,l])=>(
              <button key={s} onClick={()=>addTime(s)} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:s>0?"rgba(0,229,255,0.8)":"rgba(255,107,0,0.8)",borderRadius:9,padding:"10px 16px",cursor:"pointer",fontFamily:"monospace",fontSize:16,fontWeight:700}}>{l}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:12,justifyContent:"center"}}>
            <button onClick={()=>goTo(idx-1)} disabled={idx===0} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:idx===0?"rgba(255,255,255,0.15)":"#fff",borderRadius:12,padding:"16px 28px",cursor:idx===0?"not-allowed":"pointer",fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:20}}>← קודם</button>
            <button onClick={()=>setTimeLeft(current.duration)} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"#fff",borderRadius:12,padding:"16px 28px",cursor:"pointer",fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:20}}>↺ אפס</button>
            <button onClick={()=>setRunning(r=>!r)} style={{background:running?"rgba(255,60,60,0.2)":"linear-gradient(135deg,#FF6B00 0%,#cc4400 100%)",border:running?"2px solid rgba(255,60,60,0.5)":"none",color:"#fff",borderRadius:14,padding:"16px 60px",cursor:"pointer",fontFamily:"'Heebo',sans-serif",fontWeight:900,fontSize:24,boxShadow:running?"none":"0 6px 28px rgba(255,107,0,0.45)",minWidth:180}}>{running ? "⏸ עצור" : "▶ הפעל"}</button>
            <button onClick={()=>goTo(idx+1)} disabled={idx===drills.length-1} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:idx===drills.length-1?"rgba(255,255,255,0.15)":"#fff",borderRadius:12,padding:"16px 28px",cursor:idx===drills.length-1?"not-allowed":"pointer",fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:20}}>הבא →</button>
          </div>
          {nextDrill && <div style={{textAlign:"center",color:"rgba(255,255,255,0.2)",fontSize:15}}>הבא: <span style={{color:"rgba(255,255,255,0.45)",fontWeight:700}}>{nextDrill.name}</span></div>}
        </div>

        <div style={{width:isPersonal?420:340,flexShrink:0,display:"flex",flexDirection:"column",gap:14}}>
          {!isPersonal ? (
            <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,padding:"18px 20px",flex:1,display:"flex",flexDirection:"column"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <span style={{color:"rgba(255,255,255,0.3)",fontSize:12,letterSpacing:4,textTransform:"uppercase"}}>זוגות</span>
                <span style={{color:TYPE_COLOR[current.type],fontSize:13,fontWeight:700}}>{isPartner?(activeColor==="white"?"לבן עובד 🥋":activeColor==="blue"?"כחול עובד 🥋":"שניהם עובדים"):"כולם"}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:10,flex:1,justifyContent:"center"}}>
                {pairs.map(([wid,bid],pi) => {
                  const w=judokas.find(j=>j.id===wid), b=judokas.find(j=>j.id===bid);
                  return (
                    <div key={pi} style={{display:"flex",gap:8,alignItems:"stretch",height:90}}>
                      <div style={{flex:1,borderRadius:12,background:whiteActive?"linear-gradient(145deg,#d0d0d0 0%,#ffffff 100%)":"rgba(255,255,255,0.04)",border:whiteActive?"2px solid rgba(255,255,255,0.9)":"2px solid rgba(255,255,255,0.07)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,transition:"all 0.5s ease",boxShadow:whiteActive?"0 0 30px rgba(255,255,255,0.18)":"none"}}>
                        <span style={{fontSize:22}}>🥋</span>
                        <span style={{color:whiteActive?"#111":"rgba(255,255,255,0.22)",fontWeight:800,fontSize:17,transition:"color 0.5s"}}>{w?.name ?? "—"}</span>
                        {whiteActive && <span style={{fontSize:11,color:"rgba(0,0,0,0.45)",letterSpacing:2}}>עובד</span>}
                      </div>
                      <div style={{width:30,display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,0.18)",fontFamily:"monospace",fontSize:12}}>VS</div>
                      <div style={{flex:1,borderRadius:12,background:blueActive?"linear-gradient(145deg,#003b8e 0%,#1a5fd6 100%)":"rgba(255,255,255,0.04)",border:blueActive?"2px solid #1a5fd6":"2px solid rgba(255,255,255,0.07)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,transition:"all 0.5s ease",boxShadow:blueActive?"0 0 30px rgba(26,95,214,0.35)":"none"}}>
                        <span style={{fontSize:22}}>🥋</span>
                        <span style={{color:blueActive?"#fff":"rgba(255,255,255,0.22)",fontWeight:800,fontSize:17,transition:"color 0.5s"}}>{b?.name ?? "—"}</span>
                        {blueActive && <span style={{fontSize:11,color:"rgba(255,255,255,0.55)",letterSpacing:2}}>עובד</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(160,255,120,0.2)",borderRadius:16,padding:"18px 20px",flex:1,display:"flex",flexDirection:"column",animation:"slideIn 0.4s ease"}}>
              <div style={{color:"rgba(160,255,120,0.8)",fontSize:12,letterSpacing:4,textTransform:"uppercase",marginBottom:14}}>עבודה אישית</div>
              <div style={{display:"flex",flexDirection:"column",gap:8,flex:1,justifyContent:"center"}}>
                {judokas.map(j => {
                  const pt=personalTimers[j.id];
                  const drill=j.personalDrills?.[pt?.drillIdx??0];
                  const tl=pt?.timeLeft??drill?.duration??0;
                  const pctP=tl/(drill?.duration??1);
                  const urgP=pctP<0.25;
                  return (
                    <div key={j.id} style={{borderRadius:12,padding:"12px 16px",background:j.color==="white"?"linear-gradient(135deg,rgba(255,255,255,0.1),rgba(255,255,255,0.04))":"linear-gradient(135deg,rgba(26,95,214,0.2),rgba(0,59,142,0.1))",border:j.color==="white"?"1px solid rgba(255,255,255,0.25)":"1px solid rgba(26,95,214,0.45)",display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:j.color==="white"?"#ddd":"#1a5fd6",flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:"#fff",fontWeight:700,fontSize:16}}>{j.name}</div>
                        <div style={{color:"rgba(255,255,255,0.4)",fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{drill?.name??"—"}</div>
                      </div>
                      <div style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:28,color:urgP?"#ff3c3c":"#fff",minWidth:70,textAlign:"right"}}>{fmt(tl)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {modal==="drills"  && <DrillEditorModal  drills={drills} setDrills={d=>{setDrills(d);if(idx>=d.length){const ni=d.length-1;setIdx(ni);setTimeLeft(d[ni]?.duration??0);}else setTimeLeft(d[idx]?.duration??0);}} currentIndex={idx} onClose={()=>setModal(null)}/>}
      {modal==="judokas" && <JudokaManagerModal judokas={judokas} setJudokas={setJudokas} onClose={()=>setModal(null)}/>}
      {modal==="pairs"   && <PairEditorModal    pairs={pairs} judokas={judokas} onSave={setPairs} onClose={()=>setModal(null)}/>}
    </div>
  );
}

