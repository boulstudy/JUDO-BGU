# Malanta — סקירת ארכיטקטורה, הרשאות ואבטחת מידע

סקירה של מסמך התכנון לפני שורת הקוד הראשונה.
מסודר לפי **עלות התיקון המאוחר**, לא לפי סדר המסמך המקורי.

> הערה על ההקשר: המסמך הזה נכתב בריפו JUDO-BGU כי זה הריפו הפעיל בסשן.
> הוא מיועד להעברה ל-`docs/` של ריפו Malanta החדש ברגע שייווצר.

---

## תקציר מנהלים — 10 השורות שחשובות

1. **הסכמה לא אוכפת את הכלל המרכזי של התכנון.** אפשר, עם הסכמה הנוכחית, ליצור `location` עם `tenant_id` של יוצר א׳ ו-`map_id` של יוצר ב׳, ו-`trip_stop` שמערבב שתי מפות. RLS לא תתפוס את זה. **חסם — לתקן לפני מיגרציה 1.**
2. **`profiles.is_platform_admin` הוא וקטור הסלמת-הרשאות**, וגם סותר ישירות את כלל 10 ב-CLAUDE.md ("אין `is_admin` בוליאני"). להוציא לטבלה נפרדת.
3. **מחיקה רכה + `unique` רגיל = באג.** אחרי soft-delete של מפה אי אפשר לפתוח מפה עם אותו slug. צריך partial unique index.
4. **`layers` משותפות בין מפות — וזו דליפת מידע.** מטייל שקנה מפה אחת יראה, במדיניות נאיבית, את כל רשימת הקטגוריות של היוצר, כולל כאלה ששייכות למפות שלא קנה.
5. **הסליקה לא יכולה להתבסס על הצלבת שם+מייל בלבד.** זה ישבר על טעות הקלדה אחת, ואין לו דרך להתמודד עם זיכוי/chargeback. הפתרון: `purchase_intent` token שעובר דרך עמוד הסליקה וחוזר. מייל = fallback, לא מפתח ראשי. פירוט מלא ב-`30_PAYMENTS.md`.
6. **מפתח האריחים חשוף בקליינט** (`NEXT_PUBLIC_MAP_TILES_URL`) — זה הסיכון הכספי הפתוח היחיד. חייב domain restriction על המפתח + התראת תקציב, מהיום הראשון.
7. **תמונות ב-R2 ציבורי מחוררות את התשלום.** אם התמונות בכתובת ציבורית, חלק מהמוצר זמין בלי לשלם. צריך bucket פרטי + signed URLs.
8. **CLAUDE.md מבטיח "גישת אדמין בהסכמה, עם תפוגה, מתועדת" — וה-MVP חתך את ה-audit log.** סתירה. זו הבטחת האמון המרכזית מול יוצרים; 2 טבלאות קטנות, לא לחתוך.
9. **אין אסטרטגיית בדיקות.** "תוכיח לי שיוצר שני לא רואה כלום" בשבוע 5 היא בדיקה ידנית שתירקב. צריך חבילת בדיקות RLS אוטומטית **בסוף שבוע 1**. זו התוספת עם התשואה הגבוהה ביותר בכל התכנון.
10. שאר התכנון — מודל התחום, שני צירי השיוך, MapLibre, R2, Resend, הפרדת רכישה/הענקה/צריכה — **נכון, ולא צריך לשנות אותו.**

---

## חלק א׳ — חסמים: לתקן לפני מיגרציה ראשונה

### A1. אין אכיפת עקביות בין `tenant_id` ל-`map_id` (קריטי)

הסכמה הנוכחית:
```sql
create table locations (
  tenant_id uuid not null references tenants(id),
  map_id    uuid not null references maps(id),
  layer_id  uuid references layers(id),
  ...
);
```
שלושת ה-FK עצמאיים. שום דבר לא מונע `tenant_id = A` עם `map_id` ששייך ל-B.
ואם מדיניות ה-RLS על `locations` בודקת `tenant_id` (כמו שהיא צריכה) — היוצר של A
זה עתה כתב נקודה לתוך המפה של B, וה-RLS אישרה.

זה לא תיאורטי: זה בדיוק מה שיקרה בסקריפט ייבוא עם באג, או בקליינט שמייצר
`id` בעצמו (כלל 8) ושולח payload חלקי.

**התיקון — composite foreign keys:**
```sql
alter table maps   add constraint maps_id_tenant_key   unique (id, tenant_id);
alter table layers add constraint layers_id_tenant_key unique (id, tenant_id);
alter table maps   add constraint maps_id_key_for_children unique (id);  -- כבר PK

alter table locations
  add constraint locations_map_fk
    foreign key (map_id, tenant_id) references maps(id, tenant_id) on delete cascade,
  add constraint locations_layer_fk
    foreign key (layer_id, tenant_id) references layers(id, tenant_id) on delete set null;
```
עכשיו זה **בלתי אפשרי** ברמת ה-DB, לא ברמת המשמעת.

