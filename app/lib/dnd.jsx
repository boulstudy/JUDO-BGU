'use client';

// Pointer-based drag and drop — one code path for mouse, pen and touch.
//
//   const { startDrag, layer, over } = useDragDrop(onDrop)
//
//   draggable:   <span onPointerDown={e => startDrag(e, payload, "label")} style={{touchAction:"none"}}>⠿</span>
//   drop target: <div data-zone="workout"> <div data-item>…</div> <div data-item>…</div> </div>
//
// On drop, onDrop(payload, zone, index) is called, where `index` is the position
// among the zone's direct [data-item] children (by their vertical midpoints).
// Touch drags start from the grip only (touch-action:none there), so scrolling the
// lists with a finger keeps working.

import { useState, useRef, useCallback, useEffect } from "react";

function hit(x, y) {
  const el = document.elementFromPoint(x, y);
  const zoneEl = el && el.closest ? el.closest("[data-zone]") : null;
  if (!zoneEl) return null;
  const items = [...zoneEl.children].filter(c => c.hasAttribute("data-item"));
  let index = 0;
  items.forEach(it => { const r = it.getBoundingClientRect(); if (y > r.top + r.height / 2) index++; });
  return { zone: zoneEl.getAttribute("data-zone"), index };
}

export function useDragDrop(onDrop) {
  const [drag, setDrag] = useState(null);       // { label, x, y, over }
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  const startDrag = useCallback((e, payload, label) => {
    if (e.button !== undefined && e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    let active = false;

    const move = ev => {
      if (!active && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      active = true;
      if (ev.cancelable) ev.preventDefault();
      setDrag({ label, x: ev.clientX, y: ev.clientY, over: hit(ev.clientX, ev.clientY) });
    };
    const done = ev => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      const over = active ? hit(ev.clientX, ev.clientY) : null;
      setDrag(null);
      if (over) dropRef.current(payload, over.zone, over.index);
    };
    const up = ev => done(ev);
    const cancel = ev => { active = false; done(ev); };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  }, []);

  // The floating label under the finger/cursor, plus an insertion marker is drawn by
  // the zones themselves from `over`.
  const layer = drag && (
    <div aria-hidden="true" style={{
      position: "fixed", left: drag.x + 10, top: drag.y + 10, zIndex: 1000, pointerEvents: "none",
      background: "rgba(255,107,0,0.95)", color: "#fff", borderRadius: 10, padding: "8px 14px",
      fontFamily: "Heebo,sans-serif", fontWeight: 800, fontSize: 15, boxShadow: "0 6px 24px rgba(0,0,0,0.5)", direction: "rtl",
    }}>{drag.label}</div>
  );

  return { startDrag, layer, over: drag ? drag.over : null, dragging: !!drag };
}
