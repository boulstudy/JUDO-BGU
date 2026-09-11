const E = require("../../app/lib/sessionEngine.js");

const T0 = 1_700_000_000_000;          // a fixed "now" so tests read like arithmetic
const at = sec => T0 + sec * 1000;

const partner = (over = {}) => ({
  id: 2, name: "נאגה גדן", section: "technique", type: "partner",
  durationWork: 60, durationRest: 15, rounds: 2,
  pattern: "alternate", restTiming: "after_each", activeColor: "white",
  autoNext: true, ...over,
});
const group = (over = {}) => ({
  id: 1, name: "חימום", section: "warmup", type: "group",
  durationWork: 300, autoNext: true, ...over,
});
const rest = (over = {}) => ({
  id: 3, name: "מנוחה", section: "rest", type: "rest",
  durationWork: 60, autoNext: true, ...over,
});

describe("phases", () => {
  it("collapses a group drill to one phase", () => {
    eq(E.phasesOf(group()).length, 1);
    eq(E.totalDrillTime(group()), 300);
  });

  it("expands an alternating drill into work/rest per side per round", () => {
    // 2 rounds × (white 60, rest 15, blue 60, rest 15)
    const p = E.phasesOf(partner());
    eq(p.length, 8);
    eq(p.map(x => x.who), ["white","none","blue","none","white","none","blue","none"]);
    eq(E.totalDrillTime(partner()), 2 * (60 + 15 + 60 + 15));
  });

  it("drops internal rests when restTiming is none", () => {
    eq(E.phasesOf(partner({ restTiming: "none" })).length, 4);
  });

  it("rests once per round when restTiming is after_round", () => {
    const p = E.phasesOf(partner({ restTiming: "after_round" }));
    eq(p.map(x => x.phase), ["work","work","rest","work","work","rest"]);
  });

  it("ignores an empty drill instead of throwing", () => {
    eq(E.phasesOf(null), []);
    eq(E.totalDrillTime(undefined), 0);
  });
});

describe("clock signature", () => {
  it("survives a rename — the running clock must not reset", () => {
    eq(E.drillClockSignature(partner()), E.drillClockSignature(partner({ name: "שם אחר", note: "הערה" })));
  });
  it("changes when a duration changes", () => {
    ok(E.drillClockSignature(partner()) !== E.drillClockSignature(partner({ durationWork: 90 })));
  });
  it("changes when rounds change", () => {
    ok(E.drillClockSignature(partner()) !== E.drillClockSignature(partner({ rounds: 3 })));
  });
});

describe("cursor", () => {
  const drills = [group(), partner(), rest()];

  it("walks phases inside a drill", () => {
    const n = E.nextCursor(drills, { drillIdx: 1, phaseIdx: 0 }, {});
    eq([n.drillIdx, n.phaseIdx, n.ended], [1, 1, false]);
  });

  it("rolls into the next drill at the end when autoNext is on", () => {
    const n = E.nextCursor(drills, { drillIdx: 1, phaseIdx: 7 }, { globalAutoNext: true });
    eq([n.drillIdx, n.phaseIdx, n.newDrill], [2, 0, true]);
  });

  it("stops at the end of a drill when the drill opts out", () => {
    const d = [group(), partner({ autoNext: false }), rest()];
    const n = E.nextCursor(d, { drillIdx: 1, phaseIdx: 7 }, { globalAutoNext: true });
    eq(n.ended, true);
  });

  it("stops when the global switch is off, whatever the drill says", () => {
    const n = E.nextCursor(drills, { drillIdx: 0, phaseIdx: 0 }, { globalAutoNext: false });
    eq(n.ended, true);
  });

  it("ends at the last phase of the last drill", () => {
    const n = E.nextCursor(drills, { drillIdx: 2, phaseIdx: 0 }, { globalAutoNext: true });
    eq(n.ended, true);
  });

  it("clamps a cursor pointing past the end of the workout", () => {
    eq(E.clampCursor(drills, { drillIdx: 99, phaseIdx: 99 }), { drillIdx: 2, phaseIdx: 0 });
    eq(E.clampCursor(drills, { drillIdx: -5, phaseIdx: -5 }), { drillIdx: 0, phaseIdx: 0 });
    eq(E.clampCursor([], { drillIdx: 3, phaseIdx: 1 }), { drillIdx: 0, phaseIdx: 0 });
  });
});

