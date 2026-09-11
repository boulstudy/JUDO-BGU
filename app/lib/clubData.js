'use client';

// Club-scoped reads and writes against the v2 schema (supabase/schema.sql).
//
// Every query here relies on RLS to do the actual access control — this
// module shapes requests, it doesn't enforce anything. The server is the only
// place isolation between clubs is real; see supabase/schema.sql for the
// policies this all assumes are in force.
//
// This is the swap-in replacement for the local-only collections in store.js,
// activated once a coach has signed in and joined a club — see
// app/coach/AuthGate.jsx and the NEXT_PUBLIC_ENABLE_CLUBS flag in CLAUDE.md.

import { supa } from "./supabase";
import { localDate } from "./localDate";

// NOTE for whoever wires this into store.js: route the mutating calls below
// (create/update/archive/upsert/start/finish) through writeQueue.js's
// writeOrQueue() instead of calling supa() directly, the way store.js's
// pushPlan() already does — that's what turns a dropped connection in the
// hall into "queued, will sync" instead of a failed save. Left as plain
// supa() here because this module isn't on the live path yet (see
// CLAUDE.md) and wiring the queue in before there's a real backend to test
// the retry behavior against would be unverified guesswork.

const qs = params => Object.entries(params).filter(([, v]) => v !== undefined)
  .map(([k, v]) => k + "=" + v).join("&");

// ── groups & athletes ────────────────────────────────────────────────────────

export const listGroups = () =>
  supa("groups?" + qs({ order: "created_at.asc", archived_at: "is.null" }));

export const createGroup = (clubId, name) =>
  supa("groups", { method: "POST", body: JSON.stringify({ club_id: clubId, name }) });

export const updateGroup = (id, patch) =>
  supa("groups?id=eq." + id, { method: "PATCH", body: JSON.stringify(patch) });

export const archiveGroup = id =>
  supa("groups?id=eq." + id, { method: "PATCH", body: JSON.stringify({ archived_at: new Date().toISOString() }) });

export const listAthletes = groupId =>
  supa("athletes?" + qs({ group_id: "eq." + groupId, archived_at: "is.null", order: "name.asc" }));

export const upsertAthlete = (clubId, groupId, athlete) =>
  athlete.id
    ? supa("athletes?id=eq." + athlete.id, { method: "PATCH", body: JSON.stringify(athlete) })
    : supa("athletes", { method: "POST", body: JSON.stringify({ ...athlete, club_id: clubId, group_id: groupId }) });

export const archiveAthlete = id =>
  supa("athletes?id=eq." + id, { method: "PATCH", body: JSON.stringify({ archived_at: new Date().toISOString() }) });

// ── catalog (drills) ─────────────────────────────────────────────────────────
// RLS already filters to "shared in my club, or mine" — no extra clause needed.

export const listDrills = () => supa("drills?" + qs({ order: "created_at.desc", archived_at: "is.null" }));

export const createDrill = (clubId, ownerId, drill) =>
  supa("drills", { method: "POST", body: JSON.stringify({ ...drill, club_id: clubId, owner_id: ownerId }) });

export const updateDrill = (id, patch) =>
  supa("drills?id=eq." + id, { method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });

export const archiveDrill = id =>
  supa("drills?id=eq." + id, { method: "PATCH", body: JSON.stringify({ archived_at: new Date().toISOString() }) });

// Editing a drill you don't own is a fork, never a write to their row — RLS
// would refuse the write anyway (drills_update requires owner_id = auth.uid());
// this makes the same rule visible in the client instead of surfacing as a
// rejected request.
export const forkDrill = (clubId, ownerId, source, changes) =>
  createDrill(clubId, ownerId, {
    ...source, ...changes,
    id: undefined, forked_from: source.id, uses: 0,
  });

// ── plans ────────────────────────────────────────────────────────────────────

export const listPlans = () => supa("plans?" + qs({ order: "updated_at.desc", archived_at: "is.null" }));

export const createPlan = (clubId, ownerId, plan) =>
  supa("plans", { method: "POST", body: JSON.stringify({ ...plan, club_id: clubId, owner_id: ownerId }) });

export const updatePlan = (id, patch) =>
  supa("plans?id=eq." + id, { method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });

export const archivePlan = id =>
  supa("plans?id=eq." + id, { method: "PATCH", body: JSON.stringify({ archived_at: new Date().toISOString() }) });

// ── sessions (history) ───────────────────────────────────────────────────────

export const listSessions = (limit = 30) =>
  supa("sessions?" + qs({ order: "started_at.desc", limit }));

// A session snapshots the plan's drills at the moment training starts — the
// row never references the live plan, so editing the plan tomorrow can't
// rewrite what happened tonight.
export const startSession = (clubId, coachId, { plan, group }) =>
  supa("sessions", {
    method: "POST",
    body: JSON.stringify({
      club_id: clubId, coach_id: coachId,
      group_id: group ? group.id : null, plan_id: plan ? plan.id : null,
      local_date: localDate(),
      drills: (plan && plan.drills) || [],
      notes: "",
    }),
  });

export const finishSession = (id, patch) =>
  supa("sessions?id=eq." + id, { method: "PATCH", body: JSON.stringify(patch) });

// ── club membership ──────────────────────────────────────────────────────────
// These three call the SECURITY DEFINER functions in schema.sql (RPC) rather
// than writing to `clubs`/`profiles` directly — see schema.sql for why a
// direct write is refused (a trigger blocks it) and this is the only path in.

export const getProfile = userId => supa("profiles?id=eq." + userId + "&select=*");

export const createClub = name =>
  supa("rpc/create_club", { method: "POST", body: JSON.stringify({ club_name: name }) });

export const redeemInvite = code =>
  supa("rpc/redeem_invite", { method: "POST", body: JSON.stringify({ invite_code: code }) });

export const makeInvite = (clubId, createdBy, code, ttlHours = 72) =>
  supa("club_invites", {
    method: "POST",
    body: JSON.stringify({
      code, club_id: clubId, created_by: createdBy,
      expires_at: new Date(Date.now() + ttlHours * 3600 * 1000).toISOString(),
    }),
  });

export const listInvites = () => supa("club_invites?order=expires_at.desc");
