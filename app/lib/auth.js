'use client';

// Supabase Auth over raw REST — same philosophy as shared.js's supa(): no
// @supabase/supabase-js dependency, just fetch.
//
// A session is { access_token, refresh_token, expires_at (unix seconds), user }.
// It lives in localStorage under AUTH_STORAGE_KEY so a reload doesn't sign
// the coach out. authedFetch() is what club/branch/team screens call instead
// of shared.js's supa() — it sends the user's access token as the bearer, so
// RLS policies see auth.uid() instead of treating every request as anon.

import { useState, useEffect, useCallback } from "react";
import { SUPA_URL, SUPA_KEY } from "./shared";

const AUTH_STORAGE_KEY = "judo_auth_session";
const REFRESH_SKEW_SEC = 60; // refresh this many seconds before real expiry

function loadSession() {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

function saveSession(session) {
  try { window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session)); } catch(e) {}
}

function clearSession() {
  try { window.localStorage.removeItem(AUTH_STORAGE_KEY); } catch(e) {}
}

function normalize(raw) {
  if (!raw || !raw.access_token) return null;
  const expires_at = raw.expires_at || (Math.floor(Date.now() / 1000) + (raw.expires_in || 3600));
  return {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    expires_at,
    user: raw.user || null,
  };
}

async function authRequest(path, body) {
  try {
    const r = await fetch(SUPA_URL + "/auth/v1/" + path, {
      method: "POST",
      headers: { "apikey": SUPA_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok) return { error: (data && (data.error_description || data.msg || data.error)) || "שגיאה לא צפויה" };
    return { data };
  } catch(e) {
    return { error: "אין חיבור לרשת" };
  }
}

export async function signUp(email, password) {
  const { data, error } = await authRequest("signup", { email, password });
  if (error) return { error };
  const session = normalize(data);
  if (session) { saveSession(session); return { session }; }
  // Email confirmation is on — Supabase returns a user but no session yet.
  return { needsConfirmation: true };
}

export async function signIn(email, password) {
  const { data, error } = await authRequest("token?grant_type=password", { email, password });
  if (error) return { error: "אימייל או סיסמה שגויים" };
  const session = normalize(data);
  if (!session) return { error: "שגיאה לא צפויה" };
  saveSession(session);
  return { session };
}

export async function signOut() {
  const session = loadSession();
  clearSession();
  if (!session) return;
  try {
    await fetch(SUPA_URL + "/auth/v1/logout", {
      method: "POST",
      headers: { "apikey": SUPA_KEY, "Authorization": "Bearer " + session.access_token },
    });
  } catch(e) {}
}

async function refresh(session) {
  if (!session || !session.refresh_token) return null;
  const { data, error } = await authRequest("token?grant_type=refresh_token", { refresh_token: session.refresh_token });
  if (error) { clearSession(); return null; }
  const next = normalize(data);
  if (next) saveSession(next);
  return next;
}

// Returns a session guaranteed to be valid for the next REFRESH_SKEW_SEC
// seconds, refreshing first if needed. Null means signed out.
async function getLiveSession() {
  const session = loadSession();
  if (!session) return null;
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at - now > REFRESH_SKEW_SEC) return session;
  return refresh(session);
}

// Authenticated counterpart to shared.js's supa() — same call shape, but
// signs the request as the current user so RLS applies per-row instead of
// treating every call as anonymous.
export async function authedFetch(path, opts = {}) {
  const session = await getLiveSession();
  if (!session) return null;
  try {
    const r = await fetch(SUPA_URL + "/rest/v1/" + path, {
      ...opts,
      headers: {
        "apikey": SUPA_KEY,
        "Authorization": "Bearer " + session.access_token,
        "Content-Type": "application/json",
        "Prefer": opts.prefer !== undefined ? opts.prefer : "return=representation",
        ...(opts.headers || {}),
      },
    });
    if (!r.ok) return null;
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  } catch(e) {
    return null;
  }
}

// ── React binding ────────────────────────────────────────────────────────────
export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getLiveSession().then(s => { if (!cancelled) { setSession(s); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const doSignIn = useCallback(async (email, password) => {
    const r = await signIn(email, password);
    if (r.session) setSession(r.session);
    return r;
  }, []);

  const doSignUp = useCallback(async (email, password) => {
    const r = await signUp(email, password);
    if (r.session) setSession(r.session);
    return r;
  }, []);

  const doSignOut = useCallback(async () => {
    await signOut();
    setSession(null);
  }, []);

  return {
    user: session ? session.user : null,
    loading,
    isAuthed: !!session,
    signIn: doSignIn,
    signUp: doSignUp,
    signOut: doSignOut,
  };
}
