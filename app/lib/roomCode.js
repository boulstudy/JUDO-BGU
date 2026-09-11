// Pairing codes. Pure and import-free, so the tests can require() it.

// Deliberately without O, 0, I and 1: a code gets read off a screen across a
// hall and typed into a phone, and those are the pairs people get wrong. Both
// members of each pair are absent, which is what makes a typed "O" an
// unambiguous mistake rather than something to guess at — there is nothing to
// fold it to. L stays, because the I it could be confused with is already gone.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Six characters, not four. The topic is a public broadcast channel and the
// code is the only thing in front of it, so 1e9 combinations rather than 1e6
// is the difference between "not worth trying" and "worth trying". Two extra
// characters cost the coach nothing.
export const ROOM_CODE_LEN = 6;

export function makeRoomCode(len = ROOM_CODE_LEN) {
  const out = [];
  const g = typeof globalThis !== "undefined" ? globalThis : {};
  if (g.crypto && g.crypto.getRandomValues) {
    const buf = new Uint8Array(len);
    g.crypto.getRandomValues(buf);
    for (let i = 0; i < len; i++) out.push(CODE_ALPHABET[buf[i] % CODE_ALPHABET.length]);
    return out.join("");
  }
  for (let i = 0; i < len; i++) {
    out.push(CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]);
  }
  return out.join("");
}

export function normalizeRoomCode(code) {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

// True once there is enough of a code to be worth trying to join with.
export function isValidRoomCode(code) {
  const c = normalizeRoomCode(code);
  return c.length === ROOM_CODE_LEN && [...c].every(ch => CODE_ALPHABET.includes(ch));
}

// Flags the characters a code can never contain, so the phone can say
// "there is no O in a pairing code" instead of just failing to connect.
export function impossibleChars(code) {
  const seen = new Set();
  [...normalizeRoomCode(code)].forEach(ch => { if (!CODE_ALPHABET.includes(ch)) seen.add(ch); });
  return [...seen];
}

export const roomTopic = room => "realtime:judo-remote-" + normalizeRoomCode(room);
