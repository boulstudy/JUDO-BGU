'use client';

// The projection side of the v2 link.
//
// What separates this from a remote display: it is never told the time. It
// holds an anchor — "this much was left, at this instant" — and derives the
// clock itself, ten times a second, from the pure engine.
//
// That single choice is what survives the failures that actually happen in a
// hall. A phone that locks, backgrounds, loses signal or dies stops sending;
// the anchor it already sent stays true, and project() rolls it forward across
// however many phase boundaries have passed since. There is no catch-up to
// implement and no stuck clock to guard against: the screen was never counting
// in the first place, so it has nothing to miss.

import { useState, useEffect, useRef, useCallback } from "react";
import { createBus } from "./remoteBus";
import {
  PROTOCOL_VERSION, MSG, PEER_TIMEOUT_MS, PING_MS, PING_FAST_MS, PING_FAST_N,
  admit, releaseGate,
} from "./remoteProtocol";
import { project, estimateOffset, offsetSample, shiftAnchor } from "./sessionEngine";

const newScreenId = () => Math.random().toString(36).slice(2, 10);

export function useProjectionLink(room, { fps = 10 } = {}) {
  const [status, setStatus]  = useState("offline");
  const [heavy, setHeavy]    = useState(null);
  const [phoneSeen, setSeen] = useState(0);
  const [owner, setOwner]    = useState(null);   // the session key we trust
  const [claimant, setClaim] = useState(null);   // another phone wants the screen
  const [view, setView]      = useState(null);   // the derived clock

  const busRef     = useRef(null);
  const gateRef    = useRef(releaseGate());
  const rawRef     = useRef(null);               // exactly as the phone sent it
  const anchorRef  = useRef(null);               // the same, shifted into our clock
  const optsRef    = useRef({ globalAutoNext: true });
  const heavyRef   = useRef(null);
  const revRef     = useRef(-1);
  const samplesRef = useRef([]);
  const offsetRef  = useRef(0);
  const pingRef    = useRef(0);
  const screenId   = useRef(newScreenId()).current;

  heavyRef.current = heavy;

  const send = useCallback((msg, opts) => {
    const bus = busRef.current;
    if (bus) bus.send({ v: PROTOCOL_VERSION, screenId, ...msg }, opts);
  }, [screenId]);

  // ── receive ────────────────────────────────────────────────────────────────
  const handle = useCallback(msg => {
    const verdict = admit(gateRef.current, msg);
    if (!verdict.accept) {
      // A phone talking with the wrong key found the code but is not the one
      // running this session. Surface it as a request rather than obeying it.
      if (verdict.reason === "foreign") setClaim(c => c || { key: msg.key, at: Date.now() });
      return;
    }
    gateRef.current = verdict.gate;
    setSeen(Date.now());

    switch (msg.t) {
      case MSG.CLAIM:
        setClaim({ key: msg.key, at: Date.now() });
        return;

      case MSG.PING:
        // Answer in kind so the phone can measure the offset from its side.
        send({ t: MSG.PONG, sentAt: msg.sentAt, remoteAt: Date.now() }, { queue: false });
        return;

      case MSG.PONG: {
        if (typeof msg.sentAt !== "number" || typeof msg.remoteAt !== "number") return;
        const s = offsetSample({ sentAt: msg.sentAt, remoteAt: msg.remoteAt, recvAt: Date.now() });
        samplesRef.current = [...samplesRef.current.slice(-9), s];
        offsetRef.current = estimateOffset(samplesRef.current);
        // A better estimate is worth applying to the anchor already in hand —
        // shifting the original rather than the shifted one, so corrections do
        // not compound.
        if (rawRef.current) anchorRef.current = shiftAnchor(rawRef.current, offsetRef.current);
        return;
      }

      case MSG.BYE:
        setSeen(0);
        return;

      case MSG.STATE: {
        if (msg.key) setOwner(msg.key);
        if (msg.opts) optsRef.current = msg.opts;
        if (msg.d) { revRef.current = msg.rev; setHeavy(msg.d); }
        else if (msg.rev !== revRef.current) send({ t: MSG.HELLO, wants: revRef.current }, { queue: false });
        if (msg.a) {
          rawRef.current = msg.a;
          anchorRef.current = shiftAnchor(msg.a, offsetRef.current);
        }
        return;
      }

      default:
        return;
    }
  }, [send]);

  // ── connect ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!room) { setStatus("offline"); return; }
    gateRef.current = releaseGate();
    anchorRef.current = null;
    rawRef.current = null;
    revRef.current = -1;
    samplesRef.current = [];
    offsetRef.current = 0;
    setOwner(null); setClaim(null); setHeavy(null); setSeen(0); setView(null);

    let bus = null;
    bus = createBus({
      room,
      onStatus: s => {
        setStatus(s);
        if (s === "online" && bus) {
          bus.send({ v: PROTOCOL_VERSION, screenId, t: MSG.HELLO, wants: -1 });
        }
      },
      onMessage: handle,
    });
    busRef.current = bus;
    return () => {
      busRef.current = null;
      try { bus.send({ v: PROTOCOL_VERSION, screenId, t: MSG.BYE }, { queue: false }); } catch (e) {}
      bus.close();
    };
  }, [room, handle, screenId]);

  // ── measure the clock offset ───────────────────────────────────────────────
  // Fast at first so the very first anchor is already in the right frame, then
  // rarely, because device clocks drift over hours, not seconds.
  useEffect(() => {
    if (!room) return;
    pingRef.current = 0;
    let timer = null;
    const beat = () => {
      send({ t: MSG.PING, sentAt: Date.now() }, { queue: false });
      pingRef.current++;
      timer = setTimeout(beat, pingRef.current < PING_FAST_N ? PING_FAST_MS : PING_MS);
    };
    timer = setTimeout(beat, 200);
    return () => clearTimeout(timer);
  }, [room, send]);

  // ── derive ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const anchor = anchorRef.current;
      if (!anchor) { setView(null); return; }
      const drills = (heavyRef.current && heavyRef.current.drills) || [];
      setView(project(drills, anchor, optsRef.current, Date.now()));
    }, Math.max(50, Math.round(1000 / fps)));
    return () => clearInterval(id);
  }, [fps]);

  // ── takeover ───────────────────────────────────────────────────────────────
  const acceptClaim = useCallback(() => {
    gateRef.current = releaseGate();
    anchorRef.current = null;
    rawRef.current = null;
    revRef.current = -1;
    setOwner(null); setClaim(null); setHeavy(null); setView(null);
    send({ t: MSG.HELLO, wants: -1 }, { queue: false });
  }, [send]);

  const rejectClaim = useCallback(() => setClaim(null), []);

  return {
    status,
    heavy,
    view,
    owner,
    claimant,
    phoneConnected: phoneSeen > 0 && Date.now() - phoneSeen < PEER_TIMEOUT_MS,
    offset: offsetRef.current,
    acceptClaim,
    rejectClaim,
  };
}
