-- ============================================================================
-- Malanta — סכמה מתוקנת
-- ============================================================================
-- מבוסס על סעיף 7 במסמך התכנון, עם התיקונים מ-00_ARCHITECTURE_REVIEW.md.
--
-- עקרונות שמובנים כאן ולא נשענים על משמעת קוד:
--   1. composite FK — אי אפשר לערבב tenant/map בין ישויות
--   2. אין עמודת הרשאה בוליאנית על profiles
--   3. partial unique index — מחיקה רכה לא נועלת slug/name
--   4. updated_at בטריגר; deleted_at בכל טבלה שנמחקת רכה
--   5. id בלי default ב-locations/trips/trip_stops (נוצר בקליינט, עדיף uuidv7)
--
-- RLS נמצאת בקובץ נפרד: 20_RLS.sql
-- להריץ אחרי הקובץ הזה. אף טבלה כאן לא מוגנת עד שהוא רץ.
-- ============================================================================

create extension if not exists postgis      with schema extensions;
create extension if not exists pgcrypto     with schema extensions;
create extension if not exists pg_trgm      with schema extensions;  -- חיפוש שמות בפאנל

create schema if not exists app;   -- פונקציות עזר, לא נחשף ב-PostgREST
comment on schema app is 'פונקציות פנימיות. לא ב-exposed schemas של PostgREST.';


-- ============================================================================
-- 0. תשתית משותפת
-- ============================================================================

create or replace function app.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- מקבע created_at ל-now() בהכנסה. נדרש בכל מקום שבו check constraint
-- מסתמך על created_at — אחרת הקליינט מזייף אותו ועוקף את המגבלה.
create or replace function app.force_created_at()
returns trigger language plpgsql as $$
begin
  new.created_at := now();
  return new;
end $$;

-- חוסם שינוי של עמודות שיוך אחרי יצירה (ראה B2 בסקירה).
-- שימוש: create trigger ... execute function app.freeze_columns('tenant_id','map_id');
create or replace function app.freeze_columns()
returns trigger language plpgsql as $$
declare
  col   text;
  old_j jsonb := to_jsonb(old);
  new_j jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    if (old_j ->> col) is distinct from (new_j ->> col) then
      raise exception 'column % is immutable', col using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;

-- slugs שאסור ליוצר לתפוס
create or replace function app.is_reserved_slug(p text)
returns boolean language sql immutable as $$
  select lower(p) = any (array[
    'admin','api','app','auth','www','mail','m','map','maps','static','assets',
    'login','logout','signup','register','account','settings','billing','pay',
    'checkout','support','help','docs','blog','about','terms','privacy',
    'malanta','platform','system','root','test','dev','staging','new','edit'
  ])
$$;


-- ============================================================================
-- 1. tenants — ישות היוצר (ארגון, גם כשיש בו אדם אחד)
-- ============================================================================

