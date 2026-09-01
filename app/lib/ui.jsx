'use client';

// Reusable form controls shared by the TV editor and the phone remote.

import { useEffect, useRef } from "react";
import { DRILL_SECTIONS, PATTERNS, REST_TIMING, fmt, totalDrillTime } from "./shared";

// ── Time Picker ───────────────────────────────────────────────────────────────
export function TimeWheel({ value, onChange, max, label }) {
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

export function TimePicker({ seconds, onChange }) {
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
export function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{width:44,height:24,borderRadius:12,background:value?"#FF6B00":"rgba(255,255,255,0.1)",cursor:"pointer",position:"relative",transition:"background 0.3s",border:"1px solid rgba(255,255,255,0.15)",flexShrink:0}}>
      <div style={{position:"absolute",top:2,left:value?22:2,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left 0.3s"}}/>
    </div>
  );
}

// ── Drill Form ────────────────────────────────────────────────────────────────
export function DrillForm({ drill, onChange, onCancel, onSave, onSaveToLibrary, saveLabel }) {
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

      <div style={{display:"flex",gap:8,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap"}}>
        <div style={{color:"rgba(255,255,255,0.25)",fontSize:12}}>סה״כ: {fmt(totalDrillTime(d))}</div>
        <div style={{display:"flex",gap:8}}>
          {onSaveToLibrary && <button onClick={onSaveToLibrary} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.45)",borderRadius:8,padding:"7px 12px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:12}}>📚 ספרייה</button>}
          <button onClick={onCancel} style={{background:"none",border:"1px solid rgba(255,255,255,0.12)",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontSize:13}}>ביטול</button>
          <button onClick={onSave} style={{background:"#FF6B00",border:"none",color:"#fff",borderRadius:8,padding:"7px 18px",cursor:"pointer",fontFamily:"Heebo,sans-serif",fontWeight:700,fontSize:14}}>{saveLabel || "שמור"}</button>
        </div>
      </div>
    </div>
  );
}
