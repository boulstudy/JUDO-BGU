'use client';

import { useState, useEffect } from "react";
import { supa, fmt, totalDrillTime } from "./shared";

// ── Workout Modal ─────────────────────────────────────────────────────────────
export default function WorkoutModal({ drills, judokas, onLoad, onClose }) {
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
    const r = await supa("workouts", { method:"POST", body:JSON.stringify({date:newDate,name:newName,drills,judokas,pairs:[]}) });
    if(r && r[0]) setWorkouts(prev=>[r[0],...prev]);
    setSaving(false);
    setNewName("");
  };

  const update = async (id) => {
    setUpdatingId(id);
    await supa("workouts?id=eq."+id, { method:"PATCH", body:JSON.stringify({drills,judokas,pairs:[]}) });
    setWorkouts(prev => prev.map(w => w.id===id ? {...w,drills,judokas,pairs:[]} : w));
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
