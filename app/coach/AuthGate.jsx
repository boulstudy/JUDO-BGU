'use client';

// Sign-in and club onboarding — shown only when clubs are turned on
// (NEXT_PUBLIC_ENABLE_CLUBS, see CLAUDE.md). Three states in order:
//
//   1. no session       → email + password, sign in or sign up
//   2. session, no club → create a club (become its admin) or join one by
//                         invite code (same read-off-a-screen-type-it-in
//                         idiom as pairing the projection)
//   3. session + club    → renders `children`, i.e. the real app
//
// Deliberately not a multi-step wizard component — each state is small
// enough to just be a screen.

import { useState, useEffect, useCallback } from "react";
import { C, FONT, Screen, Btn, Label, Card, TextInput, Empty } from "../lib/mobileUI";
import { subscribeAuth, restoreSession, signIn, signUp, signOut, getSession } from "../lib/auth";
import { getProfile, createClub, redeemInvite } from "../lib/clubData";
import { notifyError, notify } from "../lib/notify";

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined);   // undefined = still loading
  const [profile, setProfile] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => subscribeAuth(setSession), []);
  useEffect(() => { restoreSession().finally(() => setChecking(false)); }, []);

  const loadProfile = useCallback(async userId => {
    const { data } = await getProfile(userId);
    setProfile((data && data[0]) || null);
  }, []);

  useEffect(() => {
    if (session && session.user) loadProfile(session.user.id);
    else setProfile(null);
  }, [session, loadProfile]);

  if (checking || session === undefined) {
    return <div style={{ position: "fixed", inset: 0, background: C.bg }} />;
  }

  if (!session) return <SignInScreen />;
  if (!profile || !profile.club_id) return <ClubOnboarding userId={session.user.id} onDone={() => loadProfile(session.user.id)} />;
  return children;
}

function SignInScreen() {
  const [mode, setMode] = useState("in");   // "in" | "up"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || password.length < 6) return;
    setBusy(true);
    const res = mode === "in" ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
    setBusy(false);
    if (!res.ok) { notifyError(new Error(res.error)); return; }
    if (mode === "up" && res.needsConfirmation) notify("נשלח מייל אישור — פתח אותו כדי להתחבר", "info", 6000);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, color: C.ink, direction: "rtl", fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <Screen style={{ justifyContent: "center", maxWidth: 380, margin: "0 auto", width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 44 }}>🥋</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 8 }}>Judo Trainer</div>
          <div style={{ color: C.ink3, fontSize: 14, marginTop: 4 }}>
            {mode === "in" ? "התחברות למועדון שלך" : "יצירת חשבון מאמן"}
          </div>
        </div>

        <div>
          <Label style={{ marginBottom: 7 }}>אימייל</Label>
          <TextInput id="auth-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                     autoCapitalize="off" autoCorrect="off" inputMode="email" />
        </div>
        <div>
          <Label style={{ marginBottom: 7 }}>סיסמה</Label>
          <TextInput id="auth-password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                     onKeyDown={e => { if (e.key === "Enter") submit(); }} />
          {mode === "up" && <div style={{ color: C.ink3, fontSize: 12.5, marginTop: 5 }}>לפחות 6 תווים</div>}
        </div>

        <Btn variant="primary" size="lg" disabled={busy || !email.trim() || password.length < 6} onClick={submit}>
          {mode === "in" ? "התחבר" : "צור חשבון"}
        </Btn>

        <button onClick={() => setMode(m => (m === "in" ? "up" : "in"))} style={{
          background: "none", border: "none", color: C.ink3, cursor: "pointer",
          fontFamily: FONT, fontSize: 13.5, padding: 10, textAlign: "center",
        }}>
          {mode === "in" ? "אין לך חשבון? הרשם" : "כבר יש לך חשבון? התחבר"}
        </button>
      </Screen>
    </div>
  );
}

function ClubOnboarding({ userId, onDone }) {
  const [tab, setTab] = useState("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const { data, error } = await createClub(name.trim());
    setBusy(false);
    if (error) { notifyError(error, "יצירת המועדון נכשלה"); return; }
    notify("המועדון נוצר 🎉", "info");
    onDone();
  };

  const join = async () => {
    if (!code.trim()) return;
    setBusy(true);
    const { error } = await redeemInvite(code.trim().toUpperCase());
    setBusy(false);
    if (error) { notifyError(error, "הקוד לא תקין או פג תוקף"); return; }
    notify("הצטרפת למועדון 🎉", "info");
    onDone();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, color: C.ink, direction: "rtl", fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <Screen style={{ maxWidth: 420, margin: "0 auto", width: "100%" }}>
        <div style={{ textAlign: "center", marginTop: 20, marginBottom: 6 }}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>כמעט מוכן</div>
          <div style={{ color: C.ink3, fontSize: 14, marginTop: 4 }}>צור מועדון חדש, או הצטרף לאחד שכבר קיים</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {[["create", "מועדון חדש"], ["join", "הצטרפות בקוד"]].map(([id, l]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              background: tab === id ? "rgba(255,107,0,0.14)" : "rgba(255,255,255,0.04)",
              border: "1px solid " + (tab === id ? "rgba(255,107,0,0.5)" : C.line),
              color: tab === id ? C.accent : C.ink2, borderRadius: 11,
              padding: "12px 6px", fontFamily: FONT, fontSize: 14, cursor: "pointer",
            }}>{l}</button>
          ))}
        </div>

        {tab === "create" ? (
          <Card>
            <Label style={{ marginBottom: 7 }}>שם המועדון</Label>
            <TextInput value={name} onChange={e => setName(e.target.value)} placeholder="למשל: נבחרת ג׳ודו BGU" />
            <div style={{ color: C.ink3, fontSize: 12.5, marginTop: 8, lineHeight: 1.6 }}>
              תהיה מנהל המועדון, ותוכל להזמין מאמנים נוספים בהמשך.
            </div>
            <Btn variant="primary" size="lg" disabled={busy || !name.trim()} onClick={create} style={{ marginTop: 10, width: "100%" }}>צור מועדון</Btn>
          </Card>
        ) : (
          <Card>
            <Label style={{ marginBottom: 7 }}>קוד הזמנה</Label>
            <TextInput value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="קוד שקיבלת ממנהל המועדון" style={{ fontFamily: "Oswald,monospace", letterSpacing: 3, textAlign: "center" }} />
            <Btn variant="primary" size="lg" disabled={busy || !code.trim()} onClick={join} style={{ marginTop: 10, width: "100%" }}>הצטרף</Btn>
          </Card>
        )}

        <button onClick={signOut} style={{
          background: "none", border: "none", color: C.ink3, cursor: "pointer",
          fontFamily: FONT, fontSize: 13, padding: 10, textAlign: "center", marginTop: 20,
        }}>התנתק</button>
      </Screen>
    </div>
  );
}