### A2. `trip_stops` יכולה לערבב שתי מפות (קריטי)

תוכנית הבנייה, שלב 8: *"קבלה: אי אפשר ליצור מסלול שמערבב נקודות משתי מפות"*.
הסכמה לא אוכפת את זה בכלל — `trip_stops` מחזיקה `trip_id` ו-`location_id` בלי שום קשר ביניהם.

זו לא בעיה תיאורטית של סדר: **זה הגבול בין קנייניהם של שני יוצרים** — בדיוק
מה שהמסמך מגדיר כהחלטה המכוונת המרכזית. אם הוא נאכף רק בקוד, הוא ייפרץ.

**התיקון:**
```sql
alter table trips     add constraint trips_id_map_key     unique (id, map_id);
alter table locations add constraint locations_id_map_key unique (id, map_id);

create table trip_stops (
  id          uuid primary key,
  trip_id     uuid not null,
  map_id      uuid not null,          -- דנורמליזציה, נאכפת
  location_id uuid not null,
  ...
  foreign key (trip_id, map_id)     references trips(id, map_id)     on delete cascade,
  foreign key (location_id, map_id) references locations(id, map_id) on delete cascade
);
```
`map_id` נראה מיותר — הוא לא. הוא הדבק שמאלץ את שני ה-FK להסכים.
אותו דבר ב-`favorites`.

### A3. `is_platform_admin` — הסלמת הרשאות + סתירה פנימית

CLAUDE.md כלל 10: *"אסור `is_admin` בוליאני"*. הסכמה בסעיף 7: `profiles.is_platform_admin boolean`.

מעבר לסתירה — זו **פרצה ממשית**. ברגע שתהיה מדיניות
`profiles update using (id = auth.uid())` (ותהיה — משתמש צריך לערוך את שמו),
כל משתמש יכול לשלוח `PATCH /profiles?id=eq.me {"is_platform_admin": true}`
ולהפוך לאדמין פלטפורמה. ב-Supabase זו קריאת REST אחת מהדפדפן.

**התיקון:**
```sql
create table platform_admins (
  user_id    uuid primary key references profiles(id) on delete cascade,
  granted_by uuid references profiles(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table platform_admins enable row level security;
-- ללא שום policy → אף אחד לא קורא/כותב חוץ מ-security definer functions
```
בנוסף, כעיקרון רוחבי: **על כל טבלה עם עדכון-עצמי, לשלול UPDATE ברמת עמודה**
על כל עמודה שהיא לא נתון משתמש:
```sql
revoke update on profiles from authenticated;
grant update (full_name, locale, avatar_key) on profiles to authenticated;
```
זו ההגנה שעובדת גם כשמדיניות RLS נכתבה ברישול.

### A4. מחיקה רכה שוברת את ה-unique constraints

```sql
unique (tenant_id, slug)   -- maps
unique (tenant_id, name)   -- layers
```
עם `deleted_at` (כלל 8) — יוצר שמחק את מפת "יוון" לא יכול ליצור מפת "יוון" חדשה, לעולם.
זה יתגלה אצל הלקוח, לא בפיתוח.

**התיקון:**
```sql
create unique index maps_tenant_slug_key
  on maps (tenant_id, lower(slug)) where deleted_at is null;
create unique index layers_tenant_name_key
  on layers (tenant_id, lower(name)) where deleted_at is null;
```
(`lower()` גם פותר "Greece" מול "greece".)

### A5. R2 — הבחירה שהמסמך מסמן כיקרה-לשינוי, לא הושלמה עד הסוף

המסמך צודק ש-R2 היא החלטה שצריך לקבל לפני שורת קוד. אבל ההחלטה שהתקבלה
היא רק *איפה מאחסנים*. שלוש החלטות נוספות באותה רמת עלות:

1. **`locations.photos text[]`** — מערך של מחרוזות. מה יושב שם, URL מלא או object key?
   אם URL מלא — החלפת דומיין CDN היא UPDATE על כל השורות בבסיס הנתונים.
   **להחליט: object key בלבד** (`t/<tenant>/m/<map>/<uuid>.webp`), הדומיין נבנה בזמן קריאה.
2. **הצורה** — `text[]` לא יכול להחזיק alt-text, מידות, סדר, קרדיט. תמונה בלי מידות
   = layout shift בכל טעינת מפה. **להחליף ל-`jsonb`** עם צורה מתועדת.
3. **פרטיות ה-bucket** — ראה B5 למטה. אם ה-bucket ציבורי, התשלום דולף.

---

## חלק ב׳ — הרשאות ו-RLS

התכנון קובע נכון ש-RLS היא שכבת האכיפה היחידה. הנקודות הבאות הן איפה
שהיישום הנאיבי של הכלל הזה נשבר.

