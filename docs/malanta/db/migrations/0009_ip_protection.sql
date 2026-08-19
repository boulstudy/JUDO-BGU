-- 0009_ip_protection — זכויות יוצרים: בעלות, גילוי דליפה, הסרה
-- ============================================================================
-- הנחת היסוד: מטייל שקנה גישה **יכול** להוריד את הדאטה. אי אפשר למנוע
-- העתקה ממי שרשאי לצפות. מה שכן אפשר, ומה שבנוי כאן:
--   1. להוכיח מי היוצר המקורי ומתי (content_revisions + origin + fingerprint)
--   2. לזהות חילוץ המוני בזמן אמת ולהגביל אותו
--   3. לזהות **מי** הדליף, אחרי שדאטה מופיעה במקום אחר (canaries + watermark)
--   4. לתת ליוצר כלי הסרה כשמצא את התוכן שלו אצל אחר
-- ============================================================================

-- ── רישיון התוכן ────────────────────────────────────────────────────────────
-- היוצר נשאר הבעלים. הפלטפורמה מקבלת רישיון מוגבל, מוגדר, וניתן לביטול.
-- זו נקודת מכירה מול Google My Maps, ולכן היא רשומה ולא מובלעת.
create table content_licenses (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  document_id  uuid not null references legal_documents(id),
  accepted_by  uuid not null references profiles(id),
  accepted_at  timestamptz not null default now(),
  ip           inet,
  -- מה הפלטפורמה רשאית לעשות. ברירת מחדל: לארח ולהגיש. לא יותר.
  allow_platform_marketing boolean not null default false,
  allow_public_showcase    boolean not null default false,
  revoked_at   timestamptz,
  constraint content_licenses_uniq unique (tenant_id, document_id)
);

-- ── חילוץ המוני ─────────────────────────────────────────────────────────────
-- לוג ברמת אירוע, לא ברמת שורה: פתיחת מפה, חיפוש, ייצוא.
create table content_access_events (
  id          bigserial primary key,
  user_id     uuid,
  map_id      uuid not null,
  tenant_id   uuid not null,
  access_id   uuid,                        -- map_access.id ששימש
  kind        text not null check (kind in ('map_open','bulk_read','search','export','api')),
  item_count  int  not null default 0,
  ip          inet,
  user_agent  text,
  occurred_at timestamptz not null default now()
);
create index cae_user_map_idx on content_access_events (user_id, map_id, occurred_at desc);
create index cae_tenant_idx   on content_access_events (tenant_id, occurred_at desc);
create rule cae_no_update as on update to content_access_events do instead nothing;

-- מכסות. ברירת מחדל ברמת המפה, דריסה ברמת הזכאות.
create table extraction_limits (
  map_id            uuid primary key references maps(id) on delete cascade,
  max_reads_per_hour  int not null default 2000,
  max_exports_per_day int not null default 3,
  block_on_breach   boolean not null default false,   -- ברירת מחדל: להתריע, לא לחסום
  updated_at        timestamptz not null default now()
);

create table extraction_alerts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  map_id      uuid not null references maps(id) on delete cascade,
  user_id     uuid,
  severity    text not null check (severity in ('info','warning','critical')),
  rule        text not null,               -- 'reads_per_hour','exports_per_day','canary_hit'
  observed    int,
  threshold   int,
  detail      jsonb not null default '{}'::jsonb,
  status      text not null default 'open' check (status in ('open','acknowledged','dismissed','actioned')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);
create index extraction_alerts_open on extraction_alerts (tenant_id, created_at desc) where status = 'open';

