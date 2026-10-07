'use client';

// The workout clock — everything that counts down and moves between phases and
// drills. Shared by the TV (/display) and the single-device mirror mode (/solo),
// so both run exactly the same engine.
//
// Two rules from CLAUDE.md live in here and must not be "tidied away":
//   * The ticker's setInterval depends on `running` only; everything else it
//     needs goes through tickCtxRef. Depending on advancePhase/phases would
//     rebuild the interval on every render and run the clock slow.
//   * The clock-override effect is declared AFTER the reset effect, so a clock
//     position pushed from outside wins when both land in the same commit.

import { useState, useEffect, useRef, useCallback } from "react";
import { getDrillPhases, drillClockSignature } from "./shared";
import { useSound } from "./useSound";

const FALLBACK_PHASE = { phase:"work", who:"both", duration:60, label:"עבודה" };

export function useWorkoutClock({ drills, judokas, globalAutoNext, soundType }) {
  const [drillIdx,  setDrillIdx]  = useState(0);
  const [phaseIdx,  setPhaseIdx]  = useState(0);
  const [timeLeft,  setTimeLeft]  = useState(drills[0] ? drills[0].durationWork : 60);
  const [running,   setRunning]   = useState(false);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [alertActive,  setAlertActive]  = useState(false);
  const [personalTimers, setPersonalTimers] = useState({});

  const intervalRef = useRef(null);
  const alertRef    = useRef(null);
  const { tickBeep, endBeep, startBeep, initCtx } = useSound(soundType);

  const current    = drills[drillIdx] || drills[0];
  const phases     = getDrillPhases(current);
  const phase      = phases[phaseIdx] || FALLBACK_PHASE;
  const isPersonal = !!current && current.type === "personal";
  const isRest     = !!current && current.type === "rest";
  const isPartner  = !!current && current.type === "partner";
  const isRestPhase = phase.phase === "rest";

  // Reset the clock when the drill — or its phase layout — actually changed.
  // Renaming a drill or editing a later one from the remote must not knock the
  // running clock back to the start.
  const clockSigRef      = useRef(null);
  const clockOverrideRef = useRef(null);
  const [clockApplyTick, setClockApplyTick] = useState(0);

  useEffect(() => {
    const d = drills[drillIdx];
    if (!d) return;
    const sig = drillClockSignature(d);
    if (clockSigRef.current === sig) return;
    clockSigRef.current = sig;
    const ph = getDrillPhases(d);
    setPhaseIdx(0);
    setTimeLeft(ph[0] ? ph[0].duration : 60);
    setAlertActive(false);
  }, [drillIdx, drills]);

  // Declared after the reset effect on purpose (see header).
  useEffect(() => {
    const o = clockOverrideRef.current;
    if (!o) return;
    clockOverrideRef.current = null;
    if (o.phaseIdx !== undefined) setPhaseIdx(o.phaseIdx);
    if (o.timeLeft !== undefined) setTimeLeft(o.timeLeft);
    setAlertActive(false);
  }, [clockApplyTick]);

  /** Force an exact clock position: { phaseIdx?, timeLeft? }. */
  const applyClock = useCallback(override => {
    clockOverrideRef.current = override;
    setClockApplyTick(t => t + 1);
  }, []);

  useEffect(() => {
    if (isPersonal) {
      const init = {};
      judokas.forEach(j => {
        init[j.id] = { drillIdx:0, timeLeft:(j.personalDrills&&j.personalDrills[0])?j.personalDrills[0].duration:60 };
      });
      setPersonalTimers(init);
    }
  }, [drillIdx, isPersonal, judokas]);

  const triggerAlert = useCallback(() => {
    setAlertActive(true);
    endBeep();
    clearTimeout(alertRef.current);
    alertRef.current = setTimeout(() => setAlertActive(false), 2500);
  }, [endBeep]);

  const advancePhase = useCallback(() => {
    setPhaseIdx(pi => {
      const nextPi = pi + 1;
      if (nextPi < phases.length) {
        setTimeLeft(phases[nextPi].duration);
        triggerAlert();
        return nextPi;
      }
      triggerAlert();
      const shouldAutoNext = globalAutoNext && current && current.autoNext;
      if (shouldAutoNext) {
        setDrillIdx(di => {
          const nextDi = di + 1;
          if (nextDi < drills.length) return nextDi;
          setRunning(false);
          return di;
        });
      } else {
        setRunning(false);
        setTimeLeft(0);
      }
      return pi;
    });
  }, [phases, triggerAlert, globalAutoNext, current, drills]);

  // The ticker reads everything it needs through a ref (see header).
  const tickCtxRef = useRef(null);
  tickCtxRef.current = { advancePhase, tickBeep, isPersonal, judokas };

  useEffect(() => {
    if (!running) { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      const { advancePhase, tickBeep, isPersonal, judokas } = tickCtxRef.current;
      setTimeLeft(t => {
        if (t <= 3 && t > 0) tickBeep(t);
        if (t <= 1) { advancePhase(); return 0; }
        return t - 1;
      });
      setTotalElapsed(e => e + 1);
      if (isPersonal) {
        setPersonalTimers(prev => {
          const next = {...prev};
          judokas.forEach(j => {
            const pt = next[j.id]; if(!pt) return;
            if (pt.timeLeft <= 1) {
              const ni = pt.drillIdx + 1;
              const nd = j.personalDrills && j.personalDrills[ni];
              next[j.id] = nd ? {drillIdx:ni,timeLeft:nd.duration} : {drillIdx:pt.drillIdx,timeLeft:0};
            } else {
              next[j.id] = {...pt,timeLeft:pt.timeLeft-1};
            }
          });
          return next;
        });
      }
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const goToDrill = useCallback(i => {
    if (i >= 0 && i < drills.length) { setDrillIdx(i); setRunning(false); }
  }, [drills.length]);

  const addTime = s => setTimeLeft(t => Math.max(0, t+s));
  const resetPhase = () => { setTimeLeft(phase.duration); setAlertActive(false); };
  const nextPhaseManual = () => {
    const nextPi = phaseIdx + 1;
    if (nextPi < phases.length) { setPhaseIdx(nextPi); setTimeLeft(phases[nextPi].duration); }
    else goToDrill(drillIdx + 1);
  };
  const prevPhaseManual = () => {
    if (phaseIdx > 0) { setPhaseIdx(phaseIdx - 1); setTimeLeft(phases[phaseIdx - 1].duration); }
    else goToDrill(drillIdx - 1);
  };

  const startPlaying = useCallback(() => {
    setRunning(r => { if (!r) startBeep(); return true; });
  }, [startBeep]);

  const toggleRunning = () => setRunning(r => { const next = !r; if (next) startBeep(); return next; });

  return {
    drillIdx, setDrillIdx, phaseIdx, setPhaseIdx, timeLeft, setTimeLeft,
    running, setRunning, totalElapsed, alertActive, personalTimers,
    current, phases, phase, isPersonal, isRest, isPartner, isRestPhase,
    goToDrill, addTime, resetPhase, nextPhaseManual, prevPhaseManual,
    startPlaying, toggleRunning, applyClock, initCtx,
  };
}
