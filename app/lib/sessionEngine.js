// The training clock, as pure functions.
//
// Deliberately free of imports, React and browser globals. Three consumers run
// this exact code and must agree on every result:
//   • the coach's phone, which owns the session and publishes anchors
//   • the projection screen, which keeps counting when the phone goes quiet
//   • the unit tests, which require() this file straight from Node
//
// Nothing here counts seconds. A running clock is an *anchor* — "this much was
// left at this wall-clock instant" — and the time left is derived from it on
// demand. That is what lets the projection stay correct through a locked
// phone, a dropped connection or a backgrounded tab: it never needed the ticks
// in the first place, so it has nothing to miss.

// ── formatting ───────────────────────────────────────────────────────────────

export const fmt = s => {
  const neg = s < 0, abs = Math.abs(Math.ceil(s - 1e-6));
  return (neg ? "-" : "") +
    String(Math.floor(abs / 60)).padStart(2, "0") + ":" +
    String(abs % 60).padStart(2, "0");
};

// ── drill → phases ───────────────────────────────────────────────────────────

export function phasesOf(drill) {
  if (!drill) return [];
  if (drill.type === "rest" || drill.type === "group" || drill.type === "personal") {
    return [{
      phase: "work", who: "both",
      duration: drill.durationWork || 60,
      label: drill.type === "rest" ? "מנוחה" : "עבודה",
    }];
  }
  const {
    durationWork = 60, durationRest = 0, rounds = 1,
    pattern = "together", restTiming = "none", activeColor = "both",
  } = drill;
  const phases = [];
  for (let r = 0; r < rounds; r++) {
    if (pattern === "together") {
      phases.push({ phase: "work", who: "both", duration: durationWork, label: "שניהם עובדים", round: r + 1 });
      if (restTiming !== "none" && durationRest > 0) {
        phases.push({ phase: "rest", who: "none", duration: durationRest, label: "מנוחה" });
      }
    } else {
      const first  = activeColor === "blue" ? "blue" : "white";
      const second = first === "white" ? "blue" : "white";
      phases.push({ phase: "work", who: first,  duration: durationWork, label: first === "white" ? "לבן עובד" : "כחול עובד", round: r + 1 });
      if (restTiming === "after_each" && durationRest > 0) {
        phases.push({ phase: "rest", who: "none", duration: durationRest, label: "מנוחה" });
      }
      phases.push({ phase: "work", who: second, duration: durationWork, label: second === "white" ? "לבן עובד" : "כחול עובד", round: r + 1 });
      if ((restTiming === "after_each" || restTiming === "after_round") && durationRest > 0) {
        phases.push({ phase: "rest", who: "none", duration: durationRest, label: "מנוחה" });
      }
    }
  }
  return phases;
}

export const totalDrillTime = drill =>
  phasesOf(drill).reduce((a, p) => a + p.duration, 0);

export const totalWorkoutTime = drills =>
  (drills || []).reduce((a, d) => a + totalDrillTime(d), 0);

// Identifies the clock layout of a drill: which phases, in what order, for how
// long. Renaming a drill or editing its note leaves this untouched, which is
// what lets the coach edit the workout mid-training without the running clock
// jumping back to the start.
export function drillClockSignature(drill) {
  if (!drill) return "none";
  return String(drill.id) + "|" +
    phasesOf(drill).map(p => p.phase + p.who + p.duration).join(",");
}

export const workoutClockSignature = drills =>
  (drills || []).map(drillClockSignature).join(";");

// ── cursor ───────────────────────────────────────────────────────────────────

const FALLBACK_PHASE = { phase: "work", who: "both", duration: 60, label: "עבודה" };

export function clampCursor(drills, cursor) {
  const list = drills || [];
  if (!list.length) return { drillIdx: 0, phaseIdx: 0 };
  const drillIdx = Math.min(Math.max(0, (cursor && cursor.drillIdx) | 0), list.length - 1);
  const phases = phasesOf(list[drillIdx]);
  const phaseIdx = Math.min(Math.max(0, (cursor && cursor.phaseIdx) | 0), Math.max(0, phases.length - 1));
  return { drillIdx, phaseIdx };
}

