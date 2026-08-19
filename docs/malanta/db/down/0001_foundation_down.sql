-- ⚠️ להריץ אחרון. הפונקציות כאן משמשות טריגרים בכל הטבלאות,
--    ולכן ה-down הזה תקף רק כשכל שאר ה-down כבר רצו.
drop function if exists app.audit(text,text,text,uuid,uuid,text,uuid,text,jsonb);
drop table    if exists audit_log cascade;
drop schema   if exists app cascade;   -- מוריד את כל פונקציות התשתית איתו
-- התוספים (postgis/pgcrypto/pg_trgm) נשארים: הסרתם משפיעה על הפרויקט כולו
