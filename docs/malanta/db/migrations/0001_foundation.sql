-- 0001_foundation — סכמות, תוספים, פונקציות תשתית, יומן ביקורת
-- ============================================================================
create extension if not exists postgis  with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

create schema if not exists app;    -- פונקציות פנימיות. לא ב-exposed schemas של PostgREST
comment on schema app is 'פנימי. אין לחשוף ב-PostgREST.';

-- ── updated_at ──────────────────────────────────────────────────────────────
create or replace function app.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ── created_at לא ניתן לזיוף ───────────────────────────────────────────────
-- נדרש בכל טבלה שבה check constraint מסתמך על created_at, אחרת הקליינט
-- שולח ערך עתידי ועוקף את המגבלה. (נמצא ותוקן בבדיקה בסבב הקודם.)
create or replace function app.force_created_at()
returns trigger language plpgsql as $$
begin new.created_at := now(); return new; end $$;

-- ── עמודות שיוך בלתי ניתנות לשינוי ─────────────────────────────────────────
create or replace function app.freeze_columns()
returns trigger language plpgsql as $$
declare col text; old_j jsonb := to_jsonb(old); new_j jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    if (old_j ->> col) is distinct from (new_j ->> col) then
      raise exception 'column % is immutable', col using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;

-- ── נעילה אופטימית ─────────────────────────────────────────────────────────
-- אם הקליינט שולח lock_version הוא חייב להיות הנוכחי; אחרת 40001.
-- אם לא שלח — נחשב "כתיבה עיוורת" ומותרת. שכבת הדאטה שולחת תמיד.
create or replace function app.bump_lock_version()
returns trigger language plpgsql as $$
begin
  if new.lock_version <> old.lock_version then
    raise exception 'stale_write: row is at version %, write assumed %',
      old.lock_version, new.lock_version using errcode = '40001';
  end if;
  new.lock_version := old.lock_version + 1;
  return new;
end $$;

-- ── slugs שמורים ───────────────────────────────────────────────────────────
create or replace function app.is_reserved_slug(p text)
returns boolean language sql immutable as $$
  select lower(p) = any (array[
    'admin','administrator','api','app','apps','auth','www','mail','smtp','m',
    'map','maps','static','assets','cdn','img','images','media','files',
    'login','logout','signin','signup','register','account','accounts','profile',
    'settings','billing','pay','payment','payments','checkout','order','orders',
    'invoice','invoices','support','help','docs','doc','blog','news','about',
    'terms','privacy','legal','dmca','security','status','health',
    'malanta','platform','system','root','superuser','test','dev','staging',
    'new','edit','delete','create','update','search','explore','discover','null','undefined'
  ])
$$;

-- ── טקסט מנורמל להשוואה ────────────────────────────────────────────────────
create or replace function app.norm_email(p text)
returns text language sql immutable as $$ select lower(btrim(p)) $$;

-- ============================================================================
-- audit_log — התשתית שכל טענת "מי עשה מה" נשענת עליה
-- ============================================================================
-- ⚠️ actor_id ללא FK במכוון: יומן ביקורת חייב לשרוד מחיקת משתמש.
--    FK עם cascade היה הופך "מחקתי את החשבון" למחיקת הראיות.
create table audit_log (
  id           bigserial primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid,
  actor_kind   text not null
                 check (actor_kind in ('creator','traveler','platform_admin','system','anonymous')),
  actor_email  text,                       -- תמונת מצב. המשתמש עלול להימחק
  action       text not null,              -- 'access.grant','content.update','admin.map.read'
  outcome      text not null default 'success' check (outcome in ('success','denied','error')),
  tenant_id    uuid,
  map_id       uuid,
  target_table text,
  target_id    uuid,
  summary      text,
  metadata     jsonb not null default '{}'::jsonb
                 check (pg_column_size(metadata) < 16384),
  ip           inet,
  user_agent   text,
  request_id   text
);

create index audit_log_tenant_idx on audit_log (tenant_id, occurred_at desc);
create index audit_log_actor_idx  on audit_log (actor_id,  occurred_at desc);
create index audit_log_action_idx on audit_log (action,    occurred_at desc);
create index audit_log_target_idx on audit_log (target_table, target_id, occurred_at desc);

-- append-only ברמת המנוע. חל גם על service_role.
create rule audit_log_no_update as on update to audit_log do instead nothing;
create rule audit_log_no_delete as on delete to audit_log do instead nothing;

-- כתיבה ליומן מתוך טריגרים ופונקציות
create or replace function app.audit(
  p_action text, p_actor_kind text default 'system', p_outcome text default 'success',
  p_tenant uuid default null, p_map uuid default null,
  p_table text default null, p_target uuid default null,
  p_summary text default null, p_metadata jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = public, pg_temp as $$
  insert into audit_log (actor_id, actor_kind, action, outcome, tenant_id, map_id,
                         target_table, target_id, summary, metadata)
  values (auth.uid(), p_actor_kind, p_action, p_outcome, p_tenant, p_map,
          p_table, p_target, p_summary, p_metadata);
$$;
