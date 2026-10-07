// Drills built from steps — the model behind the workout builder.
//
// A drill is a list of nodes. A node is either
//   { type:"step",  id, kind:"work"|"rest", who:"both"|"white"|"blue", duration, label? }
//   { type:"group", id, name, repeat, steps:[node…] }        ← a drill inside a drill
//
// Groups may nest and repeat. The clock engine never sees any of this: a drill
// with `steps` is flattened to the same phase list the older parametric drills
// produce (getDrillPhases in shared.js), so the TV, the phone and /solo run both
// kinds with the same code.

let counter = 0;
export const uid = () => Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 5);

export const WHO_LABEL = { both: "שניהם", white: "לבן", blue: "כחול" };

export function makeStep(kind = "work", who = "both", duration = 60, label = "") {
  return { type: "step", id: uid(), kind, who: kind === "rest" ? "none" : who, duration, label };
}
export function makeGroup(name = "חזרות", repeat = 3, steps = []) {
  return { type: "group", id: uid(), name, repeat, steps };
}

export function stepLabel(n) {
  if (n.label) return n.label;
  if (n.kind === "rest") return "מנוחה";
  if (n.who === "white") return "לבן עובד";
  if (n.who === "blue") return "כחול עובד";
  return "שניהם עובדים";
}

/** Nodes → the flat phase list the clock runs. */
export function stepsToPhases(nodes, ctx) {
  const out = [];
  (nodes || []).forEach(n => {
    if (n.type === "group") {
      const rep = Math.max(1, Math.floor(n.repeat) || 1);
      for (let r = 1; r <= rep; r++) out.push(...stepsToPhases(n.steps, { round: r, rounds: rep }));
    } else {
      const rest = n.kind === "rest";
      const ph = {
        phase: rest ? "rest" : "work",
        who: rest ? "none" : (n.who || "both"),
        duration: Math.max(1, Math.floor(n.duration) || 1),
        label: stepLabel(n),
      };
      if (ctx) { ph.round = ctx.round; ph.rounds = ctx.rounds; }
      out.push(ph);
    }
  });
  return out;
}

export const totalSteps = nodes => stepsToPhases(nodes).reduce((a, p) => a + p.duration, 0);

/** Deep copy with fresh ids, so a catalog entry dropped twice stays two things. */
export function cloneNodes(nodes) {
  return (nodes || []).map(n => n.type === "group"
    ? { ...n, id: uid(), steps: cloneNodes(n.steps) }
    : { ...n, id: uid() });
}

/** A parametric (older) drill expressed as steps — same phases, now editable per step. */
export function drillToSteps(drill, getPhases) {
  return getPhases(drill).map(p => makeStep(p.phase === "rest" ? "rest" : "work", p.who === "none" ? "both" : p.who, p.duration, ""));
}

/** Wrap steps as a drill the workout can hold (fields kept for the older UIs). */
export function makeStepsDrill({ name, section = "technique", steps = [], note = "", sourceId = null, autoNext = true }) {
  const total = totalSteps(steps);
  return {
    id: uid(), name, section, type: "steps", steps, note, sourceId, autoNext,
    durationWork: total, durationRest: 0, rounds: 1, pattern: "together", restTiming: "none", activeColor: "both",
  };
}

// ── tree edits, addressed by a path of indexes ([2, 0] = 1st child of the 3rd node) ──
export function getAt(nodes, path) {
  let list = nodes;
  for (const i of path) list = list[i].steps;
  return list;
}
const withList = (nodes, path, fn) => {
  if (!path.length) return fn(nodes);
  const [i, ...rest] = path;
  return nodes.map((n, k) => k === i ? { ...n, steps: withList(n.steps, rest, fn) } : n);
};
export const insertAt = (nodes, path, index, node) =>
  withList(nodes, path, list => { const a = [...list]; a.splice(Math.max(0, Math.min(index, a.length)), 0, node); return a; });
export const removeAt = (nodes, path, index) =>
  withList(nodes, path, list => list.filter((_, k) => k !== index));
export const updateAt = (nodes, path, index, patch) =>
  withList(nodes, path, list => list.map((n, k) => k === index ? { ...n, ...patch } : n));
export const moveWithin = (nodes, path, from, to) =>
  withList(nodes, path, list => { const a = [...list]; const [it] = a.splice(from, 1); a.splice(Math.max(0, Math.min(to, a.length)), 0, it); return a; });

export const fmtDur = s => String(Math.floor(s / 60)).padStart(1, "0") + ":" + String(s % 60).padStart(2, "0");
export function parseDur(text) {
  const t = String(text).trim();
  if (/^\d+$/.test(t)) return Math.max(1, parseInt(t, 10));
  const m = t.match(/^(\d+):(\d{1,2})$/);
  return m ? Math.max(1, parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) : null;
}
