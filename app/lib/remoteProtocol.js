// ── Wire protocol between the coach's phone and the projection screen ────────
//
// v2 inverts v1. The phone owns the session; the screen renders it.
//
//   phone → screen
//     { v, t:"state", seq, key, rev, a, d?, opts }
//         `a` is the anchor (see sessionEngine) — "this much was left at this
//         instant" — not a tick. The screen derives the clock from it and keeps
//         deriving when nothing arrives, which is why a locked phone, a dead
//         network or a backgrounded tab cannot stop the projection.
//         `d` (the heavy state: drills, athletes, pairs, notes, settings) rides
//         along only when `rev` changed.
//     { v, t:"ping", seq, key, sentAt }   round trip for the clock-offset estimate
//     { v, t:"bye",  key }
//
//   screen → phone
//     { v, t:"hello", screenId, wants }   asks for a full state, names its rev
//     { v, t:"pong",  screenId, sentAt, remoteAt }
//     { v, t:"status", screenId, audio, claimed }
//     { v, t:"bye" }
//
// Ownership. The channel is a public broadcast topic, so the code alone cannot
// be the whole story: anyone who joins could otherwise drive the screen. The
// phone mints a `sessionKey` at pairing; the screen pins the first key it sees
// and ignores every message signed with another until a human accepts a
// takeover on the screen itself. Trust on first use, the same trust the code
// already asks for — but it closes the window on a silent hijack mid-session.

export const PROTOCOL_VERSION = 2;

export const MSG = {
  STATE:  "state",
  PING:   "ping",
  PONG:   "pong",
  HELLO:  "hello",
  STATUS: "status",
  CLAIM:  "claim",     // phone asks a screen owned by someone else to switch
  BYE:    "bye",
};

// The phone re-sends its anchor this often even when nothing changed, so the
// screen can tell "paused" from "gone". Cheap: one small message, not a tick.
export const STATE_IDLE_MS = 3000;
// Round trips for the offset estimate. Frequent at first, then rare.
export const PING_MS       = 5000;
export const PING_FAST_MS  = 700;
export const PING_FAST_N   = 6;
// A peer unheard from for this long is treated as gone.
export const PEER_TIMEOUT_MS = 11000;
// How long the screen waits past zero for a fresh anchor before advancing the
// phase on its own. Long enough to absorb a slow message, short enough that a
// dead phone is not visible as a stuck clock.
export const SELF_ADVANCE_GRACE_MS = 1200;

// Keys of the heavy state a phone may publish.
export const STATE_KEYS = [
  "drills", "athletes", "pairs", "notes",
  "globalAutoNext", "soundType", "projection", "groupName", "planName",
];

export function pickState(obj) {
  const out = {};
  if (!obj) return out;
  STATE_KEYS.forEach(k => { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}

// ── session key ──────────────────────────────────────────────────────────────

const KEY_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function makeSessionKey(len = 16) {
  let out = "";
  const g = typeof globalThis !== "undefined" ? globalThis : {};
  const c = g.crypto;
  if (c && c.getRandomValues) {
    const buf = new Uint8Array(len);
    c.getRandomValues(buf);
    for (let i = 0; i < len; i++) out += KEY_ALPHABET[buf[i] % KEY_ALPHABET.length];
    return out;
  }
  for (let i = 0; i < len; i++) out += KEY_ALPHABET[Math.floor(Math.random() * KEY_ALPHABET.length)];
  return out;
}

/**
 * Decides whether the screen should act on an inbound message.
 *
 * @param {object} gate  { key, seq }  what the screen has pinned so far
 * @param {object} msg
 * @returns {{accept: boolean, reason: string, gate: object}}
 */
export function admit(gate, msg) {
  const g = gate || { key: null, seq: -1 };
  if (!msg || typeof msg !== "object") return { accept: false, reason: "malformed", gate: g };
  if (msg.v !== undefined && msg.v !== PROTOCOL_VERSION) {
    return { accept: false, reason: "version", gate: g };
  }
  // A claim is how a takeover is *offered*; the screen still asks a human.
  if (msg.t === MSG.CLAIM) return { accept: true, reason: "claim", gate: g };

  if (msg.key) {
    if (!g.key)            return { accept: true, reason: "adopt", gate: { key: msg.key, seq: msg.seq ?? -1 } };
    if (g.key !== msg.key) return { accept: false, reason: "foreign", gate: g };
  }
  // Broadcast can deliver out of order, and a stale anchor would drag a
  // running clock backwards.
  if (typeof msg.seq === "number" && msg.seq <= g.seq) {
    return { accept: false, reason: "stale", gate: g };
  }
  return {
    accept: true,
    reason: "ok",
    gate: { key: g.key || msg.key || null, seq: typeof msg.seq === "number" ? msg.seq : g.seq },
  };
}

export const releaseGate = () => ({ key: null, seq: -1 });
