// ── Wire protocol between the TV display and the phone remote ────────────────
//
// TV → remote
//   { t:"tick", rev, s:{ drillIdx, phaseIdx, timeLeft, running, totalElapsed, at } }
//       Sent on every clock change and as an idle heartbeat. `rev` counts the
//       heavy state (drills/judokas/pairs/notes/settings); when the remote sees
//       a rev it does not have, it asks for a full snapshot.
//   { t:"full", rev, s:{...tick state}, d:{ drills, judokas, pairs, notes,
//                                           globalAutoNext, soundType, projection } }
//   { t:"bye" }                    TV is going away
//
// remote → TV
//   { t:"hello" }                  asks for a full snapshot
//   { t:"ping" }                   keeps the "remote connected" light on
//   { t:"cmd", c, ... }            acts immediately, see COMMANDS below
//   { t:"apply", patch, then }     applies staged edits, optionally then plays
//   { t:"bye" }
//
// Everything the coach does on the phone stays on the phone until it is sent as
// an "apply" (or as the play command, which carries the pending patch with it).

export const COMMANDS = {
  PLAY:      "play",
  PAUSE:     "pause",
  RESET:     "reset",       // restart the current phase
  NEXT_PHASE:"nextPhase",
  PREV_DRILL:"prevDrill",
  NEXT_DRILL:"nextDrill",
  ADD_TIME:  "addTime",     // { seconds }
  GOTO:      "goto",        // { drillIdx, phaseIdx }
};

// TV emits a heartbeat at least this often, so the remote can tell it is alive.
export const TICK_IDLE_MS   = 2000;
// Remote pings this often, so the TV can show "remote connected".
export const PING_MS        = 3000;
// A peer that has not been heard from for this long is considered gone.
export const PEER_TIMEOUT_MS = 8000;

// Keys of the heavy state a patch may carry.
export const PATCH_KEYS = [
  "drills", "judokas", "pairs", "notes",
  "globalAutoNext", "soundType", "projection",
  "drillIdx", "phaseIdx", "timeLeft",
];

export function pickPatch(obj) {
  const out = {};
  if (!obj) return out;
  PATCH_KEYS.forEach(k => { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}
