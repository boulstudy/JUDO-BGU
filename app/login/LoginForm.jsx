'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";

const card = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 14,
  padding: 22,
};

const input = {
  width: "100%",
  background: "rgba(0,0,0,0.35)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 10,
  color: "#fff",
  padding: "13px 14px",
  fontFamily: "Heebo,sans-serif",
  fontSize: 15,
  outline: "none",
  direction: "ltr",
  textAlign: "right",
};

export default function LoginForm() {
  const router = useRouter();
  const { isAuthed, loading, signIn, signUp } = useAuth();

  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmSent, setConfirmSent] = useState(false);

  useEffect(() => {
    if (!loading && isAuthed) router.replace("/clubs");
  }, [loading, isAuthed, router]);

  const submit = async e => {
    e.preventDefault();
    if (!email || !password || busy) return;
    setBusy(true);
    setError("");
    const r = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    if (r.needsConfirmation) { setConfirmSent(true); return; }
    router.replace("/clubs");
  };

  return (
    <div style={{
      minHeight: "100dvh", width: "100%", background: "#080a10", direction: "rtl",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 26, padding: "32px 20px", boxSizing: "border-box", color: "#fff",
      fontFamily: "Heebo,sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&family=Oswald:wght@700&display=swap" rel="stylesheet" />
      <style>{`
        *{box-sizing:border-box}
        input::placeholder{color:rgba(255,255,255,0.3)}
      `}</style>

      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🥋</div>
        <div style={{ fontSize: 22, fontWeight: 900 }}>נבחרת ג׳ודו BGU</div>
        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 14, marginTop: 6 }}>
          {mode === "signin" ? "התחברות לניהול המועדון" : "הרשמה כבעל מועדון חדש"}
        </div>
      </div>

      <div style={{ ...card, width: "100%", maxWidth: 380 }}>
        {confirmSent ? (
          <div style={{ textAlign: "center", padding: "10px 4px" }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>📩</div>
            <div style={{ fontSize: 15, lineHeight: 1.7, color: "rgba(255,255,255,0.75)" }}>
              שלחנו מייל אישור ל-{email}.<br/>אחרי שמאשרים אפשר להתחבר.
            </div>
            <button
              onClick={() => { setConfirmSent(false); setMode("signin"); }}
              style={{ marginTop: 16, background: "none", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", borderRadius: 10, padding: "10px 18px", cursor: "pointer", fontSize: 14 }}
            >חזרה להתחברות</button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>אימייל</div>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="coach@example.com" style={input} autoComplete="email" required />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>סיסמה</div>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={input} autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={6} required />
            </div>

            {error && (
              <div style={{ color: "#ff8a8a", fontSize: 13.5, background: "rgba(255,60,60,0.1)", border: "1px solid rgba(255,60,60,0.3)", borderRadius: 8, padding: "9px 12px" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !email || !password}
              style={{
                marginTop: 4, padding: "14px", fontSize: 16, fontWeight: 900, borderRadius: 11, border: "none",
                cursor: busy ? "default" : "pointer", color: "#fff", fontFamily: "Heebo,sans-serif",
                background: (!email || !password) ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg,#FF6B00,#cc4400)",
                opacity: busy ? 0.7 : (!email || !password) ? 0.4 : 1,
              }}
            >{busy ? "רגע…" : mode === "signin" ? "התחבר" : "הרשם"}</button>
          </form>
        )}
      </div>

      {!confirmSent && (
        <button
          onClick={() => { setMode(m => m === "signin" ? "signup" : "signin"); setError(""); }}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", cursor: "pointer", fontSize: 14 }}
        >
          {mode === "signin" ? "אין לך חשבון? הרשמה" : "כבר יש לך חשבון? התחברות"}
        </button>
      )}
    </div>
  );
}
