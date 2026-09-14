-- Synthetic historical Order preservation seam for the composed Catalog test only.
-- Exact source: supabase/tests/checkpoints/checkout-current.sql
-- Source SHA256: 5a5110855d08c3d5c46eb9717bfad03e77d89bf589029e3395dfea06dc28c638
-- The marked blocks retain exact source statements. Catalog supplies auth.users,
-- Products, and roles. The additional prerequisites supply the UUID default and
-- ownership-policy lookup; no real identities, Orders, or provider calls occur.
-- Scope: carts/orders/order_items enums, table columns, constraints, indexes,
-- RLS policies and grants only. Checkout functions, payment/rewards tables and
-- Checkout update triggers are deliberately outside this limited schema seam.
-- This proves these complete historical rows survive Catalog operations; it does
-- not claim to exercise Checkout reservation, payment or fulfillment semantics.
-- The complete Checkout contract remains covered by its separate actual-SQL runner.

-- BEGIN EXACT CHECKOUT ORDERS PREREQUISITES
CREATE SCHEMA extensions;

CREATE EXTENSION pgcrypto WITH SCHEMA extensions;

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;
-- END EXACT CHECKOUT ORDERS PREREQUISITES

-- BEGIN EXACT CHECKOUT ORDERS SLICE
CREATE TYPE "public"."cart_status" AS ENUM ('active', 'merged', 'abandoned');

CREATE TYPE "public"."checkout_environment" AS ENUM ('sandbox');

CREATE TYPE "public"."order_status" AS ENUM ('draft', 'pending_payment', 'paid', 'payment_failed', 'cancelled', 'refunded');

CREATE TABLE public."carts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "guest_token_hash" text,
  "status" cart_status DEFAULT 'active'::cart_status NOT NULL,
  "currency" text DEFAULT 'USD'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone,
  "checkout_generation" uuid DEFAULT extensions.gen_random_uuid() NOT NULL
);

CREATE TABLE public."order_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL,
  "product_id" uuid,
  "product_slug" text NOT NULL,
  "product_name" text NOT NULL,
  "variant_key" text NOT NULL,
  "variant_label" text NOT NULL,
  "unit_price_cents" integer NOT NULL,
  "quantity" integer NOT NULL,
  "line_subtotal_cents" integer NOT NULL,
  "product_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."orders" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "order_number" text NOT NULL,
  "user_id" uuid,
  "cart_id" uuid,
  "status" order_status DEFAULT 'pending_payment'::order_status NOT NULL,
  "checkout_environment" checkout_environment DEFAULT 'sandbox'::checkout_environment NOT NULL,
  "currency" text DEFAULT 'USD'::text NOT NULL,
  "customer_email" text,
  "merchandise_subtotal_cents" integer NOT NULL,
  "discount_cents" integer DEFAULT 0 NOT NULL,
  "shipping_cents" integer DEFAULT 0 NOT NULL,
  "tax_cents" integer DEFAULT 0 NOT NULL,
  "total_cents" integer NOT NULL,
  "stripe_checkout_session_id" text,
  "stripe_payment_intent_id" text,
  "stripe_customer_id" text,
  "referral_code" text,
  "reward_points_redeemed" integer DEFAULT 0 NOT NULL,
  "reward_discount_cents" integer DEFAULT 0 NOT NULL,
  "reward_points_earned" integer DEFAULT 0 NOT NULL,
  "shipping_name" text,
  "shipping_address" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "billing_address" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "paid_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "refunded_at" timestamp with time zone,
  "checkout_generation" uuid,
  "checkout_attempt_token" uuid,
  "checkout_attempt_started_at" timestamp with time zone
);

ALTER TABLE public."carts" ADD CONSTRAINT "carts_currency_usd" CHECK (currency = 'USD'::text);

ALTER TABLE public."carts" ADD CONSTRAINT "carts_guest_token_hash_length" CHECK (guest_token_hash IS NULL OR char_length(guest_token_hash) >= 32 AND char_length(guest_token_hash) <= 128);

ALTER TABLE public."carts" ADD CONSTRAINT "carts_owner_identity" CHECK (user_id IS NOT NULL AND guest_token_hash IS NULL OR user_id IS NULL AND guest_token_hash IS NOT NULL);

ALTER TABLE public."carts" ADD CONSTRAINT "carts_pkey" PRIMARY KEY (id);

ALTER TABLE public."order_items" ADD CONSTRAINT "order_items_line_total" CHECK (line_subtotal_cents = (unit_price_cents * quantity));

ALTER TABLE public."order_items" ADD CONSTRAINT "order_items_price_nonnegative" CHECK (unit_price_cents >= 0 AND line_subtotal_cents >= 0);

ALTER TABLE public."order_items" ADD CONSTRAINT "order_items_quantity_bounds" CHECK (quantity >= 1 AND quantity <= 99);

ALTER TABLE public."order_items" ADD CONSTRAINT "order_items_pkey" PRIMARY KEY (id);

