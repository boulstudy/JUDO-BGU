'use client';

// The coach's data, phase 2.
//
// Local-first on purpose. A hall has bad reception, and the one thing that must
// never happen is a coach standing in front of fifteen athletes unable to open
// tonight's plan because a request is hanging. So localStorage is the source of
// truth for reads, and the network is a best-effort mirror behind it.
//
// The seam for phase 3: every function here is either local-only or calls
// pushRemote/pullRemote. When auth and the club schema land, those two move to
// the new tables and everything above them stays as it is.

import { useState, useEffect, useCallback, useRef } from "react";
import { supa, supaOr } from "./supabase";
import { notifyError } from "./notify";
import { read, write, KEYS } from "./persist";
import { localDate } from "./localDate";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ── seeds ────────────────────────────────────────────────────────────────────
// A brand-new coach opening the app to a blank screen has nothing to react to,
// so the first run starts from a real session rather than an empty list.

export const SEED_DRILLS = [
  { id: "d-warm", name: "חימום כללי", section: "warmup", type: "group", durationWork: 300, durationRest: 0, rounds: 1, pattern: "together", restTiming: "none", activeColor: "both", note: "ריצה + תנועתיות", autoNext: true },
  { id: "d-uchi", name: "אוצ׳יקומי", section: "technique", type: "partner", durationWork: 60, durationRest: 15, rounds: 4, pattern: "alternate", restTiming: "after_each", activeColor: "white", note: "כניסות בלבד", autoNext: true },
  { id: "d-nage", name: "נאגה קומי", section: "technique", type: "partner", durationWork: 90, durationRest: 30, rounds: 3, pattern: "alternate", restTiming: "after_each", activeColor: "white", note: "זריקה מלאה", autoNext: true },
  { id: "d-rest", name: "מנוחה", section: "rest", type: "rest", durationWork: 90, durationRest: 0, rounds: 1, pattern: "together", restTiming: "none", activeColor: "both", note: "", autoNext: true },
  { id: "d-rand", name: "ראנדורי עמידה", section: "randori", type: "partner", durationWork: 240, durationRest: 60, rounds: 4, pattern: "together", restTiming: "after_round", activeColor: "both", note: "", autoNext: false },
  { id: "d-ne",   name: "ראנדורי קרקע", section: "randori", type: "partner", durationWork: 180, durationRest: 45, rounds: 3, pattern: "together", restTiming: "after_round", activeColor: "both", note: "", autoNext: false },
  { id: "d-str",  name: "כוח וליבה", section: "strength", type: "group", durationWork: 300, durationRest: 0, rounds: 1, pattern: "together", restTiming: "none", activeColor: "both", note: "", autoNext: true },
];

const SEED_GROUP = () => ({
  id: uid(),
  name: "נבחרת בוגרים",
  color: "#FF6B00",
  athletes: [
    { id: uid(), name: "יואב כ׳", color: "white", belt: "" },
    { id: uid(), name: "ניר ל׳",  color: "blue",  belt: "" },
    { id: uid(), name: "שיר מ׳",  color: "white", belt: "" },
    { id: uid(), name: "תום א׳",  color: "blue",  belt: "" },
  ],
  pairs: [],
});

const SEED_PLAN = group => ({
  id: uid(),
  name: "אימון ערב",
  groupId: group ? group.id : null,
  drills: [
    { ...SEED_DRILLS[0], id: uid() },
    { ...SEED_DRILLS[1], id: uid() },
    { ...SEED_DRILLS[3], id: uid() },
    { ...SEED_DRILLS[4], id: uid() },
  ],
  visibility: "shared",
  updatedAt: Date.now(),
});

// ── a persisted list ─────────────────────────────────────────────────────────

