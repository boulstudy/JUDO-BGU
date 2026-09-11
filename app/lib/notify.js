'use client';

// A one-line toast bus.
//
// Exists so that a failed write has somewhere to go. Any module — including
// non-React code like the write queue — can call notify(); whichever screen is
// mounted renders it. Keeping it outside React means the client layer does not
// have to thread a setter through every call site.

import { useState, useEffect } from "react";

let seq = 0;
const listeners = new Set();
let items = [];

function emit() {
  const snapshot = items;
  listeners.forEach(fn => fn(snapshot));
}

export function notify(text, kind = "info", ms = 3200) {
  if (!text) return;
  const item = { id: ++seq, text: String(text), kind };
  items = [...items, item];
  emit();
  if (ms > 0) setTimeout(() => dismiss(item.id), ms);
  return item.id;
}

export const notifyError = (e, fallback = "הפעולה נכשלה") =>
  notify((e && e.message) || fallback, "error", 5000);

export function dismiss(id) {
  items = items.filter(i => i.id !== id);
  emit();
}

export function useToasts() {
  const [list, setList] = useState(items);
  useEffect(() => {
    listeners.add(setList);
    setList(items);
    return () => { listeners.delete(setList); };
  }, []);
  return list;
}
