'use client';

// React bindings over the broadcast bus — one hook for the TV, one for the phone.

import { useState, useEffect, useRef, useCallback } from "react";
import { createBus } from "./remoteBus";
import { TICK_IDLE_MS, PING_MS, PEER_TIMEOUT_MS } from "./remoteProtocol";

// Re-renders every `ms` so "is the peer still there?" stays honest.
function useClock(ms) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/**
 * TV side. Publishes the display state and receives commands.
 *
 * @param {string}   room      room code
 * @param {boolean}  active    false disables the link entirely
 * @param {object}   light     { drillIdx, phaseIdx, timeLeft, running, totalElapsed }
 * @param {object}   heavyRef  ref holding { drills, judokas, pairs, notes, ... }
 * @param {number}   rev       bumped whenever the heavy state changes
 * @param {function} onCommand called with the incoming { t:"cmd", c, ... }
 * @param {function} onPatch   called with (patch, then)
 */
export function useTvLink({ room, active, light, heavyRef, rev, onCommand, onPatch }) {
  const [status, setStatus]         = useState("offline");
  const [remoteSeen, setRemoteSeen] = useState(0);

  const busRef   = useRef(null);
  const lightRef = useRef(light);   lightRef.current = light;
  const revRef   = useRef(rev);     revRef.current   = rev;
  const cbRef    = useRef({});      cbRef.current    = { onCommand, onPatch };

  useClock(2000);

  const sendFull = useCallback(() => {
    const bus = busRef.current;
    if (!bus) return;
    bus.send({ t:"full", rev: revRef.current, s: { ...lightRef.current, at: Date.now() }, d: heavyRef.current });
  }, [heavyRef]);

  const sendTick = useCallback(() => {
    const bus = busRef.current;
    if (!bus) return;
    bus.send({ t:"tick", rev: revRef.current, s: { ...lightRef.current, at: Date.now() } }, { queue:false });
  }, []);

  useEffect(() => {
    if (!active || !room) { setStatus("offline"); return; }
    const bus = createBus({
      room,
      onStatus: setStatus,
      onMessage: m => {
        if (!m || typeof m !== "object") return;
        setRemoteSeen(Date.now());
        if (m.t === "hello")      { sendFull(); return; }
        if (m.t === "ping")       { sendTick(); return; }
        if (m.t === "cmd"   && cbRef.current.onCommand) cbRef.current.onCommand(m);
        else if (m.t === "apply" && cbRef.current.onPatch) cbRef.current.onPatch(m.patch, m.then);
      },
    });
    busRef.current = bus;
    return () => {
      busRef.current = null;
      try { bus.send({ t:"bye" }, { queue:false }); } catch(e) {}
      bus.close();
    };
  }, [room, active, sendFull, sendTick]);

  // Push the clock on every change, plus an idle heartbeat.
  const lightKey = [light.drillIdx, light.phaseIdx, light.timeLeft, light.running ? 1 : 0, light.totalElapsed].join("|");
  useEffect(() => { sendTick(); }, [lightKey, sendTick]);
  useEffect(() => {
    const id = setInterval(sendTick, TICK_IDLE_MS);
    return () => clearInterval(id);
  }, [sendTick]);

  // Push a full snapshot when the workout itself changed, debounced so that
  // typing in the notes box does not flood the channel.
  useEffect(() => {
    const id = setTimeout(sendFull, 400);
    return () => clearTimeout(id);
  }, [rev, sendFull]);

  return {
    status,
    remoteConnected: remoteSeen > 0 && Date.now() - remoteSeen < PEER_TIMEOUT_MS,
  };
}

/**
 * Phone side. Receives display state and sends commands.
 */
export function useRemoteLink({ room, active, onMessage }) {
  const [status, setStatus] = useState("offline");
  const [tvSeen, setTvSeen] = useState(0);

  const busRef = useRef(null);
  const cbRef  = useRef(onMessage); cbRef.current = onMessage;

  useClock(1500);

  useEffect(() => {
    if (!active || !room) { setStatus("offline"); return; }
    let self = null;
    const bus = createBus({
      room,
      onStatus: s => {
        setStatus(s);
        if (s === "online" && self) self.send({ t:"hello" });
      },
      onMessage: m => {
        if (!m || typeof m !== "object") return;
        if (m.t === "bye") { setTvSeen(0); return; }
        setTvSeen(Date.now());
        if (cbRef.current) cbRef.current(m);
      },
    });
    self = bus;
    busRef.current = bus;

    const ping = setInterval(() => bus.send({ t:"ping" }, { queue:false }), PING_MS);
    return () => {
      clearInterval(ping);
      busRef.current = null;
      try { bus.send({ t:"bye" }, { queue:false }); } catch(e) {}
      bus.close();
    };
  }, [room, active]);

  const send = useCallback(msg => {
    const bus = busRef.current;
    if (!bus) return false;
    return bus.send(msg);
  }, []);

  return {
    status,
    send,
    tvConnected: tvSeen > 0 && Date.now() - tvSeen < PEER_TIMEOUT_MS,
  };
}
