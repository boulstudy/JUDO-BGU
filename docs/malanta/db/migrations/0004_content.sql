-- 0004_content — מפות, שכבות, נקודות, מדיה, גרסאות, מקור וזכויות
-- ============================================================================
-- שני עקרונות שנאכפים כאן ברמת המנוע ולא ברמת המשמעת:
--   1. composite FK — תוכן לא יכול לחצות tenant או map
--   2. כל עריכה מייצרת גרסה — מי שינה, מה היה קודם, מתי
-- ============================================================================

create table maps (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  slug         text not null,
  label        text not null check (length(btrim(label)) between 1 and 140),
  description  text check (length(description) <= 5000),
  center_lat   float8 not null check (center_lat between -90  and 90),
  center_lng   float8 not null check (center_lng between -180 and 180),
  zoom         float8 not null default 6 check (zoom between 0 and 22),
  bounds       jsonb,
  status       text not null default 'draft'
                 check (status in ('draft','published','archived')),
  published_at timestamptz,
  cover_key    text,
  locale       text not null default 'he',
  -- זכויות: מה מותר למטייל לעשות עם התוכן הזה
  allow_export     boolean not null default false,
  allow_public_trips boolean not null default false,
  copyright_notice text,
  sort_order   int not null default 0,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  deleted_by   uuid,
  lock_version bigint not null default 0,

  constraint maps_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$'),
  constraint maps_slug_not_reserved check (not app.is_reserved_slug(slug)),
  constraint maps_published_has_date check (status <> 'published' or published_at is not null),
  -- ⚠️ שני אלה מאפשרים את כל ה-composite FK בהמשך. בלעדיהם המודל לא נאכף.
  constraint maps_id_tenant_key unique (id, tenant_id)
);
create unique index maps_tenant_slug_uniq on maps (tenant_id, lower(slug)) where deleted_at is null;
create index maps_tenant_idx on maps (tenant_id) where deleted_at is null;
create trigger maps_touch  before update on maps for each row execute function app.touch_updated_at();
create trigger maps_lock   before update on maps for each row execute function app.bump_lock_version();
create trigger maps_freeze before update on maps for each row execute function app.freeze_columns('tenant_id');

alter table membership_map_scopes
  add constraint mms_map_fk foreign key (map_id) references maps(id) on delete cascade;


-- ── layers — שייכות ליוצר, משותפות בין כל מפותיו. אין map_id. ──────────────
create table layers (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 80),
  icon         text not null default 'pin',
  color        text not null default '#2563eb' check (color ~ '^#[0-9a-fA-F]{6}$'),
  description  text check (length(description) <= 2000),
  sort_order   int not null default 0,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  deleted_by   uuid,
  lock_version bigint not null default 0,
  constraint layers_id_tenant_key unique (id, tenant_id)
);
create unique index layers_tenant_name_uniq on layers (tenant_id, lower(name)) where deleted_at is null;
create trigger layers_touch  before update on layers for each row execute function app.touch_updated_at();
create trigger layers_lock   before update on layers for each row execute function app.bump_lock_version();
create trigger layers_freeze before update on layers for each row execute function app.freeze_columns('tenant_id');


-- ── locations ───────────────────────────────────────────────────────────────
create table locations (
  id              uuid primary key,        -- ⚠️ בלי default. נוצר בקליינט (uuidv7)
  tenant_id       uuid not null,
  map_id          uuid not null,
  layer_id        uuid,
  name            text not null check (length(btrim(name)) between 1 and 200),
  description     text check (length(description) <= 8000),
  address         text check (length(address) <= 400),
  phone           text,
  website_url     text check (website_url is null or website_url ~ '^https://'),
  google_maps_url text check (google_maps_url is null or google_maps_url ~ '^https://'),
  lat             float8 not null check (lat between -90  and 90),
  lng             float8 not null check (lng between -180 and 180),
  geom geography(Point,4326) generated always as
    (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::geography) stored,

  -- ⚠️ jsonb ולא text[]: צריך alt, מידות, סדר, קרדיט. שומרים object key ולא URL.
  photos       jsonb not null default '[]'::jsonb
                 check (jsonb_typeof(photos) = 'array'
                        and jsonb_array_length(photos) <= 12
                        and pg_column_size(photos) < 8192),
  extra_fields jsonb not null default '{}'::jsonb
                 check (jsonb_typeof(extra_fields) = 'object'
                        and pg_column_size(extra_fields) < 16384),

  -- ── מקור וזכויות. הבסיס לכל טענת בעלות. ────────────────────────────────
  origin        text not null default 'manual'
                  check (origin in ('manual','import_kml','import_csv','import_geojson','api','duplicated')),
  origin_ref    text,                      -- שם קובץ הייבוא / מזהה חיצוני
  origin_batch  uuid,                      -- מקשר את כל מה שנכנס בייבוא אחד
  copied_from_location_id uuid,            -- שכפול בתוך אותו tenant בלבד (נאכף בטריגר)
  -- טביעת אצבע לזיהוי אותה דאטה שצצה תחת יוצר אחר
  fingerprint text generated always as (
    encode(extensions.digest(
      lower(btrim(name)) || '|' || round(lat::numeric, 4) || '|' || round(lng::numeric, 4),
      'sha256'), 'hex')
  ) stored,
  -- נקודת דמה ייחודית לזיהוי דליפה. לא מוצגת לכולם. ראה 0009.
  is_canary boolean not null default false,

  sort_order   int not null default 0,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  deleted_by   uuid,
  lock_version bigint not null default 0,

  constraint locations_map_fk
    foreign key (map_id, tenant_id) references maps(id, tenant_id) on delete cascade,
  constraint locations_layer_fk
    foreign key (layer_id, tenant_id) references layers(id, tenant_id) on delete set null,
  -- ⚠️ מאפשר composite FK מ-trip_stops ו-favorites
  constraint locations_id_map_key    unique (id, map_id),
  constraint locations_id_tenant_key unique (id, tenant_id)
);