-- ── סימני מים ────────────────────────────────────────────────────────────────
-- כל ייצוא נושא טוקן ייחודי. קובץ שדלף מזוהה חזרה לזכאות שהפיקה אותו.
create table export_jobs (
  id            uuid primary key default gen_random_uuid(),
  requested_by  uuid references profiles(id) on delete set null,
  tenant_id     uuid not null references tenants(id) on delete cascade,
  map_id        uuid references maps(id) on delete cascade,
  scope         text not null check (scope in ('creator_full','creator_map','traveler_trip','dsr')),
  format        text not null check (format in ('geojson','kml','csv','pdf','json')),
  -- ⚠️ הטוקן מוטבע בקובץ עצמו (שדה מטא / נקודות canary / כותרת PDF)
  watermark_token uuid not null default gen_random_uuid(),
  item_count    int,
  status        text not null default 'queued' check (status in ('queued','running','ready','failed','expired')),
  object_key    text,
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  constraint export_watermark_uniq unique (watermark_token)
);
create index export_jobs_map_idx on export_jobs (map_id, created_at desc);

-- ── נקודות canary ────────────────────────────────────────────────────────────
-- נקודות דמה בדויות, ייחודיות לכל זכאות. אם מפה מועתקת מופיעה אצל אחר
-- ומכילה canary מסוים — יודעים איזו זכאות דלפה. טכניקה מקובלת
-- בפרסום מפות ומאגרי נתונים.
-- ⚠️ opt-in פר-מפה. שימוש בזה בלי ידיעת היוצר הוא זיוף הנתונים שלו.
create table canary_assignments (
  id            uuid primary key default gen_random_uuid(),
  map_access_id uuid not null references map_access(id) on delete cascade,
  location_id   uuid not null references locations(id)  on delete cascade,
  export_job_id uuid references export_jobs(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint canary_uniq unique (map_access_id, location_id)
);
create index canary_location_idx on canary_assignments (location_id);

-- ── הסרה ותביעות ────────────────────────────────────────────────────────────
create table content_claims (
  id            uuid primary key default gen_random_uuid(),
  claimant_tenant_id uuid references tenants(id) on delete set null,
  claimant_email text not null,
  claimant_name  text not null,
  -- התוכן שנטען שהועתק, בתוך הפלטפורמה
  target_tenant_id uuid references tenants(id) on delete set null,
  target_map_id    uuid references maps(id)    on delete set null,
  target_location_ids uuid[],
  kind          text not null check (kind in ('copyright','impersonation','privacy','other')),
  description   text not null,
  evidence      jsonb not null default '{}'::jsonb,
  status        text not null default 'received' check (status in
                  ('received','reviewing','upheld','rejected','withdrawn','counter_claimed')),
  -- תוצאה: מה נעשה בפועל
  action_taken  text check (action_taken in ('none','content_hidden','content_removed','tenant_suspended')),
  sworn_statement boolean not null default false,
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  resolution_note text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index content_claims_open on content_claims (status, created_at desc)
  where status in ('received','reviewing');
create trigger content_claims_touch before update on content_claims
  for each row execute function app.touch_updated_at();

-- ── גילוי כפילות חוצת-יוצרים ────────────────────────────────────────────────
-- אותה טביעת אצבע תחת שני tenants = אותה נקודה בשתי מפות של יוצרים שונים.
-- לא ראיה לגניבה (מסעדה מפורסמת תופיע אצל כולם), אבל **צפיפות** גבוהה של
-- התאמות באותו batch ייבוא — כן. לכן הספירה, לא ההתאמה הבודדת.
create or replace view platform_duplicate_clusters as
select
  a.tenant_id  as tenant_a,
  b.tenant_id  as tenant_b,
  a.map_id     as map_a,
  b.map_id     as map_b,
  count(*)     as shared_points,
  min(a.created_at) as first_seen_a,
  min(b.created_at) as first_seen_b
from locations a
join locations b
  on a.fingerprint = b.fingerprint
 and a.tenant_id < b.tenant_id
where a.deleted_at is null and b.deleted_at is null
  and not a.is_canary and not b.is_canary
group by 1,2,3,4
having count(*) >= 15;

comment on view platform_duplicate_clusters is
  'אדמין פלטפורמה בלבד. אין policy — נגיש רק דרך service role.
   15 נקודות משותפות בין שתי מפות של יוצרים שונים מצדיק בדיקה, לא מסקנה.';
revoke all on platform_duplicate_clusters from anon, authenticated;