### B1. `layers` — דליפת מידע בין מפות של אותו יוצר

זה הכי לא-אינטואיטיבי מכל הרשימה, כי הוא נובע ישירות מדרישת המוצר המרכזית.

`layers` שייכת ל-`tenant`, לא ל-`map` — נכון, זו הנקודה. אבל אז,
מהי מדיניות ה-SELECT למטייל?

- `using (true)` → כל מטייל רואה את כל השכבות של כל היוצרים.
- `using (tenant_id = <של המפה שקניתי>)` → **מטייל שקנה את "יוון" רואה גם את
  השכבות "מסעדות טוקיו" ו"מקדשים בקיוטו"** — כלומר יודע שהיוצר מכין מפת יפן,
  לפני ההשקה. זו דליפת אסטרטגיה עסקית של הלקוח שלך.

**התיקון — שכבה נראית רק אם היא בשימוש במפה שיש אליה גישה:**
```sql
create policy layers_traveler_read on layers
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from locations l
      where l.layer_id = layers.id
        and l.deleted_at is null
        and app.has_map_access(l.map_id)
    )
  );
```
דורש אינדקס `locations (layer_id) where deleted_at is null`.
**זו הדוגמה המייצגת של הכלל:** ישות משותפת נכתבת פעם אחת, אבל נקראת בהקשר.

### B2. UPDATE בלי `with check` = העברת בעלות

```sql
create policy maps_creator on maps for all to authenticated
  using (app.is_tenant_member(tenant_id));   -- ❌ בלי with check
```
`using` נבדק על השורה **לפני** העדכון. יוצר א׳ יכול לעשות
`update maps set tenant_id = '<B>' where id = '<שלו>'` — השורה עברה את `using`,
ואין `with check` שיבדוק את התוצאה. המפה שלו עברה לחשבון של יוצר ב׳
(או, בכיוון ההפוך, הוא לוקח לעצמו את המפה של אחר — לא, זה נחסם ב-`using`;
אבל הוא כן יכול "לזרוק" תוכן לתוך חשבון אחר, ולשבש אותו).

**כלל ברזל:** כל policy מסוג `for all` / `for update` **חייבת** גם `using` וגם `with check`.
בנוסף — טריגר שחוסם שינוי של `tenant_id`, `map_id`, `owner_id` אחרי יצירה.

### B3. רקורסיה ב-`memberships`

מדיניות על `memberships` שכתובה כ-`using (exists (select 1 from memberships ...))`
תיפול ב-`infinite recursion detected in policy`. זו התקלה הכי נפוצה ב-Supabase.

**התיקון:** כל בדיקת חברות עוברת דרך פונקציית `security definer` (שעוקפת RLS
בקריאה הפנימית), עם `search_path` מקובע:
```sql
create function app.is_tenant_member(p_tenant uuid, p_min_role text default 'editor')
returns boolean language sql stable
security definer set search_path = public, pg_temp
as $$ ... $$;
revoke execute on function app.is_tenant_member(uuid, text) from public, anon;
grant   execute on function app.is_tenant_member(uuid, text) to authenticated;
```
`set search_path` הוא לא קישוט — בלעדיו, `security definer` היא פרצה קלאסית.

### B4. `creator_customers` — ה-view שקל להרוס

כלל 4 ב-CLAUDE.md מדויק. שתי מלכודות ביישום:

1. **`security_invoker`.** view רגיל ב-Postgres רץ בהרשאות **הבעלים** — כלומר
   עוקף RLS על `profiles`. זו בדיוק הסיבה שהוא עובד; וזו בדיוק הסיבה
   שהוא חייב לסנן את עצמו. אם מישהו יוסיף אחר כך `security_invoker = on`
   "כי ככה מומלץ", ה-view יפסיק להחזיר כלום — או גרוע יותר, אם ישכחו את
   הסינון הפנימי, הוא יחזיר את כל הלקוחות של כל היוצרים.
   **להיות מפורש בקוד ולכתוב בדיקה.**
2. **`revoke all ... from anon`** — PostgREST חושף אוטומטית כל view בסכמת `public`.

**המלצה:** להעדיף RPC `security definer` על view, כי בה האסרציה מפורשת ובלתי-שכיחה:
```sql
create function app.list_map_customers(p_map uuid)
returns table (user_id uuid, full_name text, email text, granted_at timestamptz, expires_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from maps m
                 where m.id = p_map and app.is_tenant_member(m.tenant_id)) then
    raise exception 'not_found' using errcode = 'P0002';   -- לא 'forbidden'
  end if;
  return query select ...;
end $$;
```
שים לב ל-`not_found` ולא `forbidden`: **הודעת שגיאה שמבחינה בין
"לא קיים" ל"אין לך הרשאה" היא oracle** שמאשר קיום של מזהים.
זה בדיוק מה שהמסמך המקורי חשש ממנו ("הודעות שגיאה שמסגירות קיום של מזהה") — טוב שזוהה, צריך שיהיה כלל אחיד.