create index locations_map_idx    on locations (map_id)   where deleted_at is null;
create index locations_layer_idx  on locations (layer_id) where deleted_at is null;
create index locations_geom_idx   on locations using gist (geom) where deleted_at is null;
create index locations_name_trgm  on locations using gin (name extensions.gin_trgm_ops);
create index locations_fp_idx     on locations (fingerprint) where deleted_at is null;
create index locations_batch_idx  on locations (origin_batch) where origin_batch is not null;

create trigger locations_touch  before update on locations for each row execute function app.touch_updated_at();
create trigger locations_lock   before update on locations for each row execute function app.bump_lock_version();
create trigger locations_freeze before update on locations
  for each row execute function app.freeze_columns('tenant_id','map_id');

-- שכפול חוצה-יוצרים הוא בדיוק מה שהמערכת אמורה למנוע
alter table locations add constraint locations_copy_fk
  foreign key (copied_from_location_id, tenant_id) references locations(id, tenant_id);


-- ============================================================================
-- מדיה — נפרד מ-locations כדי שיהיה אפשר לאכוף בעלות, מכסות וניקוי
-- ============================================================================
create table media_assets (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  object_key    text not null,             -- מפתח R2 אקראי. לא נגזר משם או מזהה
  bucket        text not null default 'malanta-content',
  visibility    text not null default 'private'
                  check (visibility in ('private','public')),  -- public רק ללוגו וכריכה
  content_type  text not null,
  byte_size     bigint not null check (byte_size between 1 and 26214400),  -- 25MB
  width         int, height int,
  checksum_sha256 text,
  exif_stripped boolean not null default false,   -- ⚠️ תמונת מטייל מכילה GPS
  uploaded_by   uuid references profiles(id),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint media_key_uniq unique (bucket, object_key),
  constraint media_private_content check (visibility = 'private' or content_type like 'image/%')
);
create index media_tenant_idx on media_assets (tenant_id) where deleted_at is null;


-- ============================================================================
-- content_revisions — כל עריכה, לתמיד
-- ============================================================================
-- שלושה תפקידים בבת אחת:
--   • שחזור אחרי טעות עריכה
--   • "מי שינה את זה ולמה" — ההבדל בין סוכנות שאפשר לסמוך עליה לבין כאוס
--   • ראיה לבעלות ולסדר יצירה במחלוקת זכויות
-- ⚠️ actor_id ללא FK: הראיה חייבת לשרוד מחיקת המשתמש שיצר אותה.
create table content_revisions (
  id           bigserial primary key,
  tenant_id    uuid not null,
  entity_type  text not null check (entity_type in ('map','layer','location')),
  entity_id    uuid not null,
  map_id       uuid,
  revision     int  not null,
  operation    text not null check (operation in ('insert','update','soft_delete','restore','hard_delete')),
  actor_id     uuid,
  actor_email  text,
  before_data  jsonb,
  after_data   jsonb,
  changed_keys text[],
  reason       text,
  occurred_at  timestamptz not null default now(),
  constraint content_revisions_uniq unique (entity_type, entity_id, revision)
);
create index content_revisions_entity_idx on content_revisions (entity_type, entity_id, revision desc);
create index content_revisions_tenant_idx on content_revisions (tenant_id, occurred_at desc);
create rule content_revisions_no_update as on update to content_revisions do instead nothing;
create rule content_revisions_no_delete as on delete to content_revisions do instead nothing;

create or replace function app.record_revision()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_op text;
  v_before jsonb;
  v_after  jsonb;
  v_keys   text[];
  v_tenant uuid;
  v_map    uuid;
  v_rev    int;
  r record;
begin
  r := coalesce(new, old);
  v_before := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_after  := case when tg_op = 'DELETE' then null else to_jsonb(new) end;

  v_op := case
    when tg_op = 'INSERT' then 'insert'
    when tg_op = 'DELETE' then 'hard_delete'
    when old.deleted_at is null and new.deleted_at is not null then 'soft_delete'
    when old.deleted_at is not null and new.deleted_at is null then 'restore'
    else 'update' end;

  if tg_op = 'UPDATE' then
    select array_agg(k) into v_keys
    from jsonb_object_keys(v_after) k
    where (v_after -> k) is distinct from (v_before -> k)
      and k not in ('updated_at','lock_version');
    if v_keys is null then return new; end if;   -- שינוי ריק, לא מייצר גרסה
  end if;

  v_tenant := (to_jsonb(r) ->> 'tenant_id')::uuid;
  v_map    := case when tg_table_name = 'maps' then r.id
                   else nullif(to_jsonb(r) ->> 'map_id','')::uuid end;

  select coalesce(max(revision), 0) + 1 into v_rev
  from content_revisions
  where entity_type = tg_argv[0] and entity_id = r.id;

  insert into content_revisions (tenant_id, entity_type, entity_id, map_id, revision,
                                 operation, actor_id, actor_email, before_data, after_data, changed_keys)
  values (v_tenant, tg_argv[0], r.id, v_map, v_rev, v_op, auth.uid(),
          (select email from profiles where id = auth.uid()),
          v_before, v_after, v_keys);

  return coalesce(new, old);
end $$;

create trigger maps_revision      after insert or update or delete on maps
  for each row execute function app.record_revision('map');
create trigger layers_revision    after insert or update or delete on layers
  for each row execute function app.record_revision('layer');
create trigger locations_revision after insert or update or delete on locations
  for each row execute function app.record_revision('location');
