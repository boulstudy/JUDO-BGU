'use client';

// The coach's app. Two modes, not five tabs and a modal soup:
//
//   home mode    — everything before a training starts: today's plan, the
//                  plan library, groups, the catalog, settings and history.
//   session mode — exactly two tabs, "ניהול אימון" and "הקרנה", plus a
//                  control bar that never scrolls off, because the two
//                  things a coach needs mid-drill are the clock and play/pause.
//
// The phone is the source of truth once a session starts: useSession holds the
// anchor and pushes it out; the projection screen only ever derives from what
// this app publishes. Losing the phone mid-training is the one failure this
// whole rewrite exists to survive, so the running session is mirrored to
// localStorage on every change and offered back on the next open.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Screen, Header, TabBar, Toasts, Sheet, Btn, C, Empty, TextInput } from "../lib/mobileUI";
import { TodayTab, PlansTab, GroupsTab, CatalogTab, MoreTab } from "./HomeTabs";
import ManageTab from "./ManageTab";
import ProjectionTab from "./ProjectionTab";
import { useGroups, usePlans, useCatalog, useHistory } from "../lib/store";
import { useSession } from "../lib/sessionLink";
import { useWakeLock } from "../lib/wakeLock";
import { read, write, drop, KEYS } from "../lib/persist";
import { normalizeRoomCode, isValidRoomCode } from "../lib/roomCode";
import { notify } from "../lib/notify";
import { useServiceWorker } from "../lib/pwaInstall";
import { wireAutoFlush } from "../lib/writeQueue";

const HOME_TABS = [
  { id: "today",   icon: "🏠", label: "היום" },
  { id: "plans",   icon: "📋", label: "מערכים" },
  { id: "groups",  icon: "👥", label: "קבוצות" },
  { id: "catalog", icon: "📚", label: "קטלוג" },
  { id: "more",    icon: "⋯", label: "עוד" },
];

const SESSION_TABS = [
  { id: "manage",     icon: "🎛", label: "ניהול אימון" },
  { id: "projection", icon: "📺", label: "הקרנה" },
];

