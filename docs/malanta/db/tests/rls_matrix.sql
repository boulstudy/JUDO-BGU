-- tests/rls_matrix.sql — חבילת בדיקות ההרשאות
-- ============================================================================
-- זו התשתית שמאפשרת לשנות מדיניות בלי פחד. רצה ב-CI על כל PR.
-- כל טענה: set role authenticated + הזהות של המשתמש, ואז ספירה.
-- כישלון = ERROR, כלומר exit code שונה מאפס.
-- ============================================================================
\set ON_ERROR_STOP on
\set QUIET 1
set client_min_messages = notice;

create or replace function t_assert(p_label text, p_actual anyelement, p_expected anyelement)
returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL: % — expected %, got %', p_label, p_expected, p_actual;
  end if;
  raise notice 'ok   %', p_label;
end $$;

-- ⚠️ שתי מלכודות שהתגלו בכתיבת החבילה הזו, ושכל מי שכותב בדיקות RLS ייפול בהן:
--
-- 1. t_denied מוקדם יותר תפס גם raise_exception — כלומר בלע את הודעת ה-FAIL
--    של עצמו והציג כישלון כהצלחה. כאן הודעת FAIL נזרקת מחדש במפורש.
--
-- 2. **UPDATE ו-DELETE שנחסמים ב-RLS לא זורקים שגיאה — הם מעדכנים 0 שורות.**
--    בדיקה שמצפה לשגיאה תעבור תמיד, גם כשהמדיניות פרוצה. לכן t_no_rows.
create or replace function t_denied(p_label text, p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL: % — statement succeeded but should have been denied', p_label;
exception
  when insufficient_privilege or check_violation or foreign_key_violation
     or unique_violation or no_data_found or serialization_failure then
    raise notice 'ok   % (denied: %)', p_label, sqlerrm;
  when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;   -- ⚠️ לא לבלוע את הכישלון של עצמנו
    raise notice 'ok   % (denied: %)', p_label, sqlerrm;
end $$;

-- לכתיבות שנחסמות ע"י RLS בשקט: לוודא ש-0 שורות הושפעו בפועל
create or replace function t_no_rows(p_label text, p_sql text)
returns void language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: % — % row(s) were modified; RLS did not filter them', p_label, n;
  end if;
  raise notice 'ok   % (0 rows affected)', p_label;
end $$;

-- ── נתוני בסיס ──────────────────────────────────────────────────────────────
\set A_OWNER    '11111111-1111-1111-1111-111111111111'
\set A_CONTRIB  '11111111-1111-1111-1111-111111111122'
\set B_OWNER    '22222222-2222-2222-2222-222222222222'
\set TRAVELER   '33333333-3333-3333-3333-333333333333'
\set OUTSIDER   '44444444-4444-4444-4444-444444444444'
\set TEN_A      'aaaaaaaa-0000-0000-0000-00000000000a'
\set TEN_B      'bbbbbbbb-0000-0000-0000-00000000000b'
\set MAP_A1     'a1a1a1a1-0000-0000-0000-0000000000a1'
\set MAP_A2     'a2a2a2a2-0000-0000-0000-0000000000a2'
\set MAP_B1     'b1b1b1b1-0000-0000-0000-0000000000b1'
\set LAY_A_PUB  'aaaa1111-0000-0000-0000-00000000aaa1'
\set LAY_A_SEC  'aaaa2222-0000-0000-0000-00000000aaa2'
\set LAY_B      'bbbb1111-0000-0000-0000-00000000bbb1'
\set LOC_A1     'a0000001-0000-0000-0000-00000000a001'
\set LOC_A2     'a0000002-0000-0000-0000-00000000a002'
\set LOC_B1     'b0000001-0000-0000-0000-00000000b001'
\set TRIP_T     'c0000001-0000-0000-0000-00000000c001'

insert into auth.users(id,email,email_confirmed_at) values
 (:'A_OWNER','a-owner@x.test',now()), (:'A_CONTRIB','a-contrib@x.test',now()),
 (:'B_OWNER','b-owner@x.test',now()), (:'TRAVELER','traveler@x.test',now()),
 (:'OUTSIDER','outsider@x.test',now());

insert into tenants(id,slug,name) values (:'TEN_A','creator-a','Creator A'), (:'TEN_B','creator-b','Creator B');
insert into memberships(tenant_id,user_id,role) values
 (:'TEN_A',:'A_OWNER','owner'), (:'TEN_A',:'A_CONTRIB','contributor'),
 (:'TEN_B',:'B_OWNER','owner');

insert into maps(id,tenant_id,slug,label,center_lat,center_lng,status,published_at) values
 (:'MAP_A1',:'TEN_A','greece','Greece',37,23,'published',now()),
 (:'MAP_A2',:'TEN_A','japan','Japan (unreleased)',35,139,'draft',null),
 (:'MAP_B1',:'TEN_B','peru','Peru',-12,-77,'published',now());

insert into layers(id,tenant_id,name) values
 (:'LAY_A_PUB',:'TEN_A','Food'), (:'LAY_A_SEC',:'TEN_A','Kyoto Temples'), (:'LAY_B',:'TEN_B','Ruins');

insert into locations(id,tenant_id,map_id,layer_id,name,lat,lng) values
 (:'LOC_A1',:'TEN_A',:'MAP_A1',:'LAY_A_PUB','Taverna',37.1,23.1),
 (:'LOC_A2',:'TEN_A',:'MAP_A2',:'LAY_A_SEC','Kinkaku-ji',35.0,135.7),
 (:'LOC_B1',:'TEN_B',:'MAP_B1',:'LAY_B','Machu Picchu',-13.1,-72.5);

insert into map_access(map_id,user_id,source) values (:'MAP_A1',:'TRAVELER','manual');

grant usage on schema app to authenticated;

-- ============================================================================
\echo '### 1. בידוד בין יוצרים'
-- ============================================================================
set role authenticated; set request.jwt.claim.sub = :'B_OWNER';
select t_assert('יוצר ב׳ לא רואה מפות של א׳',  (select count(*) from maps where tenant_id=:'TEN_A'), 0::bigint);
select t_assert('יוצר ב׳ לא רואה נקודות של א׳',(select count(*) from locations where tenant_id=:'TEN_A'), 0::bigint);
select t_assert('יוצר ב׳ לא רואה שכבות של א׳', (select count(*) from layers where tenant_id=:'TEN_A'), 0::bigint);
select t_assert('יוצר ב׳ לא רואה את tenant א׳',(select count(*) from tenants where id=:'TEN_A'), 0::bigint);
select t_assert('יוצר ב׳ רואה את שלו',         (select count(*) from maps), 1::bigint);
select t_denied('יוצר ב׳ לא יכול לכתוב נקודה למפה של א׳',
  format('insert into locations(id,tenant_id,map_id,name,lat,lng) values (gen_random_uuid(),%L,%L,''x'',1,1)', :'TEN_B', :'MAP_A1'));
select t_no_rows('יוצר ב׳ לא יכול לגנוב מפה ע"י שינוי tenant_id',
  format('update maps set tenant_id=%L where id=%L', :'TEN_B', :'MAP_A1'));
reset role;

-- ============================================================================
\echo '### 2. תפקידים — contributor לא רואה לקוחות'
-- ============================================================================
set role authenticated; set request.jwt.claim.sub = :'A_CONTRIB';
select t_assert('contributor רואה את התוכן',        (select count(*) from locations), 2::bigint);
select t_assert('contributor רואה שכבות',           (select count(*) from layers), 2::bigint);
select t_assert('contributor לא רואה זכאויות',      (select count(*) from map_access), 0::bigint);
select t_denied('contributor לא קורא רשימת לקוחות', format('select * from app.list_map_customers(%L)', :'MAP_A1'));
select t_denied('contributor לא מזמין חברי צוות',
  format('insert into membership_invites(tenant_id,email_norm,role,token_hash,invited_by,expires_at) values (%L,''x@y.z'',''editor'',''h'',%L,now()+interval ''1 day'')', :'TEN_A', :'A_CONTRIB'));
reset role;

set role authenticated; set request.jwt.claim.sub = :'A_OWNER';
select t_assert('owner כן רואה לקוחות', (select count(*) from app.list_map_customers(:'MAP_A1')), 1::bigint);
select t_assert('owner רואה זכאויות',   (select count(*) from map_access), 1::bigint);
reset role;

-- ============================================================================
\echo '### 3. מטייל — זכאות, גבולות, ודליפת שכבות'
-- ============================================================================
set role authenticated; set request.jwt.claim.sub = :'TRAVELER';
select t_assert('מטייל רואה את המפה שקנה',        (select count(*) from maps), 1::bigint);
select t_assert('מטייל רואה נקודות של המפה שקנה', (select count(*) from locations), 1::bigint);
select t_assert('מטייל לא רואה נקודות של מפה אחרת', (select count(*) from locations where map_id=:'MAP_B1'), 0::bigint);
-- ⚠️ הבדיקה החשובה: שכבות משותפות בין מפות של אותו יוצר
select t_assert('מטייל לא רואה שכבה של מפה שלא קנה (Kyoto)',
  (select count(*) from layers where id=:'LAY_A_SEC'), 0::bigint);
select t_assert('מטייל רואה רק את השכבה שבשימוש במפה שקנה', (select count(*) from layers), 1::bigint);
select t_assert('מטייל לא רואה פרופילים אחרים', (select count(*) from profiles), 1::bigint);
select t_no_rows('מטייל לא יכול לערוך נקודה של היוצר',
  format('update locations set name=''hacked'' where id=%L', :'LOC_A1'));
select t_denied('מטייל לא יכול ליצור מסלול במפה שלא קנה',
  format('insert into trips(id,map_id,owner_id,title) values (gen_random_uuid(),%L,%L,''x'')', :'MAP_B1', :'TRAVELER'));
insert into trips(id,map_id,owner_id,title) values (:'TRIP_T',:'MAP_A1',:'TRAVELER','My Greece trip');
select t_assert('מטייל יוצר מסלול במפה שקנה', (select count(*) from trips), 1::bigint);
select t_denied('אי אפשר לצרף נקודה ממפה אחרת למסלול',
  format('insert into trip_stops(id,trip_id,map_id,location_id) values (gen_random_uuid(),%L,%L,%L)',
         :'TRIP_T', :'MAP_A1', :'LOC_B1'));
insert into trip_stops(id,trip_id,map_id,location_id) values (gen_random_uuid(),:'TRIP_T',:'MAP_A1',:'LOC_A1');
reset role;

-- ============================================================================
\echo '### 4. פקיעת זכאות — מסלול שורד, תוכן נחסם'
-- ============================================================================
-- הערה: המגבלה expires_at > starts_at חוסמת "פקיעה בדיעבד" — וזה נכון.
-- לסיום מיידי משתמשים ב-revoked_at. לכן ההדמיה מזיזה גם את starts_at.
update map_access set starts_at = now() - interval '10 days',
                      expires_at = now() - interval '1 day' where map_id=:'MAP_A1';
set role authenticated; set request.jwt.claim.sub = :'TRAVELER';
select t_assert('אחרי פקיעה: אין תוכן',        (select count(*) from locations), 0::bigint);
select t_assert('אחרי פקיעה: אין מפה',         (select count(*) from maps), 0::bigint);
select t_assert('אחרי פקיעה: המסלול שרד',      (select count(*) from trips), 1::bigint);
select t_assert('אחרי פקיעה: העצירות שרדו',    (select count(*) from trip_stops), 1::bigint);
select t_denied('אחרי פקיעה: אי אפשר להוסיף עצירה',
  format('insert into trip_stops(id,trip_id,map_id,location_id) values (gen_random_uuid(),%L,%L,%L)',
         :'TRIP_T', :'MAP_A1', :'LOC_A1'));
reset role;
update map_access set starts_at = now(), expires_at = null where map_id=:'MAP_A1';

-- ============================================================================
\echo '### 5. אדמין פלטפורמה — ללא הסכמה, אין גישה'
-- ============================================================================
insert into platform_admins(user_id, role_key) values (:'OUTSIDER','platform_admin');
set role authenticated; set request.jwt.claim.sub = :'OUTSIDER';
select t_assert('אדמין בלי הסכמה לא רואה מפות',   (select count(*) from maps), 0::bigint);
select t_assert('אדמין בלי הסכמה לא רואה נקודות', (select count(*) from locations), 0::bigint);
select t_denied('אדמין לא יכול להעניק לעצמו הסכמה',
  format('insert into admin_map_grants(map_id,admin_id,granted_by,reason,expires_at) values (%L,%L,%L,''self serve please'',now()+interval ''7 days'')',
         :'MAP_A1', :'OUTSIDER', :'OUTSIDER'));
reset role;

-- היוצר מעניק הסכמה מפורשת
set role authenticated; set request.jwt.claim.sub = :'A_OWNER';
insert into admin_map_grants(map_id,admin_id,granted_by,reason,expires_at)
 values (:'MAP_A1',:'OUTSIDER',:'A_OWNER','debugging a reported import issue', now()+interval '7 days');
reset role;
set role authenticated; set request.jwt.claim.sub = :'OUTSIDER';
select t_assert('עם הסכמה: אדמין רואה את המפה',    (select count(*) from maps), 1::bigint);
select t_assert('עם הסכמה: רק את המפה שהוסכמה',    (select count(*) from maps where id=:'MAP_A2'), 0::bigint);
select t_no_rows('הסכמת קריאה לא מתירה עריכה',
  format('update maps set label=''x'' where id=%L', :'MAP_A1'));
reset role;
update admin_map_grants set expires_at = now() - interval '1 hour';
set role authenticated; set request.jwt.claim.sub = :'OUTSIDER';
select t_assert('הסכמה שפגה מפסיקה לתת גישה מיידית', (select count(*) from maps), 0::bigint);
reset role;

-- ============================================================================
\echo '### 6. הסלמת הרשאות'
-- ============================================================================
set role authenticated; set request.jwt.claim.sub = :'TRAVELER';
select t_denied('משתמש לא יכול להפוך עצמו לאדמין פלטפורמה',
  format('insert into platform_admins(user_id,role_key) values (%L,''platform_admin'')', :'TRAVELER'));
select t_denied('משתמש לא יכול לצרף את עצמו ל-tenant',
  format('insert into memberships(tenant_id,user_id,role) values (%L,%L,''owner'')', :'TEN_A', :'TRAVELER'));
select t_denied('משתמש לא יכול להעניק לעצמו זכאות',
  format('insert into map_access(map_id,user_id) values (%L,%L)', :'MAP_B1', :'TRAVELER'));
select t_denied('משתמש לא קורא טבלת תשלומים', 'select * from payments');
select t_denied('משתמש לא קורא קופונים',       'select * from coupons');
select t_denied('משתמש לא קורא canary',        'select * from canary_assignments');
select t_no_rows('משתמש לא משנה role של עצמו',
  format('update memberships set role=''owner'' where user_id=%L', :'TRAVELER'));
reset role;

-- ============================================================================
\echo '### 7. הודעות שגיאה לא מסגירות קיום'
-- ============================================================================
set role authenticated; set request.jwt.claim.sub = :'B_OWNER';
do $$
declare e1 text; e2 text;
begin
  begin perform * from app.list_map_customers('a1a1a1a1-0000-0000-0000-0000000000a1');
  exception when others then e1 := sqlerrm; end;
  begin perform * from app.list_map_customers('00000000-0000-0000-0000-000000000000');
  exception when others then e2 := sqlerrm; end;
  if e1 is distinct from e2 then
    raise exception 'FAIL: error text leaks existence — real map: %, fake map: %', e1, e2;
  end if;
  raise notice 'ok   מפה קיימת של אחר ומפה שלא קיימת מחזירות בדיוק אותה שגיאה (%)', e1;
end $$;
reset role;

-- ============================================================================
\echo '### 8. עריכה — נעילה אופטימית והיסטוריה'
-- ============================================================================
set role authenticated; set request.jwt.claim.sub = :'A_OWNER';
update maps set label='Greece v2' where id=:'MAP_A1';
select t_assert('lock_version התקדם', (select lock_version from maps where id=:'MAP_A1'), 1::bigint);
select t_denied('כתיבה על גרסה ישנה נדחית',
  format('update maps set label=''conflict'', lock_version=0 where id=%L', :'MAP_A1'));
select t_assert('נרשמה גרסה בהיסטוריה',
  (select count(*) from content_revisions where entity_id=:'MAP_A1' and operation='update'), 1::bigint);
select t_assert('ההיסטוריה שמרה מה השתנה',
  (select 'label' = any(changed_keys) from content_revisions
   where entity_id=:'MAP_A1' and operation='update'), true);
reset role;
set role authenticated; set request.jwt.claim.sub = :'B_OWNER';
select t_assert('יוצר ב׳ לא רואה את ההיסטוריה של א׳',
  (select count(*) from content_revisions where tenant_id=:'TEN_A'), 0::bigint);
reset role;

\echo ''
\echo '✅ כל הטענות עברו'
