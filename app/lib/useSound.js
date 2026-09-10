'use client';

// The training signals, as the hall hears them.
//
// Lives on whatever screen is doing the projecting, because that is the one
// with the speakers — and because a beep triggered by a network message would
// arrive late and jittery, while one derived from the local clock lands on the
// second.
//
// The iOS constraint that shapes this: an AudioContext only starts inside a
// real user gesture. A "start" pressed on the coach's phone is not a gesture on
// the TV, so the TV has to be tapped once itself. Hence initCtx() being
// separate, and the unlock banner that calls it.

import { useCallback, useRef } from "react";

// ── Sound — Flex Timer / GymNext style (client-only) ─────────────────────────
// soundType: "beep" | "buzz" | "mute"
export function useSound(soundType) {
  const ctxRef = useRef(null);

  // Must be called directly inside a user gesture (tap/click) to work on iOS
  const initCtx = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      if (!ctxRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctxRef.current = new AC();
      }
      if (ctxRef.current.state === "suspended") {
        ctxRef.current.resume();
      }
      return ctxRef.current;
    } catch(e) { return null; }
  }, []);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) return null;
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  // Sharp electronic beep — Flex Timer style
  // Uses sine + slight distortion via gain clipping for that crisp gym-timer sound
  const playBeep = useCallback((freq, dur, vol, offset) => {
    try {
      const ctx = getCtx();
      if (!ctx) return;
      const t = ctx.currentTime + (offset || 0);

      // Primary tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      // Hard attack, flat sustain, fast release — gym timer character
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.004);
      gain.gain.setValueAtTime(vol, t + dur - 0.015);
      gain.gain.linearRampToValueAtTime(0, t + dur);
      osc.start(t); osc.stop(t + dur + 0.02);

      // Click transient at attack — makes it feel punchy
      const click = ctx.createOscillator();
      const clickGain = ctx.createGain();
      click.connect(clickGain); clickGain.connect(ctx.destination);
      click.type = "square";
      click.frequency.value = freq * 1.5;
      clickGain.gain.setValueAtTime(vol * 0.25, t);
      clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
      click.start(t); click.stop(t + 0.02);
    } catch(e) {}
  }, [getCtx]);

  // Buzz — lower, more aggressive sound for rest end
  const playBuzz = useCallback((freq, dur, vol, offset) => {
    try {
      const ctx = getCtx();
      if (!ctx) return;
      const t = ctx.currentTime + (offset || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.005);
      gain.gain.setValueAtTime(vol, t + dur - 0.02);
      gain.gain.linearRampToValueAtTime(0, t + dur);
      osc.start(t); osc.stop(t + dur + 0.02);
    } catch(e) {}
  }, [getCtx]);

  // Interval-Timer style countdown: 3 short sharp beeps at t=3,2,1
  const tickBeep = useCallback((t) => {
    if (soundType === "mute") return;
    if (soundType === "buzz") {
      playBuzz(180, 0.08, 0.3, 0);
    } else {
      playBeep(1000, 0.09, 0.5, 0);
    }
  }, [soundType, playBeep, playBuzz]);

  // Start-of-time signal — one long beep
  const startBeep = useCallback(() => {
    if (soundType === "mute") return;
    if (soundType === "buzz") {
      playBuzz(150, 0.7, 0.5, 0);
    } else {
      playBeep(800, 0.75, 0.65, 0);
    }
  }, [soundType, playBeep, playBuzz]);

  // End-of-time signal — two short beeps fired together, right after the 3 countdown beeps
  const endBeep = useCallback(() => {
    if (soundType === "mute") return;
    if (soundType === "buzz") {
      playBuzz(180, 0.08, 0.3, 0);
      playBuzz(180, 0.32, 0.3, 0.16);
    } else {
      playBeep(1000, 0.09, 0.5, 0);
      playBeep(1000, 0.32, 0.5, 0.16);
    }
  }, [soundType, playBeep, playBuzz]);

  return { tickBeep, endBeep, startBeep, initCtx };
}