ALTER TABLE public."orders" ADD CONSTRAINT "orders_amounts_nonnegative" CHECK (merchandise_subtotal_cents >= 0 AND discount_cents >= 0 AND shipping_cents >= 0 AND tax_cents >= 0 AND total_cents >= 0 AND reward_points_redeemed >= 0 AND reward_discount_cents >= 0 AND reward_points_earned >= 0);

ALTER TABLE public."orders" ADD CONSTRAINT "orders_currency_usd" CHECK (currency = 'USD'::text);

ALTER TABLE public."orders" ADD CONSTRAINT "orders_sandbox_only" CHECK (checkout_environment = 'sandbox'::checkout_environment);

ALTER TABLE public."orders" ADD CONSTRAINT "orders_total_matches_components" CHECK (total_cents = (GREATEST(0, merchandise_subtotal_cents - discount_cents) + shipping_cents + tax_cents));

ALTER TABLE public."orders" ADD CONSTRAINT "orders_pkey" PRIMARY KEY (id);

ALTER TABLE public."orders" ADD CONSTRAINT "orders_idempotency_key_key" UNIQUE (idempotency_key);

ALTER TABLE public."orders" ADD CONSTRAINT "orders_order_number_key" UNIQUE (order_number);

ALTER TABLE public."orders" ADD CONSTRAINT "orders_stripe_checkout_session_id_key" UNIQUE (stripe_checkout_session_id);

ALTER TABLE public."orders" ADD CONSTRAINT "orders_stripe_payment_intent_id_key" UNIQUE (stripe_payment_intent_id);

ALTER TABLE public."carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

ALTER TABLE public."order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

ALTER TABLE public."orders" ADD CONSTRAINT "orders_cart_id_fkey" FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE SET NULL;

ALTER TABLE public."orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX carts_one_active_user ON public.carts USING btree (user_id) WHERE ((status = 'active'::cart_status) AND (user_id IS NOT NULL));

CREATE UNIQUE INDEX carts_one_active_guest ON public.carts USING btree (guest_token_hash) WHERE ((status = 'active'::cart_status) AND (guest_token_hash IS NOT NULL));

CREATE INDEX carts_user_status_idx ON public.carts USING btree (user_id, status);

CREATE INDEX carts_guest_status_idx ON public.carts USING btree (guest_token_hash, status);

CREATE INDEX carts_expired_guest_cleanup_idx ON public.carts USING btree (expires_at, id) WHERE ((user_id IS NULL) AND (expires_at IS NOT NULL) AND (status = ANY (ARRAY['active'::cart_status, 'abandoned'::cart_status])));

ALTER TABLE public."carts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carts_select_own_user" ON public."carts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));

GRANT SELECT ON public."carts" TO "authenticated";

GRANT DELETE ON public."carts" TO "service_role";

GRANT INSERT ON public."carts" TO "service_role";

GRANT REFERENCES ON public."carts" TO "service_role";

GRANT SELECT ON public."carts" TO "service_role";

GRANT TRIGGER ON public."carts" TO "service_role";

GRANT TRUNCATE ON public."carts" TO "service_role";

GRANT UPDATE ON public."carts" TO "service_role";

CREATE INDEX order_items_order_idx ON public.order_items USING btree (order_id);

CREATE INDEX order_items_product_idx ON public.order_items USING btree (product_id);

ALTER TABLE public."order_items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_items_select_own_order" ON public."order_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND (o.user_id = ( SELECT auth.uid() AS uid))))));

GRANT SELECT ON public."order_items" TO "authenticated";

GRANT DELETE ON public."order_items" TO "service_role";

GRANT INSERT ON public."order_items" TO "service_role";

GRANT REFERENCES ON public."order_items" TO "service_role";

GRANT SELECT ON public."order_items" TO "service_role";

GRANT TRIGGER ON public."order_items" TO "service_role";

GRANT TRUNCATE ON public."order_items" TO "service_role";

GRANT UPDATE ON public."order_items" TO "service_role";

CREATE INDEX orders_user_created_idx ON public.orders USING btree (user_id, created_at DESC);

CREATE INDEX orders_cart_idx ON public.orders USING btree (cart_id);

CREATE INDEX orders_status_idx ON public.orders USING btree (status);

CREATE UNIQUE INDEX orders_cart_checkout_generation_key ON public.orders USING btree (cart_id, checkout_generation) WHERE ((cart_id IS NOT NULL) AND (checkout_generation IS NOT NULL));

ALTER TABLE public."orders" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select_own" ON public."orders" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));

GRANT SELECT ON public."orders" TO "authenticated";

GRANT DELETE ON public."orders" TO "service_role";

GRANT INSERT ON public."orders" TO "service_role";

GRANT REFERENCES ON public."orders" TO "service_role";

GRANT SELECT ON public."orders" TO "service_role";

GRANT TRIGGER ON public."orders" TO "service_role";

GRANT TRUNCATE ON public."orders" TO "service_role";

