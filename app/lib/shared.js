// Shared constants and pure data helpers.
// Used by the coach app, the projection screen and the tests alike.
//
// The Supabase client moved to ./supabase — it needs to report errors, and
// this module is imported by pure code that should not drag a client along.

export { SUPA_URL, SUPA_KEY, supa, supaOr, SupaError } from "./supabase";

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

// The clock lives in ./sessionEngine — pure, import-free and shared by the
// phone, the projection and the tests. Re-exported here so existing call sites
// keep one import, and `getDrillPhases` keeps its old name.
export {
  fmt,
  phasesOf,
  phasesOf as getDrillPhases,
  totalDrillTime,
  totalWorkoutTime,
  drillClockSignature,
} from "./sessionEngine";
