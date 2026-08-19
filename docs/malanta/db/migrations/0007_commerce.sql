-- 0007_commerce — קטלוג, הזמנות, תשלומים, זיכויים, חשבוניות, מנויים
-- ============================================================================
-- החלטת מפתח: **ההזמנה היא כוונת הרכישה.** אין טבלת intent נפרדת.
-- שורת orders נוצרת לפני היציאה לספק הסליקה, ה-checkout_token שלה נוסע
-- כפרמטר מותאם וחוזר ב-callback. זה מה שמחליף הצלבת שם+מייל כמפתח ראשי,
-- ומה שנותן תשובה לשאלה "מה בדיוק נקנה, מתי, בכמה, ובאיזו הנחה".
--
-- כל סכום נשמר ב**יחידות מינימליות** (אגורות) כ-int. לעולם לא float.
-- כל שיעור מס נשמר ב-basis points (1800 = 18%) וכ**תמונת מצב בהזמנה**,
-- כי שיעור המע"מ משתנה והחשבונית הישנה חייבת להישאר נכונה.
-- ============================================================================

-- ── קטלוג ───────────────────────────────────────────────────────────────────
create table products (
  id          uuid primary key default gen_random_uuid(),
  -- null = מוצר של הפלטפורמה (מנוי יוצר). לא null = מוצר שיוצר מוכר.
  tenant_id   uuid references tenants(id) on delete cascade,
  kind        text not null check (kind in ('map_access','platform_subscription','bundle')),
  map_id      uuid,
  code        text not null,
  name        text not null,
  description text,
  status      text not null default 'active' check (status in ('draft','active','retired')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint products_kind_shape check (
    (kind = 'map_access'            and tenant_id is not null and map_id is not null) or
    (kind = 'platform_subscription' and tenant_id is null     and map_id is null)     or
    (kind = 'bundle'                and tenant_id is not null and map_id is null)),
  constraint products_map_fk foreign key (map_id, tenant_id) references maps(id, tenant_id) on delete cascade
);
create unique index products_code_uniq on products (coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid), lower(code));
create trigger products_touch before update on products for each row execute function app.touch_updated_at();

create table product_map_items (         -- לחבילות: אילו מפות נכללות
  product_id uuid not null references products(id) on delete cascade,
  map_id     uuid not null references maps(id)     on delete cascade,
  primary key (product_id, map_id)
);

create table prices (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references products(id) on delete cascade,
  currency       text not null default 'ILS' check (currency ~ '^[A-Z]{3}$'),
  unit_amount_minor int not null check (unit_amount_minor >= 0),
  -- מחיר קטלוג לפני הנחה קבועה. מאפשר להציג "היה/עכשיו" בלי לשכתב היסטוריה.
  list_amount_minor int check (list_amount_minor is null or list_amount_minor >= unit_amount_minor),
  tax_inclusive  boolean not null default true,      -- בישראל, מחיר לצרכן כולל מע"מ
  tax_rate_bp    int not null default 1800 check (tax_rate_bp between 0 and 10000),
  billing_scheme text not null check (billing_scheme in ('one_time','recurring')),
  interval       text check (interval in ('month','year')),
  interval_count int check (interval_count between 1 and 12),
  -- לרכישה חד-פעמית של גישה למפה: לכמה זמן. null = לצמיתות.
  access_duration_days int check (access_duration_days is null or access_duration_days between 1 and 3650),
  status         text not null default 'active' check (status in ('active','archived')),
  valid_from     timestamptz not null default now(),
  valid_to       timestamptz,
  created_at     timestamptz not null default now(),
  constraint prices_recurring_shape check (
    (billing_scheme = 'recurring' and interval is not null and interval_count is not null
      and access_duration_days is null) or
    (billing_scheme = 'one_time'  and interval is null and interval_count is null))
);
create index prices_product_idx on prices (product_id) where status = 'active';


