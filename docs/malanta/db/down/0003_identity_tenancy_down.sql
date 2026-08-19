-- ⚠️ סדר: טבלאות לפני פונקציות. טריגר תלוי בפונקציה שלו, ולכן
--    drop function לפני drop table נכשל. (התגלה בהרצת ה-down בפועל.)
drop trigger  if exists on_auth_user_upsert on auth.users;
drop table    if exists membership_invites, membership_map_scopes, memberships,
                        platform_admins, profiles, tenants cascade;
drop function if exists app.sync_profile_from_auth();
drop function if exists app.guard_last_owner();