describe("derivation", () => {
  const drills = [group(), partner(), rest()];
  const opts = { globalAutoNext: true };

  it("reads the stored remaining while paused, whatever the wall clock says", () => {
    const a = E.makeAnchor({ drillIdx: 0, phaseIdx: 0, running: false, remaining: 120, at: T0 });
    eq(E.project(drills, a, opts, at(9999)).timeLeft, 120);
  });

  it("counts down from the anchor while running", () => {
    const a = E.anchorAtCursor(drills, { drillIdx: 0, phaseIdx: 0 }, { running: true, now: T0 });
    near(E.project(drills, a, opts, at(10)).timeLeft, 290);
    near(E.project(drills, a, opts, at(299.5)).timeLeft, 0.5);
  });

  it("does not drift — one long derivation equals the sum of its parts", () => {
    const a = E.anchorAtCursor(drills, { drillIdx: 0, phaseIdx: 0 }, { running: true, now: T0 });
    const once = E.project(drills, a, opts, at(287));
    // Re-anchoring every second the way a ticking screen would must land identically.
    let step = a;
    for (let s = 1; s <= 287; s++) step = E.reanchor(drills, step, opts, at(s));
    const many = E.project(drills, step, opts, at(287));
    eq([many.drillIdx, many.phaseIdx], [once.drillIdx, once.phaseIdx]);
    near(many.timeLeft, once.timeLeft, 0.0001, "re-anchoring 287 times must not accumulate error");
  });

  it("catches up across a boundary it slept through", () => {
    // 300s warmup, then the partner drill's first phase (60s white).
    const a = E.anchorAtCursor(drills, { drillIdx: 0, phaseIdx: 0 }, { running: true, now: T0 });
    const p = E.project(drills, a, opts, at(310));
    eq([p.drillIdx, p.phaseIdx], [1, 0]);
    near(p.timeLeft, 50);
    eq(p.crossed, 1);
  });

  it("catches up across many boundaries after a long silence", () => {
    // The projection heard nothing for the whole warmup plus most of the
    // partner drill — the case that decides whether a dead phone is survivable.
    const a = E.anchorAtCursor(drills, { drillIdx: 0, phaseIdx: 0 }, { running: true, now: T0 });
    const p = E.project(drills, a, opts, at(300 + 60 + 15 + 60 + 15 + 10));
    eq([p.drillIdx, p.phaseIdx], [1, 4]);
    near(p.timeLeft, 50);
  });

  it("stops at the end of the workout instead of running negative", () => {
    const a = E.anchorAtCursor(drills, { drillIdx: 2, phaseIdx: 0 }, { running: true, now: T0 });
    const p = E.project(drills, a, opts, at(9999));
    eq([p.ended, p.running, p.timeLeft], [true, false, 0]);
  });

  it("accumulates total elapsed across boundaries", () => {
    const a = E.anchorAtCursor(drills, { drillIdx: 0, phaseIdx: 0 }, { running: true, now: T0 });
    near(E.project(drills, a, opts, at(400)).totalElapsed, 400);
  });

  it("survives a zero-length phase without spinning", () => {
    const weird = [partner({ durationWork: 0, durationRest: 0, rounds: 3 }), rest()];
    const a = E.anchorAtCursor(weird, { drillIdx: 0, phaseIdx: 0 }, { running: true, now: T0 });
    const p = E.project(weird, a, { globalAutoNext: true }, at(5));
    eq(p.drillIdx, 1);
    near(p.timeLeft, 55);
  });
});

describe("controls", () => {
  const drills = [group(), partner(), rest()];
  const opts = { globalAutoNext: true };

  it("pause freezes the clock where it stood", () => {
    const a = E.anchorAtCursor(drills, { drillIdx: 0, phaseIdx: 0 }, { running: true, now: T0 });
    const paused = E.pause(drills, a, opts, at(40));
    near(paused.remaining, 260);
    eq(E.project(drills, paused, opts, at(4000)).timeLeft, paused.remaining);
  });

  it("play resumes from where pause left it", () => {
    const a = E.pause(drills, E.anchorAtCursor(drills, { drillIdx: 0, phaseIdx: 0 }, { running: true, now: T0 }), opts, at(40));
    const resumed = E.play(drills, a, opts, at(1000));
    near(E.project(drills, resumed, opts, at(1010)).timeLeft, 250);
  });

  it("adding time extends the phase without moving the cursor", () => {
    const a = E.anchorAtCursor(drills, { drillIdx: 1, phaseIdx: 0 }, { running: true, now: T0 });
    const more = E.addTime(drills, a, opts, at(10), 30);
    near(E.project(drills, more, opts, at(10)).timeLeft, 80);
    eq(E.project(drills, more, opts, at(10)).phaseIdx, 0);
  });

  it("removing more time than is left floors at zero, not below", () => {
    const a = E.anchorAtCursor(drills, { drillIdx: 1, phaseIdx: 0 }, { running: false, now: T0 });
    eq(E.addTime(drills, a, opts, T0, -9999).remaining, 0);
  });

  it("reset restarts the current phase", () => {
    const a = E.anchorAtCursor(drills, { drillIdx: 1, phaseIdx: 0 }, { running: true, now: T0 });
    near(E.resetPhase(drills, a, opts, at(45)).remaining, 60);
  });

  it("skip moves on and keeps running", () => {
    const a = E.anchorAtCursor(drills, { drillIdx: 1, phaseIdx: 0 }, { running: true, now: T0 });
    const s = E.skipPhase(drills, a, opts, at(5));
    eq([s.drillIdx, s.phaseIdx, s.running], [1, 1, true]);
    near(s.remaining, 15);
  });

  it("stepping to another drill lands at its first phase", () => {
    eq(E.stepDrill(drills, { drillIdx: 1, phaseIdx: 5 }, 1), { drillIdx: 2, phaseIdx: 0 });
    eq(E.stepDrill(drills, { drillIdx: 0, phaseIdx: 0 }, -1), { drillIdx: 0, phaseIdx: 0 });
  });
});

