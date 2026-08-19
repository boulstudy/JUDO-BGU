-- ============================================================================
-- Malanta — RLS
-- ============================================================================
-- להריץ אחרי 10_SCHEMA.sql.
--
-- עקרונות:
--   1. כל בדיקת הרשאה עוברת דרך פונקציית security definer עם search_path מקובע
--      → מונע רקורסיה (B3) ומונע search_path hijacking
--   2. כל policy מסוג for all / for update כוללת גם using וגם with check (B2)
--   3. פונקציות חסרות-פרמטר נעטפות ב-(select ...) → InitPlan במקום פעם-לכל-שורה
--   4. "אין הרשאה" ו"לא קיים" מחזירים את אותה תוצאה. תמיד.
-- ============================================================================


-- ============================================================================
-- חלק 1 — פונקציות עזר
-- ============================================================================

create or replace function app.is_platform_admin()
returns boolean language sql stable
security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from platform_admins pa
    where pa.user_id = auth.uid() and pa.revoked_at is null
  )
$$;

-- p_min_role: 'editor' = חבר פעיל כלשהו | 'owner' = בעלים בלבד
create or replace function app.is_tenant_member(p_tenant uuid, p_min_role text default 'editor')
returns boolean language sql stable
security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from memberships m
    where m.tenant_id = p_tenant
      and m.user_id   = auth.uid()
      and m.status    = 'active'
      and m.revoked_at is null
      and (p_min_role = 'editor' or m.role = 'owner')
  )
$$;

-- הזכאות של מטייל. ארבעת התנאים כולם נדרשים (ראה B6).
create or replace function app.has_map_access(p_map uuid)
returns boolean language sql stable
security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from map_access a
    join maps mp on mp.id = a.map_id
    where a.map_id  = p_map
      and a.user_id = auth.uid()
      and a.revoked_at is null
      and a.starts_at <= now()
      and (a.expires_at is null or a.expires_at > now())
      and mp.deleted_at is null
      and mp.status = 'published'
  )
$$;

-- גישת אדמין פלטפורמה — רק בהסכמה מפורשת של היוצר, פר-מפה, בתוקף (D6)
create or replace function app.admin_has_map_consent(p_map uuid)
returns boolean language sql stable
security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from admin_map_grants g
    where g.map_id   = p_map
      and g.admin_id = auth.uid()
      and g.revoked_at is null
      and g.expires_at > now()
  ) and exists (
    select 1 from platform_admins pa
    where pa.user_id = auth.uid() and pa.revoked_at is null
  )
$$;

-- קיצור: "אני יכול לערוך את המפה הזו"
create or replace function app.can_edit_map(p_map uuid)
returns boolean language sql stable
security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from maps mp
    where mp.id = p_map and mp.deleted_at is null
      and app.is_tenant_member(mp.tenant_id)
  )
$$;

revoke execute on all functions in schema app from public, anon;
grant  execute on function app.is_platform_admin()                 to authenticated;
grant  execute on function app.is_tenant_member(uuid, text)        to authenticated;
grant  execute on function app.has_map_access(uuid)                to authenticated;
grant  execute on function app.admin_has_map_consent(uuid)         to authenticated;
grant  execute on function app.can_edit_map(uuid)                  to authenticated;


-- ============================================================================
-- חלק 2 — הפעלה + ברירת מחדל "סגור"
-- ============================================================================
-- ⚠️ force row level security מכפיף גם את הבעלים של הטבלה.
--    הוא *לא* עוצר את service_role (יש לו BYPASSRLS) — המשמעת שם ידנית (C3).

