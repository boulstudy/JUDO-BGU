-- 0010_rls — פונקציות הרשאה ומדיניות לכל טבלה
-- ============================================================================
-- מדיניות מפנה ל**הרשאה** ולא ל**תפקיד**. תפקיד חדש = שורות ב-role_permissions,
-- לא שכתוב של 40 policies.
-- כל פונקציה: stable + security definer + search_path מקובע.
-- ============================================================================

-- ── פונקציות הרשאה ──────────────────────────────────────────────────────────
create or replace function app.is_platform_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from platform_admins pa
                 where pa.user_id = auth.uid() and pa.revoked_at is null)
$$;

-- הרשאה ברמת היוצר
create or replace function app.has_permission(p_tenant uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from memberships m
    join role_permissions rp on rp.role_key = m.role
    where m.tenant_id = p_tenant and m.user_id = auth.uid()
      and m.status = 'active' and m.revoked_at is null
      and rp.permission_key = p_perm)
$$;

-- הרשאה ברמת מפה — כולל היקף מפות מוגבל לעובד
create or replace function app.has_map_permission(p_map uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from maps mp
    join memberships m  on m.tenant_id = mp.tenant_id and m.user_id = auth.uid()
                       and m.status = 'active' and m.revoked_at is null
    join role_permissions rp on rp.role_key = m.role and rp.permission_key = p_perm
    where mp.id = p_map and mp.deleted_at is null
      and (m.map_scope_all
           or exists (select 1 from membership_map_scopes s
                      where s.tenant_id = m.tenant_id and s.user_id = m.user_id
                        and s.map_id = mp.id)))
$$;

-- חברות כלשהי (לקריאה בסיסית)
create or replace function app.is_tenant_member(p_tenant uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from memberships m
                 where m.tenant_id = p_tenant and m.user_id = auth.uid()
                   and m.status = 'active' and m.revoked_at is null)
$$;

-- זכאות מטייל. ארבעת התנאים כולם נדרשים.
create or replace function app.has_map_access(p_map uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from map_access a join maps mp on mp.id = a.map_id
    where a.map_id = p_map and a.user_id = auth.uid()
      and a.revoked_at is null
      and a.starts_at <= now()
      and (a.expires_at is null or a.expires_at > now())
      and mp.deleted_at is null and mp.status = 'published')
$$;

-- זכאות לשכבה מסוימת (כשההיקף חלקי)
create or replace function app.has_layer_access(p_map uuid, p_layer uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from map_access a join maps mp on mp.id = a.map_id
    where a.map_id = p_map and a.user_id = auth.uid()
      and a.revoked_at is null and a.starts_at <= now()
      and (a.expires_at is null or a.expires_at > now())
      and mp.deleted_at is null and mp.status = 'published'
      and (a.scope_all_layers or p_layer is null
           or exists (select 1 from map_access_layers l
                      where l.map_access_id = a.id and l.layer_id = p_layer)))
$$;

-- גישת אדמין — רק בהסכמת היוצר, בתוקף, ולפי מה שהותר
create or replace function app.admin_has_map_consent(p_map uuid, p_need_edit boolean default false)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from admin_map_grants g
    join platform_admins pa on pa.user_id = g.admin_id and pa.revoked_at is null
    where g.map_id = p_map and g.admin_id = auth.uid()
      and g.revoked_at is null and g.expires_at > now()
      and (not p_need_edit or g.can_edit))
$$;

revoke execute on all functions in schema app from public, anon;
grant execute on function
  app.is_platform_admin(), app.has_permission(uuid,text), app.has_map_permission(uuid,text),
  app.is_tenant_member(uuid), app.has_map_access(uuid), app.has_layer_access(uuid,uuid),
  app.admin_has_map_consent(uuid,boolean)
to authenticated;

-- ⚠️ פונקציות שמופיעות בתוך CHECK constraint רצות בהרשאות **המשתמש הכותב**,
--    לא בהרשאות הבעלים. בלי ה-grant הזה כל INSERT/UPDATE על maps או tenants
--    נכשל ב-'permission denied for function'. התגלה בחבילת הבדיקות.
grant execute on function app.is_reserved_slug(text), app.norm_email(text) to authenticated;

-- app.audit, app.anonymize_profile, app.next_invoice_number, app.list_map_customers
-- מנוהלות בנפרד: הראשונות שלוש — service role בלבד.


-- ── הפעלה על כל הטבלאות ────────────────────────────────────────────────────
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('alter table public.%I force  row level security', t.tablename);
  end loop;
end $$;
-- ⚠️ ברירת המחדל היא עכשיו "נעול". טבלה בלי policy = לא נגישה לאף תפקיד
--    חוץ מ-service_role. כל מה שלא מופיע למטה — נעול במכוון.


