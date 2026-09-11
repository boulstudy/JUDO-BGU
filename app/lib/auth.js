'use client';

// Email + password auth against Supabase's GoTrue REST API — same "raw REST,
// no @supabase/supabase-js" convention as app/lib/supabase.js, so this repo
// doesn't gain a client library for one feature.
//
// Chosen for one reason stated in the plan: no dependency on a mail server
// reaching the coach at the moment that matters. A coach standing in a hall
// with bad reception can still sign in; password reset is the only path that
// needs email, and it's a rare one.

import { SUPA_URL, SUPA_KEY, setAccessToken } from "./supabase";
import { needsRefresh, toSession, describeAuthError } from "./authPure";

const STORE_KEY = "judo.auth.session";

export { needsRefresh, toSession, describeAuthError } from "./authPure";

// ── network ──────────────────────────────────────────────────────────────────

async function authFetch(path, body) {
  let r;
  try {
    r = await fetch(SUPA_URL + "/auth/v1" + path, {
      method: "POST",
      headers: { "apikey": SUPA_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: describeAuthError(0) };
  }
  const text = await r.text().catch(() => "");
  let json = null;
  if (text) { try { json = JSON.parse(text); } catch (e) {} }
  if (!r.ok) return { ok: false, error: describeAuthError(r.status, json) };
  return { ok: true, data: json };
}

// ── session store + broadcast ────────────────────────────────────────────────

let current = null;
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn(current));

function persist(session) {
  current = session;
  setAccessToken(session ? session.access_token : null);
  try {
    if (session) window.localStorage.setItem(STORE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(STORE_KEY);
  } catch (e) {}
  emit();
}

export function getSession() { return current; }

export function subscribeAuth(fn) {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}

// ── actions ──────────────────────────────────────────────────────────────────

export async function signUp(email, password) {
  const res = await authFetch("/signup", { email, password });
  if (!res.ok) return res;
  const session = toSession(res.data);
  // A project with email confirmation turned on returns no access_token yet.
  if (session) persist(session);
  return { ok: true, data: res.data, needsConfirmation: !session };
}

export async function signIn(email, password) {
  const res = await authFetch("/token?grant_type=password", { email, password });
  if (!res.ok) return res;
  persist(toSession(res.data));
  return { ok: true };
}

export async function signOut() {
  const session = current;
  persist(null);
  if (session) {
    try {
      await fetch(SUPA_URL + "/auth/v1/logout", {
        method: "POST",
        headers: { "apikey": SUPA_KEY, "Authorization": "Bearer " + session.access_token },
      });
    } catch (e) {}
  }
}

export async function refresh() {
  if (!current || !current.refresh_token) return { ok: false, error: "אין session פעיל" };
  const res = await authFetch("/token?grant_type=refresh_token", { refresh_token: current.refresh_token });
  if (!res.ok) { persist(null); return res; }
  persist(toSession(res.data));
  return { ok: true };
}

// Loads whatever was saved last time, and refreshes it if it's stale or about
// to expire — called once on boot.
export async function restoreSession() {
  if (typeof window === "undefined") return null;
  let saved = null;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch (e) {}
  if (!saved) return null;
  current = saved;
  setAccessToken(saved.access_token);
  if (needsRefresh(saved)) {
    const r = await refresh();
    if (!r.ok) return null;
  }
  emit();
  return current;
}

// Call before any request that must not run on an expiring token — e.g.
// right before starting a training session.
export async function ensureFreshSession() {
  if (!current) return false;
  if (needsRefresh(current)) {
    const r = await refresh();
    return r.ok;
  }
  return true;
}
