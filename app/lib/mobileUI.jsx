'use client';

// The phone's building blocks.
//
// Two constraints shape all of it. The coach operates this one-handed, standing
// up, in a hall — so nothing important sits above the thumb, and nothing is
// smaller than a finger. And the app runs installed to the home screen, where
// there is no browser chrome to absorb the iPhone's home indicator — hence the
// safe-area insets, without which the bottom tabs sit underneath it.

import { useEffect, useRef, useState } from "react";
import { useToasts, dismiss } from "./notify";

export const C = {
  bg:      "#080a10",
  surface: "#11141f",
  raised:  "#181c2b",
  line:    "rgba(255,255,255,0.08)",
  lineHi:  "rgba(255,255,255,0.16)",
  ink:     "#f2f4f8",
  ink2:    "rgba(255,255,255,0.62)",
  ink3:    "rgba(255,255,255,0.34)",
  accent:  "#FF6B00",
  accentSoft: "rgba(255,107,0,0.13)",
  go:      "#2ecc71",
  stop:    "#ff4444",
  rest:    "#a8ff78",
};

export const TAP = 46;            // smallest thing worth aiming at
export const FONT = "Heebo,system-ui,sans-serif";
export const NUM  = "Oswald,ui-monospace,monospace";

export const SAFE_BOTTOM = "env(safe-area-inset-bottom, 0px)";
export const SAFE_TOP    = "env(safe-area-inset-top, 0px)";

// ── page ─────────────────────────────────────────────────────────────────────

export function Screen({ children, pad = 14, bottom = 0, style }) {
  return (
    <div style={{
      flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch",
      padding: pad, paddingBottom: `calc(${bottom}px + ${pad}px + ${SAFE_BOTTOM})`,
      display: "flex", flexDirection: "column", gap: 12,
      ...style,
    }}>{children}</div>
  );
}

export function Header({ title, sub, right }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: `calc(12px + ${SAFE_TOP}) 14px 12px`,
      borderBottom: "1px solid " + C.line, flexShrink: 0,
      background: C.bg,
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: -0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        {sub ? <div style={{ color: C.ink3, fontSize: 12.5, marginTop: 1 }}>{sub}</div> : null}
      </div>
      {right}
    </div>
  );
}

// ── tabs ─────────────────────────────────────────────────────────────────────

export function TabBar({ tabs, value, onChange }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: `repeat(${tabs.length},1fr)`,
      borderTop: "1px solid " + C.line, background: "rgba(10,12,20,0.96)",
      backdropFilter: "blur(12px)", flexShrink: 0,
      paddingBottom: SAFE_BOTTOM,
    }}>
      {tabs.map(t => {
        const on = t.id === value;
        return (
          <button key={t.id} onClick={() => onChange(t.id)} aria-current={on ? "page" : undefined} style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "9px 2px 8px", minHeight: TAP,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            color: on ? C.accent : C.ink3, fontFamily: FONT,
            borderTop: "2px solid " + (on ? C.accent : "transparent"),
            marginTop: -1,
          }}>
            <span style={{ fontSize: 19, lineHeight: 1 }}>{t.icon}</span>
            <span style={{ fontSize: 11, fontWeight: on ? 700 : 400 }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── surfaces ─────────────────────────────────────────────────────────────────

export function Card({ children, onClick, accent, style, ...rest }) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e); } } : undefined}
      style={{
        background: accent ? C.accentSoft : C.surface,
        border: "1px solid " + (accent ? "rgba(255,107,0,0.35)" : C.line),
        borderRadius: 14, padding: 14,
        cursor: clickable ? "pointer" : "default",
        ...style,
      }}
      {...rest}
    >{children}</div>
  );
}

export function Label({ children, style }) {
  return <div style={{ color: C.ink3, fontSize: 11, letterSpacing: 2.5, ...style }}>{children}</div>;
}