export function phaseAt(drills, cursor) {
  const c = clampCursor(drills, cursor);
  const phases = phasesOf((drills || [])[c.drillIdx]);
  return phases[c.phaseIdx] || FALLBACK_PHASE;
}

export const phaseDurationAt = (drills, cursor) => phaseAt(drills, cursor).duration || 0;

/**
 * Where the session goes when the current phase runs out.
 * `ended` means the workout has nowhere left to advance to and should stop.
 */
export function nextCursor(drills, cursor, { globalAutoNext = true } = {}) {
  const list = drills || [];
  const c = clampCursor(list, cursor);
  const drill = list[c.drillIdx];
  const phases = phasesOf(drill);

  if (c.phaseIdx + 1 < phases.length) {
    return { drillIdx: c.drillIdx, phaseIdx: c.phaseIdx + 1, ended: false, newDrill: false };
  }
  const autoNext = globalAutoNext && drill && drill.autoNext;
  if (autoNext && c.drillIdx + 1 < list.length) {
    return { drillIdx: c.drillIdx + 1, phaseIdx: 0, ended: false, newDrill: true };
  }
  return { drillIdx: c.drillIdx, phaseIdx: c.phaseIdx, ended: true, newDrill: false };
}

export function stepDrill(drills, cursor, dir) {
  const list = drills || [];
  const c = clampCursor(list, cursor);
  const target = c.drillIdx + dir;
  if (target < 0 || target >= list.length) return c;
  return { drillIdx: target, phaseIdx: 0 };
}

// ── the anchor ───────────────────────────────────────────────────────────────
//
// { drillIdx, phaseIdx, running, remaining, at, elapsed }
//
//   remaining — seconds left in the current phase, true as of `at`
//   at        — wall clock (ms) that `remaining` and `elapsed` describe
//   elapsed   — total session seconds, true as of `at`
//
// While paused, `remaining` is simply the answer. While running, it is the
// starting point the derivation counts down from.

export function makeAnchor({
  drillIdx = 0, phaseIdx = 0, running = false,
  remaining = 0, elapsed = 0, at = 0,
}) {
  return { drillIdx, phaseIdx, running: !!running, remaining, elapsed, at };
}

export function anchorAtCursor(drills, cursor, { running = false, elapsed = 0, now = 0 } = {}) {
  const c = clampCursor(drills, cursor);
  return makeAnchor({ ...c, running, remaining: phaseDurationAt(drills, c), elapsed, at: now });
}

// Re-anchor to right now without changing what the clock currently reads.
// Every mutation goes through this, so a paused clock never silently resumes
// and a running one never loses the seconds it already spent.
export function reanchor(drills, anchor, opts, now, changes = {}) {
  const p = project(drills, anchor, opts, now);
  return makeAnchor({
    drillIdx: p.drillIdx,
    phaseIdx: p.phaseIdx,
    running:  p.running,
    remaining: p.timeLeft,
    elapsed:  p.totalElapsed,
    at: now,
    ...changes,
  });
}

export const play  = (drills, anchor, opts, now) => reanchor(drills, anchor, opts, now, { running: true });
export const pause = (drills, anchor, opts, now) => reanchor(drills, anchor, opts, now, { running: false });

export function addTime(drills, anchor, opts, now, seconds) {
  const a = reanchor(drills, anchor, opts, now);
  return makeAnchor({ ...a, remaining: Math.max(0, a.remaining + seconds) });
}

// Restart the current phase from the top.
export function resetPhase(drills, anchor, opts, now) {
  const a = reanchor(drills, anchor, opts, now);
  return makeAnchor({ ...a, remaining: phaseDurationAt(drills, a) });
}

export function gotoCursor(drills, anchor, opts, now, cursor, { keepRunning = true } = {}) {
  const a = reanchor(drills, anchor, opts, now);
  const c = clampCursor(drills, cursor);
  return makeAnchor({
    ...c,
    running: keepRunning ? a.running : false,
    remaining: phaseDurationAt(drills, c),
    elapsed: a.elapsed,
    at: now,
  });
}

export function skipPhase(drills, anchor, opts, now) {
  const a = reanchor(drills, anchor, opts, now);
  const nx = nextCursor(drills, a, opts);
  if (nx.ended) return makeAnchor({ ...a, running: false, remaining: 0 });
  return gotoCursor(drills, a, opts, now, nx);
}