do $$
declare t text;
begin
  foreach t in array array[
    'tenants','profiles','platform_admins','memberships','maps','layers',
    'locations','map_access','trips','trip_stops','favorites',
    'admin_map_grants','audit_log',
    'payment_events','purchase_intents','payments'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force  row level security', t);
  end loop;
end $$;

-- טבלאות ללא אף policy = נעולות לחלוטין ל-anon/authenticated. במכוון:
--   platform_admins, audit_log (כתיבה), payment_events, purchase_intents, payments
-- כל גישה אליהן דרך שירותי service role בלבד, עם רישום ל-audit_log.


-- ============================================================================
-- חלק 3 — tenants
-- ============================================================================

create policy tenants_member_read on tenants for select to authenticated
  using (deleted_at is null and app.is_tenant_member(id));

-- מטייל צריך את המיתוג של היוצר שממנו קנה, ותו לא.
-- ⚠️ שים לב: מחזיר את השורה כולה. אם יתווספו לtenants שדות פנימיים
--    (עלויות, הערות פנימיות) — להעביר את המטייל ל-view עם עמודות מפורשות.
create policy tenants_traveler_read on tenants for select to authenticated
  using (
    deleted_at is null and status = 'active'
    and exists (
      select 1 from maps m
      where m.tenant_id = tenants.id and app.has_map_access(m.id)
    )
  );

create policy tenants_owner_update on tenants for update to authenticated
  using       (deleted_at is null and app.is_tenant_member(id, 'owner'))
  with check  (deleted_at is null and app.is_tenant_member(id, 'owner'));

-- יצירת tenant היא onboarding, לא פעולת משתמש. service role בלבד. אין policy ל-insert.


-- ============================================================================
-- חלק 4 — profiles
-- ============================================================================

create policy profiles_self_read on profiles for select to authenticated
  using (id = (select auth.uid()));

-- העמודות שניתן לעדכן מוגבלות ברמת GRANT ב-10_SCHEMA.sql. שתי השכבות יחד.
create policy profiles_self_update on profiles for update to authenticated
  using      (id = (select auth.uid()) and deleted_at is null)
  with check (id = (select auth.uid()) and deleted_at is null);

-- ⚠️ אין policy שמאפשרת ליוצר לקרוא profiles.
--    ראיית לקוחות עוברת אך ורק דרך app.list_map_customers (חלק 12).


-- ============================================================================
-- חלק 5 — memberships
-- ============================================================================
-- הפונקציה היא security definer, ולכן הקריאה הפנימית ל-memberships
-- לא מפעילה מדיניות → אין רקורסיה.

create policy memberships_read on memberships for select to authenticated
  using (user_id = (select auth.uid()) or app.is_tenant_member(tenant_id));

create policy memberships_owner_write on memberships for all to authenticated
  using      (app.is_tenant_member(tenant_id, 'owner'))
  with check (app.is_tenant_member(tenant_id, 'owner'));


-- ============================================================================
-- חלק 6 — maps
-- ============================================================================

create policy maps_creator_all on maps for all to authenticated
  using      (app.is_tenant_member(tenant_id))
  with check (app.is_tenant_member(tenant_id));   -- ⚠️ בלי זה: העברת מפה ל-tenant אחר

create policy maps_traveler_read on maps for select to authenticated
  using (deleted_at is null and status = 'published' and app.has_map_access(id));

create policy maps_admin_read on maps for select to authenticated
  using (app.admin_has_map_consent(id));

-- ── מדיניות anon לדמו (שלב 2–4 בתוכנית) ────────────────────────────────────
-- ⚠️ זמנית. להסיר בשלב 5 כשנכנס auth.
-- מותנית בדגל מפורש ב-branding כדי שלא תחול על כל מפה שפורסמה בטעות.
-- create policy maps_public_demo on maps for select to anon
--   using (deleted_at is null and status = 'published'
--          and exists (select 1 from tenants t
--                      where t.id = maps.tenant_id
--                        and (t.branding->>'public_demo')::boolean is true));


-- ============================================================================
-- חלק 7 — layers  (ראה B1 — הדליפה הכי לא-אינטואיטיבית בתכנון)
-- ============================================================================

create policy layers_creator_all on layers for all to authenticated
  using      (app.is_tenant_member(tenant_id))
  with check (app.is_tenant_member(tenant_id));

-- מטייל רואה שכבה רק אם היא בשימוש במפה שיש לו גישה אליה.
-- מדיניות נאיבית לפי tenant_id תחשוף את מפות העתיד של היוצר.
create policy layers_traveler_read on layers for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from locations l
      where l.layer_id = layers.id
        and l.deleted_at is null
        and app.has_map_access(l.map_id)
    )
  );

