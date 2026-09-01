// Shared constants, data helpers and the Supabase REST client.
// Used by both the TV display (app/JudoTrainer.jsx) and the phone remote (app/remote).

export const SUPA_URL = "https://oakbpcjxjunppuyddpsj.supabase.co";
export const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ha2JwY2p4anVucHB1eWRkcHNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyOTcwOTIsImV4cCI6MjA5NTg3MzA5Mn0.EoYTL3N_P5C05VyR2-EFKcQUk3dcZSE3l3kWeADzQnE";

export const supa = async (path, opts = {}) => {
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

export const DRILL_SECTIONS = [
  { id:"warmup",    label:"חימום",   color:"#6ec6ff" },
  { id:"technique", label:"טכניקה",  color:"#FF6B00" },
  { id:"randori",   label:"קרבות",   color:"#ff4444" },
  { id:"strength",  label:"כוח",     color:"#a8ff78" },
  { id:"mixed",     label:"משולב",   color:"#ffb347" },
  { id:"rest",      label:"מנוחה",   color:"#88ccff" },
];
export const SEC_COLOR = Object.fromEntries(DRILL_SECTIONS.map(s => [s.id, s.color]));

export const PATTERNS = [
  { id:"alternate", label:"לסירוגין", desc:"לבן עובד, אחר כך כחול" },
  { id:"together",  label:"יחד",      desc:"שניהם עובדים" },
];
export const REST_TIMING = [
  { id:"none",        label:"ללא מנוחה פנימית" },
  { id:"after_each",  label:"אחרי כל עובד" },
  { id:"after_round", label:"אחרי כל סבב" },
];

export const fmt = s => {
  const neg = s < 0, abs = Math.abs(s);
  return (neg?"-":"") + String(Math.floor(abs/60)).padStart(2,"0") + ":" + String(abs%60).padStart(2,"0");
};

export function getDrillPhases(drill) {
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

export function totalDrillTime(drill) {
  return getDrillPhases(drill).reduce((a,p) => a+p.duration, 0);
}

// Signature of the clock layout of a drill. When this is unchanged there is no
// reason to reset the running phase/clock — lets the coach edit the workout
// mid-training without knocking the timer back to the start.
export function drillClockSignature(drill) {
  if (!drill) return "none";
  return String(drill.id) + "|" + getDrillPhases(drill).map(p => p.phase + p.who + p.duration).join(",");
}