### B5. תמונות — התשלום דולף דרך ה-CDN

אם ה-bucket ב-R2 ציבורי, ה-URL של התמונה הוא מפתח נצחי בלי בדיקת הרשאה.
בפועל: קישור לתמונה שיוצא ב-share, או צילום מסך של DevTools, נותן גישה
לנכס שהמטייל שילם עליו. וגרוע יותר — אם המפתחות צפויים (`.../map-123/1.jpg`)
אפשר לסרוק את כל הספרייה.

**התיקון — שלוש שכבות, לפי סדר:**
1. מפתחות אובייקט **אקראיים** (uuid), לא רציפים. זול, חובה בכל מקרה.
2. bucket **פרטי**, גישה דרך signed URL קצר-מועד (10–15 דק׳) שמונפק רק אחרי
   בדיקת `has_map_access` בשרת.
3. או: Cloudflare Worker לפני ה-bucket שמאמת JWT של Supabase.

לוגו של יוצר ותמונת שער יכולים להיות ציבוריים — הם שיווק. תוכן = פרטי.
**בנוסף:** להסיר EXIF בהעלאה. תמונה שמטייל מעלה מכילה קואורדינטות GPS של
המקום שבו צולמה — ולפעמים של הבית שלו.

### B6. פרטים נוספים ברמת ה-RLS

| נושא | מה לעשות |
|---|---|
| ביצועים | לעטוף פונקציות חסרות-פרמטר ב-`(select app.is_platform_admin())` — Postgres יהפוך את זה ל-InitPlan במקום הרצה לכל שורה. הפרש של פי 10–100 בטבלת `locations`. |
| אינדקסים | כל עמודה שמופיעה במדיניות חייבת אינדקס: `map_access(user_id, map_id)`, `memberships(user_id, tenant_id)`, `locations(map_id) where deleted_at is null`. בלעדיהם ה-RLS היא seq scan. |
| `force row level security` | להפעיל על כל טבלה. חשוב לדעת: זה **לא** עוצר את `service_role` (יש לו `bypassrls`). המשמעת סביב service role היא ידנית — ראה C3. |
| `anon` | להחליט מפורשות מה מטייל לא-מחובר רואה. שלב 2 בתוכנית (דמו לבלוגר לפני שיש auth) דורש קריאת anon — **לרשום תזכורת להסיר/לצמצם את המדיניות הזו בשלב 5.** מדיניות anon זמנית ששכחו היא הדליפה הקלאסית. |
| תוקף | `has_map_access` חייבת לבדוק `expires_at > now()` **וגם** `revoked_at is null` **וגם** `maps.status='published'` **וגם** `maps.deleted_at is null`. ארבעתם. |

---

## חלק ג׳ — ארכיטקטורת קוד

### C1. "אין `supabase.from()` בקומפוננטות" — לפרט לתיקייה

הכלל נכון אבל לא ניתן לאכיפה כמו שהוא. הצעה קונקרטית:

```
src/
  lib/
    supabase/
      client.ts        — browser client (anon key)
      server.ts        — server client מ-cookies (anon key + RLS של המשתמש)
      admin.ts         — service role. שורה ראשונה: import 'server-only'
    data/              — ה-*רק* מקום עם supabase.from()
      maps.repo.ts
      locations.repo.ts
      access.repo.ts
    services/          — לוגיקה עסקית, קוראת ל-data/
      grantAccess.ts
      resolveCreator.ts
      featureConfig.ts
      reconcilePayment.ts
    domain/            — טיפוסים + סכמות zod. אפס תלות בסופאבייס
  app/                 — קומפוננטות + route handlers. אפס import מ-lib/supabase
```

אכיפה אמיתית (לא משמעת) — ESLint:
```json
"no-restricted-imports": ["error", { "patterns": [
  { "group": ["**/lib/supabase/*"], "message": "גישה לנתונים רק דרך lib/data/*" }
]}]
```
עם `overrides` שמתיר את זה רק ב-`src/lib/data/**`. חמש דקות עבודה, מונע את
הריקבון שהכלל נועד למנוע.

### C2. `import 'server-only'` — לא אופציונלי

`SUPABASE_SERVICE_ROLE_KEY` ב-App Router: מספיק import אחד בטעות מקובץ
`'use client'` והמפתח נכנס ל-bundle של הדפדפן. `server-only` הופך את זה
לשגיאת build במקום לאירוע אבטחה. גם על `R2_SECRET_ACCESS_KEY`, `RESEND_API_KEY`,
ומפתחות הסליקה.

### C3. משמעת ה-service role

זו הפרצה שהכי קל ליפול אליה בפרויקט שכולו RLS: הרגע שבו משהו לא עובד,
מחליפים ל-`admin.ts` "רק כדי לבדוק", וזה נשאר.

