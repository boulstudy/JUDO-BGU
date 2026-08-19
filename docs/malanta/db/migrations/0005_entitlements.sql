-- 0005_entitlements — זכאות, הענקה, והסכמת יוצר לגישת אדמין
-- ============================================================================

create table map_access (
  id            uuid primary key default gen_random_uuid(),
  map_id        uuid not null references maps(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  -- היקף: null = מלא. טבלת קשר ולא מערך uuid — מערך לא נושא שלמות התייחסותית.
  scope_all_layers boolean not null default true,
  granted_by    uuid references profiles(id),
  source        text not null default 'manual'
                  check (source in ('manual','purchase','import','founding','gift','trial')),
  order_id      uuid,                      -- FK נוסף ב-0007
  starts_at     timestamptz not null default now(),
  expires_at    timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid,
  revoke_reason text check (revoke_reason in
                  ('refund','chargeback','manual','abuse','expired','tenant_closed','dsr_erasure')),
  -- זכויות שימוש שהוענקו למטייל הספציפי הזה
  allow_export  boolean not null default false,
  seat_note     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint map_access_window check (expires_at is null or expires_at > starts_at),
  constraint map_access_revoke_shape check (
    (revoked_at is null and revoke_reason is null) or
    (revoked_at is not null and revoke_reason is not null))
);
create unique index map_access_active_uniq on map_access (map_id, user_id) where revoked_at is null;
create index map_access_user_idx on map_access (user_id, map_id) where revoked_at is null;
create index map_access_map_idx  on map_access (map_id)          where revoked_at is null;
create index map_access_expiry   on map_access (expires_at)
  where revoked_at is null and expires_at is not null;
create trigger map_access_touch before update on map_access
  for each row execute function app.touch_updated_at();

create table map_access_layers (
  map_access_id uuid not null references map_access(id) on delete cascade,
  layer_id      uuid not null references layers(id)     on delete cascade,
  primary key (map_access_id, layer_id)
);

-- ⚠️ אין policy ל-insert/update/delete על map_access. הכתיבה בשירות בלבד,
--    כדי שיהיה מקום אחד שכותב גם ל-audit_log וגם מטפל בזיכויים.


-- ============================================================================
-- גישת אדמין פלטפורמה — הסכמה של היוצר, לא הרשאה של הפלטפורמה
-- ============================================================================
create table admin_map_grants (
  id          uuid primary key default gen_random_uuid(),
  map_id      uuid not null references maps(id) on delete cascade,
  admin_id    uuid not null references profiles(id) on delete cascade,
  granted_by  uuid not null references profiles(id),      -- owner של ה-tenant
  reason      text not null check (length(btrim(reason)) >= 10),
  -- מה הותר: קריאה בלבד היא ברירת המחדל, ועריכה דורשת בקשה מפורשת
  can_edit    boolean not null default false,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint admin_grant_max_window check (expires_at <= created_at + interval '30 days')
);
create index admin_map_grants_lookup on admin_map_grants (admin_id, map_id) where revoked_at is null;
-- בלי זה ה-check חסר משמעות: קליינט שולח created_at עתידי ומקבל שנה
create trigger admin_map_grants_pin before insert on admin_map_grants
  for each row execute function app.force_created_at();

-- כל קריאה של אדמין לתוכן של יוצר מתועדת. אין "הצצה" שקטה.
create table admin_access_events (
  id         bigserial primary key,
  grant_id   uuid not null references admin_map_grants(id) on delete cascade,
  admin_id   uuid not null,
  map_id     uuid not null,
  action     text not null check (action in ('read','export','edit')),
  item_count int,
  ip         inet,
  occurred_at timestamptz not null default now()
);
create index admin_access_events_map on admin_access_events (map_id, occurred_at desc);
create rule admin_access_events_no_update as on update to admin_access_events do instead nothing;
create rule admin_access_events_no_delete as on delete to admin_access_events do instead nothing;
