-- 0002_authz_catalog — הרשאות כנתונים, לא כקוד
-- ============================================================================
-- החלטה: מדיניות RLS מפנה ל**הרשאה** ולא ל**תפקיד**.
-- הוספת תפקיד חדש בעתיד = שתי שורות בטבלה, לא כתיבה מחדש של 40 policies.
-- ============================================================================

create table roles (
  key         text primary key check (key ~ '^[a-z_]{3,32}$'),
  scope       text not null check (scope in ('tenant','platform')),
  label_he    text not null,
  rank        int  not null,          -- גבוה יותר = חזק יותר. להשוואות בלבד
  is_assignable boolean not null default true,
  created_at  timestamptz not null default now()
);

create table permissions (
  key        text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  category   text not null,
  label_he   text not null,
  -- הרשאה שנוגעת במידע אישי של מטיילים או בתוכן של יוצר.
  -- משמשת את בדיקת "מה אדמין פלטפורמה יכול לעשות בלי הסכמה".
  sensitivity text not null default 'normal'
                check (sensitivity in ('normal','personal_data','creator_content','financial')),
  created_at timestamptz not null default now()
);

create table role_permissions (
  role_key       text not null references roles(key)       on delete cascade,
  permission_key text not null references permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);

-- קטלוג ההרשאות אינו נתון משתמש. אין policy, ואין כתיבה מהאפליקציה.
-- שינוי מתבצע רק במיגרציה — כדי שהוא ייראה ב-code review.