-- ── קטלוג ההרשאות: קריאה בלבד למחוברים ─────────────────────────────────────
create policy roles_read       on roles            for select to authenticated using (true);
create policy permissions_read on permissions      for select to authenticated using (true);
create policy role_perms_read  on role_permissions for select to authenticated using (true);


-- ── tenants ─────────────────────────────────────────────────────────────────
create policy tenants_member_read on tenants for select to authenticated
  using (deleted_at is null and app.is_tenant_member(id));

create policy tenants_traveler_read on tenants for select to authenticated
  using (deleted_at is null and status = 'active'
         and exists (select 1 from maps m where m.tenant_id = tenants.id and app.has_map_access(m.id)));

create policy tenants_update on tenants for update to authenticated
  using      (deleted_at is null and app.has_permission(id, 'tenant.settings'))
  with check (deleted_at is null and app.has_permission(id, 'tenant.settings'));

create policy tenants_admin_read on tenants for select to authenticated
  using (exists (select 1 from maps m where m.tenant_id = tenants.id
                 and app.admin_has_map_consent(m.id)));


-- ── profiles ────────────────────────────────────────────────────────────────
create policy profiles_self_read on profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_self_update on profiles for update to authenticated
  using      (id = (select auth.uid()) and deleted_at is null)
  with check (id = (select auth.uid()) and deleted_at is null);
-- ⚠️ אין policy שמאפשרת ליוצר לקרוא profiles. ראיית לקוחות דרך RPC בלבד.


-- ── memberships ─────────────────────────────────────────────────────────────
create policy memberships_read on memberships for select to authenticated
  using (user_id = (select auth.uid()) or app.is_tenant_member(tenant_id));
create policy memberships_manage on memberships for all to authenticated
  using      (app.has_permission(tenant_id, 'member.manage'))
  with check (app.has_permission(tenant_id, 'member.manage'));

create policy mms_read on membership_map_scopes for select to authenticated
  using (user_id = (select auth.uid()) or app.is_tenant_member(tenant_id));
create policy mms_manage on membership_map_scopes for all to authenticated
  using      (app.has_permission(tenant_id, 'member.manage'))
  with check (app.has_permission(tenant_id, 'member.manage'));

create policy invites_manage on membership_invites for all to authenticated
  using      (app.has_permission(tenant_id, 'member.invite'))
  with check (app.has_permission(tenant_id, 'member.invite'));


-- ── maps ────────────────────────────────────────────────────────────────────
create policy maps_read on maps for select to authenticated
  using (deleted_at is null and app.has_map_permission(id, 'map.read'));
create policy maps_insert on maps for insert to authenticated
  with check (app.has_permission(tenant_id, 'map.create'));
create policy maps_update on maps for update to authenticated
  using      (deleted_at is null and app.has_map_permission(id, 'map.update'))
  with check (app.has_map_permission(id, 'map.update'));
create policy maps_delete on maps for delete to authenticated
  using (app.has_map_permission(id, 'map.delete'));

create policy maps_traveler_read on maps for select to authenticated
  using (deleted_at is null and status = 'published' and app.has_map_access(id));
create policy maps_admin_read on maps for select to authenticated
  using (app.admin_has_map_consent(id));
create policy maps_admin_update on maps for update to authenticated
  using      (app.admin_has_map_consent(id, true))
  with check (app.admin_has_map_consent(id, true));


-- ── layers ──────────────────────────────────────────────────────────────────
create policy layers_creator_read on layers for select to authenticated
  using (deleted_at is null and app.has_permission(tenant_id, 'layer.read'));
create policy layers_creator_write on layers for all to authenticated
  using      (app.has_permission(tenant_id, 'layer.update'))
  with check (app.has_permission(tenant_id, 'layer.update'));

-- ⚠️ מטייל רואה שכבה רק דרך מפה שיש לו זכאות אליה — לא לפי tenant_id.
--    מדיניות לפי tenant_id הייתה חושפת את מפות העתיד של היוצר.
create policy layers_traveler_read on layers for select to authenticated
  using (deleted_at is null
         and exists (select 1 from locations l
                     where l.layer_id = layers.id and l.deleted_at is null
                       and app.has_map_access(l.map_id)));
create policy layers_admin_read on layers for select to authenticated
  using (exists (select 1 from locations l
                 where l.layer_id = layers.id and app.admin_has_map_consent(l.map_id)));


-- ── locations ───────────────────────────────────────────────────────────────
create policy locations_creator_read on locations for select to authenticated
  using (app.has_map_permission(map_id, 'location.read'));
create policy locations_creator_write on locations for all to authenticated
  using      (app.has_map_permission(map_id, 'location.update'))
  with check (app.has_map_permission(map_id, 'location.update'));