// ── derivation ───────────────────────────────────────────────────────────────

// A phase of zero length would otherwise let the catch-up loop spin forever.
const MAX_CATCHUP_STEPS = 5000;

/**
 * What the clock reads at `now`, given an anchor.
 *
 * Crucially this rolls *forward across phase boundaries the elapsed time has
 * already passed*, so a screen that heard nothing for four minutes lands on the
 * right drill rather than sitting at 00:00 or one phase behind.
 *
 * @returns {{drillIdx, phaseIdx, timeLeft, running, totalElapsed, ended, crossed}}
 */
export function project(drills, anchor, opts = {}, now = 0) {
  const list = drills || [];
  const a = anchor || makeAnchor({});
  let { drillIdx, phaseIdx } = clampCursor(list, a);

  if (!a.running) {
    return {
      drillIdx, phaseIdx,
      timeLeft: Math.max(0, a.remaining),
      running: false,
      totalElapsed: a.elapsed,
      ended: false,
      crossed: 0,
    };
  }

  const since = Math.max(0, (now - a.at) / 1000);
  let left = a.remaining - since;
  const totalElapsed = a.elapsed + since;
  let crossed = 0;

  while (left <= 0 && crossed < MAX_CATCHUP_STEPS) {
    const nx = nextCursor(list, { drillIdx, phaseIdx }, opts);
    if (nx.ended) {
      return { drillIdx, phaseIdx, timeLeft: 0, running: false, totalElapsed, ended: true, crossed };
    }
    drillIdx = nx.drillIdx;
    phaseIdx = nx.phaseIdx;
    crossed++;
    const dur = phaseDurationAt(list, { drillIdx, phaseIdx });
    if (dur <= 0) continue;          // zero-length phase: step over it
    left += dur;
  }

  return {
    drillIdx, phaseIdx,
    timeLeft: Math.max(0, left),
    running: true,
    totalElapsed,
    ended: false,
    crossed,
  };
}

// Seconds shown on a countdown. Rounding up means 59.3 reads "01:00" for the
// last fraction of its second, the way a stopwatch does, instead of skipping.
export const displaySeconds = timeLeft => Math.max(0, Math.ceil(timeLeft - 1e-6));

/**
 * Keeps a running clock pinned to the same phase layout across an edit.
 *
 * Returns the anchor unchanged when the edit did not touch the current drill's
 * timing (a rename, a note, a change to a later drill), and a fresh anchor at
 * the top of the phase when it did.
 */
export function reconcileEdit(prevDrills, nextDrills, anchor, opts, now) {
  const c = clampCursor(nextDrills, anchor);
  const before = drillClockSignature((prevDrills || [])[anchor ? anchor.drillIdx : 0]);
  const after  = drillClockSignature((nextDrills || [])[c.drillIdx]);
  if (before === after) return reanchor(nextDrills, anchor, opts, now);
  return makeAnchor({
    ...c,
    running: anchor ? anchor.running : false,
    remaining: phaseDurationAt(nextDrills, c),
    elapsed: anchor ? project(prevDrills, anchor, opts, now).totalElapsed : 0,
    at: now,
  });
}

// ── clock skew between devices ───────────────────────────────────────────────
//
// Two phones and a smart TV rarely agree on the wall clock, and an anchor is
// meaningless in the wrong frame of reference. Each side measures the offset
// from round trips and shifts incoming anchors into its own clock.

export function estimateOffset(samples) {
  const usable = (samples || []).filter(s => s && isFinite(s.offset));
  if (!usable.length) return 0;
  // Prefer the samples with the tightest round trip — those bound the error.
  const best = usable.slice().sort((x, y) => (x.rtt || 0) - (y.rtt || 0)).slice(0, 5);
  const offsets = best.map(s => s.offset).sort((x, y) => x - y);
  return offsets[Math.floor(offsets.length / 2)];
}

// offset = how far the remote clock is ahead of ours.
export const offsetSample = ({ sentAt, remoteAt, recvAt }) => ({
  rtt: recvAt - sentAt,
  offset: remoteAt - (sentAt + (recvAt - sentAt) / 2),
});

export const shiftAnchor = (anchor, offset) =>
  !anchor ? anchor : { ...anchor, at: anchor.at - (offset || 0) };