-- ── קופונים ─────────────────────────────────────────────────────────────────
create table coupons (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid references tenants(id) on delete cascade,   -- null = של הפלטפורמה
  code           text not null,
  kind           text not null check (kind in ('percent','fixed')),
  percent_off    int  check (percent_off between 1 and 100),
  amount_off_minor int check (amount_off_minor > 0),
  currency       text check (currency ~ '^[A-Z]{3}$'),
  min_subtotal_minor int not null default 0,
  max_redemptions    int check (max_redemptions is null or max_redemptions > 0),
  per_user_limit     int not null default 1 check (per_user_limit >= 1),
  redeemed_count     int not null default 0 check (redeemed_count >= 0),
  valid_from     timestamptz not null default now(),
  valid_to       timestamptz,
  status         text not null default 'active' check (status in ('active','disabled')),
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now(),
  constraint coupons_kind_shape check (
    (kind = 'percent' and percent_off is not null and amount_off_minor is null) or
    (kind = 'fixed'   and amount_off_minor is not null and currency is not null and percent_off is null)),
  constraint coupons_redemption_cap check (max_redemptions is null or redeemed_count <= max_redemptions)
);
create unique index coupons_code_uniq
  on coupons (coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid), upper(code));

create table coupon_products (
  coupon_id  uuid not null references coupons(id)  on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  primary key (coupon_id, product_id)
);


-- ── הזמנות ──────────────────────────────────────────────────────────────────
create sequence order_number_seq start 1000;