export function Pill({ children, color = C.ink2, bg }) {
  return (
    <span style={{
      background: bg || "rgba(255,255,255,0.06)", color,
      borderRadius: 100, padding: "3px 10px", fontSize: 12, fontWeight: 700,
      whiteSpace: "nowrap", flexShrink: 0,
    }}>{children}</span>
  );
}

// ── controls ─────────────────────────────────────────────────────────────────

const VARIANTS = {
  primary: { background: "linear-gradient(135deg,#FF6B00,#cc4400)", color: "#fff", border: "none", fontWeight: 800 },
  go:      { background: "linear-gradient(135deg,#2ecc71,#1f9c54)", color: "#fff", border: "none", fontWeight: 900 },
  stop:    { background: "linear-gradient(135deg,#ff4444,#a82020)", color: "#fff", border: "none", fontWeight: 900 },
  ghost:   { background: "rgba(255,255,255,0.05)", color: C.ink, border: "1px solid " + C.line, fontWeight: 600 },
  quiet:   { background: "none", color: C.ink2, border: "1px solid " + C.line, fontWeight: 500 },
  danger:  { background: "rgba(255,68,68,0.08)", color: "#ff8080", border: "1px solid rgba(255,68,68,0.3)", fontWeight: 600 },
};

export function Btn({ children, variant = "ghost", size = "md", disabled, style, ...rest }) {
  const v = VARIANTS[variant] || VARIANTS.ghost;
  const pad = size === "lg" ? "18px 20px" : size === "sm" ? "8px 12px" : "13px 16px";
  const fs  = size === "lg" ? 19 : size === "sm" ? 13 : 15.5;
  return (
    <button
      disabled={disabled}
      style={{
        ...v, borderRadius: 12, padding: pad, fontSize: fs,
        fontFamily: FONT, cursor: disabled ? "not-allowed" : "pointer",
        minHeight: size === "sm" ? 36 : TAP, opacity: disabled ? 0.4 : 1,
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
        ...style,
      }}
      {...rest}
    >{children}</button>
  );
}

export function TextInput({ style, ...rest }) {
  return (
    <input
      style={{
        background: "rgba(255,255,255,0.05)", border: "1px solid " + C.line,
        borderRadius: 11, color: C.ink, padding: "12px 13px",
        fontFamily: FONT, fontSize: 16,     // 16px: anything less and iOS zooms
        outline: "none", width: "100%", minHeight: TAP, direction: "rtl",
        ...style,
      }}
      {...rest}
    />
  );
}

export function TextArea({ style, ...rest }) {
  return (
    <textarea
      style={{
        background: "rgba(255,255,255,0.05)", border: "1px solid " + C.line,
        borderRadius: 11, color: C.ink, padding: "12px 13px",
        fontFamily: FONT, fontSize: 16, lineHeight: 1.6,
        outline: "none", width: "100%", resize: "vertical", direction: "rtl",
        ...style,
      }}
      {...rest}
    />
  );
}

