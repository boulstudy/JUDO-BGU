'use client';

// ── Remote-control transport ─────────────────────────────────────────────────
//
// The TV and the coach's phone talk over a Supabase Realtime *broadcast*
// channel. Broadcast is ephemeral pub/sub — it needs no database table and no
// extra npm dependency, so this speaks the Phoenix wire protocol directly over
// a WebSocket.
//
// Messages are plain JSON objects; see app/lib/remoteProtocol.js for the shapes.

import { SUPA_URL, SUPA_KEY } from "./shared";

const REALTIME_URL =
  SUPA_URL.replace(/^http/, "ws") + "/realtime/v1/websocket?apikey=" + SUPA_KEY + "&vsn=1.0.0";

const HEARTBEAT_MS   = 25000;  // Supabase drops idle sockets after ~60s
const JOIN_TIMEOUT_MS = 12000;
const MAX_BACKOFF_MS  = 10000;
const BROADCAST_EVENT = "m";

// Room codes avoid characters that are easy to misread out loud (0/O, 1/I).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeRoomCode(len = 4) {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export function normalizeRoomCode(code) {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function roomTopic(room) {
  return "realtime:judo-remote-" + normalizeRoomCode(room);
}

/**
 * Opens a broadcast channel for a room.
 *
 * @param {object}   opts
 * @param {string}   opts.room       room code, e.g. "A7K2"
 * @param {function} opts.onMessage  called with each message from the peer
 * @param {function} opts.onStatus   "connecting" | "online" | "offline"
 * @returns {{ send: function, close: function, status: function }}
 */
export function createBus({ room, onMessage, onStatus }) {
  const topic = roomTopic(room);

  let ws        = null;
  let refCount  = 0;
  let joinRef   = null;
  let joined    = false;
  let disposed  = false;
  let attempt   = 0;
  let hbTimer   = null;
  let joinTimer = null;
  let retryTimer = null;
  let status    = "connecting";

  const backlog = [];   // messages sent before the join completed

  const setStatus = s => {
    if (status === s) return;
    status = s;
    try { if (onStatus) onStatus(s); } catch(e) {}
  };

  const nextRef = () => String(++refCount);

  const push = (event, payload, ref) => {
    if (!ws || ws.readyState !== 1) return false;
    try {
      ws.send(JSON.stringify({ topic, event, payload, ref: ref || nextRef(), join_ref: joinRef }));
      return true;
    } catch(e) { return false; }
  };

  const clearTimers = () => {
    clearInterval(hbTimer);   hbTimer = null;
    clearTimeout(joinTimer);  joinTimer = null;
  };

  const scheduleReconnect = () => {
    if (disposed) return;
    clearTimers();
    setStatus("offline");
    const wait = Math.min(MAX_BACKOFF_MS, 800 * Math.pow(2, attempt)) * (0.7 + Math.random() * 0.6);
    attempt += 1;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, wait);
  };

  const teardownSocket = () => {
    if (!ws) return;
    const old = ws;
    ws = null;
    joined = false;
    joinRef = null;
    old.onopen = old.onmessage = old.onerror = old.onclose = null;
    try { old.close(); } catch(e) {}
  };

  function connect() {
    if (disposed) return;
    if (typeof window === "undefined" || typeof WebSocket === "undefined") return;
    teardownSocket();
    setStatus(attempt === 0 ? "connecting" : status === "online" ? "connecting" : "offline");

    let sock;
    try { sock = new WebSocket(REALTIME_URL); }
    catch(e) { scheduleReconnect(); return; }
    ws = sock;

    sock.onopen = () => {
      if (ws !== sock) return;
      joinRef = nextRef();
      push("phx_join", {
        config: {
          broadcast: { self: false, ack: false },
          presence:  { key: "" },
          private:   false,
        },
      }, joinRef);

      clearTimeout(joinTimer);
      joinTimer = setTimeout(() => { if (ws === sock && !joined) { teardownSocket(); scheduleReconnect(); } }, JOIN_TIMEOUT_MS);

      clearInterval(hbTimer);
      hbTimer = setInterval(() => {
        if (!ws || ws.readyState !== 1) return;
        try { ws.send(JSON.stringify({ topic:"phoenix", event:"heartbeat", payload:{}, ref:nextRef() })); } catch(e) {}
      }, HEARTBEAT_MS);
    };

    sock.onmessage = ev => {
      if (ws !== sock) return;
      let msg;
      try { msg = JSON.parse(ev.data); } catch(e) { return; }

      if (msg.event === "phx_reply" && msg.ref === joinRef) {
        if (msg.payload && msg.payload.status === "ok") {
          joined  = true;
          attempt = 0;
          clearTimeout(joinTimer); joinTimer = null;
          setStatus("online");
          while (backlog.length) {
            push("broadcast", { type:"broadcast", event:BROADCAST_EVENT, payload: backlog.shift() });
          }
        } else {
          teardownSocket();
          scheduleReconnect();
        }
        return;
      }

      if (msg.event === "phx_error" || msg.event === "phx_close") {
        teardownSocket();
        scheduleReconnect();
        return;
      }

      if (msg.event === "broadcast" && msg.payload && msg.payload.event === BROADCAST_EVENT) {
        try { if (onMessage) onMessage(msg.payload.payload); } catch(e) {}
      }
    };

    sock.onerror = () => { if (ws === sock) { teardownSocket(); scheduleReconnect(); } };
    sock.onclose = () => { if (ws === sock) { teardownSocket(); scheduleReconnect(); } };
  }

  connect();

  return {
    /**
     * @param {object} msg      the payload to broadcast
     * @param {object} [opts]   { queue: false } drops the message instead of
     *                          buffering it when the channel is not joined yet —
     *                          right for periodic state ticks, wrong for commands.
     */
    send(msg, opts) {
      if (disposed) return false;
      if (!joined) {
        if (opts && opts.queue === false) return false;
        backlog.push(msg);
        if (backlog.length > 30) backlog.shift();
        return false;
      }
      return push("broadcast", { type:"broadcast", event:BROADCAST_EVENT, payload: msg });
    },
    status() { return status; },
    close() {
      disposed = true;
      clearTimers();
      clearTimeout(retryTimer);
      teardownSocket();
    },
  };
}
