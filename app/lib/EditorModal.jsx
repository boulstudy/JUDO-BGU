'use client';

import { useState, useEffect } from "react";
import { supa, DRILL_SECTIONS, SEC_COLOR, fmt, totalDrillTime } from "./shared";
import { DrillForm } from "./ui";

// ── Editor Modal ──────────────────────────────────────────────────────────────
export default function EditorModal({ drills, setDrills, currentIndex, judokas, setJudokas, pairs, setPairs, onClose }) {
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
