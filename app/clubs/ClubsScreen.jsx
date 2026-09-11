'use client';

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth, authedFetch } from "../lib/auth";
import { card, btn, input, Shell } from "../lib/manageUi";

export default function ClubsScreen() {
  const router = useRouter();
  const { user, loading, isAuthed, signOut } = useAuth();

  const [clubs, setClubs] = useState(null); // null = not loaded yet
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !isAuthed) router.replace("/login");
  }, [loading, isAuthed, router]);

  const load = useCallback(async () => {
    const r = await authedFetch("clubs?select=*&order=created_at.asc");
    setClubs(r || []);
  }, []);

  useEffect(() => { if (isAuthed) load(); }, [isAuthed, load]);

  const createClub = async e => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    const r = await authedFetch("clubs", { method: "POST", body: JSON.stringify({ owner_id: user.id, name: name.trim() }) });
    setBusy(false);
    if (!r || !r[0]) { setError("לא הצלחנו ליצור את המועדון — נסו שוב"); return; }
    router.push("/clubs/" + r[0].id);
  };

  if (loading || !isAuthed || clubs === null) {
    return <Shell><div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "80px 0" }}>טוען…</div></Shell>;
  }

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>מועדוני הג׳ודו שלי</div>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginTop: 4 }}>{user && user.email}</div>
        </div>
        <button onClick={() => signOut().then(() => router.replace("/login"))} style={btn("rgba(255,60,60,0.1)", "#ff6060")}>התנתק</button>
      </div>

      {clubs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 26 }}>
          {clubs.map(c => (
            <a key={c.id} href={"/clubs/" + c.id} style={{ ...card, textDecoration: "none", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{c.name}</span>
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 20 }}>‹</span>
            </a>
          ))}
        </div>
      )}

      {clubs.length === 0 && (
        <div style={{ ...card, marginBottom: 26 }}>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, marginBottom: 14 }}>
            עדיין אין לך מועדון. צרו אחד כדי להתחיל להוסיף סניפים ונבחרות.
          </div>
          <form onSubmit={createClub} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="שם המועדון" style={{ ...input, flex: 1, minWidth: 180 }} required />
            <button type="submit" disabled={busy || !name.trim()} style={{ ...btn("linear-gradient(135deg,#FF6B00,#cc4400)", "#fff", "none"), opacity: (!name.trim() || busy) ? 0.5 : 1 }}>
              {busy ? "רגע…" : "צור מועדון"}
            </button>
          </form>
          {error && <div style={{ color: "#ff8a8a", fontSize: 13, marginTop: 10 }}>{error}</div>}
        </div>
      )}
    </Shell>
  );
}