create table orders (
  id             uuid primary key default gen_random_uuid(),
  -- ⚠️ הטוקן שנוסע לספק הסליקה. נפרד מ-id כדי שה-id לא יעזוב את השרת.
  checkout_token uuid not null default gen_random_uuid(),
  order_number   text not null default ('MAL-' || to_char(now(),'YYYY') || '-' || nextval('order_number_seq')),

  kind           text not null check (kind in ('map_access','platform_subscription','bundle')),
  -- היוצר שמוכר. במנוי פלטפורמה — היוצר שקונה.
  tenant_id      uuid not null references tenants(id) on delete restrict,
  -- ⚠️ מי סוחר-הרשומה. ההבחנה קובעת מי מנפיק חשבונית ומי סופג זיכוי.
  merchant       text not null check (merchant in ('platform','creator')),

  buyer_user_id  uuid references profiles(id) on delete set null,
  buyer_email_norm text,
  buyer_name     text,
  buyer_phone    text,

  status text not null default 'pending' check (status in
    ('pending','awaiting_payment','paid','fulfilled','cancelled','expired',
     'refunded','partially_refunded','disputed')),

  currency          text not null default 'ILS' check (currency ~ '^[A-Z]{3}$'),
  subtotal_minor    int not null default 0 check (subtotal_minor >= 0),
  discount_minor    int not null default 0 check (discount_minor >= 0),
  tax_minor         int not null default 0 check (tax_minor >= 0),
  total_minor       int not null default 0 check (total_minor >= 0),
  refunded_minor    int not null default 0 check (refunded_minor >= 0),
  tax_rate_bp       int not null default 1800,
  tax_inclusive     boolean not null default true,
  coupon_id         uuid references coupons(id),
  coupon_code       text,                   -- תמונת מצב. הקופון עלול להימחק

  placed_at    timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '2 hours',
  paid_at      timestamptz,
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,

  locale     text not null default 'he',
  ip         inet,
  user_agent text,
  metadata   jsonb not null default '{}'::jsonb check (pg_column_size(metadata) < 8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint orders_number_uniq   unique (order_number),
  constraint orders_token_uniq    unique (checkout_token),
  constraint orders_totals        check (total_minor = subtotal_minor - discount_minor + case when tax_inclusive then 0 else tax_minor end),
  constraint orders_refund_bound  check (refunded_minor <= total_minor),
  constraint orders_paid_shape    check (status not in ('paid','fulfilled') or paid_at is not null),
  constraint orders_buyer_known   check (status not in ('fulfilled') or buyer_user_id is not null)
);
create index orders_buyer_idx  on orders (buyer_user_id, placed_at desc);
create index orders_email_idx  on orders (buyer_email_norm) where buyer_user_id is null;
create index orders_tenant_idx on orders (tenant_id, placed_at desc);
create index orders_open_idx   on orders (status, expires_at) where status in ('pending','awaiting_payment');
create trigger orders_touch before update on orders for each row execute function app.touch_updated_at();

create table order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  product_id    uuid references products(id) on delete set null,
  price_id      uuid references prices(id)   on delete set null,
  map_id        uuid references maps(id)     on delete set null,
  -- ⚠️ תמונת מצב מלאה. המוצר ישתנה, החשבונית לא רשאית להשתנות איתו.
  name_snapshot text not null,
  quantity      int not null default 1 check (quantity > 0),
  list_amount_minor     int,
  unit_amount_minor     int not null check (unit_amount_minor >= 0),
  discount_amount_minor int not null default 0 check (discount_amount_minor >= 0),
  tax_amount_minor      int not null default 0 check (tax_amount_minor >= 0),
  total_amount_minor    int not null check (total_amount_minor >= 0),
  tax_rate_bp           int not null default 1800,
  -- מה הפריט הזה מעניק, כתמונת מצב — כדי שהענקת הגישה לא תלויה בקטלוג עדכני
  grants_access_days    int,
  grants_all_layers     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index order_items_order_idx on order_items (order_id);
create index order_items_map_idx   on order_items (map_id);

create table coupon_redemptions (
  id         uuid primary key default gen_random_uuid(),
  coupon_id  uuid not null references coupons(id) on delete cascade,
  order_id   uuid not null references orders(id)  on delete cascade,
  user_id    uuid references profiles(id) on delete set null,
  amount_discounted_minor int not null check (amount_discounted_minor >= 0),
  redeemed_at timestamptz not null default now(),
  constraint coupon_redemption_once unique (coupon_id, order_id)
);
create index coupon_redemptions_user on coupon_redemptions (coupon_id, user_id);

alter table map_access add constraint map_access_order_fk
  foreign key (order_id) references orders(id) on delete set null;


-- ── תשלומים ─────────────────────────────────────────────────────────────────
-- יומן גולמי. immutable. הבסיס לכל בירור "למה הוא לא קיבל גישה".
create table payment_events (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null,
  provider_event_id  text not null,
  event_type         text not null,
  payload            jsonb not null,       -- ⚠️ אסור שיכיל PAN מעבר ל-4 ספרות
  signature_verified boolean not null default false,
  received_at        timestamptz not null default now(),
  processed_at       timestamptz,
  processing_error   text,
  constraint payment_events_idem unique (provider, provider_event_id)   -- idempotency
);
create index payment_events_unprocessed on payment_events (received_at) where processed_at is null;
create rule payment_events_no_delete as on delete to payment_events do instead nothing;

create table payments (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null,
  provider_payment_id text not null,
  raw_event_id        uuid references payment_events(id),
  order_id            uuid references orders(id) on delete set null,

  payer_name       text,
  payer_email_norm text,
  payer_phone      text,
  card_brand       text,
  card_last4       char(4) check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  installments     int check (installments is null or installments between 1 and 36),

  amount_minor   int  not null check (amount_minor > 0),
  currency       text not null check (currency ~ '^[A-Z]{3}$'),
  status         text not null check (status in ('captured','pending','failed','refunded','chargeback')),
  failure_reason text,
  paid_at        timestamptz,

  -- סולם השיוך: token → מייל מאומת → ידני. אף פעם "הכי קרוב".
  matched_user_id uuid references profiles(id) on delete set null,
  match_method    text check (match_method in ('checkout_token','email_verified','manual')),
  matched_at      timestamptz,
  matched_by      uuid references profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payments_idem unique (provider, provider_payment_id),
  constraint payments_match_shape check (
    (matched_user_id is null and match_method is null and matched_at is null) or
    (matched_user_id is not null and match_method is not null and matched_at is not null)),
  constraint payments_manual_actor check (match_method <> 'manual' or matched_by is not null)
);
-- תור הטיפול הידני
create index payments_unmatched  on payments (created_at) where matched_user_id is null and status = 'captured';
create index payments_email_idx  on payments (payer_email_norm) where matched_user_id is null;
create index payments_order_idx  on payments (order_id);
create trigger payments_touch before update on payments for each row execute function app.touch_updated_at();

create table refunds (
  id                 uuid primary key default gen_random_uuid(),
  payment_id         uuid not null references payments(id) on delete restrict,
  provider_refund_id text,
  amount_minor       int not null check (amount_minor > 0),
  currency           text not null,
  kind               text not null check (kind in ('refund','chargeback')),
  reason             text,
  status             text not null default 'pending' check (status in ('pending','succeeded','failed')),
  requested_by       uuid references profiles(id),
  created_at         timestamptz not null default now(),
  settled_at         timestamptz,
  constraint refunds_provider_uniq unique (payment_id, provider_refund_id)
);
create index refunds_payment_idx on refunds (payment_id);


-- ── חשבוניות ────────────────────────────────────────────────────────────────
-- מספור רציף לפי מנפיק ולפי שנה. חובה חשבונאית, ולא ניתן להשיג עם uuid.
-- ⚠️ PRIMARY KEY/UNIQUE לא מקבלים ביטוי ב-Postgres — רק unique index כן.
-- לכן PK סורוגטי + index על הביטוי. (התגלה בהרצה מול Postgres.)
create table invoice_sequences (
  id               bigserial primary key,
  issuer_tenant_id uuid,                   -- null = הפלטפורמה
  year             int  not null,
  last_number      int  not null default 0,
  updated_at       timestamptz not null default now()
);
create unique index invoice_sequences_uniq on invoice_sequences
  (coalesce(issuer_tenant_id,'00000000-0000-0000-0000-000000000000'::uuid), year);

-- הקצאת מספר חשבונית אטומית. advisory lock ולא SELECT FOR UPDATE,
-- כדי ששני חיובים במקביל לא ייצרו את אותו מספר.
create or replace function app.next_invoice_number(p_issuer uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_year int := extract(year from now())::int; v_n int; v_key uuid;
begin
  v_key := coalesce(p_issuer,'00000000-0000-0000-0000-000000000000'::uuid);
  perform pg_advisory_xact_lock(hashtextextended(v_key::text || v_year::text, 0));
  insert into invoice_sequences (issuer_tenant_id, year, last_number)
  values (p_issuer, v_year, 1)
  on conflict (coalesce(issuer_tenant_id,'00000000-0000-0000-0000-000000000000'::uuid), year)
    do update set last_number = invoice_sequences.last_number + 1, updated_at = now()
  returning last_number into v_n;
  return to_char(v_year,'FM9999') || '-' || lpad(v_n::text, 5, '0');
end $$;

create table invoices (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete restrict,
  issuer_tenant_id uuid references tenants(id) on delete restrict,   -- null = פלטפורמה
  number        text not null,
  kind          text not null default 'invoice_receipt'
                  check (kind in ('invoice','receipt','invoice_receipt','credit_note')),
  -- תמונת מצב של הקונה ברגע ההנפקה. חשבונית לא משתנה כשהמשתמש עורך פרופיל.
  buyer_name    text not null,
  buyer_email   text not null,
  buyer_tax_id  text,
  buyer_address text,
  currency      text not null,
  subtotal_minor int not null,
  discount_minor int not null default 0,
  tax_minor      int not null,
  total_minor    int not null,
  tax_rate_bp    int not null,
  issued_at     timestamptz not null default now(),
  document_key  text,                      -- PDF ב-R2
  external_id   text,                      -- מזהה אצל ספק החשבוניות
  external_url  text,
  status        text not null default 'issued' check (status in ('draft','issued','void')),
  voided_at     timestamptz,
  void_reason   text,
  created_at    timestamptz not null default now(),
  constraint invoices_totals check (total_minor = subtotal_minor - discount_minor + tax_minor)
);
create unique index invoices_number_uniq on invoices
  (coalesce(issuer_tenant_id,'00000000-0000-0000-0000-000000000000'::uuid), number);
create index invoices_order_idx on invoices (order_id);
-- חשבונית שהונפקה לא נערכת. ביטול = credit_note חדשה.
create rule invoices_no_delete as on delete to invoices do instead nothing;


-- ── מנויים ──────────────────────────────────────────────────────────────────
create table subscriptions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  product_id    uuid not null references products(id) on delete restrict,
  price_id      uuid not null references prices(id)   on delete restrict,
  status        text not null default 'trialing' check (status in
                  ('trialing','active','past_due','paused','canceled','expired')),
  collection    text not null default 'automatic' check (collection in ('automatic','manual')),
  current_period_start timestamptz not null default now(),
  current_period_end   timestamptz not null,
  trial_end     timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at   timestamptz,
  cancel_reason text,
  ended_at      timestamptz,
  -- כמה כישלונות חיוב ברצף. מעל סף → past_due → השעיה
  failed_payment_count int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint subscriptions_period check (current_period_end > current_period_start)
);
create unique index subscriptions_active_uniq on subscriptions (tenant_id)
  where status in ('trialing','active','past_due');
create index subscriptions_renewal on subscriptions (current_period_end)
  where status in ('trialing','active','past_due');
create trigger subscriptions_touch before update on subscriptions
  for each row execute function app.touch_updated_at();

create table subscription_periods (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  order_id        uuid references orders(id) on delete set null,
  period_start    timestamptz not null,
  period_end      timestamptz not null,
  amount_minor    int not null,
  currency        text not null,
  status          text not null check (status in ('paid','unpaid','waived','refunded')),
  created_at      timestamptz not null default now(),
  constraint subscription_periods_range check (period_end > period_start),
  constraint subscription_periods_uniq unique (subscription_id, period_start)
);
