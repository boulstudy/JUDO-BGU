alter table if exists map_access drop constraint if exists map_access_order_fk;
drop function if exists app.next_invoice_number(uuid);
drop table if exists subscription_periods, subscriptions, invoices, invoice_sequences,
                     refunds, payments, payment_events,
                     coupon_redemptions, coupon_products, coupons,
                     order_items, orders, prices, product_map_items, products cascade;
drop sequence if exists order_number_seq;
