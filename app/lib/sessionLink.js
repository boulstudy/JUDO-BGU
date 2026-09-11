'use client';

// The phone side of the v2 link: the session itself.
//
// This is the source of truth. It holds the anchor, applies every control to
// it through the pure engine, and publishes the result. It does not stream
// ticks — it announces changes, plus a slow heartbeat so the screen can tell
// "paused" from "gone".
//
// The phone derives its own clock from the same anchor with the same function
// the screen uses, so the number under the coach's thumb and the number on the
// wall are the same number, not two clocks that happen to agree.

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createBus } from "./remoteBus";
import {
  PROTOCOL_VERSION, MSG, STATE_IDLE_MS, PEER_TIMEOUT_MS, pickState, makeSessionKey,
} from "./remoteProtocol";
import {
  project, anchorAtCursor, reanchor, play as enginePlay, pause as enginePause,
  addTime as engineAddTime, resetPhase as engineReset, skipPhase as engineSkip,
  gotoCursor, stepDrill, reconcileEdit, workoutClockSignature,
} from "./sessionEngine";

const KEY_STORE = "judo.session.key";

function loadSessionKey() {
  if (typeof window === "undefined") return makeSessionKey();
  try {
    const existing = window.localStorage.getItem(KEY_STORE);
    if (existing && existing.length >= 12) return existing;
    const fresh = makeSessionKey();
    window.localStorage.setItem(KEY_STORE, fresh);
    return fresh;
  } catch (e) {
    return makeSessionKey();
  }
}

/**
 * @param {object}  opts
 * @param {string}  opts.room      pairing code; "" keeps the session local
 * @param {object}  opts.content   { drills, athletes, pairs, notes, ... } — the
 *                                 heavy state the screen renders
 * @param {object}  opts.options   { globalAutoNext }
 * @param {number}  opts.fps       how often the phone re-derives its own clock
 */