function useCollection(storeKey, seed) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const existing = read(storeKey, null);
    if (existing && Array.isArray(existing)) { setItems(existing); setLoaded(true); return; }
    const initial = typeof seed === "function" ? seed() : (seed || []);
    setItems(initial);
    write(storeKey, initial);
    setLoaded(true);
    // seed is intentionally not a dependency: it only ever runs on first open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);

  const commit = useCallback(next => {
    setItems(next);
    write(storeKey, next);
    return next;
  }, [storeKey]);

  const add = useCallback(item => {
    // Spread first, id last: a caller passing a stale or null id (a fresh
    // plan built as { id: null, ... }) must not shadow the generated one.
    const withId = { ...item, id: uid() };
    setItems(prev => { const next = [withId, ...prev]; write(storeKey, next); return next; });
    return withId;
  }, [storeKey]);

  const update = useCallback((id, patch) => {
    setItems(prev => {
      const next = prev.map(i => (i.id === id ? { ...i, ...patch, updatedAt: Date.now() } : i));
      write(storeKey, next);
      return next;
    });
  }, [storeKey]);

  const remove = useCallback(id => {
    // Archive rather than delete: history points at plans, and a coach who
    // deletes last month's plan should not lose last month's session with it.
    setItems(prev => {
      const next = prev.map(i => (i.id === id ? { ...i, archivedAt: Date.now() } : i));
      write(storeKey, next);
      return next;
    });
  }, [storeKey]);

  const restore = useCallback(id => {
    setItems(prev => {
      const next = prev.map(i => (i.id === id ? { ...i, archivedAt: null } : i));
      write(storeKey, next);
      return next;
    });
  }, [storeKey]);

  const live = items.filter(i => !i.archivedAt);
  return { items, live, loaded, add, update, remove, restore, commit };
}

export const useGroups  = () => useCollection(KEYS.groups,  () => [SEED_GROUP()]);
export const useCatalog = () => useCollection(KEYS.catalog, () => SEED_DRILLS.map(d => ({ ...d, id: uid(), visibility: "shared" })));

export function usePlans(groups) {
  const col = useCollection(KEYS.plans, () => []);
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !col.loaded || col.items.length || !groups || !groups.length) return;
    seeded.current = true;
    col.commit([SEED_PLAN(groups[0])]);
  }, [col, groups]);
  return col;
}

// ── history ──────────────────────────────────────────────────────────────────
//
// A session is written when it starts and closed when it ends, so a training
// that was abandoned halfway still leaves a record. The drills are stored as a
// copy on purpose: editing the plan next week must not rewrite what happened
// tonight.

const HISTORY_KEY = "judo.history";

export function useHistory() {
  const col = useCollection(HISTORY_KEY, () => []);

  const start = useCallback(({ plan, group, drills }) => col.add({
    startedAt: Date.now(),
    endedAt: null,
    localDate: localDate(),
    planId: plan ? plan.id : null,
    planName: plan ? plan.name : "אימון",
    groupId: group ? group.id : null,
    groupName: group ? group.name : "",
    drills: JSON.parse(JSON.stringify(drills || [])),   // a snapshot, not a link
    presentIds: [],
    notes: "",
  }), [col]);

  const finish = useCallback((id, stats) => col.update(id, { endedAt: Date.now(), ...stats }), [col]);

  return { ...col, start, finish };
}

// ── best-effort mirror to Supabase ───────────────────────────────────────────
// Phase 3 replaces these two with the club schema. Until then they keep the
// existing tables warm so nothing already saved is stranded.

export async function pullLegacyWorkouts() {
  const rows = await supaOr("workouts?order=date.desc&limit=30", []);
  return (rows || []).map(w => ({
    id: "legacy-" + w.id,
    name: w.name || w.date,
    drills: w.drills || [],
    legacy: true,
    updatedAt: Date.parse(w.date || "") || 0,
  }));
}

export async function pushPlan(plan) {
  const { error } = await supa("workouts", {
    method: "POST",
    body: JSON.stringify({ date: localDate(), name: plan.name, drills: plan.drills, judokas: [], pairs: [] }),
  });
  if (error) { notifyError(error, "המערך נשמר במכשיר אבל לא בענן"); return false; }
  return true;
}