create table tenants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  name        text not null,
  branding    jsonb not null default '{}'::jsonb,
  status      text not null default 'active'
                check (status in ('active','suspended','closed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  constraint tenants_slug_format
    check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  constraint tenants_slug_not_reserved
    check (not app.is_reserved_slug(slug)),
  constraint tenants_branding_size
    check (pg_column_size(branding) < 8192),
  -- נדרש ל-composite FK מטבלאות הבת
  constraint tenants_id_key unique (id)
);

create unique index tenants_slug_uniq
  on tenants (lower(slug)) where deleted_at is null;

create trigger tenants_touch before update on tenants
  for each row execute function app.touch_updated_at();

comment on column tenants.branding is
  'צורה מתועדת: {"logo_key":"...","primary_color":"#2563eb","email_from_name":"..."}
   מפתחות R2, לא URL מלא. ראה A5 בסקירה.';


-- ============================================================================
-- 2. profiles — זהות גלובלית. ללא tenant_id, ללא map_id, ללא is_admin
-- ============================================================================

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  -- עמודת ההשוואה לסליקה. generated → לא ניתנת לזיוף מהקליינט.
  email_norm  text generated always as (lower(btrim(email))) stored,
  full_name   text,
  locale      text not null default 'he' check (locale in ('he','en')),
  avatar_key  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create unique index profiles_email_norm_uniq
  on profiles (email_norm) where deleted_at is null;

create trigger profiles_touch before update on profiles
  for each row execute function app.touch_updated_at();

-- סנכרון מ-auth.users. בלי זה profiles.email מתיישן בשינוי מייל,
-- וההצלבה בסליקה תיכשל בשקט.
create or replace function app.sync_profile_from_auth()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', null))
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function app.sync_profile_from_auth();

-- ⚠️ קריטי: המשתמש יכול לעדכן רק את השדות שלו, ברמת עמודה.
-- זו ההגנה שעובדת גם אם מדיניות RLS נכתבה ברישול.
revoke update on profiles from authenticated, anon;
grant  update (full_name, locale, avatar_key) on profiles to authenticated;


-- ============================================================================
-- 3. platform_admins — במקום profiles.is_platform_admin (ראה A3)
-- ============================================================================

create table platform_admins (
  user_id    uuid primary key references profiles(id) on delete cascade,
  granted_by uuid references profiles(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  note       text
);
-- ללא grant ל-authenticated/anon בכלל. נגישה רק ל-security definer functions.
revoke all on platform_admins from authenticated, anon;


-- ============================================================================
-- 4. memberships — מי עובד אצל איזה יוצר
-- ============================================================================

create table memberships (
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       text not null check (role in ('owner','editor')),
  status     text not null default 'active'
               check (status in ('active','invited','suspended')),
  invited_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (tenant_id, user_id)
);

create index memberships_user_idx on memberships (user_id, tenant_id)
  where status = 'active' and revoked_at is null;

create trigger memberships_touch before update on memberships
  for each row execute function app.touch_updated_at();

-- לא ניתן להסיר את ה-owner האחרון של tenant
create or replace function app.guard_last_owner()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'DELETE' and old.role = 'owner')
     or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    if (select count(*) from memberships
        where tenant_id = old.tenant_id and role = 'owner'
          and status = 'active' and revoked_at is null) <= 1 then
      raise exception 'cannot remove the last owner of a tenant'
        using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger memberships_guard_owner
  before update or delete on memberships
  for each row execute function app.guard_last_owner();


-- ============================================================================
-- 5. maps
-- ============================================================================

create table maps (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  slug         text not null,
  label        text not null,
  description  text,
  center_lat   float8 not null check (center_lat between -90  and 90),
  center_lng   float8 not null check (center_lng between -180 and 180),
  zoom         float8 not null default 6 check (zoom between 0 and 22),
  status       text not null default 'draft'
                 check (status in ('draft','published','archived')),
  published_at timestamptz,
  cover_key    text,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  constraint maps_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$'),
  -- ⚠️ שני ה-unique הבאים אינם קישוט: הם מה שמאפשר את ה-composite FK
  --    ב-locations, trips ו-trip_stops. בלעדיהם A1+A2 חוזרים.
  constraint maps_id_tenant_key unique (id, tenant_id)
);

create unique index maps_tenant_slug_uniq
  on maps (tenant_id, lower(slug)) where deleted_at is null;
create index maps_tenant_idx on maps (tenant_id) where deleted_at is null;

create trigger maps_touch before update on maps
  for each row execute function app.touch_updated_at();
create trigger maps_freeze before update on maps
  for each row execute function app.freeze_columns('tenant_id');


-- ============================================================================
-- 6. layers — שייכות ליוצר, משותפות בין כל מפותיו. אין map_id. (דרישת מוצר)
-- ============================================================================

create table layers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  icon        text not null default 'pin',
  color       text not null default '#2563eb' check (color ~ '^#[0-9a-fA-F]{6}$'),
  description text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  constraint layers_id_tenant_key unique (id, tenant_id)
);

create unique index layers_tenant_name_uniq
  on layers (tenant_id, lower(name)) where deleted_at is null;

create trigger layers_touch before update on layers
  for each row execute function app.touch_updated_at();
create trigger layers_freeze before update on layers
  for each row execute function app.freeze_columns('tenant_id');


-- ============================================================================
-- 7. locations
-- ============================================================================

