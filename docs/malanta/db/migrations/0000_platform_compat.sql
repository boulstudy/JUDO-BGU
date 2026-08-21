-- 0000_platform_compat — שכבת התאמה לפלטפורמה
-- ============================================================================
-- ⚠️ **על Supabase — לדלג על הקובץ הזה.** סופאבייס מספקת את כל מה שכאן.
--
-- על כל Postgres אחר (Neon, self-hosted, Railway, RDS) — להריץ אותו ראשון.
-- זה כל מה שמפריד בין הסכמה הזו לבין ריצה בכל מקום: 1877 שורות SQL,
-- מתוכן ההסתמכות על סופאבייס היא הקובץ הזה בלבד.
--
-- מה שנדרש מהאפליקציה בתמורה: בכל טרנזקציה, לפני כל שאילתה,
--     set local request.jwt.claim.sub = '<user-uuid>';
--     set local role = 'authenticated';
-- זו הפונקציה withUser() בשכבת lib/data. אצל סופאבייס PostgREST עושה
-- את זה עבורך; כאן אתה עושה את זה בעצמך — שבע שורות קוד, פעם אחת.
-- ============================================================================

-- ── סכמת התוספים ────────────────────────────────────────────────────────────
-- סופאבייס מתקינה תוספים ל-schema בשם extensions. משוכפל כאן לתאימות.
create schema if not exists extensions;
create extension if not exists postgis  with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

-- ── תפקידי הגישה ────────────────────────────────────────────────────────────
-- nologin: הם נלבשים ב-set local role, לא מתחברים ישירות.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon')
    then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated')
    then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')
    then create role service_role nologin noinherit bypassrls; end if;
end $$;

-- ── סכמת auth ───────────────────────────────────────────────────────────────
create schema if not exists auth;

-- טבלת המשתמשים של ספק האימות. הסכמה מפנה אליה רק מ-profiles.
-- מלאה ע"י ה-adapter של ספק האימות (Better Auth / Auth.js / Clerk webhook).
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  email_confirmed_at timestamptz,          -- ⚠️ תנאי לשיוך תשלום אוטומטי
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists auth_users_email_uniq on auth.users (lower(email));

-- זהות המשתמש בטרנזקציה הנוכחית.
-- תומך בשתי הצורות שסופאבייס מייצרת, כדי שאותו קוד ירוץ בשני המקומות.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- ⚠️ auth.users עצמה נשארת ללא grant: היא נכתבת ע"י ספק האימות בלבד.
