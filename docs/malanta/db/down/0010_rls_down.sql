-- down 0010 — הסרת מדיניות, הרשאות ופונקציות אכיפה
-- ⚠️ הרצה של זה משאירה את הטבלאות פתוחות לכל מי שיש לו grant.
--    לא להריץ בייצור בלי להוריד גם את שכבות ה-grant.
do $$ declare p record; begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname='public' loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;
revoke all on all tables in schema public from authenticated, anon;
drop function if exists app.list_map_customers(uuid,int,int);
drop function if exists app.admin_has_map_consent(uuid,boolean);
drop function if exists app.has_layer_access(uuid,uuid);
drop function if exists app.has_map_access(uuid);
drop function if exists app.is_tenant_member(uuid);
drop function if exists app.has_map_permission(uuid,text);
drop function if exists app.has_permission(uuid,text);
drop function if exists app.is_platform_admin();
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I disable row level security', t.tablename);
  end loop;
end $$;