-- ⚠️ נקודות canary לא מוצגות דרך המסלול הרגיל — הן מוזרקות בייצוא בלבד.
create policy locations_traveler_read on locations for select to authenticated
  using (deleted_at is null and not is_canary and app.has_layer_access(map_id, layer_id));
create policy locations_admin_read on locations for select to authenticated
  using (app.admin_has_map_consent(map_id));

create policy media_creator on media_assets for all to authenticated
  using      (app.has_permission(tenant_id, 'location.update'))
  with check (app.has_permission(tenant_id, 'location.update'));

create policy revisions_read on content_revisions for select to authenticated
  using (app.has_permission(tenant_id, 'content.history'));


-- ── זכאות ───────────────────────────────────────────────────────────────────
-- ⚠️ אין policy לכתיבה. grantAccess/revokeAccess ב-service role בלבד.
create policy map_access_self on map_access for select to authenticated
  using (user_id = (select auth.uid()));
create policy map_access_creator on map_access for select to authenticated
  using (app.has_map_permission(map_id, 'access.read'));
create policy mal_read on map_access_layers for select to authenticated
  using (exists (select 1 from map_access a where a.id = map_access_id
                 and (a.user_id = (select auth.uid()) or app.has_map_permission(a.map_id,'access.read'))));

-- ההסכמה שייכת ליוצר: הוא מעניק, רואה ומבטל.
create policy admin_grants_creator on admin_map_grants for all to authenticated
  using      (app.has_map_permission(map_id, 'admin_access.manage'))
  with check (app.has_map_permission(map_id, 'admin_access.manage')
              and granted_by = (select auth.uid()));
create policy admin_grants_admin_read on admin_map_grants for select to authenticated
  using (admin_id = (select auth.uid()));
-- היוצר רואה כל קריאה של אדמין בתוכן שלו. שקיפות דו-כיוונית.
create policy admin_events_creator_read on admin_access_events for select to authenticated
  using (app.has_map_permission(map_id, 'audit.read'));
create policy admin_events_self_read on admin_access_events for select to authenticated
  using (admin_id = (select auth.uid()));


-- ── פעילות מטייל ────────────────────────────────────────────────────────────
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
  using (exists (select 1 from trips t where t.id = trip_stops.trip_id
                 and t.owner_id = (select auth.uid())));
create policy trip_stops_owner_write on trip_stops for all to authenticated
  using (exists (select 1 from trips t where t.id = trip_stops.trip_id
                 and t.owner_id = (select auth.uid())))
  with check (exists (select 1 from trips t where t.id = trip_stops.trip_id
                      and t.owner_id = (select auth.uid()) and app.has_map_access(t.map_id)));

create policy favorites_owner_read on favorites for select to authenticated
  using (owner_id = (select auth.uid()));
create policy favorites_owner_write on favorites for all to authenticated
  using      (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and app.has_map_access(map_id));


-- ── מסחר ────────────────────────────────────────────────────────────────────
-- ⚠️ אין policy לכתיבה על אף טבלת מסחר. כסף נכתב בשרת בלבד.
create policy products_public_read on products for select to authenticated
  using (status = 'active');
create policy prices_public_read on prices for select to authenticated
  using (status = 'active' and valid_from <= now() and (valid_to is null or valid_to > now()));

create policy orders_buyer_read on orders for select to authenticated
  using (buyer_user_id = (select auth.uid()));
create policy orders_creator_read on orders for select to authenticated
  using (app.has_permission(tenant_id, 'billing.read'));
create policy order_items_read on order_items for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id
                 and (o.buyer_user_id = (select auth.uid())
                      or app.has_permission(o.tenant_id, 'billing.read'))));
create policy invoices_buyer_read on invoices for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and o.buyer_user_id = (select auth.uid())));
create policy invoices_issuer_read on invoices for select to authenticated
  using (issuer_tenant_id is not null and app.has_permission(issuer_tenant_id, 'billing.read'));
create policy subscriptions_read on subscriptions for select to authenticated
  using (app.has_permission(tenant_id, 'billing.read'));
-- payments, refunds, payment_events, coupons: אין policy. service role בלבד.


-- ── פרטיות ──────────────────────────────────────────────────────────────────
create policy legal_docs_read on legal_documents for select to authenticated using (true);
create policy consents_self_read on consents for select to authenticated
  using (user_id = (select auth.uid()));
create policy dsr_self_read on data_subject_requests for select to authenticated
  using (user_id = (select auth.uid()));
-- כתיבת הסכמה ו-DSR עוברת בשרת (צריך IP, user-agent, ואימות זהות)


-- ── זכויות יוצרים ───────────────────────────────────────────────────────────
create policy licenses_read on content_licenses for select to authenticated
  using (app.is_tenant_member(tenant_id));