create table locations (
  id              uuid primary key,          -- ⚠️ בלי default. נוצר בקליינט (uuidv7)
  tenant_id       uuid not null,
  map_id          uuid not null,
  layer_id        uuid,
  name            text not null check (length(name) between 1 and 200),
  description     text check (length(description) <= 5000),
  address         text,
  website_url     text check (website_url is null or website_url ~ '^https?://'),
  google_maps_url text check (google_maps_url is null or google_maps_url ~ '^https?://'),
  lat             float8 not null check (lat between -90  and 90),
  lng             float8 not null check (lng between -180 and 180),

  -- עמודה מחושבת: לא יכולה להתיישן מול lat/lng.
  -- אם PostGIS בגרסה שלך לא מקבל את זה כ-immutable, להחליף בטריגר —
  -- אבל אל תשאיר עמודה שהאפליקציה אמורה למלא ידנית.
  geom geography(Point,4326)
    generated always as
      (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::geography) stored,

  -- jsonb ולא text[]: צריך alt, מידות, סדר. שומרים object key ולא URL. (ראה A5)
  -- צורה: [{"key":"t/<tenant>/<uuid>.webp","w":1600,"h":1200,"alt":"..."}]
  photos       jsonb not null default '[]'::jsonb
                 check (jsonb_typeof(photos) = 'array'
                        and jsonb_array_length(photos) <= 12
                        and pg_column_size(photos) < 8192),
  extra_fields jsonb not null default '{}'::jsonb
                 check (jsonb_typeof(extra_fields) = 'object'
                        and pg_column_size(extra_fields) < 16384),
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  -- ⚠️ הלב של A1: המפה חייבת להיות של אותו tenant, והשכבה גם.
  constraint locations_map_fk
    foreign key (map_id, tenant_id) references maps(id, tenant_id) on delete cascade,
  constraint locations_layer_fk
    foreign key (layer_id, tenant_id) references layers(id, tenant_id) on delete set null,
  -- מאפשר את ה-composite FK מ-trip_stops ומ-favorites (A2)
  constraint locations_id_map_key unique (id, map_id)
);

create index locations_map_idx   on locations (map_id)   where deleted_at is null;
create index locations_layer_idx on locations (layer_id) where deleted_at is null;
create index locations_geom_idx  on locations using gist (geom) where deleted_at is null;
create index locations_name_trgm on locations using gin (name extensions.gin_trgm_ops);

create trigger locations_touch before update on locations
  for each row execute function app.touch_updated_at();
create trigger locations_freeze before update on locations
  for each row execute function app.freeze_columns('tenant_id','map_id');


-- ============================================================================
-- 8. map_access — הזכאות בפועל. נכתבת אך ורק דרך grantAccess() (כלל 5)
-- ============================================================================