export function useSession({ room = "", content, options, fps = 5 }) {
  const opts = useMemo(
    () => ({ globalAutoNext: options ? options.globalAutoNext !== false : true }),
    [options]
  );
  const drills = (content && content.drills) || [];

  const [anchor, setAnchor] = useState(() => anchorAtCursor(drills, { drillIdx: 0, phaseIdx: 0 }, { now: Date.now() }));
  const [status, setStatus] = useState("offline");
  const [screenSeen, setScreenSeen] = useState(0);
  const [view, setView] = useState(null);

  const busRef     = useRef(null);
  const seqRef     = useRef(0);
  const revRef     = useRef(0);
  const anchorRef  = useRef(anchor);   anchorRef.current  = anchor;
  const contentRef = useRef(content);  contentRef.current = content;
  const optsRef    = useRef(opts);     optsRef.current    = opts;
  const sessionKey = useRef(null);
  if (sessionKey.current === null) sessionKey.current = loadSessionKey();

  // ── publish ────────────────────────────────────────────────────────────────
  const publish = useCallback((withContent) => {
    const bus = busRef.current;
    if (!bus) return;
    bus.send({
      v: PROTOCOL_VERSION,
      t: MSG.STATE,
      key: sessionKey.current,
      seq: ++seqRef.current,
      rev: revRef.current,
      a: anchorRef.current,
      opts: optsRef.current,
      ...(withContent ? { d: pickState(contentRef.current) } : {}),
    });
  }, []);

  // ── connect ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!room) { setStatus("offline"); return; }
    let bus = null;
    bus = createBus({
      room,
      onStatus: s => { setStatus(s); if (s === "online") publish(true); },
      onMessage: m => {
        if (!m || typeof m !== "object" || m.v !== PROTOCOL_VERSION) return;
        setScreenSeen(Date.now());
        if (m.t === MSG.HELLO) { publish(true); return; }
        if (m.t === MSG.PING) {
          bus.send({ v: PROTOCOL_VERSION, t: MSG.PONG, key: sessionKey.current, sentAt: m.sentAt, remoteAt: Date.now() }, { queue: false });
          return;
        }
      },
    });
    busRef.current = bus;
    return () => {
      busRef.current = null;
      try { bus.send({ v: PROTOCOL_VERSION, t: MSG.BYE, key: sessionKey.current }, { queue: false }); } catch (e) {}
      bus.close();
    };
  }, [room, publish]);

  // A new anchor is news; send it at once.
  useEffect(() => { publish(false); }, [anchor, publish]);

  // Heavy state changes get a new rev and ride along in full.
  const contentSig = useMemo(() => JSON.stringify(pickState(content)), [content]);
  useEffect(() => {
    revRef.current++;
    const id = setTimeout(() => publish(true), 250);   // debounced: notes are typed
    return () => clearTimeout(id);
  }, [contentSig, publish]);

  // Heartbeat, so a quiet session still reads as alive.
  useEffect(() => {
    if (!room) return;
    const id = setInterval(() => publish(false), STATE_IDLE_MS);
    return () => clearInterval(id);
  }, [room, publish]);

  // ── keep the clock honest across edits ─────────────────────────────────────
  // A rename or a change to a later drill must not knock the running clock back
  // to the top of the phase; a change to *this* drill's timing must.
  const prevDrillsRef = useRef(drills);
  const clockSig = useMemo(() => workoutClockSignature(drills), [drills]);
  useEffect(() => {
    const prev = prevDrillsRef.current;
    prevDrillsRef.current = drills;
    if (prev === drills) return;
    setAnchor(a => reconcileEdit(prev, drills, a, optsRef.current, Date.now()));
  }, [clockSig, drills]);

  // ── derive our own clock ───────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => setView(project(drills, anchorRef.current, optsRef.current, Date.now()));
    tick();
    const id = setInterval(tick, Math.max(100, Math.round(1000 / fps)));
    return () => clearInterval(id);
  }, [drills, fps, anchor]);

  // A session that ran off the end of the workout should settle, not keep
  // claiming to run.
  useEffect(() => {
    if (view && view.ended && anchorRef.current.running) {
      setAnchor(a => reanchor(drills, a, optsRef.current, Date.now(), { running: false }));
    }
  }, [view, drills]);

  // ── controls ───────────────────────────────────────────────────────────────
  const act = useCallback(fn => setAnchor(a => fn(a, Date.now())), []);

  const controls = useMemo(() => ({
    play:       () => act((a, now) => enginePlay(drills, a, optsRef.current, now)),
    pause:      () => act((a, now) => enginePause(drills, a, optsRef.current, now)),
    toggle:     () => act((a, now) => (a.running ? enginePause : enginePlay)(drills, a, optsRef.current, now)),
    addTime:    s => act((a, now) => engineAddTime(drills, a, optsRef.current, now, s)),
    resetPhase: () => act((a, now) => engineReset(drills, a, optsRef.current, now)),
    skipPhase:  () => act((a, now) => engineSkip(drills, a, optsRef.current, now)),
    prevDrill:  () => act((a, now) => gotoCursor(drills, a, optsRef.current, now, stepDrill(drills, a, -1))),
    nextDrill:  () => act((a, now) => gotoCursor(drills, a, optsRef.current, now, stepDrill(drills, a, 1))),
    goto:       (drillIdx, phaseIdx = 0) => act((a, now) => gotoCursor(drills, a, optsRef.current, now, { drillIdx, phaseIdx })),
    restart:    () => setAnchor(anchorAtCursor(drills, { drillIdx: 0, phaseIdx: 0 }, { now: Date.now() })),
  }), [act, drills]);

  return {
    anchor,
    view,
    status,
    controls,
    sessionKey: sessionKey.current,
    screenConnected: screenSeen > 0 && Date.now() - screenSeen < PEER_TIMEOUT_MS,
    republish: () => publish(true),
  };
}
