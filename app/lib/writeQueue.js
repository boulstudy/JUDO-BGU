'use client';

// A queue for writes that failed because the network was down, not because
// the server rejected them — the difference already computed by supabase.js
// as SupaError.retriable.
//
// Kept in localStorage rather than IndexedDB: the payloads here (a plan, an
// attendance record) are a few KB at most and there are at most a handful
// queued at once — the extra ceremony of IndexedDB buys nothing at this
// scale. Flushed on the browser's 'online' event and once on load, in the
// order the writes were made, so a later edit never lands before an earlier
// one it depended on.

import { read, write } from "./persist";
import { supa } from "./supabase";
import { notify } from "./notify";

const KEY = "judo.writeQueue";
const listeners = new Set();

function load() { return read(KEY, []); }
function save(items) { write(KEY, items); listeners.forEach(fn => fn(items)); }

export function queueLength() { return load().length; }

export function subscribeQueue(fn) {
  listeners.add(fn);
  fn(load());
  return () => listeners.delete(fn);
}

/**
 * Enqueues a request supa() already tried and that failed for a retriable
 * (network) reason. Returns the queued item's id so a caller could look it up
 * later, though most callers just fire-and-forget.
 */
export function enqueue(path, opts, label) {
  const items = load();
  const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), path, opts, label: label || "", queuedAt: Date.now() };
  save([...items, item]);
  return item.id;
}

/**
 * Tries a write immediately; if it fails for a retriable (network) reason,
 * queues it instead of just reporting failure, and returns `queued: true` so
 * the caller can say "נשמר במכשיר, יסונכרן" instead of "נכשל". A write the
 * server actively rejects (bad data, permission) is never queued — retrying
 * that forever would just fail silently on a loop — and is returned as a
 * normal error for the caller to report.
 */
export async function writeOrQueue(path, opts, label) {
  const res = await supa(path, opts);
  if (!res.error) return { ...res, queued: false };
  if (res.error.retriable) {
    enqueue(path, opts, label);
    return { data: null, error: null, queued: true };
  }
  return { ...res, queued: false };
}

let flushing = false;

/** Replays queued writes in order; stops at the first one that is still
 *  offline (leaving it and everything after it queued) rather than
 *  reordering around a failure. */
export async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    let items = load();
    if (!items.length) return;
    const remaining = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const { error } = await supa(it.path, it.opts);
      if (error && error.retriable) {
        remaining.push(...items.slice(i));
        break;
      }
      // A non-retriable error (rejected by the server) is dropped rather than
      // retried forever — the coach already saw the failure toast when this
      // was first queued; retrying a request the server actively refused
      // would just fail silently on a loop.
    }
    save(remaining);
    if (remaining.length < items.length) {
      notify("סונכרן — " + (items.length - remaining.length) + " שינויים שנשמרו במכשיר עלו לענן", "info");
    }
  } finally {
    flushing = false;
  }
}

// Called once from the app root (CoachApp.jsx): flushes on load if already
// online, and again every time the browser regains a connection.
let wired = false;
export function wireAutoFlush() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("online", flushQueue);
  if (navigator.onLine) flushQueue();
}
