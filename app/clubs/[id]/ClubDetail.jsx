'use client';

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth, authedFetch } from "../../lib/auth";
import { ORANGE, card, btn, input, Shell } from "../../lib/manageUi";

const label = { color: "rgba(255,255,255,0.3)", fontSize: 11, letterSpacing: 2, marginBottom: 10 };

function ComingSoonCard({ icon, title, sub }) {
  return (
    <div style={{ ...card, opacity: 0.55, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{icon} {title}</span>
        <span style={{ fontSize: 11, color: ORANGE, border: "1px solid rgba(255,107,0,0.4)", borderRadius: 6, padding: "2px 8px" }}>בקרוב</span>
      </div>
      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>{sub}</span>
    </div>
  );
}

function TeamRow({ team }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: ORANGE, flexShrink: 0 }} />
      <span style={{ fontSize: 14 }}>{team.name}</span>
    </div>
  );
}

function NewTeamForm({ onCreate }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    await onCreate(name.trim());
    setBusy(false);
    setName("");
  };
  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8 }}>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="שם הנבחרת" style={{ ...input, padding: "8px 12px", fontSize: 13.5, flex: 1 }} />
      <button type="submit" disabled={busy || !name.trim()} style={{ ...btn("rgba(255,107,0,0.14)", ORANGE), padding: "8px 14px", fontSize: 13, opacity: (!name.trim() || busy) ? 0.5 : 1 }}>+ נבחרת</button>
    </form>
  );
}

function BranchCard({ branch, onCreateTeam }) {
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <span style={{ fontSize: 17, fontWeight: 700 }}>{branch.name}</span>
        {branch.city && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>{branch.city}</span>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {branch.teams.length === 0 && <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 13 }}>אין נבחרות עדיין בסניף הזה</div>}
        {branch.teams.map(t => <TeamRow key={t.id} team={t} />)}
      </div>

      <NewTeamForm onCreate={name => onCreateTeam(branch.id, name)} />
    </div>
  );
}

function NewBranchForm({ atQuota, onCreate }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);

  if (atQuota) {
    return (
      <div style={{ ...card, textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 13.5 }}>
        הגעתם למכסת הסניפים. לפנייה להגדלת המכסה — יש לפנות להנהלת האתר.
      </div>
    );
  }

  const submit = async e => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    await onCreate(name.trim(), city.trim());
    setBusy(false);
    setName(""); setCity("");
  };

  return (
    <form onSubmit={submit} style={{ ...card, display: "flex", gap: 10, flexWrap: "wrap", border: "1px dashed rgba(255,255,255,0.15)", background: "none" }}>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="שם הסניף" style={{ ...input, flex: 2, minWidth: 140 }} />
      <input value={city} onChange={e => setCity(e.target.value)} placeholder="עיר (אופציונלי)" style={{ ...input, flex: 1, minWidth: 120 }} />
      <button type="submit" disabled={busy || !name.trim()} style={{ ...btn("linear-gradient(135deg,#FF6B00,#cc4400)", "#fff", "none"), opacity: (!name.trim() || busy) ? 0.5 : 1 }}>
        {busy ? "רגע…" : "+ סניף"}
      </button>
    </form>
  );
}

export default function ClubDetail({ clubId }) {
  const router = useRouter();
  const { loading, isAuthed } = useAuth();

  const [club, setClub] = useState(null); // undefined-ish states: null = loading, false = not found/denied
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !isAuthed) router.replace("/login");
  }, [loading, isAuthed, router]);

  const load = useCallback(async () => {
    const r = await authedFetch(
      "clubs?id=eq." + clubId + "&select=*,branches(*,teams(*))" +
      "&branches.order=name.asc&branches.teams.order=name.asc"
    );
    if (!r || !r[0]) { setClub(false); return; }
    setClub(r[0]);
  }, [clubId]);

  useEffect(() => { if (isAuthed) load(); }, [isAuthed, load]);

  const createBranch = async (name, city) => {
    const r = await authedFetch("branches", { method: "POST", body: JSON.stringify({ club_id: clubId, name, city: city || null }) });
    if (!r || !r[0]) { setError("לא הצלחנו להוסיף את הסניף — ייתכן שהמכסה נגמרה"); return; }
    setError("");
    load();
  };

  const createTeam = async (branchId, name) => {
    const r = await authedFetch("teams", { method: "POST", body: JSON.stringify({ branch_id: branchId, name }) });
    if (!r || !r[0]) { setError("לא הצלחנו להוסיף את הנבחרת"); return; }
    setError("");
    load();
  };

  if (loading || !isAuthed || club === null) {
    return <Shell><div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "80px 0" }}>טוען…</div></Shell>;
  }

  if (club === false) {
    return (
      <Shell>
        <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.4)" }}>
          המועדון לא נמצא, או שאין לך גישה אליו.
          <div style={{ marginTop: 16 }}>
            <a href="/clubs" style={{ color: ORANGE }}>← חזרה למועדונים</a>
          </div>
        </div>
      </Shell>
    );
  }

  const branches = club.branches || [];

  return (
    <Shell>
      <a href="/clubs" style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textDecoration: "none" }}>← המועדונים שלי</a>

      <div style={{ fontSize: 26, fontWeight: 900, marginTop: 10, marginBottom: 26 }}>{club.name}</div>

      <div style={label}>הקטלוג</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 30 }}>
        <ComingSoonCard icon="📚" title="קטלוג התרגילים" sub="המאגר שממנו בונים מערכי אימון" />
        <ComingSoonCard icon="📋" title="מערכי אימון" sub="אימונים בנויים, גלויים לכל מאמני המועדון" />
      </div>

      <div style={label}>
        סניפים · {branches.length}/{club.branch_quota}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {branches.map(b => <BranchCard key={b.id} branch={b} onCreateTeam={createTeam} />)}
        <NewBranchForm atQuota={branches.length >= club.branch_quota} onCreate={createBranch} />
      </div>

      {error && <div style={{ color: "#ff8a8a", fontSize: 13, marginTop: 14 }}>{error}</div>}
    </Shell>
  );
}
