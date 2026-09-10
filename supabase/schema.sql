-- ═══════════════════════════════════════════════════════════════════════════
-- JUDO-BGU V2 schema — clubs, coaches, and a catalog shared within a club.
--
-- Run supabase/backup.sql first and keep its output. Then run this file once
-- (it's written to be safe to re-run: every object uses IF NOT EXISTS / OR
-- REPLACE / DROP POLICY IF EXISTS before CREATE POLICY). Then run migrate.sql
-- to carry over the three old tables.
--
-- Where to run this: Supabase dashboard → SQL Editor → paste → Run. Requires
-- no extensions beyond what a stock Supabase project already has.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── clubs & people ───────────────────────────────────────────────────────────

create table if not exists clubs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(trim(name)) > 0),
  slug       text unique,
  owner_id   uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- One row per signed-in coach. club_id is null until they create or join a
-- club — the app treats that as "finish onboarding" rather than an error.
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  club_id      uuid references clubs(id) on delete set null,
  role         text not null default 'coach' check (role in ('admin', 'coach')),
  created_at   timestamptz not null default now()
);

-- Short-lived codes that let a second coach join a club without an admin
-- inviting them by email — matches how the room-pairing code already works
-- elsewhere in this app: read it off a screen, type it in.
create table if not exists club_invites (
  code       text primary key,
  club_id    uuid not null references clubs(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_by    uuid references auth.users(id) on delete set null,
  used_at    timestamptz
);

-- ── club content ─────────────────────────────────────────────────────────────

create table if not exists groups (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references clubs(id) on delete cascade,
  name        text not null check (char_length(trim(name)) > 0),
  color       text not null default '#FF6B00',
  -- Default training pairs for this group, e.g. [["athlete-id-1","athlete-id-2"]].
  -- A session can still re-pair on the day; this is just what a fresh session
  -- starts from, matching the local-first shape store.js already uses.
  pairs       jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists athletes (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null references clubs(id) on delete cascade,
  group_id        uuid references groups(id) on delete set null,
  name            text not null check (char_length(trim(name)) > 0),
  belt            text not null default '',
  side            text not null default 'white' check (side in ('white', 'blue')),
  personal_drills jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  archived_at     timestamptz
);

-- visibility: 'shared' (default — every coach in the club sees it) or
-- 'private' (only the owner). There is no cross-club 'public' tier yet; see
-- CLAUDE.md for why that's a deliberate, easy-to-widen-later choice.
create table if not exists drills (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  club_id     uuid not null references clubs(id) on delete cascade,
  name        text not null check (char_length(trim(name)) > 0),
  section     text not null default 'technique',
  type        text not null default 'partner',
  spec        jsonb not null default '{}',   -- durationWork, rounds, pattern, ...
  visibility  text not null default 'shared' check (visibility in ('shared', 'private')),
  forked_from uuid references drills(id) on delete set null,
  tags        text[] not null default '{}',
  uses        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists plans (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  club_id     uuid not null references clubs(id) on delete cascade,
  group_id    uuid references groups(id) on delete set null,
  name        text not null check (char_length(trim(name)) > 0),
  drills      jsonb not null default '[]',
  visibility  text not null default 'shared' check (visibility in ('shared', 'private')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);

-- A session snapshots the plan's drills at the moment training started —
-- deliberately not a foreign key into a live plan. Editing tonight's plan
-- tomorrow must not rewrite what happened tonight.
create table if not exists sessions (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references clubs(id) on delete cascade,
  group_id    uuid references groups(id) on delete set null,
  plan_id     uuid references plans(id) on delete set null,
  coach_id    uuid not null references auth.users(id) on delete cascade,
  local_date  date not null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  drills      jsonb not null default '[]',
  present_ids uuid[] not null default '{}',
  notes       text not null default '',
  stats       jsonb not null default '{}'
);

create index if not exists idx_groups_club    on groups(club_id)    where archived_at is null;
create index if not exists idx_athletes_club  on athletes(club_id)  where archived_at is null;
create index if not exists idx_drills_club    on drills(club_id)    where archived_at is null;
create index if not exists idx_plans_club     on plans(club_id)     where archived_at is null;
create index if not exists idx_sessions_club  on sessions(club_id, local_date desc);
create index if not exists idx_invites_club   on club_invites(club_id);

-- ── helpers ──────────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER + a fixed search_path, owned by the migration-running role
-- (postgres, which in Supabase has BYPASSRLS). That's what lets my_club() read
-- profiles without recursing into profiles' own RLS policy, which itself calls
-- my_club(). Without this, "select my_club()" from inside a profiles policy
-- would deadlock against itself.

create or replace function my_club()
returns uuid
language sql security definer set search_path = public stable as $$
  select club_id from profiles where id = auth.uid();
$$;

create or replace function my_role()
returns text
language sql security definer set search_path = public stable as $$
  select role from profiles where id = auth.uid();
$$;

-- Creates a club and makes the caller its admin, in one call — the app's
-- "new club" onboarding step. Runs as one function so a crash midway never
-- leaves a club with no admin or a coach stuck mid-signup.
create or replace function create_club(club_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if exists (select 1 from profiles where id = auth.uid() and club_id is not null) then
    raise exception 'already in a club';
  end if;
  insert into clubs (name, owner_id) values (club_name, auth.uid()) returning id into new_id;
  perform set_config('app.bypass_membership_guard', 'on', true);
  insert into profiles (id, club_id, role, display_name)
    values (auth.uid(), new_id, 'admin', coalesce((select display_name from profiles where id = auth.uid()), ''))
    on conflict (id) do update set club_id = new_id, role = 'admin';
  return new_id;
end;
$$;

-- Redeems an invite code: joins the caller to that club as a coach. Checked
-- and consumed atomically so two coaches racing on the same code can't both
-- win it, and an expired or already-used code fails with a clear reason
-- rather than silently doing nothing.
create or replace function redeem_invite(invite_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare inv club_invites;
begin
  select * into inv from club_invites where code = invite_code for update;
  if inv is null then raise exception 'invite not found'; end if;
  if inv.used_by is not null then raise exception 'invite already used'; end if;
  if inv.expires_at < now() then raise exception 'invite expired'; end if;

  update club_invites set used_by = auth.uid(), used_at = now() where code = invite_code;
  perform set_config('app.bypass_membership_guard', 'on', true);
  insert into profiles (id, club_id, role, display_name)
    values (auth.uid(), inv.club_id, 'coach', coalesce((select display_name from profiles where id = auth.uid()), ''))
    on conflict (id) do update set club_id = inv.club_id, role = 'coach';
  return inv.club_id;
end;
$$;

-- Populate a fresh signup's profile row so my_club()/my_role() never see a
-- missing row for a real user (a missing row and "no club yet" must stay
-- distinguishable, so this always runs, even before onboarding).
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name) values (new.id, '')
    on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table clubs        enable row level security;
alter table profiles     enable row level security;
alter table club_invites enable row level security;
alter table groups       enable row level security;
alter table athletes     enable row level security;
alter table drills       enable row level security;
alter table plans        enable row level security;
alter table sessions     enable row level security;

-- clubs: members can see their own club's row; creation goes through
-- create_club() (SECURITY DEFINER), not a direct insert.
drop policy if exists clubs_select on clubs;
create policy clubs_select on clubs for select using (id = my_club());

-- profiles: see your own row and your clubmates' (so coaches can see who else
-- coaches the club). club_id/role are never writable directly — only via
-- create_club()/redeem_invite() — so a coach can't grant themselves admin or
-- hop into a club they were never invited to.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (id = auth.uid() or club_id = my_club());

drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- club_id and role are guarded by a trigger, not the policy above: a RLS
-- WITH CHECK that reads the same row it's updating (to compare NEW against
-- OLD) depends on subtle snapshot-visibility rules and is easy to get subtly
-- wrong. A BEFORE UPDATE trigger comparing NEW to OLD directly is the
-- standard, unambiguous way to make specific columns immutable through the
-- normal client path while still letting create_club()/redeem_invite()
-- (SECURITY DEFINER, bypasses this trigger's intent by design — see below)
-- change them.
create or replace function guard_profile_membership()
returns trigger
language plpgsql as $$
begin
  -- create_club()/redeem_invite() set this transaction-local flag right
  -- before the update that is legitimately allowed to move club_id/role; a
  -- raw client UPDATE through PostgREST never sets it, so it stays blocked.
  if current_setting('app.bypass_membership_guard', true) = 'on' then
    return new;
  end if;
  -- A club being deleted cascades to `club_id = null` on every member's
  -- profile (see `on delete set null` above) — that has to pass through
  -- the guard too, since it isn't a privilege grab, just membership ending.
  -- Anything else (a different club, or any role change) still requires
  -- create_club()/redeem_invite().
  if new.role is distinct from old.role
     or (new.club_id is distinct from old.club_id and new.club_id is not null) then
    raise exception 'club_id and role can only change via create_club() or redeem_invite()';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_membership on profiles;
create trigger profiles_guard_membership
  before update on profiles
  for each row execute function guard_profile_membership();

-- club_invites: only an admin of the club can create or list its invite
-- codes; redemption happens through redeem_invite(), which runs as the table
-- owner and does not need a select/update policy of its own.
drop policy if exists invites_admin on club_invites;
create policy invites_admin on club_invites for all
  using (club_id = my_club() and my_role() = 'admin')
  with check (club_id = my_club() and my_role() = 'admin');

-- groups / athletes: any coach in the club can manage the shared roster —
-- several coaches running one club's groups together is the whole point.
drop policy if exists groups_club on groups;
create policy groups_club on groups for all
  using (club_id = my_club()) with check (club_id = my_club());

drop policy if exists athletes_club on athletes;
create policy athletes_club on athletes for all
  using (club_id = my_club()) with check (club_id = my_club());

-- drills / plans: every clubmate can read a shared one, or your own private
-- one; only the owner can write or delete. Editing someone else's shared
-- drill is a fork (a new row with forked_from set), handled in the app —
-- never a write to their row.
drop policy if exists drills_select on drills;
create policy drills_select on drills for select
  using (club_id = my_club() and (visibility = 'shared' or owner_id = auth.uid()));

drop policy if exists drills_write on drills;
create policy drills_write on drills for insert
  with check (club_id = my_club() and owner_id = auth.uid());

drop policy if exists drills_update on drills;
create policy drills_update on drills for update
  using (owner_id = auth.uid()) with check (club_id = my_club() and owner_id = auth.uid());

drop policy if exists drills_delete on drills;
create policy drills_delete on drills for delete using (owner_id = auth.uid());

drop policy if exists plans_select on plans;
create policy plans_select on plans for select
  using (club_id = my_club() and (visibility = 'shared' or owner_id = auth.uid()));

drop policy if exists plans_write on plans;
create policy plans_write on plans for insert
  with check (club_id = my_club() and owner_id = auth.uid());

drop policy if exists plans_update on plans;
create policy plans_update on plans for update
  using (owner_id = auth.uid()) with check (club_id = my_club() and owner_id = auth.uid());

drop policy if exists plans_delete on plans;
create policy plans_delete on plans for delete using (owner_id = auth.uid());

-- sessions: club-scoped read/write for any coach (covering histroy and a
-- coach picking up where another left off); nothing here is ever hard-deleted
-- by the app.
drop policy if exists sessions_club on sessions;
create policy sessions_club on sessions for all
  using (club_id = my_club()) with check (club_id = my_club());
