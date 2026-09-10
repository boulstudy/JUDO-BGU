'use client';

// The five home tabs — everything before "התחל אימון".
//
// Kept in one file because each is small and they share the same list/card
// idioms; splitting further would scatter twenty lines of layout each without
// buying independence, since they all read from the same local store.

import { useState } from "react";
import {
  C, NUM, FONT, Card, Btn, Label, Pill, Screen, Header, Sheet, TextInput, Toggle, Empty,
} from "../lib/mobileUI";
import PlanEditor from "./PlanEditor";
import DrillEditor, { blankDrill } from "./DrillEditor";
import { SEC_COLOR, DRILL_SECTIONS } from "../lib/shared";
import { fmt, totalDrillTime, totalWorkoutTime } from "../lib/sessionEngine";
import { longDate, relativeDate } from "../lib/localDate";
import { useInstallPrompt } from "../lib/pwaInstall";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ── היום ─────────────────────────────────────────────────────────────────────

export function TodayTab({ groups, plans, history, selectedPlanId, onSelectPlan, onStart }) {
  const livePlans = plans.live;
  const plan = livePlans.find(p => p.id === selectedPlanId) || livePlans[0] || null;
  const group = groups.live.find(g => g.id === (plan && plan.groupId)) || groups.live[0] || null;
  const lastSession = history.live[0];

  return (
    <Screen>
      <div>
        <div style={{ fontSize: 22, fontWeight: 900 }}>{longDate()}</div>
        {group && <div style={{ color: C.ink3, fontSize: 14, marginTop: 2 }}>{group.name}</div>}
      </div>

      {livePlans.length === 0 ? (
        <Empty icon="📋" title="אין עדיין מערך אימון" hint="צור מערך בטאב מערכי אימון כדי להתחיל" />
      ) : (
        <>
          {livePlans.length > 1 && (
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
              {livePlans.slice(0, 8).map(p => (
                <button key={p.id} onClick={() => onSelectPlan(p.id)} style={{
                  flexShrink: 0, background: p.id === (plan && plan.id) ? "rgba(255,107,0,0.14)" : "rgba(255,255,255,0.04)",
                  border: "1px solid " + (p.id === (plan && plan.id) ? "rgba(255,107,0,0.5)" : C.line),
                  color: p.id === (plan && plan.id) ? C.accent : C.ink2,
                  borderRadius: 100, padding: "9px 15px", fontFamily: FONT, fontSize: 13.5, cursor: "pointer",
                }}>{p.name}</button>
              ))}
            </div>
          )}

          {plan && (
            <Card>
              <Label style={{ marginBottom: 8 }}>האימון המוצע</Label>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{plan.name}</div>
              <div style={{ color: C.ink3, fontSize: 13.5, marginTop: 3 }}>
                {(plan.drills || []).length} תרגילים · {fmt(totalWorkoutTime(plan.drills || []))}
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 10, flexWrap: "wrap" }}>
                {(plan.drills || []).slice(0, 6).map((d, i) => (
                  <span key={i} style={{
                    width: 8, height: 8, borderRadius: 2,
                    background: SEC_COLOR[d.section || "warmup"],
                  }} />
                ))}
                {(plan.drills || []).length > 6 && <span style={{ color: C.ink3, fontSize: 11 }}>+{(plan.drills || []).length - 6}</span>}
              </div>
            </Card>
          )}

          <Btn variant="go" size="lg" onClick={() => onStart(plan, group)} disabled={!plan} style={{ marginTop: 4 }}>
            ▶ התחל אימון
          </Btn>
        </>
      )}

      {lastSession && (
        <Card style={{ background: "rgba(255,255,255,0.02)" }}>
          <Label style={{ marginBottom: 6 }}>אימון אחרון</Label>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 14.5 }}>{lastSession.planName}</span>
            <span style={{ color: C.ink3, fontSize: 12.5 }}>{relativeDate(lastSession.localDate)}</span>
          </div>
        </Card>
      )}
    </Screen>
  );
}

// ── מערכי אימון ─────────────────────────────────────────────────────────────