GRANT UPDATE ON public."orders" TO "service_role";
-- END EXACT CHECKOUT ORDERS SLICE

-- Call after pg_temp.seed_catalog_identity(...), which provides the synthetic
-- Product and user referenced here. Explicit values cover every stored column;
-- no random default or wall-clock value can weaken the preservation comparison.
create function pg_temp.seed_current_contract_order()
returns uuid language plpgsql as $$
declare
  order_id constant uuid := '10000000-0000-4000-8000-000000000701';
begin
  insert into public.carts (
    id, user_id, guest_token_hash, status, currency, created_at, updated_at,
    expires_at, checkout_generation
  ) values (
    '10000000-0000-4000-8000-000000000801',
    '10000000-0000-4000-8000-000000000901',
    null, 'abandoned', 'USD', '2026-06-01T10:00:00Z', '2026-06-01T10:15:00Z',
    '2026-07-01T10:00:00Z', '10000000-0000-4000-8000-000000000811'
  );
  insert into public.orders (
    id, order_number, user_id, cart_id, status, checkout_environment, currency,
    customer_email, merchandise_subtotal_cents, discount_cents, shipping_cents,
    tax_cents, total_cents, stripe_checkout_session_id, stripe_payment_intent_id,
    stripe_customer_id, referral_code, reward_points_redeemed,
    reward_discount_cents, reward_points_earned, shipping_name, shipping_address,
    billing_address, metadata, idempotency_key, created_at, updated_at, paid_at,
    cancelled_at, refunded_at, checkout_generation, checkout_attempt_token,
    checkout_attempt_started_at
  ) values (
    order_id, 'MP-20260601-SYNTHETIC358',
    '10000000-0000-4000-8000-000000000901',
    '10000000-0000-4000-8000-000000000801', 'paid', 'sandbox', 'USD',
    'historical-order@example.invalid', 5800, 725, 495, 418, 5988,
    'cs_test_synthetic_spec358_historical', 'pi_synthetic_spec358_historical',
    'cus_synthetic_spec358_historical', 'SYNTHETIC358', 100, 500, 50,
    'Synthetic Historical Customer',
    '{"line1":"100 Synthetic Test Way","line2":"Fixture Suite 2","city":"Fixture City","state":"CA","postal_code":"00000","country":"US"}'::jsonb,
    '{"line1":"200 Synthetic Billing Way","line2":"Fixture Suite 3","city":"Fixture City","state":"CA","postal_code":"00000","country":"US"}'::jsonb,
    '{"fixture":"spec358-current-contract","acceptedProductName":"Peptide Bounce","acceptedProductSlug":"peptide-bounce","acceptedOrderPrefix":"MP","pricing":{"merchandiseSubtotalCents":5800,"discountCents":725,"shippingCents":495,"taxCents":418,"totalCents":5988},"historicalPaymentReference":"cs_test_synthetic_spec358_historical"}'::jsonb,
    'synthetic:spec358:historical-order:accepted',
    '2026-06-01T10:05:00Z', '2026-06-01T10:10:00Z', '2026-06-01T10:10:00Z',
    null, null, '10000000-0000-4000-8000-000000000811',
    '10000000-0000-4000-8000-000000000812', '2026-06-01T10:06:00Z'
  );
  insert into public.order_items (
    id, order_id, product_id, product_slug, product_name, variant_key,
    variant_label, unit_price_cents, quantity, line_subtotal_cents,
    product_snapshot, created_at
  ) values (
    '10000000-0000-4000-8000-000000000711', order_id,
    '10000000-0000-4000-8000-000000000101', 'peptide-bounce', 'Peptide Bounce',
    'single', '30 ml', 2900, 2, 5800,
    '{"productId":"10000000-0000-4000-8000-000000000101","slug":"peptide-bounce","displayName":"Peptide Bounce","variantKey":"single","variantLabel":"30 ml","sku":"MP-PB-30-SYNTHETIC","unitPriceCents":2900,"quantity":2,"lineSubtotalCents":5800,"currency":"USD","media":{"url":"https://example.invalid/storage/v1/object/public/product-media/products/peptide-bounce/primary/original/synthetic-historical.webp","alt":"Historical Peptide Bounce bottle"},"acceptedAt":"2026-06-01T10:05:00Z","sourceRevision":1}'::jsonb,
    '2026-06-01T10:05:00Z'
  );
  return order_id;
end;
$$;

-- Snapshot every column and every row, including unexpected inserts/deletes.
-- Ordering uses full row JSON so the result is deterministic without omitting
-- nullable fields, nested historical facts, timestamps or provider references.
create function pg_temp.current_contract_order_state()
returns jsonb language plpgsql as $$
declare
  table_name text;
  rows jsonb;
  result jsonb := '{}'::jsonb;
begin
  foreach table_name in array array['carts', 'orders', 'order_items'] loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), ''[]''::jsonb) from public.%I t',
      table_name
    ) into rows;
    result := result || jsonb_build_object(table_name, rows);
  end loop;
  return result;
end;
$$;
