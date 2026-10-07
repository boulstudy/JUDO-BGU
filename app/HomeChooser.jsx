'use client';

// Entry screen: one link for everything. The question is "what is THIS device?"
// — not "what is my role" — because the same URL is opened on the TV and on the
// phone. A TV browser is recognised and pre-selected (never redirected), and the
// last choice is remembered.

import { useState, useEffect, useRef } from "react";

const FONT = "Heebo,sans-serif";
const LAST_KEY = "judo_last_role";
const TV_UA = /(smart-?tv|tizen|web0s|webos|bravia|hbbtv|netcast|viera|appletv|aft[a-z]*\b|crkey|googletv|android tv|roku|large screen)/i;

const ROLES = {
  display: { href: "/display", label: "המסך באולם" },
  remote:  { href: "/remote",  label: "שלט בנייד" },
  solo:    { href: "/solo",    label: "שיקוף הנייד" },
};

const card = (accent) => ({
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
  width: "100%", padding: "26px 20px", borderRadius: 18, boxSizing: "border-box", textAlign: "center",
  border: "2px solid " + (accent ? "rgba(255,107,0,0.6)" : "rgba(255,255,255,0.16)"),
  background: accent ? "rgba(255,107,0,0.1)" : "rgba(255,255,255,0.05)",
  color: "#fff", textDecoration: "none", fontFamily: FONT, cursor: "pointer",
});
const title = { fontSize: 22, fontWeight: 900 };
const sub = { fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 };

export default function HomeChooser() {
  const [step, setStep] = useState("device");   // "device" | "phone"
  const [isTv, setIsTv] = useState(false);
  const [last, setLast] = useState("");
  const displayRef = useRef(null);

  useEffect(() => {
    try { setIsTv(TV_UA.test(navigator.userAgent || "")); } catch(e) {}
    try { const l = window.localStorage.getItem(LAST_KEY); if (ROLES[l]) setLast(l); } catch(e) {}
  }, []);

  // React only auto-focuses form controls, so a TV remote gets its cursor by hand.
  useEffect(() => { if (isTv && displayRef.current) displayRef.current.focus(); }, [isTv, step]);

  const remember = role => { try { window.localStorage.setItem(LAST_KEY, role); } catch(e) {} };

  return (
    <div style={{
      minHeight: "100dvh", width: "100%", background: "#080a10", direction: "rtl", fontFamily: FONT, color: "#fff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 26, padding: "28px 20px", boxSizing: "border-box",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&display=swap" rel="stylesheet" />
      <style>{`a:focus-visible,button:focus-visible{outline:4px solid #FF6B00;outline-offset:3px}`}</style>

      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 10 }}>🥋</div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>נבחרת ג׳ודו BGU</h1>
        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 17, marginTop: 8, fontWeight: 700 }}>
          {step === "device" ? "מה המכשיר הזה?" : "איך מקרינים היום?"}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", maxWidth: 420 }}>
        {step === "device" && last && (
          <a href={ROLES[last].href} onClick={() => remember(last)} style={{ ...card(false), padding: "14px 16px", flexDirection: "row", gap: 10, fontSize: 16, fontWeight: 800 }}>
            ↩ בפעם הקודמת: {ROLES[last].label} — המשך
          </a>
        )}

        {step === "device" && (
          <>
            <a ref={displayRef} href="/display" onClick={() => remember("display")} style={card(isTv)}>
              <span style={{ fontSize: 40 }}>📺</span>
              <span style={title}>המסך באולם</span>
              <span style={sub}>טלויזיה חכמה או מחשב — מציג את האימון למתאמנים{isTv ? " · זוהתה טלויזיה" : ""}</span>
            </a>
            <button onClick={() => setStep("phone")} style={{ ...card(!isTv), font: "inherit" }}>
              <span style={{ fontSize: 40 }}>📱</span>
              <span style={title}>הנייד שלי</span>
              <span style={sub}>המאמן — שולט באימון ומנהל את המערך</span>
            </button>
          </>
        )}

        {step === "phone" && (
          <>
            <a href="/remote" onClick={() => remember("remote")} style={card(true)}>
              <span style={{ fontSize: 40 }}>🔗</span>
              <span style={title}>יש מסך עם האתר פתוח</span>
              <span style={sub}>הנייד הופך לשלט. מקלידים את הקוד שמוצג על המסך</span>
            </a>
            <a href="/solo" onClick={() => remember("solo")} style={card(false)}>
              <span style={{ fontSize: 40 }}>🪞</span>
              <span style={title}>אשקף את הנייד לטלויזיה</span>
              <span style={sub}>אין טלויזיה חכמה? הנייד עצמו הוא מסך האימון, והשיקוף מעביר אותו לטלויזיה</span>
            </a>
            <button onClick={() => setStep("device")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 15, cursor: "pointer", fontFamily: FONT, padding: 12, textDecoration: "underline" }}>→ חזרה</button>
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", justifyContent: "center" }}>
        <a href="/clubs" style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, textDecoration: "none" }}>🗂️ ניהול מועדונים (בטא)</a>
      </div>
    </div>
  );
}