create policy layers_admin_read on layers for select to authenticated
  using (
    exists (
      select 1 from locations l
      where l.layer_id = layers.id and app.admin_has_map_consent(l.map_id)
    )
  );


-- ============================================================================
-- חלק 8 — locations
-- ============================================================================

create policy locations_creator_all on locations for all to authenticated
  using      (app.is_tenant_member(tenant_id))
  with check (app.is_tenant_member(tenant_id));

create policy locations_traveler_read on locations for select to authenticated
  using (deleted_at is null and app.has_map_access(map_id));

create policy locations_admin_read on locations for select to authenticated
  using (app.admin_has_map_consent(map_id));


-- ============================================================================
-- חלק 9 — map_access
-- ============================================================================
-- ⚠️ אין policy ל-insert/update/delete. בכוונה.
--    כל כתיבה עוברת דרך grantAccess()/revokeAccess() ב-service role (כלל 5),
--    כדי שיהיה מקום אחד שכותב גם ל-audit_log.

create policy map_access_self_read on map_access for select to authenticated
  using (user_id = (select auth.uid()));

create policy map_access_creator_read on map_access for select to authenticated
  using (app.can_edit_map(map_id));


-- ============================================================================
-- חלק 10 — פעילות מטייל
-- ============================================================================
-- הכלל: הבעלות היא של המטייל, אבל היצירה מותנית בזכאות פעילה למפה.
-- פקיעת זכאות לא מוחקת — היא חוסמת יצירה חדשה ומסתירה את התוכן העשיר (כלל 7).

create policy trips_owner_read on trips for select to authenticated
  using (owner_id = (select auth.uid()) and deleted_at is null);

create policy trips_owner_insert on trips for insert to authenticated
  with check (owner_id = (select auth.uid()) and app.has_map_access(map_id));

create policy trips_owner_update on trips for update to authenticated
  using      (owner_id = (select auth.uid()) and deleted_at is null)
  with check (owner_id = (select auth.uid()));

create policy trips_owner_delete on trips for delete to authenticated
  using (owner_id = (select auth.uid()));


create policy trip_stops_owner_read on trip_stops for select to authenticated
  using (exists (select 1 from trips t
                 where t.id = trip_stops.trip_id and t.owner_id = (select auth.uid())));

create policy trip_stops_owner_write on trip_stops for all to authenticated
  using (exists (select 1 from trips t
                 where t.id = trip_stops.trip_id
                   and t.owner_id = (select auth.uid())))
  with check (exists (select 1 from trips t
                      where t.id = trip_stops.trip_id
                        and t.owner_id = (select auth.uid())
                        and app.has_map_access(t.map_id)));
-- ה-composite FK כבר מונע צירוף נקודה ממפה אחרת — זו שכבה שנייה על אותו כלל.


create policy favorites_owner_read on favorites for select to authenticated
  using (owner_id = (select auth.uid()));

create policy favorites_owner_write on favorites for all to authenticated
  using      (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and app.has_map_access(map_id));


-- ============================================================================
-- חלק 11 — הסכמות אדמין ויומן
-- ============================================================================

-- היוצר מעניק, רואה ומבטל. זה כל הרעיון: זו הסכמה שלו, לא הרשאה שלי.
create policy admin_grants_creator_all on admin_map_grants for all to authenticated
  using      (app.can_edit_map(map_id))
  with check (app.can_edit_map(map_id) and granted_by = (select auth.uid()));

create policy admin_grants_admin_read on admin_map_grants for select to authenticated
  using (admin_id = (select auth.uid()));

-- היוצר קורא את היומן של ה-tenant שלו. כתיבה — service role בלבד (יש rules חוסמים).
create policy audit_log_tenant_read on audit_log for select to authenticated
  using (tenant_id is not null and app.is_tenant_member(tenant_id, 'owner'));


-- ============================================================================
-- חלק 12 — ראיית לקוחות ע"י יוצר (כלל 4)
-- ============================================================================
-- RPC ולא view: האסרציה מפורשת, קשה לשכוח, וקל לכתוב לה בדיקה.
-- מחזירה עמודות מפורשות בלבד — לעולם לא select * על profiles.

