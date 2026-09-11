'use client';

// Small, honest localStorage wrapper.
//
// Every access is wrapped: Safari in private mode throws on setItem rather
// than failing quietly, and a coach whose storage is full should still be able
// to run a training. Losing a draft is survivable; a thrown exception in the
// middle of a session is not.

const can = () => typeof window !== "undefined" && !!window.localStorage;

export function read(key, fallback = null) {
  if (!can()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

export function write(key, value) {
  if (!can()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

export function drop(key) {
  if (!can()) return;
  try { window.localStorage.removeItem(key); } catch (e) {}
}

export const KEYS = {
  session:  "judo.session.active",   // the running session, for recovery
  draft:    "judo.draft",            // unsaved editing
  room:     "judo.room",             // pairing code the phone last used
  settings: "judo.settings",
  plans:    "judo.cache.plans",
  groups:   "judo.cache.groups",
  catalog:  "judo.cache.catalog",
};