**כללים:**
- `admin.ts` מייצא **פונקציות ממוקדות בלבד** (`adminGrantAccess`, `adminPurgeTenant`),
  אף פעם לא את ה-client עצמו.
- כל פונקציה כזו כותבת שורה ל-`audit_log`. ללא יוצא מן הכלל.
- ESLint אוסר import של `admin.ts` מחוץ ל-`lib/services/admin/**`.
- ב-Vercel: משתנה הסביבה מוגדר ל-**Production בלבד**, לא ל-Preview.
  Preview deployments רצים על קוד מ-branch שעדיין לא נבדק.

### C4. מזהים שנוצרים בקליינט — שתי השלכות שלא נדונו

כלל 8 (id בלי default ב-`locations`/`trips`/`trip_stops`) נכון לסנכרון אופליין,
אבל גורר:

1. **ולידציה.** הקליינט שולח `id`. חייב `check (id is not null)` + ולידציית פורמט
   ב-zod. עדיף **UUIDv7** ולא v4 — v7 ממוין לפי זמן, ולכן אינדקס ה-B-tree
   לא מתפצל אקראית. ההבדל משמעותי בטבלת `locations` אחרי ייבוא של אלפי נקודות.
2. **התנגשות = oracle.** אם קליינט מנחש `id` קיים של יוצר אחר, הוא יקבל
   `23505 duplicate key` במקום "אין הרשאה" — כלומר אישור שהמזהה קיים.
   בפרקטיקה לא ניתן לניצול עם UUID, אבל **צריך למפות כל 23505 להודעה גנרית**
   בשכבת השגיאות ממילא.
3. **Idempotency בחינם.** כיוון שהקליינט קובע `id`, כל כתיבה יכולה להיות
   `upsert` — שליחה חוזרת אחרי ניתוק רשת לא תיצור כפילות. לנצל את זה במפורש.

### C5. שכבת השגיאות

צריך מודול אחד (`lib/errors.ts`) שממפה שגיאות Postgres/PostgREST להודעות משתמש,
ובכללי:
- `23505` (unique) → הודעה גנרית לפי הקשר, בלי לחשוף את שם ה-constraint
- `42501` / RLS denial → תמיד "לא נמצא", אף פעם לא "אין הרשאה"
- כל שגיאה שלא מוכרת → `500` גנרי + לוג מלא בצד שרת (Sentry), אפס פרטים לקליינט

### C6. Next.js 14 — הערה מעשית

התוכנית קובעת Next.js 14 אבל גם `npx create-next-app@latest`. השניים כבר לא
מסתדרים — `@latest` לא ייתן 14. זו לא הצעה לשנות סטאק, רק להחליט במודע:
לנעול `create-next-app@14` או לעדכן את המסמך. עדיף לעדכן את המסמך —
אין סיבה להתחיל פרויקט חדש על גרסה ישנה.

### C7. שני פרויקטי Supabase, לא אחד

התוכנית מזכירה פרויקט אחד. צריך שניים: `malanta-dev` (free) ו-`malanta-prod` (Pro).
הסיבה אינה נוחות — היא שבשלב כלשהו תריץ מיגרציה או סקריפט ייבוא מול
הפרויקט הלא נכון, וב-prod יושב תוכן של לקוח משלם. עלות: 0.

---

## חלק ד׳ — אבטחת מידע ותאימות

### D1. סיכון האריחים — הסיכון הכספי היחיד, ויש לו פתרון

המסמך מזהה נכון ש"אריחי מפה הם הסיכון שגדל עם הלקוחות של הלקוחות".
מה שחסר הוא שזה לא רק סיכון עומס — זה סיכון **גניבה**: המפתח ב-`NEXT_PUBLIC_*`
גלוי לכל מי שפותח DevTools. אתר אחר יכול להשתמש במפתח שלך.

**בקרות, לפי סדר יישום:**
1. **URL / domain restriction על המפתח** — גם MapTiler וגם Mapbox תומכים.
   חמש דקות, מבטל את רוב הסיכון. **לעשות ברגע יצירת המפתח, לא אחר כך.**
2. תקרת שימוש + התראת מייל אצל ספק האריחים.
3. Spend Management ב-Vercel עם תקרה (המסמך כבר מציין — טוב).
4. בהמשך, כשהעלות תגדל: Protomaps/PMTiles על R2 — עלות אחסון בלבד, אפס egress.
   ה-seam של `NEXT_PUBLIC_MAP_TILES_URL` כבר מוכן לזה. תכנון טוב.

### D2. סליקה — היקף PCI

זה החלק שבו "קופסה סגורה" עלולה להיסגר לא מספיק.

**הכלל:** אם שדה הכרטיס נמצא בעמוד ב**דומיין שלך** — גם אם הוא נשלח ישירות
לספק — אתה בהיקף PCI מורחב (SAQ A-EP), כי הקוד שלך יכול תיאורטית לקרוא
את השדה. אם העמוד הוא של הספק (redirect או iframe מהדומיין שלו) — אתה
ב-SAQ A, כמעט אפס חובות.