create policy cae_creator_read on content_access_events for select to authenticated
  using (app.has_permission(tenant_id, 'audit.read'));
create policy limits_creator on extraction_limits for all to authenticated
  using      (app.has_map_permission(map_id, 'map.update'))
  with check (app.has_map_permission(map_id, 'map.update'));
create policy alerts_creator on extraction_alerts for all to authenticated
  using      (app.has_permission(tenant_id, 'audit.read'))
  with check (app.has_permission(tenant_id, 'audit.read'));
create policy exports_creator_read on export_jobs for select to authenticated
  using (requested_by = (select auth.uid()) or app.has_permission(tenant_id, 'export.data'));
create policy claims_claimant_read on content_claims for select to authenticated
  using (claimant_tenant_id is not null and app.is_tenant_member(claimant_tenant_id));
-- canary_assignments: אין policy. הידיעה מי קיבל איזה canary היא הסוד עצמו.

create policy audit_tenant_read on audit_log for select to authenticated
  using (tenant_id is not null and app.has_permission(tenant_id, 'audit.read'));


-- ── ראיית לקוחות ע"י יוצר ───────────────────────────────────────────────────
-- RPC ולא view: האסרציה מפורשת, קשה לשכוח, וקל לכתוב לה בדיקה.
create or replace function app.list_map_customers(p_map uuid, p_limit int default 100, p_offset int default 0)
returns table (user_id uuid, full_name text, email text,
               granted_at timestamptz, expires_at timestamptz, source text, order_number text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not app.has_map_permission(p_map, 'customer.read') then
    -- ⚠️ not_found ולא forbidden: ההבחנה ביניהם מאשרת קיום מזהה
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return query
    select p.id, p.full_name, p.email, a.created_at, a.expires_at, a.source, o.order_number
    from map_access a
    join profiles p on p.id = a.user_id
    left join orders o on o.id = a.order_id
    where a.map_id = p_map and a.revoked_at is null and p.deleted_at is null
    order by a.created_at desc
    limit least(coalesce(p_limit,100), 500) offset greatest(coalesce(p_offset,0),0);
end $$;
revoke execute on function app.list_map_customers(uuid,int,int) from public, anon;
grant  execute on function app.list_map_customers(uuid,int,int) to authenticated;

-- מה שהפונקציה הזו במכוון לא מחזירה, ואסור שיהיה לה אח שכן מחזיר:
--   • מתי המשתמש נרשם לפלטפורמה   • כמה מפות קנה בסך הכל, או ממי
--   • האם המייל קיים כשאין לו גישה  • מיון לפי פעילות כללית
-- כל אחד מהם מאפשר ליוצר להסיק על קיומם של יוצרים אחרים.

alter default privileges in schema public revoke all on tables from anon, authenticated;
revoke all on schema app from anon, authenticated;
grant usage on schema app to authenticated;


-- ============================================================================
-- הרשאות GRANT מפורשות — השכבה שמתחת ל-RLS
-- ============================================================================
-- Supabase מעניק כברירת מחדל הרשאות רחבות ל-anon/authenticated ונשען אך ורק
-- על RLS. כאן מבטלים את זה ומעניקים במפורש. התוצאה: policy שנשכחה
-- לא מייצרת דליפה, ו**טבלה שלא מופיעה ברשימה הזו לא נגישה כלל.**
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on
  roles, permissions, role_permissions, legal_documents,
  products, product_map_items, prices,
  content_revisions, map_access, map_access_layers, admin_access_events,
  orders, order_items, invoices, subscriptions,
  consents, data_subject_requests, content_licenses, content_access_events,
  export_jobs, content_claims, audit_log
to authenticated;

grant select, update on tenants  to authenticated;
grant select          on profiles to authenticated;   -- UPDATE מוענק ברמת עמודה ב-0003

grant select, insert, update, delete on
  memberships, membership_map_scopes, membership_invites,
  maps, layers, locations, media_assets,
  admin_map_grants, trips, trip_stops, favorites,
  extraction_limits, extraction_alerts
to authenticated;

-- ⚠️ ללא grant בכלל, במכוון — service role בלבד:
--   platform_admins, payments, refunds, payment_events, coupons, coupon_products,
--   coupon_redemptions, invoice_sequences, subscription_periods,
--   canary_assignments, retention_policies
-- הידיעה מי קיבל איזה canary היא הסוד עצמו; טבלאות הכסף נכתבות רק בשרת.

-- anon לא מקבל דבר. אם יידרש דמו ציבורי — grant ממוקד + policy ייעודית,
-- ומשימה מפורשת להסרה. מדיניות anon זמנית ששכחו היא הדליפה הקלאסית.