create or replace function app.list_map_customers(p_map uuid)
returns table (
  user_id    uuid,
  full_name  text,
  email      text,
  granted_at timestamptz,
  expires_at timestamptz,
  source     text
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not app.can_edit_map(p_map) then
    -- ⚠️ 'not_found' ולא 'forbidden': הבחנה ביניהם מאשרת קיום מזהה.
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return query
    select p.id, p.full_name, p.email, a.created_at, a.expires_at, a.source
    from map_access a
    join profiles p on p.id = a.user_id
    where a.map_id = p_map
      and a.revoked_at is null
      and p.deleted_at is null
    order by a.created_at desc;
end $$;

revoke execute on function app.list_map_customers(uuid) from public, anon;
grant  execute on function app.list_map_customers(uuid) to authenticated;

-- מה שהפונקציה הזו במכוון *לא* מחזירה, וגם אסור שיהיה לה אח שכן מחזיר:
--   • מתי המשתמש נרשם לפלטפורמה (תאריך ברמת פלטפורמה)
--   • כמה מפות הוא קנה בסך הכל, או ממי
--   • האם המייל קיים במערכת כשאין לו גישה למפה הזו
--   • מיון לפי פעילות כללית
-- כל אחד מהם מאפשר ליוצר להסיק על קיומם של יוצרים אחרים.


-- ============================================================================
-- חלק 13 — חגורה ושלייקס: ברירות מחדל של GRANT
-- ============================================================================
-- Supabase מעניק כברירת מחדל הרשאות רחבות ל-anon/authenticated ונשען
-- אך ורק על RLS. השורות הבאות מוסיפות שכבה שנייה: טבלה חדשה שנוצרה בלי
-- policy לא תהיה נגישה בטעות.

alter default privileges in schema public
  revoke all on tables from anon, authenticated;

revoke all on schema app from anon, authenticated;
grant usage on schema app to authenticated;


-- ============================================================================
-- חלק 14 — בדיקות (ראה E1). זו התוספת החשובה ביותר בכל התכנון.
-- ============================================================================
-- קובץ בדיקות שרץ ב-CI על כל PR. שלד הטענות שחייבות להיות שם:
--
-- בידוד בין יוצרים
--   ✓ יוצר ב׳ לא רואה אף map/layer/location של יוצר א׳
--   ✓ יוצר ב׳ לא יכול לעדכן maps.tenant_id לערך של יוצר א׳       (B2)
--   ✓ יוצר ב׳ לא יכול לכתוב location עם map_id של יוצר א׳         (A1)
--   ✓ insert של location עם tenant_id של א׳ ו-map_id של ב׳ נכשל   (A1)
--
-- מטייל
--   ✓ מטייל בלי זכאות מקבל 0 שורות (לא שגיאה) מכל טבלת תוכן
--   ✓ מטייל עם זכאות שפגה מקבל 0 שורות תוכן — אבל trips שלו נשמרות (כלל 7)
--   ✓ מטייל שקנה מפה אחת לא רואה layers ששייכות רק למפה אחרת      (B1)
--   ✓ אי אפשר להוסיף trip_stop עם location ממפה אחרת              (A2)
--   ✓ אי אפשר ליצור trip למפה שאין אליה זכאות
--
-- הסלמת הרשאות
--   ✓ update על profiles של עמודה שלא הוענקה נכשל                 (A3)
--   ✓ משתמש רגיל לא יכול לכתוב ל-platform_admins
--   ✓ אדמין פלטפורמה בלי admin_map_grant בתוקף רואה 0 שורות       (D6)
--   ✓ admin_map_grant שפג מפסיק לתת גישה מיידית
--
-- ראיית לקוחות
--   ✓ list_map_customers על מפה של יוצר אחר זורק not_found         (B4)
--   ✓ ההודעה זהה למפה שלא קיימת בכלל
--
-- סליקה
--   ✓ אף תפקיד חוץ מ-service role לא קורא payments/purchase_intents
--
-- אחרי כל שינוי במדיניות: להריץ. אם הבדיקות לא רצות ב-CI, הן לא קיימות.
-- ============================================================================