**להחליט מפורשות: redirect לעמוד הספק, או iframe מהדומיין של הספק. לא טופס משלך.**
ובכל מקרה — לעולם לא ללוגר payload של סליקה, לא ב-Sentry ולא בקונסולה.

### D3. Webhook / IPN — מה חייב להיבדק

(פירוט מלא ב-`30_PAYMENTS.md`, כאן רק העקרונות)

- **אימות חתימה/hash** לפי מנגנון הספק. בלעדיו כל אחד יכול לשלוח "שילמתי".
- **הסכום והמטבע נבדקים מול ה-intent** בצד שרת. לעולם לא לסמוך על סכום
  שהגיע ב-query string של ה-redirect.
- **Idempotency** לפי `provider_event_id` עם `unique` — ספקים שולחים כפילויות.
- **ה-redirect לא מעניק גישה. רק ה-callback מהשרת מעניק.**
  ה-redirect הוא UI. משתמש שיערוך את ה-URL לא צריך לקבל כלום.

### D4. אימות מייל הוא הבקרה שמחזיקה את כל מודל השיוך

התכנון: "אקבל אישור תשלום עם שם ומייל ואשייך למשתמש".
המסקנה הישירה: **מי ששולט במייל שולט ברכישה.**

לכן, לא כהמלצה אלא כתנאי:
- שיוך אוטומטי מתבצע **רק** מול פרופיל עם מייל מאומת (`email_confirmed_at`).
- נורמליזציה של מייל להשוואה (`lower(btrim())`) — אחרת `Yossi@Gmail.com` לא יימצא.
- **אין endpoint שמגלה קיום תשלום ממתין לפי מייל.** "בדוק אם שילמתי" בלי
  התחברות = כלי לגילוי מי קנה מה.

### D5. פרטיות — חובות ממשיות, לא פורמליות

הפלטפורמה מחזיקה מידע אישי של ישראלים (מיילים, שמות, ובעקיפין —
מסלולי טיול, שזה מידע התנהגותי). **תיקון 13 לחוק הגנת הפרטיות
נכנס לתוקף באוגוסט 2025 והחמיר משמעותית את האכיפה והקנסות.**

מה שצריך, בסדר עולה של דחיפות:
1. **מדיניות פרטיות + תנאי שימוש** — לפני הלקוח הראשון, לא אחריו.
2. **הסכם מול יוצרים** שמבהיר: התוכן שלהם, אתה מארח. מי בעלים של רשימת
   הלקוחות. מה קורה בעזיבה. זה גם כלי מכירה — ראה D6.
3. **מימוש מחיקה** — כלל 15 ב-CLAUDE.md כבר דורש ייצוא+מחיקה ליוצר.
   להוסיף את אותו הדבר **למטייל** (זו זכות חוקית, לא פיצ׳ר).
4. **גיבויים.** המסמך מסמן נכון ש-Glender בלי גיבויים = הסיכון הפתוח.
   ל-Malanta: Supabase Pro מהלקוח המשלם הראשון, **ולעשות שחזור-ניסיון פעם אחת.**
   גיבוי שלא ניסית לשחזר הוא הנחה, לא גיבוי.
5. **תיעוד אירועי אבטחה** — ה-audit log שנחתך (ראה D6).

### D6. ה-audit log שנחתך סותר את הבטחת האמון

CLAUDE.md: *"גישה לתוכן של Creator מותנית בהסכמה מפורשת שלו, פר-מפה,
עם תפוגה, ומתועדת ב-audit log. זה מנגנון הרשאות, לא הצהרת כוונות."*
סעיף 7: *"נחתך במכוון מה-MVP: admin_audit_log"*.

אי אפשר גם וגם. וזו לא בירוקרטיה — זו התשובה לשאלה שכל בלוגר ישאל:
*"רגע, אתה יכול לראות את כל ההמלצות שלי?"*. התשובה "לא, רק אם תאשר לי,
לזמן מוגבל, ואתה רואה את היומן" היא **נקודת מכירה**, ומול Google My Maps
היא גם דיפרנציאטור.

**עלות: שתי טבלאות קטנות (`admin_map_grants`, `audit_log`) ומדיניות אחת.**
לא לחתוך. מפורט ב-`10_SCHEMA.sql`.

### D7. בקרות בסיס שלא הוזכרו

