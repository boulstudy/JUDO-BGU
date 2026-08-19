-- seed/0001 — קטלוג התפקידים וההרשאות
-- ============================================================================
-- זהו הקובץ שקובע מי יכול מה. שינוי כאן הוא שינוי אבטחה — עובר ב-code review.
-- ============================================================================

insert into roles (key, scope, label_he, rank, is_assignable) values
  ('owner',           'tenant',   'בעלים',              100, true),
  ('manager',         'tenant',   'מנהל',                80, true),
  ('editor',          'tenant',   'עורך תוכן',           60, true),
  ('contributor',     'tenant',   'תורם (טיוטות בלבד)',  40, true),
  ('analyst',         'tenant',   'צפייה בלבד',          20, true),
  ('billing',         'tenant',   'הנהלת חשבונות',       30, true),
  ('platform_admin',  'platform', 'אדמין פלטפורמה',     900, true),
  ('platform_support','platform', 'תמיכה',              800, true)
on conflict (key) do nothing;

insert into permissions (key, category, label_he, sensitivity) values
  -- תוכן
  ('map.read',            'content','צפייה במפות',              'creator_content'),
  ('map.create',          'content','יצירת מפה',                'creator_content'),
  ('map.update',          'content','עריכת מפה',                'creator_content'),
  ('map.publish',         'content','פרסום מפה',                'creator_content'),
  ('map.delete',          'content','מחיקת מפה',                'creator_content'),
  ('layer.read',          'content','צפייה בשכבות',             'creator_content'),
  ('layer.update',        'content','עריכת שכבות',              'creator_content'),
  ('location.read',       'content','צפייה בנקודות',            'creator_content'),
  ('location.update',     'content','עריכת נקודות',             'creator_content'),
  ('location.import',     'content','ייבוא נקודות',             'creator_content'),
  ('content.history',     'content','צפייה בהיסטוריית שינויים', 'creator_content'),
  ('content.restore',     'content','שחזור גרסה',               'creator_content'),
  -- לקוחות וגישה
  ('access.read',         'access', 'צפייה בזכאויות',           'personal_data'),
  ('access.grant',        'access', 'הענקת גישה',               'personal_data'),
  ('access.revoke',       'access', 'ביטול גישה',               'personal_data'),
  ('customer.read',       'access', 'צפייה בפרטי לקוחות',       'personal_data'),
  -- צוות והגדרות
  ('member.invite',       'admin',  'הזמנת חברי צוות',          'normal'),
  ('member.manage',       'admin',  'ניהול חברי צוות',          'normal'),
  ('tenant.settings',     'admin',  'הגדרות ומיתוג',            'normal'),
  ('admin_access.manage', 'admin',  'הסכמה לגישת אדמין',        'creator_content'),
  ('audit.read',          'admin',  'צפייה ביומן',              'normal'),
  -- כסף
  ('billing.read',        'billing','צפייה בחיובים',            'financial'),
  ('billing.manage',      'billing','ניהול מנוי ואמצעי תשלום',  'financial'),
  ('product.manage',      'billing','ניהול מוצרים ומחירים',     'financial'),
  ('coupon.manage',       'billing','ניהול קופונים',            'financial'),
  -- יציאה
  ('export.data',         'data',   'ייצוא נתונים',             'creator_content'),
  ('tenant.purge',        'data',   'מחיקת כל הנתונים',         'creator_content')
on conflict (key) do nothing;

-- owner — הכל
insert into role_permissions (role_key, permission_key)
select 'owner', key from permissions on conflict do nothing;

-- manager — הכל חוץ מכסף, מחיקת חשבון והסכמה לגישת אדמין
insert into role_permissions (role_key, permission_key)
select 'manager', key from permissions
where key not in ('tenant.purge','billing.manage','product.manage','coupon.manage','admin_access.manage')
on conflict do nothing;

-- editor — תוכן ולקוחות, בלי צוות, בלי כסף, בלי ייצוא המוני
insert into role_permissions (role_key, permission_key) values
  ('editor','map.read'),('editor','map.create'),('editor','map.update'),('editor','map.publish'),
  ('editor','layer.read'),('editor','layer.update'),
  ('editor','location.read'),('editor','location.update'),('editor','location.import'),
  ('editor','content.history'),('editor','content.restore'),
  ('editor','access.read'),('editor','access.grant')
on conflict do nothing;

-- contributor — עריכת תוכן בלבד. לא רואה לקוחות, לא מפרסם.
-- ⚠️ ההפרדה הזו היא מה שמאפשר ליוצר לשכור פרילנסר בלי לחשוף את רשימת הלקוחות.
insert into role_permissions (role_key, permission_key) values
  ('contributor','map.read'),('contributor','layer.read'),
  ('contributor','location.read'),('contributor','location.update'),
  ('contributor','content.history')
on conflict do nothing;

-- analyst — צפייה בלבד
insert into role_permissions (role_key, permission_key) values
  ('analyst','map.read'),('analyst','layer.read'),('analyst','location.read'),
  ('analyst','access.read'),('analyst','audit.read')
on conflict do nothing;

-- billing — כסף בלבד. לא רואה תוכן, לא רואה לקוחות.
insert into role_permissions (role_key, permission_key) values
  ('billing','billing.read'),('billing','billing.manage'),
  ('billing','product.manage'),('billing','coupon.manage')
on conflict do nothing;

-- ⚠️ תפקידי הפלטפורמה מכוון ללא role_permissions ברמת tenant.
--    אדמין פלטפורמה לא מקבל גישה לתוכן דרך התפקיד — רק דרך
--    admin_map_grants, כלומר בהסכמה מפורשת של היוצר, עם תפוגה.

-- מדיניות שמירה
insert into retention_policies (key, target, retain_days, basis, note) values
  ('audit_log',            'audit_log',             2555, 'legal',      '7 שנים — תיעוד גישה למידע אישי'),
  ('content_access_events','content_access_events',   90, 'operational','גילוי חילוץ המוני'),
  ('payment_events',       'payment_events',        2555, 'accounting', '7 שנים — חובת שמירה'),
  ('content_revisions',    'content_revisions',      730, 'product',    'שנתיים היסטוריית עריכה'),
  ('export_artifacts',     'export_jobs.object_key',   7, 'privacy',    'קובץ ייצוא נמחק אחרי שבוע'),
  ('dsr_artifacts',        'data_subject_requests',   30, 'privacy',    'קובץ מענה ל-DSR')
on conflict (key) do nothing;