export default function CoachApp() {
  const groups  = useGroups();
  const catalog = useCatalog();
  const plans   = usePlans(groups.live);
  const history = useHistory();

  const [homeTab, setHomeTab] = useState("today");
  const [selectedPlanId, setSelectedPlanId] = useState(null);

  const [settings, setSettings] = useState(() => read(KEYS.settings, { globalAutoNext: true, soundType: "beep", projection: false }));
  const patchSettings = p => setSettings(s => { const next = { ...s, ...p }; write(KEYS.settings, next); return next; });

  const [room, setRoom] = useState(() => read(KEYS.room, ""));
  const setRoomPersist = r => { setRoom(r); if (r) write(KEYS.room, r); else drop(KEYS.room); };
  const [sessionTab, setSessionTab] = useState("manage");

  // ── the active session ───────────────────────────────────────────────────
  const [active, setActive] = useState(null);       // { plan, group, historyId } | null
  const [recoverable, setRecoverable] = useState(null);

  // Offer to resume a session that was still running the last time this app
  // was open — the phone died, the tab was killed, whatever the reason, the
  // coach should not have to rebuild the workout from memory mid-hall.
  useEffect(() => {
    const saved = read(KEYS.session, null);
    if (saved && saved.plan) setRecoverable(saved);
  }, []);

  const content = useMemo(() => {
    if (!active) return { drills: [] };
    return {
      drills: active.plan.drills || [],
      athletes: (active.group && active.group.athletes) || [],
      pairs: (active.group && active.group.pairs) || [],
      notes: active.notes || "",
      soundType: settings.soundType,
      projection: settings.projection,
      groupName: active.group ? active.group.name : "",
      globalAutoNext: settings.globalAutoNext,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, settings]);

  const session = useSession({
    room: active ? room : "",
    content,
    options: { globalAutoNext: settings.globalAutoNext !== false },
  });

  useWakeLock(!!active);
  useServiceWorker();
  useEffect(() => { wireAutoFlush(); }, []);

  // Persist the running session so it can be recovered.
  useEffect(() => {
    if (!active) { drop(KEYS.session); return; }
    write(KEYS.session, { ...active, notes: active.notes || "", savedAt: Date.now() });
  }, [active]);

  const startSession = useCallback((plan, group) => {
    if (!plan) return;
    const rec = history.start({ plan, group, drills: plan.drills });
    setActive({ plan, group, notes: "", historyId: rec.id });
    setSessionTab("manage");
  }, [history]);

  const resumeSaved = useCallback(() => {
    setActive(recoverable);
    setRecoverable(null);
  }, [recoverable]);

  const discardSaved = useCallback(() => {
    drop(KEYS.session);
    setRecoverable(null);
  }, []);

  const endSession = useCallback(() => {
    if (active && active.historyId) {
      history.finish(active.historyId, {
        notes: active.notes || "",
        totalElapsed: session.view ? Math.round(session.view.totalElapsed) : 0,
      });
    }
    drop(KEYS.session);
    setActive(null);
    session.controls.restart();
    notify("האימון נשמר בהיסטוריה", "info");
  }, [active, history, session]);

  const setNotes = useCallback(txt => setActive(a => (a ? { ...a, notes: txt } : a)), []);

  // ── projection draft/live merge ─────────────────────────────────────────
  // "אחרי העדכון" needs a state object shaped like the live one but with the
  // pending edits folded in — same ProjectionScreen renders both, so the coach
  // sees precisely what pushing will change.
  const liveState = useMemo(() => (active && session.view ? {
    ...content,
    drillIdx: session.view.drillIdx, phaseIdx: session.view.phaseIdx,
    timeLeft: session.view.timeLeft, running: session.view.running,
    totalElapsed: session.view.totalElapsed,
  } : null), [active, session.view, content]);

  // Right now every control applies immediately (phase 2 has no separate
  // "draft" queue for the clock — see CLAUDE.md); dirty stays false until a
  // staged-edit queue is added in a later pass. The seam is here so
  // ProjectionTab already knows how to render one.
  const dirty = false;
  const draftState = null;

  const [pairSheet, setPairSheet] = useState(false);

  return (
    <div style={{
      position: "fixed", inset: 0, background: C.bg, color: C.ink,
      display: "flex", flexDirection: "column", direction: "rtl",
      fontFamily: "Heebo,system-ui,sans-serif", overflow: "hidden",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&family=Oswald:wght@500;700&display=swap" rel="stylesheet" />

      {!active ? (
        <>
          <Header
            title={HOME_TABS.find(t => t.id === homeTab)?.label || ""}
            right={room ? <span style={{ color: "#2ecc71", fontSize: 12 }}>📺 {room}</span> : null}
          />
          {homeTab === "today"   && <TodayTab groups={groups} plans={plans} history={history} selectedPlanId={selectedPlanId} onSelectPlan={setSelectedPlanId} onStart={startSession} />}
          {homeTab === "plans"   && <PlansTab plans={plans} catalog={catalog} groups={groups} />}
          {homeTab === "groups"  && <GroupsTab groups={groups} />}
          {homeTab === "catalog" && <CatalogTab catalog={catalog} />}
          {homeTab === "more"    && <MoreTab history={history} settings={settings} onSettings={patchSettings} room={room} onPairTv={() => { setHomeTab("more"); setPairSheet(true); }} />}
          <TabBar tabs={HOME_TABS} value={homeTab} onChange={setHomeTab} />
        </>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
          <Header
            title={active.plan.name}
            sub={active.group ? active.group.name : ""}
            right={<Btn size="sm" variant="quiet" onClick={() => setSessionTab(t => (t === "manage" ? "projection" : "manage"))}>
              {sessionTab === "manage" ? "📺" : "🎛"}
            </Btn>}
          />
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            {sessionTab === "manage" ? (
              <ManageTab
                drills={active.plan.drills || []}
                view={session.view}
                controls={session.controls}
                notes={active.notes || ""}
                onNotes={setNotes}
                settings={settings}
                onSettings={patchSettings}
                onEndSession={endSession}
              />
            ) : (
              <ProjectionTab
                room={room}
                onRoom={setRoomPersist}
                status={session.status}
                screenConnected={session.screenConnected}
                liveState={liveState}
                draftState={draftState}
                dirty={dirty}
                onPush={session.republish}
                onDiscard={() => {}}
              />
            )}
          </div>
          <TabBar tabs={SESSION_TABS} value={sessionTab} onChange={setSessionTab} />
        </div>
      )}

      <Toasts />

      <Sheet open={!!recoverable} onClose={discardSaved} title="יש אימון פעיל">
        {recoverable && (
          <>
            <div style={{ color: C.ink2, fontSize: 15, lineHeight: 1.7 }}>
              נמצא אימון "{recoverable.plan.name}" שלא הסתיים. להמשיך אותו?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn style={{ flex: 1 }} onClick={discardSaved}>התחל מחדש</Btn>
              <Btn variant="primary" style={{ flex: 1 }} onClick={resumeSaved}>המשך אימון</Btn>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={pairSheet} onClose={() => setPairSheet(false)} title="חיבור להקרנה">
        <PairSheetBody room={room} onRoom={r => { setRoomPersist(r); setPairSheet(false); }} />
      </Sheet>
    </div>
  );
}

function PairSheetBody({ room, onRoom }) {
  const [typed, setTyped] = useState("");
  const full = isValidRoomCode(typed);
  return (
    <>
      <div style={{ color: C.ink2, fontSize: 14, lineHeight: 1.7 }}>
        פתח את מסך ההקרנה על הטלויזיה והקלד כאן את הקוד שמוצג שם.
      </div>
      <TextInput
        value={typed}
        onChange={e => setTyped(normalizeRoomCode(e.target.value))}
        placeholder="קוד בן 6 תווים"
        style={{ fontFamily: "Oswald,monospace", fontSize: 22, letterSpacing: 6, textAlign: "center", direction: "ltr" }}
      />
      <Btn variant="primary" disabled={!full} onClick={() => onRoom(typed)} style={{ width: "100%" }}>חבר</Btn>
      {room && <Btn variant="quiet" onClick={() => onRoom("")} style={{ width: "100%" }}>נתק ({room})</Btn>}
    </>
  );
}