| בקרה | הערה |
|---|---|
| Security headers | CSP, HSTS, `X-Frame-Options`. שים לב: MapLibre צריך `worker-src blob:` ו-`img-src` לדומיין האריחים ול-R2. |
| Rate limiting | על התחברות, על שליחת magic link, ועל ה-endpoint של הסליקה. Upstash/Vercel KV. |
| Enumeration בהרשמה | "המייל כבר רשום" מגלה מי משתמש. הודעה אחידה + מייל ליבה. |
| Sentry / לוגים | אין שום observability בתכנון. לפחות Sentry + Supabase log drain. חינם בהתחלה. |
| CI | GitHub Actions: typecheck + lint + **בדיקות RLS** לפני merge. ראה E1. |
| סודות בריפו | `gitleaks` כ-pre-commit. `.env.local` ב-`.gitignore` מהקומיט הראשון. |
| Storage abuse | מגבלת גודל ומספר תמונות לנקודה, ובדיקת content-type אמיתית (magic bytes), לא לפי סיומת. |

---

## חלק ה׳ — שינויים בתוכנית העבודה

### E1. שבוע 1 מסתיים בחבילת בדיקות RLS, לא בסכמה

**זו ההמלצה היחידה שאני חושב שהיא לא-לוויתור.**

הקבלה בשלב 5 היא *"יוצר שני לא רואה שום דבר של הראשון. תוכיח לי את זה."*
זו בדיקה ידנית. בשבוע 9, אחרי מיגרציה 14, אף אחד לא יריץ אותה שוב.

**הפתרון:** בסוף שבוע 1, קובץ בדיקות שיוצר שני tenants, שלושה משתמשים
(יוצר א׳, יוצר ב׳, מטייל), ומריץ ~40 טענות: מה כל אחד רואה, מה כל אחד
לא רואה, מה קורה כשהתוקף פג. רץ ב-CI על כל PR.

עלות: יום עבודה. תשואה: אתה יכול לשנות RLS בלי פחד למשך שנתיים.
בלי זה, כל שינוי מדיניות הופך להימור. יש כאן גם היבט מכירתי —
"יש לי חבילת בדיקות אוטומטית שמוכיחה בידוד בין לקוחות" זה משפט שאפשר
להגיד לבלוגר, בלי ש-Google My Maps יכולה להגיד אותו.

### E2. שבוע 0 — החלטות שחייבות להיסגר לפני קוד

מעבר לסעיף 10 במסמך המקורי:
1. R2: object key או URL? jsonb או text[]? bucket ציבורי או פרטי? (A5, B5)
2. ספק סליקה — לא צריך להשתלב, אבל **צריך לדעת אם הוא מחזיר פרמטר מותאם
   ב-callback**. כל התכנון ב-`30_PAYMENTS.md` תלוי בזה. שאלה אחת למייל תמיכה.
3. MapTiler או Mapbox — ההכרעה פחות חשובה מ**להגדיר domain restriction** ברגע היצירה.
4. Next 14 או 15 (C6).

### E3. תיקון קטן בסדר: הענקת גישה לפני מסלולים

שלב 7 (`grantAccess`) לפני שלב 8 (מסלולים) — כבר נכון בתוכנית.
רק לוודא ש-`grantAccess` נבנית **מעל** מודל ה-`entitlements` מ-`30_PAYMENTS.md`
ולא כ-insert ישיר ל-`map_access`, אחרת החיבור לסליקה יהיה כתיבה מחדש.
כלל 5 ב-CLAUDE.md כבר אומר את זה — רק לוודא שהחתימה כוללת `source_ref`.

### E4. הערכת הזמן

6 שבועות בקצב סטודנט לכל מה שברשימה — אופטימי, אבל לא בצורה שמזיקה,
כי הסדר נכון: **נכס הדמו (שלב 4) מגיע בשבוע 2–3**, לפני auth ולפני פאנל.
זו החלטה מצוינת ולא לשנות אותה. אם משהו יחרוג, יחרגו שלבים 6–8, ואז
כבר יהיה מה להראות. הייתי מוסיף רק: **שבוע 1 יתארך** בגלל RLS + בדיקות.
זה שבוע ששווה להאריך.

---

## חלק ו׳ — מה בתכנון נכון ולא לגעת

לא רק ביקורת. הדברים הבאים הם החלטות טובות שקל יהיה לפרק אותן בלחץ:

- **שני צירי השיוך** (תוכן ← tenant, פעילות ← map). זה הלב, וזה נכון.
  ההערות שלי בחלק א׳ הן על **אכיפה** של העיקרון, לא על העיקרון.
- **MapLibre ולא Google Maps.** החלטה חוסמת, זוהתה נכון כחוסמת.
- **`NEXT_PUBLIC_MAP_TILES_URL` כ-seam.** תכנון נכון לעתיד בעלות אפס היום.
- **הפרדת רכישה → הענקה → צריכה לשלושה שלבים.** הנימוק (עמלת אפל) נכון,
  אבל ההחלטה נכונה גם בלי הנימוק — היא מה שמאפשר את כל מודל ההצלבה בסליקה.