create table map_access (
  id           uuid primary key default gen_random_uuid(),
  map_id       uuid not null references maps(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  layer_ids    uuid[],          -- null = גישה מלאה. מחוץ ל-MVP; ראה הערה למטה
  granted_by   uuid references profiles(id),
  source       text not null default 'manual'
                 check (source in ('manual','payment','import','founding')),
  source_ref   uuid,            -- payments.id כשה-source הוא payment
  starts_at    timestamptz not null default now(),
  expires_at   timestamptz,
  revoked_at   timestamptz,
  revoke_reason text check (revoke_reason in ('refund','chargeback','manual','abuse')),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint map_access_window check (expires_at is null or expires_at > starts_at)
);

-- זכאות פעילה אחת לכל (מפה, משתמש). היסטוריה נשמרת בשורות עם revoked_at.
create unique index map_access_active_uniq
  on map_access (map_id, user_id) where revoked_at is null;
-- ⚠️ האינדקס שכל מדיניות RLS של מטייל תלויה בו
create index map_access_user_idx on map_access (user_id, map_id) where revoked_at is null;
create index map_access_map_idx  on map_access (map_id)          where revoked_at is null;

create trigger map_access_touch before update on map_access
  for each row execute function app.touch_updated_at();

comment on column map_access.layer_ids is
  'מחוץ ל-MVP — תמיד null בשלב זה. כשיוטמע: להחליף בטבלת קשר map_access_layers
   עם FK אמיתי. מערך uuid לא יכול להחזיק שלמות התייחסותית.';


-- ============================================================================
-- 9. trips + trip_stops + favorites — פעילות מטייל, מתוחמת למפה
-- ============================================================================

create table trips (
  id                uuid primary key,        -- בלי default
  map_id            uuid not null references maps(id) on delete cascade,
  owner_id          uuid not null references profiles(id) on delete cascade,
  title             text not null check (length(title) between 1 and 200),
  notes             text check (length(notes) <= 10000),
  start_date        date,
  end_date          date,
  visibility        text not null default 'private'
                      check (visibility in ('private','shared_link','public')),
  moderation_status text not null default 'none'
                      check (moderation_status in ('none','pending','approved','rejected')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint trips_dates check (end_date is null or start_date is null or end_date >= start_date),
  constraint trips_id_map_key unique (id, map_id)      -- ⚠️ ל-composite FK מ-trip_stops
);

create index trips_owner_idx on trips (owner_id, map_id) where deleted_at is null;

create trigger trips_touch before update on trips
  for each row execute function app.touch_updated_at();
create trigger trips_freeze before update on trips
  for each row execute function app.freeze_columns('map_id','owner_id');


create table trip_stops (
  id          uuid primary key,              -- בלי default
  trip_id     uuid not null,
  map_id      uuid not null,                 -- ⚠️ הדבק שמאלץ את שני ה-FK להסכים
  location_id uuid not null,
  day_index   int check (day_index between 0 and 365),
  position    int not null default 0,
  notes       text check (length(notes) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  -- ⚠️ הלב של A2: אי אפשר לצרף נקודה ממפה אחרת למסלול הזה.
  constraint trip_stops_trip_fk
    foreign key (trip_id, map_id) references trips(id, map_id) on delete cascade,
  -- כלל 7: הפניה, לעולם לא העתק. מיקום נמחק רכות → העצירה שורדת.
  constraint trip_stops_location_fk
    foreign key (location_id, map_id) references locations(id, map_id) on delete cascade
);

create index trip_stops_trip_idx on trip_stops (trip_id, day_index, position)
  where deleted_at is null;

create trigger trip_stops_touch before update on trip_stops
  for each row execute function app.touch_updated_at();

-- הערה על position: אין unique. סידור מחדש כותב את כל היום בטרנזקציה אחת.
-- unique על (trip_id, day_index, position) ישבור כל גרירה, כי הוא נבדק שורה-שורה.


create table favorites (
  owner_id    uuid not null references profiles(id) on delete cascade,
  map_id      uuid not null,
  location_id uuid not null,
  created_at  timestamptz not null default now(),

  primary key (owner_id, location_id),
  constraint favorites_location_fk
    foreign key (location_id, map_id) references locations(id, map_id) on delete cascade
);

create index favorites_owner_map_idx on favorites (owner_id, map_id);


-- ============================================================================
-- 10. גישת אדמין פלטפורמה — בהסכמה, פר-מפה, עם תפוגה (ראה D6)
--     נחתך מה-MVP המקורי. לא לחתוך: זו הבטחת האמון מול היוצר.
-- ============================================================================

create table admin_map_grants (
  id         uuid primary key default gen_random_uuid(),
  map_id     uuid not null references maps(id) on delete cascade,
  admin_id   uuid not null references profiles(id) on delete cascade,
  granted_by uuid not null references profiles(id),   -- ה-owner של ה-tenant
  reason     text not null,
  expires_at timestamptz not null,                    -- ⚠️ not null. אין גישה נצחית.
  revoked_at timestamptz,
  created_at timestamptz not null default now(),

  constraint admin_grant_max_window check (expires_at <= created_at + interval '30 days')
);

create index admin_map_grants_lookup on admin_map_grants (admin_id, map_id)
  where revoked_at is null;

-- ⚠️ בלי זה, ה-check למעלה חסר משמעות: הקליינט שולח created_at עתידי
--    ומקבל חלון גישה של שנה. נבדק בפועל — הבייפאס עובד בלי הטריגר.
create trigger admin_map_grants_pin_created before insert on admin_map_grants
  for each row execute function app.force_created_at();


create table audit_log (
  id          bigserial primary key,
  actor_id    uuid references profiles(id),
  actor_role  text not null check (actor_role in ('creator','traveler','platform_admin','system')),
  action      text not null,          -- 'access.grant','access.revoke','admin.map.read',...
  tenant_id   uuid,
  map_id      uuid,
  target_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  ip          inet,
  created_at  timestamptz not null default now()
);

create index audit_log_tenant_idx on audit_log (tenant_id, created_at desc);
create index audit_log_actor_idx  on audit_log (actor_id,  created_at desc);

-- append-only. גם service role לא אמור לעדכן.
create rule audit_log_no_update as on update to audit_log do instead nothing;
create rule audit_log_no_delete as on delete to audit_log do instead nothing;


-- ============================================================================
-- 11. סליקה — הקופסה הסגורה. פירוט מלא ב-30_PAYMENTS.md
-- ============================================================================

-- 11a. יומן גולמי. immutable. הבסיס לכל בירור "למה הוא לא קיבל גישה".
create table payment_events (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null,
  provider_event_id  text not null,
  event_type         text not null,
  payload            jsonb not null,
  signature_verified boolean not null default false,
  received_at        timestamptz not null default now(),
  processed_at       timestamptz,
  processing_error   text,

  constraint payment_events_idem unique (provider, provider_event_id)  -- ⚠️ idempotency
);
create index payment_events_unprocessed on payment_events (received_at)
  where processed_at is null;


-- 11b. כוונת רכישה. ה-id שלה הוא ה-token שעובר דרך עמוד הסליקה וחוזר.
--      זה מה שמחליף את הצלבת שם+מייל כמפתח ראשי.
create table purchase_intents (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('map_access','platform_subscription')),
  tenant_id     uuid references tenants(id) on delete cascade,
  map_id        uuid,
  offer_code    text not null,
  amount_minor  int  not null check (amount_minor > 0),   -- אגורות
  currency      text not null default 'ILS' check (currency ~ '^[A-Z]{3}$'),
  buyer_user_id uuid references profiles(id),             -- אם היה מחובר
  buyer_email_norm text,                                  -- אם ידוע מראש
  status        text not null default 'pending'
                  check (status in ('pending','paid','fulfilled','expired','cancelled')),
  expires_at    timestamptz not null default now() + interval '2 hours',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint purchase_intents_map_fk
    foreign key (map_id, tenant_id) references maps(id, tenant_id) on delete cascade,
  constraint purchase_intents_kind_shape check (
    (kind = 'map_access'          and map_id is not null and tenant_id is not null) or
    (kind = 'platform_subscription' and map_id is null   and tenant_id is not null)
  )
);
create index purchase_intents_open on purchase_intents (status, expires_at)
  where status = 'pending';

create trigger purchase_intents_touch before update on purchase_intents
  for each row execute function app.touch_updated_at();


-- 11c. עובדות כספיות מאומתות. שורה כאן = כסף שהתקבל בפועל.
create table payments (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null,
  provider_payment_id text not null,
  raw_event_id        uuid references payment_events(id),
  intent_id           uuid references purchase_intents(id),

  payer_name       text,
  payer_email_norm text,
  amount_minor     int  not null,
  currency         text not null,

  status text not null check (status in ('captured','refunded','chargeback','failed')),

  -- שיוך: איך הגענו מהתשלום למשתמש
  matched_user_id uuid references profiles(id),
  match_method    text check (match_method in ('intent_token','email_verified','manual')),
  matched_at      timestamptz,
  matched_by      uuid references profiles(id),   -- רק כש-match_method='manual'

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payments_idem unique (provider, provider_payment_id),
  constraint payments_match_shape check (
    (matched_user_id is null and match_method is null and matched_at is null) or
    (matched_user_id is not null and match_method is not null and matched_at is not null)
  ),
  constraint payments_manual_needs_actor check (
    match_method <> 'manual' or matched_by is not null
  )
);

-- תור הטיפול הידני: כל תשלום שנכנס ולא הצליח להשתייך
create index payments_unmatched on payments (created_at)
  where matched_user_id is null and status = 'captured';
create index payments_email_idx on payments (payer_email_norm)
  where matched_user_id is null;

create trigger payments_touch before update on payments
  for each row execute function app.touch_updated_at();

alter table map_access
  add constraint map_access_payment_fk
  foreign key (source_ref) references payments(id) on delete set null;


-- ============================================================================
-- 12. מחסום מחיקת tenant — cascade נוגע בכל התוכן והלקוחות
-- ============================================================================
-- מחיקת tenant מוחקת maps → locations → trip_stops של מטיילים משלמים.
-- זו פעולה לגיטימית (כלל 15: ייצוא ומחיקה), אבל היא חייבת לעבור דרך
-- שירות ה-purge בלבד, אחרי ייצוא ואישור. לא דרך DELETE מזדמן בקונסולה.

create or replace function app.guard_tenant_purge()
returns trigger language plpgsql as $$
begin
  if current_setting('app.allow_tenant_purge', true) is distinct from 'yes' then
    raise exception
      'tenant purge must go through the purge service (set app.allow_tenant_purge)'
      using errcode = '23514';
  end if;
  return old;
end $$;

create trigger tenants_guard_purge before delete on tenants
  for each row execute function app.guard_tenant_purge();


-- ============================================================================
-- הבא: 20_RLS.sql — בלעדיו כל הטבלאות האלה פתוחות לכל משתמש מחובר.
-- ============================================================================