describe("editing mid-session", () => {
  const opts = { globalAutoNext: true };

  it("a rename leaves the running clock alone", () => {
    const before = [group(), partner()];
    const after  = [group(), partner({ name: "שם חדש", note: "משהו" })];
    const a = E.anchorAtCursor(before, { drillIdx: 1, phaseIdx: 2 }, { running: true, now: T0 });
    const r = E.reconcileEdit(before, after, a, opts, at(20));
    near(E.project(after, r, opts, at(20)).timeLeft, 40, 0.001);
    eq([r.drillIdx, r.phaseIdx], [1, 2]);
  });

  it("editing a later drill leaves the running clock alone", () => {
    const before = [group(), partner(), rest()];
    const after  = [group(), partner(), rest({ durationWork: 999 })];
    const a = E.anchorAtCursor(before, { drillIdx: 1, phaseIdx: 0 }, { running: true, now: T0 });
    const r = E.reconcileEdit(before, after, a, opts, at(25));
    near(E.project(after, r, opts, at(25)).timeLeft, 35);
  });

  it("changing the current drill's timing restarts its phase", () => {
    const before = [group(), partner()];
    const after  = [group(), partner({ durationWork: 90 })];
    const a = E.anchorAtCursor(before, { drillIdx: 1, phaseIdx: 0 }, { running: true, now: T0 });
    const r = E.reconcileEdit(before, after, a, opts, at(20));
    near(r.remaining, 90);
    eq(r.running, true, "an edit must not silently pause the session");
  });

  it("keeps the session's total elapsed across a resetting edit", () => {
    const before = [group(), partner()];
    const after  = [group(), partner({ rounds: 5 })];
    const a = E.anchorAtCursor(before, { drillIdx: 1, phaseIdx: 0 }, { running: true, elapsed: 300, now: T0 });
    near(E.reconcileEdit(before, after, a, opts, at(20)).elapsed, 320);
  });
});

describe("clock skew", () => {
  it("takes the median of the tightest round trips", () => {
    const samples = [
      E.offsetSample({ sentAt: 0,  remoteAt: 5000, recvAt: 20 }),   // ~5000
      E.offsetSample({ sentAt: 0,  remoteAt: 5010, recvAt: 30 }),   // ~4995
      E.offsetSample({ sentAt: 0,  remoteAt: 9000, recvAt: 4000 }), // wild, slow rtt
    ];
    near(E.estimateOffset(samples), 4995, 20);
  });

  it("is zero with nothing to go on", () => eq(E.estimateOffset([]), 0));

  it("shifting an anchor by the offset makes a skewed clock agree", () => {
    // The phone's clock runs 7s ahead of the TV's.
    const OFFSET = 7000;
    const drills = [group()];
    const phoneAnchor = E.anchorAtCursor(drills, { drillIdx: 0, phaseIdx: 0 }, { running: true, now: T0 + OFFSET });
    const shifted = E.shiftAnchor(phoneAnchor, OFFSET);
    // 10 real seconds later, both must read the same time left.
    near(E.project(drills, phoneAnchor, {}, T0 + OFFSET + 10000).timeLeft,
         E.project(drills, shifted,     {}, T0 + 10000).timeLeft, 0.0001);
  });
});

describe("formatting", () => {
  it("pads to mm:ss", () => { eq(E.fmt(0), "00:00"); eq(E.fmt(9), "00:09"); eq(E.fmt(65), "01:05"); eq(E.fmt(600), "10:00"); });
  it("shows a fractional second as its ceiling, like a stopwatch", () => eq(E.fmt(59.4), "01:00"));
  it("marks negative time", () => eq(E.fmt(-5), "-00:05"));
});