export function PlansTab({ plans, catalog, groups }) {
  const [open, setOpen] = useState(null);

  const newPlan = () => setOpen({ id: null, name: "", drills: [], visibility: "shared" });

  const save = plan => {
    if (plan.id) plans.update(plan.id, plan);
    else plans.add(plan);
    setOpen(null);
  };

  return (
    <>
      <Screen>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Label>מערכי האימון שלי</Label>
          <span style={{ marginInlineStart: "auto" }}>
            <Btn size="sm" variant="primary" onClick={newPlan}>+ מערך חדש</Btn>
          </span>
        </div>

        {plans.live.length === 0 ? (
          <Empty icon="📋" title="עדיין אין מערכים" hint="בנה מערך ידנית או הרכב אחד מתרגילי הקטלוג" action={<Btn variant="primary" onClick={newPlan}>+ מערך חדש</Btn>} />
        ) : (
          plans.live.map(p => (
            <Card key={p.id} onClick={() => setOpen(p)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{p.name || "ללא שם"}</div>
                  <div style={{ color: C.ink3, fontSize: 13, marginTop: 3 }}>
                    {(p.drills || []).length} תרגילים · {fmt(totalWorkoutTime(p.drills || []))}
                  </div>
                </div>
                {p.visibility === "private" ? <Pill>🔒 פרטי</Pill> : <Pill color={C.ink3}>👥 משותף</Pill>}
              </div>
            </Card>
          ))
        )}
      </Screen>

      {open && (
        <PlanEditor
          plan={open}
          catalog={catalog.live}
          onChange={setOpen}
          onClose={() => save(open)}
        />
      )}
    </>
  );
}

// ── קבוצות ───────────────────────────────────────────────────────────────────

export function GroupsTab({ groups }) {
  const [editingGroup, setEditingGroup] = useState(null);
  const [athleteSheet, setAthleteSheet] = useState(null);   // { groupId, athlete }

  const newGroup = () => setEditingGroup({ id: null, name: "", color: "#FF6B00", athletes: [], pairs: [] });
  const saveGroup = g => {
    if (g.id) groups.update(g.id, g); else groups.add(g);
    setEditingGroup(null);
  };

  const saveAthlete = (groupId, athlete) => {
    const g = groups.items.find(x => x.id === groupId);
    if (!g) return;
    const list = g.athletes || [];
    const next = athlete.id ? list.map(a => (a.id === athlete.id ? athlete : a)) : [...list, { ...athlete, id: uid() }];
    groups.update(groupId, { athletes: next });
    setAthleteSheet(null);
  };

  const removeAthlete = (groupId, athleteId) => {
    const g = groups.items.find(x => x.id === groupId);
    if (!g) return;
    groups.update(groupId, { athletes: (g.athletes || []).filter(a => a.id !== athleteId) });
    setAthleteSheet(null);
  };

  return (
    <>
      <Screen>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Label>הקבוצות שלי</Label>
          <span style={{ marginInlineStart: "auto" }}>
            <Btn size="sm" variant="primary" onClick={newGroup}>+ קבוצה</Btn>
          </span>
        </div>

        {groups.live.length === 0 ? (
          <Empty icon="👥" title="אין עדיין קבוצות" action={<Btn variant="primary" onClick={newGroup}>+ קבוצה</Btn>} />
        ) : (
          groups.live.map(g => (
            <Card key={g.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: g.color || C.accent, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{g.name}</div>
                  <div style={{ color: C.ink3, fontSize: 13 }}>{(g.athletes || []).length} חניכים</div>
                </div>
                <Btn size="sm" onClick={() => setEditingGroup(g)}>ערוך</Btn>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {(g.athletes || []).map(a => (
                  <button key={a.id} onClick={() => setAthleteSheet({ groupId: g.id, athlete: a })} style={{
                    background: a.color === "blue" ? "rgba(0,110,255,0.14)" : "rgba(255,255,255,0.06)",
                    border: "1px solid " + (a.color === "blue" ? "rgba(0,140,255,0.4)" : C.line),
                    color: C.ink, borderRadius: 100, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontFamily: FONT,
                  }}>{a.name}</button>
                ))}
                <button onClick={() => setAthleteSheet({ groupId: g.id, athlete: { name: "", color: "white" } })} style={{
                  background: "none", border: "1px dashed " + C.line, color: C.ink3,
                  borderRadius: 100, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontFamily: FONT,
                }}>+ חניך</button>
              </div>
            </Card>
          ))
        )}
      </Screen>

      <Sheet
        open={!!editingGroup} onClose={() => setEditingGroup(null)}
        title={editingGroup && editingGroup.id ? "עריכת קבוצה" : "קבוצה חדשה"}
        footer={<Btn variant="primary" style={{ width: "100%" }} onClick={() => saveGroup(editingGroup)} disabled={!editingGroup || !editingGroup.name.trim()}>שמור</Btn>}
      >
        {editingGroup && (
          <div>
            <Label style={{ marginBottom: 7 }}>שם הקבוצה</Label>
            <TextInput value={editingGroup.name} onChange={e => setEditingGroup({ ...editingGroup, name: e.target.value })} placeholder="נבחרת נוער, מתחילים…" />
          </div>
        )}
      </Sheet>

      <Sheet
        open={!!athleteSheet} onClose={() => setAthleteSheet(null)}
        title={athleteSheet && athleteSheet.athlete.id ? "עריכת חניך" : "חניך חדש"}
        footer={<>
          {athleteSheet && athleteSheet.athlete.id && (
            <Btn variant="danger" onClick={() => removeAthlete(athleteSheet.groupId, athleteSheet.athlete.id)}>הסר</Btn>
          )}
          <Btn variant="primary" style={{ flex: 1 }} onClick={() => saveAthlete(athleteSheet.groupId, athleteSheet.athlete)} disabled={!athleteSheet || !athleteSheet.athlete.name.trim()}>שמור</Btn>
        </>}
      >
        {athleteSheet && (
          <>
            <div>
              <Label style={{ marginBottom: 7 }}>שם</Label>
              <TextInput
                value={athleteSheet.athlete.name}
                onChange={e => setAthleteSheet({ ...athleteSheet, athlete: { ...athleteSheet.athlete, name: e.target.value } })}
              />
            </div>
            <div>
              <Label style={{ marginBottom: 7 }}>חגורה / צד</Label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {["white", "blue"].map(c => (
                  <button key={c} onClick={() => setAthleteSheet({ ...athleteSheet, athlete: { ...athleteSheet.athlete, color: c } })} style={{
                    background: athleteSheet.athlete.color === c ? (c === "blue" ? "rgba(0,110,255,0.14)" : "rgba(255,255,255,0.1)") : "rgba(255,255,255,0.04)",
                    border: "1px solid " + (athleteSheet.athlete.color === c ? (c === "blue" ? "rgba(0,140,255,0.5)" : C.lineHi) : C.line),
                    color: C.ink, borderRadius: 11, padding: "12px", fontFamily: FONT, fontSize: 14, cursor: "pointer",
                  }}>{c === "blue" ? "כחול" : "לבן"}</button>
                ))}
              </div>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}

// ── קטלוג ────────────────────────────────────────────────────────────────────

export function CatalogTab({ catalog }) {
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState("");

  const list = catalog.live.filter(d => {
    if (filter === "mine" && d.visibility !== "private") return false;
    if (q && !d.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const save = d => {
    if (d.id && catalog.items.some(x => x.id === d.id)) catalog.update(d.id, d);
    else catalog.add(d);
    setEditing(null);
  };

  return (
    <>
      <Screen>
        <TextInput value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש תרגיל…" />

        <div style={{ display: "flex", gap: 6 }}>
          {[["all", "הכל"], ["mine", "שלי"]].map(([id, l]) => (
            <button key={id} onClick={() => setFilter(id)} style={{
              background: filter === id ? "rgba(255,107,0,0.14)" : "rgba(255,255,255,0.04)",
              border: "1px solid " + (filter === id ? "rgba(255,107,0,0.5)" : C.line),
              color: filter === id ? C.accent : C.ink2, borderRadius: 100,
              padding: "8px 16px", fontFamily: FONT, fontSize: 13.5, cursor: "pointer",
            }}>{l}</button>
          ))}
          <span style={{ marginInlineStart: "auto" }}>
            <Btn size="sm" variant="primary" onClick={() => setEditing("new")}>+ תרגיל</Btn>
          </span>
        </div>

        {list.length === 0 ? (
          <Empty icon="📚" title="לא נמצאו תרגילים" />
        ) : (
          list.map(d => {
            const sc = SEC_COLOR[d.section || "warmup"];
            return (
              <Card key={d.id} onClick={() => setEditing(d)} style={{ padding: "12px 13px", display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 3, height: 30, borderRadius: 2, background: sc, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                  <div style={{ color: sc, fontSize: 12, marginTop: 1 }}>{fmt(totalDrillTime(d))} · {DRILL_SECTIONS.find(s => s.id === d.section)?.label}</div>
                </div>
                {d.visibility === "private" ? <Pill>🔒</Pill> : <Pill color={C.ink3}>👥</Pill>}
              </Card>
            );
          })
        )}
      </Screen>

      <DrillEditor
        open={!!editing}
        drill={editing === "new" ? null : editing}
        onSave={save}
        onClose={() => setEditing(null)}
        onDelete={d => { catalog.remove(d.id); setEditing(null); }}
      />
    </>
  );
}

// ── עוד ──────────────────────────────────────────────────────────────────────

export function MoreTab({ history, settings, onSettings, onPairTv, room }) {
  const [showHistory, setShowHistory] = useState(false);
  const install = useInstallPrompt();

  return (
    <>
      <Screen>
        {!install.installed && (install.canPrompt || install.platform === "ios") && (
          <Card style={{ background: "rgba(255,107,0,0.08)", border: "1px solid rgba(255,107,0,0.3)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 24 }}>📲</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>התקן כאפליקציה</div>
                <div style={{ color: C.ink3, fontSize: 12.5, marginTop: 2 }}>
                  {install.platform === "ios"
                    ? "שתף ⬆ ← הוסף למסך הבית"
                    : "פתיחה מהירה, בלי דפדפן, גם בלי רשת"}
                </div>
              </div>
              {install.canPrompt && <Btn size="sm" variant="primary" onClick={install.promptInstall}>התקן</Btn>}
            </div>
          </Card>
        )}

        <Card onClick={() => setShowHistory(true)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 15.5, fontWeight: 700 }}>📅 היסטוריית אימונים</div>
              <div style={{ color: C.ink3, fontSize: 12.5, marginTop: 2 }}>{history.live.length} אימונים נשמרו</div>
            </div>
            <span style={{ color: C.ink3 }}>‹</span>
          </div>
        </Card>

        <Card onClick={onPairTv}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 15.5, fontWeight: 700 }}>📺 חיבור להקרנה</div>
              <div style={{ color: C.ink3, fontSize: 12.5, marginTop: 2 }}>{room ? "מחובר: " + room : "לא מחובר"}</div>
            </div>
            <span style={{ color: C.ink3 }}>‹</span>
          </div>
        </Card>

        <Card>
          <Label style={{ marginBottom: 10 }}>הגדרות</Label>
          <Toggle
            on={settings.globalAutoNext !== false}
            onChange={v => onSettings({ globalAutoNext: v })}
            label="מעבר אוטומטי בין תרגילים"
          />
          <Toggle
            on={!!settings.projection}
            onChange={v => onSettings({ projection: v })}
            label="מצב הקרנה נקי כברירת מחדל"
          />
        </Card>

        <Card style={{ background: "rgba(255,255,255,0.02)" }}>
          <div style={{ color: C.ink3, fontSize: 12.5, lineHeight: 1.7 }}>
            Judo Trainer · האפליקציה עובדת גם בלי רשת — שינויים יישמרו במכשיר.
          </div>
        </Card>
      </Screen>

      <Sheet open={showHistory} onClose={() => setShowHistory(false)} title="היסטוריית אימונים">
        {history.live.length === 0 ? (
          <Empty icon="📅" title="עדיין אין היסטוריה" />
        ) : (
          history.live
            .slice()
            .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
            .map(s => (
              <Card key={s.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{s.planName}</span>
                  <span style={{ color: C.ink3, fontSize: 12.5 }}>{relativeDate(s.localDate)}</span>
                </div>
                <div style={{ color: C.ink3, fontSize: 12.5, marginTop: 3 }}>
                  {s.groupName || ""}{s.groupName ? " · " : ""}
                  {(s.drills || []).length} תרגילים
                  {!s.endedAt ? " · לא הושלם" : ""}
                </div>
              </Card>
            ))
        )}
      </Sheet>
    </>
  );
}
