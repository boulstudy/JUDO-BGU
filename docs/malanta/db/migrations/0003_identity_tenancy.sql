-- 0003_identity_tenancy — יוצרים, משתמשים, חברות, היקף
-- ============================================================================

create table tenants (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null,
  name         text not null check (length(btrim(name)) between 2 and 120),
  legal_name   text,                       -- לחשבוניות ולהסכם
  tax_id       text,                       -- ח.פ / עוסק. נדרש כשהיוצר מוכר בעצמו
  contact_email text,
  branding     jsonb not null default '{}'::jsonb
                 check (pg_column_size(branding) < 8192),
  settings     jsonb not null default '{}'::jsonb
                 check (pg_column_size(settings) < 8192),
  status       text not null default 'active'
                 check (status in ('active','suspended','closed')),
  suspended_reason text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  lock_version bigint not null default 0,

  constraint tenants_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  constraint tenants_slug_not_reserved check (not app.is_reserved_slug(slug)),
  constraint tenants_id_key unique (id)
);
create unique index tenants_slug_uniq on tenants (lower(slug)) where deleted_at is null;
create trigger tenants_touch before update on tenants for each row execute function app.touch_updated_at();
create trigger tenants_lock  before update on tenants for each row execute function app.bump_lock_version();

comment on column tenants.branding is
  'object keys של R2, לא URL מלא: {"logo_key":"…","primary_color":"#2563eb"}';


-- ── profiles ────────────────────────────────────────────────────────────────
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  email_norm  text generated always as (lower(btrim(email))) stored,
  email_verified_at timestamptz,           -- ⚠️ תנאי לשיוך תשלום אוטומטי
  full_name   text check (full_name is null or length(btrim(full_name)) between 1 and 120),
  display_name text,
  locale      text not null default 'he' check (locale in ('he','en')),
  avatar_key  text,
  last_seen_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  -- אנונימיזציה במקום מחיקה, כשיש חובות שמירה חשבונאיות
  anonymized_at timestamptz
);
create unique index profiles_email_norm_uniq on profiles (email_norm)
  where deleted_at is null and anonymized_at is null;
create trigger profiles_touch before update on profiles for each row execute function app.touch_updated_at();

-- סנכרון מ-auth.users. בלעדיו profiles.email מתיישן בשינוי מייל
-- וההצלבה בסליקה נכשלת בשקט.
create or replace function app.sync_profile_from_auth()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into profiles (id, email, full_name, email_verified_at)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.email_confirmed_at)
  on conflict (id) do update
    set email = excluded.email,
        email_verified_at = excluded.email_verified_at;
  return new;
end $$;
create trigger on_auth_user_upsert
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function app.sync_profile_from_auth();

-- ⚠️ הגנה ברמת עמודה. עובדת גם אם policy נכתבה ברישול.
revoke update on profiles from authenticated, anon;
grant  update (full_name, display_name, locale, avatar_key) on profiles to authenticated;


-- ── platform_admins ─────────────────────────────────────────────────────────
-- אין עמודה בוליאנית על profiles. עמודת הרשאה על טבלה שהמשתמש
-- יכול לעדכן היא הסלמת הרשאות בקריאת REST אחת.
create table platform_admins (
  user_id    uuid primary key references profiles(id) on delete cascade,
  role_key   text not null references roles(key),
  granted_by uuid,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  note       text
);
revoke all on platform_admins from authenticated, anon;


-- ── memberships ─────────────────────────────────────────────────────────────
create table memberships (
  tenant_id    uuid not null references tenants(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  role         text not null references roles(key),
  status       text not null default 'active'
                 check (status in ('active','invited','suspended')),
  -- היקף מפות: true = כל מפות היוצר. false = רק מה שב-membership_map_scopes.
  -- סוכנות עם 5 עובדים ו-20 מפות צריכה את זה, ואי אפשר להוסיף אותו אחר כך
  -- בלי לגעת בכל מדיניות תוכן.
  map_scope_all boolean not null default true,
  invited_by   uuid references profiles(id),
  invited_at   timestamptz,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  primary key (tenant_id, user_id),
  constraint memberships_tenant_user_key unique (tenant_id, user_id)
);
create index memberships_user_idx on memberships (user_id, tenant_id)
  where status = 'active' and revoked_at is null;
create trigger memberships_touch before update on memberships
  for each row execute function app.touch_updated_at();

create table membership_map_scopes (
  tenant_id  uuid not null,
  user_id    uuid not null,
  map_id     uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id, map_id),
  constraint mms_membership_fk
    foreign key (tenant_id, user_id) references memberships(tenant_id, user_id) on delete cascade
  -- ה-FK ל-maps נוסף ב-0004 (סדר יצירה)
);

-- לא ניתן להסיר את ה-owner האחרון
create or replace function app.guard_last_owner()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'DELETE' and old.role = 'owner')
     or (tg_op = 'UPDATE' and old.role = 'owner'
         and (new.role <> 'owner' or new.status <> 'active' or new.revoked_at is not null)) then
    if (select count(*) from memberships
        where tenant_id = old.tenant_id and role = 'owner'
          and status = 'active' and revoked_at is null) <= 1 then
      raise exception 'cannot remove the last owner of a tenant' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger memberships_guard_owner before update or delete on memberships
  for each row execute function app.guard_last_owner();

-- הזמנות עם token חד-פעמי (לא uuid שמנחשים)
create table membership_invites (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  email_norm  text not null,
  role        text not null references roles(key),
  token_hash  text not null,               -- ⚠️ hash בלבד. ה-token עצמו רק במייל
  invited_by  uuid not null references profiles(id),
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references profiles(id),
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint invite_window check (expires_at <= created_at + interval '14 days')
);
create unique index membership_invites_token on membership_invites (token_hash);
create index membership_invites_open on membership_invites (tenant_id, email_norm)
  where accepted_at is null and revoked_at is null;
create trigger membership_invites_pin before insert on membership_invites
  for each row execute function app.force_created_at();