export function Segmented({ options, value, onChange, style }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${options.length},1fr)`, gap: 6, ...style }}>
      {options.map(o => {
        const on = o.id === value;
        return (
          <button key={o.id} onClick={() => onChange(o.id)} style={{
            background: on ? C.accentSoft : "rgba(255,255,255,0.04)",
            border: "1px solid " + (on ? "rgba(255,107,0,0.5)" : C.line),
            color: on ? C.accent : C.ink2, borderRadius: 11,
            padding: "11px 6px", minHeight: TAP, cursor: "pointer",
            fontFamily: FONT, fontSize: 14, fontWeight: on ? 700 : 400,
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

export function Toggle({ on, onChange, label, hint }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      display: "flex", alignItems: "center", gap: 12, width: "100%",
      background: "none", border: "none", cursor: "pointer",
      padding: "10px 0", minHeight: TAP, fontFamily: FONT, textAlign: "start",
    }}>
      <span style={{
        width: 46, height: 27, borderRadius: 100, flexShrink: 0, position: "relative",
        background: on ? C.accent : "rgba(255,255,255,0.12)", transition: "background 0.18s",
      }}>
        <span style={{
          position: "absolute", top: 3, insetInlineStart: on ? 22 : 3,
          width: 21, height: 21, borderRadius: "50%", background: "#fff",
          transition: "inset-inline-start 0.18s",
        }} />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", color: C.ink, fontSize: 15 }}>{label}</span>
        {hint ? <span style={{ display: "block", color: C.ink3, fontSize: 12.5, marginTop: 1 }}>{hint}</span> : null}
      </span>
    </button>
  );
}

// ── sheet ────────────────────────────────────────────────────────────────────

export function Sheet({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, direction: "rtl", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
      <div style={{
        position: "relative", background: C.raised,
        borderTop: "1px solid " + C.lineHi, borderRadius: "20px 20px 0 0",
        maxHeight: "88vh", display: "flex", flexDirection: "column",
        paddingBottom: SAFE_BOTTOM,
      }}>
        <div style={{ display: "flex", alignItems: "center", padding: "14px 16px 10px", gap: 10, borderBottom: "1px solid " + C.line }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 800 }}>{title}</div>
          <button onClick={onClose} aria-label="סגור" style={{
            background: "none", border: "none", color: C.ink3, cursor: "pointer",
            fontSize: 22, lineHeight: 1, padding: 6, minWidth: 40, minHeight: 40,
          }}>✕</button>
        </div>
        <div style={{ overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {children}
        </div>
        {footer ? <div style={{ padding: "12px 16px", borderTop: "1px solid " + C.line, display: "flex", gap: 10 }}>{footer}</div> : null}
      </div>
    </div>
  );
}

// ── empty state ──────────────────────────────────────────────────────────────

export function Empty({ icon, title, hint, action }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      gap: 10, padding: "44px 20px", textAlign: "center",
    }}>
      <div style={{ fontSize: 38, opacity: 0.7 }}>{icon}</div>
      <div style={{ fontSize: 17, fontWeight: 700 }}>{title}</div>
      {hint ? <div style={{ color: C.ink3, fontSize: 14, lineHeight: 1.6, maxWidth: 320 }}>{hint}</div> : null}
      {action ? <div style={{ marginTop: 6 }}>{action}</div> : null}
    </div>
  );
}

// ── toasts ───────────────────────────────────────────────────────────────────

export function Toasts() {
  const list = useToasts();
  if (!list.length) return null;
  return (
    <div style={{
      position: "fixed", insetInline: 12, zIndex: 500, direction: "rtl",
      bottom: `calc(78px + ${SAFE_BOTTOM})`,
      display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
    }}>
      {list.map(t => (
        <div key={t.id} onClick={() => dismiss(t.id)} style={{
          pointerEvents: "auto", cursor: "pointer",
          background: t.kind === "error" ? "rgba(120,20,20,0.96)" : "rgba(24,28,43,0.97)",
          border: "1px solid " + (t.kind === "error" ? "rgba(255,68,68,0.5)" : C.lineHi),
          color: C.ink, borderRadius: 12, padding: "12px 14px",
          fontFamily: FONT, fontSize: 14.5, lineHeight: 1.5,
          boxShadow: "0 8px 26px rgba(0,0,0,0.45)",
        }}>{t.text}</div>
      ))}
    </div>
  );
}

// ── misc ─────────────────────────────────────────────────────────────────────

export function useNow(ms = 1000) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export const stopEvent = e => { e.stopPropagation(); };

// Wraps a run of digits-and-symbols ("1 / 4", "3x · 01:30") so the RTL bidi
// algorithm cannot reorder it. Two numbers separated only by a neutral
// character (/, ·, :) get visually flipped inside an RTL block unless pinned
// to ltr explicitly — this is the fix, applied as one inline component
// wherever that pattern shows up rather than repeating the style inline.
export function Num({ children, style }) {
  return <span style={{ direction: "ltr", unicodeBidi: "embed", ...style }}>{children}</span>;
}
