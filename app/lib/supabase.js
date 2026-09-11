// Supabase REST client.
//
// Two things this does that the old inline helper did not:
//   1. Reads its credentials from the environment, falling back to the
//      committed project so an existing deploy keeps working untouched.
//   2. Reports failures. The previous version returned null for every error —
//      network, auth, constraint violation alike — and every call site
//      ignored it, so a failed save looked exactly like a successful one.
//      Callers now get { data, error } and can say something.

export const SUPA_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://oakbpcjxjunppuyddpsj.supabase.co";
export const SUPA_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ha2JwY2p4anVucHB1eWRkcHNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyOTcwOTIsImV4cCI6MjA5NTg3MzA5Mn0.EoYTL3N_P5C05VyR2-EFKcQUk3dcZSE3l3kWeADzQnE";

// Set by the auth layer once a coach signs in; until then requests go out as
// the anon role, which is what the TV and the pre-login screens need.
let accessToken = null;
export const setAccessToken = t => { accessToken = t || null; };
export const getAccessToken = () => accessToken;

export class SupaError extends Error {
  constructor(message, { status = 0, code = "", details = "" } = {}) {
    super(message);
    this.name = "SupaError";
    this.status = status;
    this.code = code;
    this.details = details;
    // A request that never reached the server is worth retrying later; one the
    // server rejected on its merits is not.
    this.retriable = status === 0 || status === 429 || status >= 500;
  }
}

// Turns whatever PostgREST said into something a coach can act on.
function describe(status, body) {
  if (status === 401 || status === 403) return "אין הרשאה — נסה להתחבר מחדש";
  if (status === 409) return "כבר קיים רשומה כזאת";
  if (status === 0)   return "אין חיבור לרשת";
  if (status >= 500)  return "השרת לא זמין כרגע";
  if (body && body.message) return body.message;
  return "הפעולה נכשלה";
}

/**
 * @returns {Promise<{data: any, error: SupaError|null}>} — never throws.
 */
export async function supa(path, opts = {}) {
  const { prefer, headers, signal, ...rest } = opts;
  let r;
  try {
    r = await fetch(SUPA_URL + "/rest/v1/" + path, {
      ...rest,
      signal,
      headers: {
        "apikey": SUPA_KEY,
        "Authorization": "Bearer " + (accessToken || SUPA_KEY),
        "Content-Type": "application/json",
        "Prefer": prefer !== undefined ? prefer : "return=representation",
        ...(headers || {}),
      },
    });
  } catch (e) {
    // fetch only rejects when the request never completed.
    return { data: null, error: new SupaError(describe(0), { status: 0, details: String(e && e.message || e) }) };
  }

  const text = await r.text().catch(() => "");
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch (e) { body = null; } }

  if (!r.ok) {
    return {
      data: null,
      error: new SupaError(describe(r.status, body), {
        status: r.status,
        code: (body && body.code) || "",
        details: (body && (body.details || body.hint)) || text.slice(0, 300),
      }),
    };
  }
  return { data: body, error: null };
}

// For reads where "no rows" and "request failed" are equally uninteresting and
// the caller has a sensible default anyway.
export async function supaOr(path, fallback, opts) {
  const { data, error } = await supa(path, opts);
  return error || data == null ? fallback : data;
}
