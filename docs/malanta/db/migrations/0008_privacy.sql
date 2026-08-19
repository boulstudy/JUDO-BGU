-- 0008_privacy — הסכמות, בקשות נושא מידע, שמירה ומחיקה
-- ============================================================================
-- הפלטפורמה מחזיקה מידע אישי של ישראלים (מיילים, שמות, ובעקיפין מסלולי
-- טיול — מידע התנהגותי). תיקון 13 לחוק הגנת הפרטיות החמיר משמעותית
-- את האכיפה. הטבלאות כאן הן המנגנון, לא הצהרה.
-- ============================================================================

-- ── מסמכים משפטיים בגרסאות ─────────────────────────────────────────────────
create table legal_documents (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in
                  ('terms_of_service','privacy_policy','creator_agreement',
                   'content_license','dpa','cookie_policy')),
  version       text not null,
  locale        text not null default 'he',
  body_key      text not null,             -- המסמך עצמו ב-R2, לא בטבלה
  body_sha256   text not null,             -- ⚠️ ראיה שהטקסט לא שונה בדיעבד
  effective_from timestamptz not null,
  superseded_at timestamptz,
  created_at    timestamptz not null default now(),
  constraint legal_documents_uniq unique (kind, version, locale)
);
create rule legal_documents_no_update as on update to legal_documents do instead nothing;

-- ── הסכמות. מנגנון אחד לתנאים, לפרטיות, לשיווק ולרישיון התוכן. ────────────
create table consents (
  id            bigserial primary key,
  subject_kind  text not null check (subject_kind in ('user','tenant')),
  user_id       uuid references profiles(id) on delete set null,
  tenant_id     uuid references tenants(id)  on delete set null,
  document_id   uuid references legal_documents(id),
  purpose       text not null check (purpose in
                  ('terms','privacy','marketing_email','analytics','content_license')),
  granted       boolean not null,
  -- ראיות: מה בדיוק הוצג, מתי, מאיפה
  ip            inet,
  user_agent    text,
  evidence      jsonb not null default '{}'::jsonb,
  occurred_at   timestamptz not null default now(),
  withdrawn_at  timestamptz,
  constraint consents_subject_shape check (
    (subject_kind = 'user'   and user_id is not null) or
    (subject_kind = 'tenant' and tenant_id is not null))
);
create index consents_user_idx   on consents (user_id, purpose, occurred_at desc);
create index consents_tenant_idx on consents (tenant_id, purpose, occurred_at desc);
create rule consents_no_delete as on delete to consents do instead nothing;

-- ── בקשות נושא מידע ────────────────────────────────────────────────────────
create table data_subject_requests (
  id            uuid primary key default gen_random_uuid(),
  subject_kind  text not null check (subject_kind in ('traveler','creator')),
  user_id       uuid references profiles(id) on delete set null,
  tenant_id     uuid references tenants(id)  on delete set null,
  subject_email text not null,              -- שורד מחיקת המשתמש
  kind          text not null check (kind in ('export','erasure','rectification','access','portability')),
  status        text not null default 'received' check (status in
                  ('received','verifying','in_progress','completed','rejected','partially_completed')),
  reject_reason text,
  -- ⚠️ מועד יעד נגזר. חובה חוקית, לא נוחות.
  received_at   timestamptz not null default now(),
  due_at        timestamptz not null default now() + interval '30 days',
  verified_at   timestamptz,
  completed_at  timestamptz,
  handled_by    uuid,
  artifact_key  text,                       -- קובץ הייצוא ב-R2
  artifact_expires_at timestamptz,
  -- מה נשמר למרות בקשת מחיקה, ולמה. חובות חשבונאיות גוברות על מחיקה.
  retained_categories text[],
  retention_basis text,
  notes         text,
  created_at    timestamptz not null default now()
);
create index dsr_open_idx on data_subject_requests (status, due_at)
  where status not in ('completed','rejected');
create index dsr_email_idx on data_subject_requests (lower(subject_email));

-- ── מדיניות שמירה, כנתונים ─────────────────────────────────────────────────
create table retention_policies (
  key          text primary key,
  target       text not null,
  retain_days  int  not null check (retain_days > 0),
  basis        text not null,
  note         text,
  updated_at   timestamptz not null default now()
);

-- ── אנונימיזציה במקום מחיקה ────────────────────────────────────────────────
-- מחיקת משתמש שקנה תמחק שורות שחייבים לשמור לצורכי חשבונאות.
-- הפתרון: מחיקת ה-PII, שמירת העובדה הכספית.
create or replace function app.anonymize_profile(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_email text;
begin
  select email into v_email from profiles where id = p_user;
  if v_email is null then raise exception 'not_found' using errcode = 'P0002'; end if;

  update profiles set
    email        = 'anonymized+' || p_user || '@invalid.local',
    full_name    = null, display_name = null, avatar_key = null,
    anonymized_at = now(), deleted_at = coalesce(deleted_at, now())
  where id = p_user;

  -- ההזמנות נשארות, מנותקות מהזהות
  update orders set buyer_name = null, buyer_phone = null, buyer_email_norm = null,
                    ip = null, user_agent = null
   where buyer_user_id = p_user;
  update payments set payer_name = null, payer_email_norm = null, payer_phone = null
   where matched_user_id = p_user;

  -- זכאויות מבוטלות
  update map_access set revoked_at = now(), revoke_reason = 'dsr_erasure'
   where user_id = p_user and revoked_at is null;

  perform app.audit('privacy.anonymize','platform_admin','success',
                    null, null, 'profiles', p_user, p_reason,
                    jsonb_build_object('email_hash', encode(extensions.digest(v_email,'sha256'),'hex')));
end $$;
