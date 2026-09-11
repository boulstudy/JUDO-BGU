// Refresh this long before real expiry — a session dying mid-training because
// nobody refreshed it in time is exactly the kind of failure this app exists
// to avoid.
const REFRESH_SKEW_MS = 5 * 60 * 1000;

// The parts of auth.js that don't touch the network or the browser — token
// expiry math and error-message mapping. Pulled out for the same reason
// sessionEngine.js has no imports: this file can be require()'d directly by
// test/unit/run.js with no bundler in the way.

// ── pure helpers (unit-tested directly) ──────────────────────────────────────

/** True once a session is close enough to its expiry to need refreshing. */
export function needsRefresh(session, now = Date.now()) {
  if (!session || !session.expires_at) return true;
  return session.expires_at - now <= REFRESH_SKEW_MS;
}

/** Turns a GoTrue token response into the shape this module persists. */
export function toSession(tokenResponse, now = Date.now()) {
  if (!tokenResponse || !tokenResponse.access_token) return null;
  const expiresInMs = (tokenResponse.expires_in || 3600) * 1000;
  return {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_at: now + expiresInMs,
    user: tokenResponse.user || null,
  };
}

export function describeAuthError(status, body) {
  const msg = (body && (body.error_description || body.msg || body.error)) || "";
  if (status === 400 && /already registered/i.test(msg)) return "כתובת המייל כבר רשומה — נסה להתחבר";
  if (status === 400 && /invalid.*credentials|invalid.*grant/i.test(msg)) return "אימייל או סיסמה שגויים";
  if (status === 422) return "כתובת מייל לא תקינה";
  if (status === 400 && /password/i.test(msg)) return "הסיסמה קצרה מדי — לפחות 6 תווים";
  if (status === 0) return "אין חיבור לרשת";
  if (status >= 500) return "השרת לא זמין כרגע";
  return msg || "ההתחברות נכשלה";
}

