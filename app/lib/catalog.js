'use client';

// The coach's drill catalog: folders of reusable drills. A drill may contain other
// drills (groups), so variations are just saved drills — one folder per athlete
// gives that athlete's "presets".
//
// Storage is behind a tiny adapter so it can move to Supabase (per club / per
// account) without touching the UI. Today it is this device's localStorage.

import { useState, useEffect, useCallback, useRef } from "react";
import { uid, makeStep, makeGroup, totalSteps } from "./steps";

const KEY = "judo_catalog_v1";

const emptyCatalog = () => ({ folders: [], items: [] });

function seed() {
  const f1 = { id: uid(), name: "בסיס" };
  const mk = (name, section, steps, note = "") => ({ id: uid(), folderId: f1.id, name, section, steps, note });
  return {
    folders: [f1],
    items: [
      mk("חימום כללי", "warmup", [makeStep("work", "both", 300)], "ריצה + תנועתיות"),
      mk("נאגה קומי — לבן ואז כחול", "technique", [
        makeGroup("סבב", 5, [makeStep("work", "white", 60), makeStep("rest", "both", 15), makeStep("work", "blue", 60), makeStep("rest", "both", 15)]),
      ], "זריקה לצד שמאל"),
      mk("ראנדורי", "randori", [makeGroup("סבב", 3, [makeStep("work", "both", 300), makeStep("rest", "both", 60)])]),
      mk("מנוחה", "rest", [makeStep("rest", "both", 60)]),
    ],
  };
}

// ── adapter (swap this object to change where the catalog lives) ─────────────
export const localAdapter = {
  async load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const c = JSON.parse(raw);
        if (c && Array.isArray(c.folders) && Array.isArray(c.items)) return c;
      }
    } catch(e) {}
    return seed();
  },
  async save(c) {
    try { window.localStorage.setItem(KEY, JSON.stringify(c)); } catch(e) {}
  },
};

export function useCatalog(adapter = localAdapter) {
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [ready, setReady] = useState(false);
  const adapterRef = useRef(adapter);

  useEffect(() => { adapterRef.current.load().then(c => { setCatalog(c); setReady(true); }); }, []);

  const commit = useCallback(fn => {
    setCatalog(prev => {
      const next = fn(prev);
      adapterRef.current.save(next);
      return next;
    });
  }, []);

  const addFolder    = useCallback(name => { const f = { id: uid(), name }; commit(c => ({ ...c, folders: [...c.folders, f] })); return f; }, [commit]);
  const renameFolder = useCallback((id, name) => commit(c => ({ ...c, folders: c.folders.map(f => f.id === id ? { ...f, name } : f) })), [commit]);
  const removeFolder = useCallback(id => commit(c => ({ folders: c.folders.filter(f => f.id !== id), items: c.items.filter(i => i.folderId !== id) })), [commit]);
  const saveItem     = useCallback(item => { const it = { ...item, id: item.id || uid() }; commit(c => ({ ...c, items: c.items.some(i => i.id === it.id) ? c.items.map(i => i.id === it.id ? it : i) : [...c.items, it] })); return it; }, [commit]);
  const removeItem   = useCallback(id => commit(c => ({ ...c, items: c.items.filter(i => i.id !== id) })), [commit]);
  const moveItem     = useCallback((id, folderId) => commit(c => ({ ...c, items: c.items.map(i => i.id === id ? { ...i, folderId } : i) })), [commit]);

  return { catalog, ready, addFolder, renameFolder, removeFolder, saveItem, removeItem, moveItem };
}

export const itemTotal = item => totalSteps(item.steps);