- **`trip_stops` מחזיקה FK ולא העתק.** נכון, ומה שהופך "פקיעת גישה" לניתנת לחידוש.
- **ייבוא ידני ב-MVP.** החלטת מכירה נכונה, וגם החלטה הנדסית נכונה —
  ממשק ייבוא הוא הרבה יותר עבודה ממה שהוא נראה.
- **5 יוצרים מייסדים, אחד בכל פעם.** נכון בדיוק מהסיבה שנכתבה.
- **Vercel Hobby אסור מסחרית** — זוהה נכון, זו טעות שאנשים עושים.

---

## מסמכים נלווים

| קובץ | תוכן |
|---|---|
| `10_SCHEMA.sql` | סכמה מתוקנת מלאה, 14 טבלאות (9 מקוריות + הרשאות + סליקה) |
| `20_RLS.sql` | פונקציות עזר + מדיניות לכל טבלה + אינדקסים תומכים |
| `30_PAYMENTS.md` | תכנון הסליקה כקופסה סגורה — intent, callback, שיוך, זיכויים |
| `40_SECURITY_CHECKLIST.md` | רשימת תיוג מעשית לפי שלבי הבנייה |
| `50_CLAUDE.md` | גרסה מתוקנת של פרומפט B, מוכנה להדבקה כ-CLAUDE.md בריפו החדש |

---

## נספח — מה נבדק בפועל

`10_SCHEMA.sql` ו-`20_RLS.sql` **הורצו מול PostgreSQL 16 אמיתי**, לא נכתבו על הנייר.
שני הקבצים נטענים נקי (`ON_ERROR_STOP=1`, אפס שגיאות).

**מה שנבדק ועובד** — 21 טענות, כולל:

| # | טענה | תוצאה |
|---|---|---|
| A1 | `location` עם `tenant_id` של א׳ ו-`map_id` של ב׳ | ❌ נדחה ב-FK |
| A1 | `location` של ב׳ שמשתמש ב-`layer` של א׳ | ❌ נדחה ב-FK |
| A2 | `trip_stop` שמצרף נקודה ממפה אחרת | ❌ נדחה ב-FK |
| A2 | `trip_stop` שמשקר לגבי `map_id` | ❌ נדחה ב-FK |
| A2 | `favorite` שמערבב מפות | ❌ נדחה ב-FK |
| A4 | מחיקה רכה של מפה ואז שימוש חוזר ב-slug | ✅ עובד |
| A4 | שתי מפות חיות עם אותו slug (כולל שינוי אותיות) | ❌ נדחה |
| B2 | העברת `location` ל-tenant אחר ב-UPDATE | ❌ נחסם בטריגר |
| — | slug שמור (`admin`) | ❌ נדחה |
| — | הסרת ה-owner האחרון | ❌ נדחה |
| — | `DELETE FROM tenants` בלי דגל purge | ❌ נדחה |
| — | `audit_log` — update/delete | no-op שקט, השורה שרדה |
| — | `payments` עם משתמש משויך בלי `match_method` | ❌ נדחה |
| — | `purchase_intent` מסוג `map_access` בלי `map_id` | ❌ נדחה |
| — | שתי זכאויות פעילות לאותו (מפה, משתמש) | ❌ נדחה |
| כלל 7 | מיקום שנמחק רכות — העצירה במסלול שרדה | ✅ שרדה |
| — | `updated_at` בטריגר, כולל ניסיון לדחוף אותו אחורה | ✅ הטריגר גובר |

**מה שנמצא ותוקן תוך כדי:**
מגבלת 30 הימים על `admin_map_grants` חושבה מ-`created_at` — והקליינט יכול לשלוח
`created_at` עתידי ולקבל חלון גישה של שנה. הבייפאס אומת בפועל, ותוקן בטריגר
`app.force_created_at()`. אחרי התיקון: זיוף נדחה, הענקה לגיטימית של 14 יום עוברת.

**מה שלא נבדק ודורש אימות בפרויקט Supabase אמיתי:**
- העמודה המחושבת `geom geography(Point,4326)` — PostGIS לא היה זמין בסביבת הבדיקה.
  אם `generated always as` נדחה בגרסת PostGIS שלך (דורש immutable), להחליף בטריגר —
  **אבל לא להשאיר עמודה שהאפליקציה ממלאת ידנית**, היא תתיישן מול lat/lng.
- `gist` על `geom` ו-`gin_trgm_ops` על `name` — הורדו לבדיקה, תלויי extension.
- **התנהגות ה-policies בפועל** — נבדק שהן נטענות ושהחלוקה נכונה
  (12 טבלאות עם policies, 4 נעולות לחלוטין: `platform_admins`, `payment_events`,
  `purchase_intents`, `payments`). מה שכל תפקיד **רואה** דורש `auth.uid()` אמיתי,
  כלומר בדיקה מול Supabase. זו בדיוק חבילת הבדיקות מ-E1, והשלד שלה
  נמצא ב-`20_RLS.sql` חלק 14.
