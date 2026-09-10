-- ═══════════════════════════════════════════════════════════════════════════
-- Carries the three old tables (drill_library, workouts, attendance) into the
-- v2 schema. Run schema.sql first. Idempotent: every insert here is keyed so
-- running this twice does not duplicate rows.
--
-- BEFORE RUNNING: run supabase/backup.sql and keep its output — this reads
-- the old tables but never writes or drops them, so they're safe either way,
-- but a backup costs nothing and this is exactly the situation it's for.
--
-- YOU MUST EDIT THE TWO VALUES BELOW before running. Everything old becomes
-- one club, owned by one coach — that coach must already have signed up
-- through the app once (so a row exists in auth.users) before this runs.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  target_owner  uuid := '00000000-0000-0000-0000-000000000000';  -- ← EDIT: your auth.users id
  target_club_name text := 'BGU';                                 -- ← EDIT: club name, if you want one made
  target_club   uuid;
  target_group  uuid;
  r             record;
  n_drills      int := 0;
  n_plans       int := 0;
  n_sessions    int := 0;
begin
  if target_owner = '00000000-0000-0000-0000-000000000000' then
    raise exception 'edit target_owner at the top of this script before running it';
  end if;
  if not exists (select 1 from auth.users where id = target_owner) then
    raise exception 'no auth.users row for %; sign up through the app first', target_owner;
  end if;

  -- Reuse a club already owned by this coach if one exists (so re-running
  -- this script does not create a second "BGU" every time); otherwise make one.
  select id into target_club from clubs where owner_id = target_owner order by created_at limit 1;
  if target_club is null then
    -- create_club() reads auth.uid() from this claim rather than from
    -- current_user, so it attributes correctly even though this whole script
    -- runs as the database owner (who bypasses RLS by design — an admin
    -- migration is exactly the case RLS bypass exists for).
    perform set_config('request.jwt.claim.sub', target_owner::text, true);
    select create_club(target_club_name) into target_club;
  end if;
  raise notice 'target club: %', target_club;

  -- A holding group for whatever roster the old `workouts` rows carried, so
  -- migrated plans have somewhere to point. The coach can rename or split it
  -- in the app afterward.
  select id into target_group from groups where club_id = target_club and name = 'הועבר מהמערכת הישנה' limit 1;
  if target_group is null then
    insert into groups (club_id, name) values (target_club, 'הועבר מהמערכת הישנה') returning id into target_group;
  end if;

  -- ── drill_library → drills ──────────────────────────────────────────────
  for r in select * from drill_library loop
    if not exists (
      select 1 from drills where club_id = target_club and owner_id = target_owner
        and name = r.name and (spec->>'legacyId') = r.id::text
    ) then
      insert into drills (owner_id, club_id, name, section, type, spec, visibility)
      values (
        target_owner, target_club, r.name,
        coalesce(nullif(r.section, ''), 'technique'),
        coalesce(nullif(r.type, ''), 'partner'),
        jsonb_build_object(
          'legacyId', r.id::text,
          'durationWork', coalesce(r.duration_work, 60),
          'durationRest', coalesce(r.duration_rest, 0),
          'rounds', coalesce(r.rounds, 1),
          'pattern', coalesce(nullif(r.pattern, ''), 'together'),
          'activeColor', coalesce(nullif(r.active_color, ''), 'both'),
          'note', coalesce(r.note, '')
        ),
        'shared'
      );
      n_drills := n_drills + 1;
    end if;
  end loop;

  -- ── workouts → plans ─────────────────────────────────────────────────────
  -- Dedup key: same owner+club+name+drills content. There is no free-form bag
  -- on plans to stash a legacy id in the way spec/stats do for drills and
  -- sessions below (drills has to stay a pure array of drill objects — the
  -- app reads it directly), so this compares the migrated content itself
  -- rather than a marker. That is exactly as strong a check here: two
  -- workouts producing byte-identical name+drills are indistinguishable
  -- anyway, and re-running this script always regenerates the same content
  -- from the same source row.
  for r in select * from workouts loop
    declare
      plan_name text := coalesce(nullif(r.name, ''), 'אימון ' || r.date::text);
      plan_drills jsonb := coalesce(r.drills, '[]'::jsonb);
    begin
      if not exists (
        select 1 from plans
        where club_id = target_club and owner_id = target_owner
          and name = plan_name and drills = plan_drills
      ) then
        insert into plans (owner_id, club_id, group_id, name, drills, visibility)
        values (target_owner, target_club, target_group, plan_name, plan_drills, 'shared');
        n_plans := n_plans + 1;
      end if;
    end;
  end loop;

  -- ── attendance → sessions ────────────────────────────────────────────────
  -- attendance had no drill list, just who showed up — migrated as a session
  -- record with empty drills and the headcount in `stats`, so it still shows
  -- up in history rather than being silently dropped.
  for r in select * from attendance loop
    if not exists (select 1 from sessions where club_id = target_club and local_date = r.date and coach_id = target_owner
                     and (stats->>'legacyAttendanceId') = r.id::text) then
      insert into sessions (club_id, group_id, coach_id, local_date, started_at, ended_at, drills, present_ids, notes, stats)
      values (
        target_club, target_group, target_owner, r.date,
        r.date::timestamptz, r.date::timestamptz,
        '[]'::jsonb, '{}'::uuid[], 'הועבר מרישום נוכחות ישן — אין רשימת תרגילים',
        jsonb_build_object('legacyAttendanceId', r.id::text, 'presentCount', r.total)
      );
      n_sessions := n_sessions + 1;
    end if;
  end loop;

  raise notice 'migrated: % drills, % plans, % attendance→sessions', n_drills, n_plans, n_sessions;
end $$;
