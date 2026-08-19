-- 0006_traveler_activity — מסלולים ומועדפים, מתוחמים למפה
-- ============================================================================
create table trips (
  id                uuid primary key,      -- בלי default
  map_id            uuid not null references maps(id) on delete cascade,
  owner_id          uuid not null references profiles(id) on delete cascade,
  title             text not null check (length(btrim(title)) between 1 and 200),
  notes             text check (length(notes) <= 10000),
  start_date        date,
  end_date          date,
  visibility        text not null default 'private'
                      check (visibility in ('private','shared_link','public')),
  share_token_hash  text,                  -- hash בלבד, ורק כש-shared_link
  moderation_status text not null default 'none'
                      check (moderation_status in ('none','pending','approved','rejected')),
  moderated_by      uuid,
  moderated_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  lock_version      bigint not null default 0,
  constraint trips_dates check (end_date is null or start_date is null or end_date >= start_date),
  constraint trips_share_shape check (visibility <> 'shared_link' or share_token_hash is not null),
  constraint trips_id_map_key unique (id, map_id)
);
create index trips_owner_idx on trips (owner_id, map_id) where deleted_at is null;
create unique index trips_share_token on trips (share_token_hash) where share_token_hash is not null;
create trigger trips_touch  before update on trips for each row execute function app.touch_updated_at();
create trigger trips_lock   before update on trips for each row execute function app.bump_lock_version();
create trigger trips_freeze before update on trips for each row execute function app.freeze_columns('map_id','owner_id');

create table trip_stops (
  id          uuid primary key,            -- בלי default
  trip_id     uuid not null,
  map_id      uuid not null,               -- ⚠️ הדבק שמאלץ את שני ה-FK להסכים
  location_id uuid not null,
  day_index   int check (day_index between 0 and 365),
  position    int not null default 0,
  notes       text check (length(notes) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  -- ⚠️ אי אפשר לצרף נקודה ממפה אחרת. נאכף במנוע, לא בקוד.
  constraint trip_stops_trip_fk
    foreign key (trip_id, map_id) references trips(id, map_id) on delete cascade,
  -- הפניה, לעולם לא העתק: פקיעת זכאות חוסמת תוכן ולא מוחקת מסלול
  constraint trip_stops_location_fk
    foreign key (location_id, map_id) references locations(id, map_id) on delete cascade
);
create index trip_stops_trip_idx on trip_stops (trip_id, day_index, position) where deleted_at is null;
create trigger trip_stops_touch before update on trip_stops for each row execute function app.touch_updated_at();
-- אין unique על position: הוא נבדק שורה-שורה וישבור כל גרירה.
-- סידור מחדש כותב את כל היום בטרנזקציה אחת.

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
