-- Phase 1+2: accounts, clubs, branches, teams.
--
-- This repo's agent environment cannot reach Supabase (see CLAUDE.md "בדיקות"),
-- so there is no automated migration runner here. Run this once, by hand, in
-- the Supabase SQL editor for oakbpcjxjunppuyddpsj, then tell the app to use it.
--
-- Hierarchy: profiles (1 per auth user) -> clubs (1 owner) -> branches (<= 3
-- per club) -> teams. Coaches, judokas, catalog and plans are later phases —
-- this migration only lays the accounts + structure foundation.

-- ── profiles ──────────────────────────────────────────────────────────────
-- One row per auth.users row, created automatically on signup.
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text not null,
  name           text,
  is_site_admin  boolean not null default false,
  created_at     timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Read own row; site admins read everyone's (used by later admin screens).
create function public.is_site_admin()
returns boolean
language sql
stable
as $$
  select coalesce((select is_site_admin from public.profiles where id = auth.uid()), false);
$$;

alter table public.profiles enable row level security;

create policy "profiles: read own or admin" on public.profiles
  for select using (auth.uid() = id or public.is_site_admin());

create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id);

-- ── clubs ─────────────────────────────────────────────────────────────────
-- One owner per club (see CLAUDE.md — a "chain" is one club with several
-- branches, not several clubs).
create table public.clubs (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  name          text not null,
  branch_quota  int not null default 3,
  created_at    timestamptz not null default now()
);

alter table public.clubs enable row level security;

create policy "clubs: owner or admin" on public.clubs
  for all
  using (auth.uid() = owner_id or public.is_site_admin())
  with check (auth.uid() = owner_id or public.is_site_admin());

-- ── branches ──────────────────────────────────────────────────────────────
create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs(id) on delete cascade,
  name        text not null,
  city        text,
  created_at  timestamptz not null default now()
);

alter table public.branches enable row level security;

create policy "branches: club owner or admin" on public.branches
  for all
  using (
    public.is_site_admin()
    or exists (select 1 from public.clubs c where c.id = branches.club_id and c.owner_id = auth.uid())
  )
  with check (
    public.is_site_admin()
    or exists (select 1 from public.clubs c where c.id = branches.club_id and c.owner_id = auth.uid())
  );

-- Quota is enforced here too, not just in the UI — a direct REST call must
-- not be able to bypass it.
create function public.enforce_branch_quota()
returns trigger
language plpgsql
as $$
declare
  current_count int;
  quota int;
begin
  select count(*) into current_count from public.branches where club_id = new.club_id;
  select branch_quota into quota from public.clubs where id = new.club_id;
  if current_count >= quota then
    raise exception 'branch quota (%) reached for this club', quota;
  end if;
  return new;
end;
$$;

create trigger before_branch_insert
  before insert on public.branches
  for each row execute function public.enforce_branch_quota();

-- ── teams ─────────────────────────────────────────────────────────────────
create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references public.branches(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

alter table public.teams enable row level security;

create policy "teams: club owner or admin" on public.teams
  for all
  using (
    public.is_site_admin()
    or exists (
      select 1 from public.branches b
      join public.clubs c on c.id = b.club_id
      where b.id = teams.branch_id and c.owner_id = auth.uid()
    )
  )
  with check (
    public.is_site_admin()
    or exists (
      select 1 from public.branches b
      join public.clubs c on c.id = b.club_id
      where b.id = teams.branch_id and c.owner_id = auth.uid()
    )
  );
