'use client';

// The workout builder on its own page — for a computer or tablet. The workout is
// kept on this device; the phone remote and /solo open the same builder in place.

import { useState, useEffect } from "react";
import WorkoutBuilder from "../lib/WorkoutBuilder";
import { INIT_DRILLS } from "../lib/defaults";

const KEY = "judo_build_workout";

export default function BuildScreen() {
  const [drills, setDrills] = useState(INIT_DRILLS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) { const d = JSON.parse(raw); if (Array.isArray(d)) setDrills(d); }
    } catch(e) {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { window.localStorage.setItem(KEY, JSON.stringify(drills)); } catch(e) {}
  }, [drills, loaded]);

  return <WorkoutBuilder drills={drills} onChange={setDrills} onClose={() => { window.location.href = "/"; }} />;
}
