# Malanta — שכבת הנתונים

## סדר הרצה
```
migrations/0001_foundation.sql        תשתית: סכמות, פונקציות, audit_log
migrations/0002_authz_catalog.sql     קטלוג תפקידים והרשאות (מבנה)
migrations/0003_identity_tenancy.sql  יוצרים, משתמשים, חברות, הזמנות
migrations/0004_content.sql           מפות, שכבות, נקודות, מדיה, גרסאות
migrations/0005_entitlements.sql      זכאות + הסכמת יוצר לגישת אדמין
migrations/0006_traveler_activity.sql מסלולים ומועדפים
migrations/0007_commerce.sql          קטלוג, הזמנות, תשלומים, חשבוניות, מנויים
migrations/0008_privacy.sql           הסכמות, בקשות נושא מידע, שמירה
migrations/0009_ip_protection.sql     בעלות, גילוי דליפה, הסרה
migrations/0010_rls.sql               פונקציות הרשאה + policies + grants
seed/0001_roles_permissions.sql       ⚠️ אחרון. תוכן הקטלוג + מדיניות שמירה
```
ה-down תואם ב-`down/`, בסדר הפוך.

## הרצה
```bash
for f in migrations/0*.sql seed/0*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" || exit 1
done
```

## בדיקות
```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/rls_matrix.sql
```
49 טענות. יוצרת נתוני בדיקה משלה — **להריץ על בסיס נתונים נקי בלבד.**
כישלון מחזיר exit code שונה מאפס, כלומר שובר את ה-CI.

## שלושה דברים שחייבים להישאר נכונים
1. **`seed/` רץ אחרי `0010`.** `role_permissions` ריקה = אף אחד לא יכול כלום.
2. **טבלה חדשה לא נגישה עד שמוסיפים לה גם policy וגם `grant`.** זו ברירת המחדל
   ומכוונת — `0010` מבטל את ההרשאות הרחבות שסופאבייס נותנת אוטומטית.
3. **פונקציה שמופיעה ב-CHECK constraint צריכה `grant execute` ל-`authenticated`.**
   היא רצה בהרשאות הכותב. חסר grant = כל כתיבה לטבלה נכשלת.

## מה נבדק ומה לא
נבדק מול PostgreSQL 16 אמיתי: כל המיגרציות, ה-seed, ו-49 טענות ההרשאות.
**לא** נבדק (דורש PostGIS, כלומר פרויקט Supabase): העמודה המחושבת `geom`,
אינדקס GIST, `gin_trgm_ops`, ו-`extensions.digest` לטביעת האצבע.
