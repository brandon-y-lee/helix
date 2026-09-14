-- Checkout checkpoint captured schema-only from erasogmsqpgiirovubjh, PG17.6, 2026-09-14.
-- No customer rows. Catalog write triggers and authentication/rewards services are outside this seam.
-- See docs/operations/checkout-contract-cleanup.md before running.
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
SET check_function_bodies = false;

CREATE TYPE "public"."cart_status" AS ENUM ('active', 'merged', 'abandoned');

CREATE TYPE "public"."checkout_environment" AS ENUM ('sandbox');

CREATE TYPE "public"."order_status" AS ENUM ('draft', 'pending_payment', 'paid', 'payment_failed', 'cancelled', 'refunded');

CREATE TYPE "public"."payment_attempt_status" AS ENUM ('requires_payment', 'processing', 'paid', 'failed', 'cancelled', 'refunded');



CREATE TYPE "public"."referral_status" AS ENUM ('pending', 'qualified', 'rewarded', 'void');





CREATE TABLE public."product_variants" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL,
  "variant_key" text NOT NULL,
  "label" text NOT NULL,
  "price_cents" integer NOT NULL,
  "sku" text,
  "supplier_variant_id" text,
  "option_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "compare_at_price_cents" integer,
  "available" boolean DEFAULT true NOT NULL,
  "inventory_status" text DEFAULT 'in_stock'::text NOT NULL,
  "volume" text,
  "pack_count" integer,
  "sort_order" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone
);

CREATE TABLE public."products" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "benefits" text[] DEFAULT '{}'::text[] NOT NULL,
  "swatch_from" text NOT NULL,
  "swatch_to" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" text DEFAULT 'available'::text NOT NULL,
  "made_for" text,
  "good_for" text,
  "texture" text,
  "product_type" text NOT NULL,
  "catalog_status" text DEFAULT 'active'::text NOT NULL,
  "badge" text,
  "currency" text DEFAULT 'USD'::text NOT NULL,
  "sort_order" integer NOT NULL,
  "published_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "key_ingredients" text[] DEFAULT '{}'::text[] NOT NULL,
  "ingredients" text,
  "cautions" text[] DEFAULT '{}'::text[] NOT NULL,
  "finish" text,
  "volume" text,
  "skin_types" text[] DEFAULT '{}'::text[] NOT NULL,
  "concerns" text[] DEFAULT '{}'::text[] NOT NULL,
  "usage_time" text[] DEFAULT '{}'::text[] NOT NULL,
  "seo_title" text,
  "seo_description" text,
  "search_keywords" text[] DEFAULT '{}'::text[] NOT NULL,
  "display_name" text NOT NULL,
  "editorial_description" text NOT NULL,
  "editorial_how_to_use" text NOT NULL,
  "formula_notes" text[] DEFAULT '{}'::text[] NOT NULL,
  "routine_group" text NOT NULL,
  "routine_sort" integer NOT NULL,
  "system_step_name" text
);

CREATE TABLE public."system_steps" (
  "name" text NOT NULL,
  "position" smallint NOT NULL,
  "routine_group" text NOT NULL
);

CREATE TABLE public."cart_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cart_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "variant_key" text NOT NULL,
  "quantity" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

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

CREATE TABLE public."payment_attempts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL,
  "provider" text DEFAULT 'stripe'::text NOT NULL,
  "checkout_environment" checkout_environment DEFAULT 'sandbox'::checkout_environment NOT NULL,
  "status" payment_attempt_status DEFAULT 'requires_payment'::payment_attempt_status NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" text DEFAULT 'USD'::text NOT NULL,
  "stripe_checkout_session_id" text,
  "stripe_payment_intent_id" text,
  "idempotency_key" text NOT NULL,
  "raw_status" text,
  "last_error" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."referral_attributions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "referral_code_id" uuid NOT NULL,
  "referrer_user_id" uuid NOT NULL,
  "referee_user_id" uuid,
  "order_id" uuid,
  "status" referral_status DEFAULT 'pending'::referral_status NOT NULL,
  "source_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "qualified_at" timestamp with time zone
);

CREATE TABLE public."referral_codes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "code" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."rewards_accounts" (
  "user_id" uuid NOT NULL,
  "points_balance" integer DEFAULT 0 NOT NULL,
  "lifetime_points" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_compare_at_price_cents_check" CHECK (((compare_at_price_cents IS NULL) OR (compare_at_price_cents >= 0)));

ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_inventory_status_check" CHECK ((inventory_status = ANY (ARRAY['in_stock'::text, 'low_stock'::text, 'out_of_stock'::text, 'unavailable'::text])));

ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_pack_count_check" CHECK (((pack_count IS NULL) OR (pack_count > 0)));

ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_pkey" PRIMARY KEY (id);

ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_price_cents_check" CHECK ((price_cents >= 0));

ALTER TABLE public."products" ADD CONSTRAINT "products_active_system_step_check" CHECK (((catalog_status <> 'active'::text) OR (system_step_name IS NOT NULL)));

ALTER TABLE public."products" ADD CONSTRAINT "products_catalog_status_check" CHECK ((catalog_status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])));

ALTER TABLE public."products" ADD CONSTRAINT "products_currency_check" CHECK ((currency = 'USD'::text));

ALTER TABLE public."products" ADD CONSTRAINT "products_pkey" PRIMARY KEY (id);

ALTER TABLE public."products" ADD CONSTRAINT "products_routine_group_check" CHECK (((routine_group IS NULL) OR (routine_group = ANY (ARRAY['core'::text, 'beyond_core'::text]))));

ALTER TABLE public."products" ADD CONSTRAINT "products_slug_key" UNIQUE (slug);

ALTER TABLE public."products" ADD CONSTRAINT "products_slug_length_check" CHECK ((char_length(slug) <= 120));

ALTER TABLE public."products" ADD CONSTRAINT "products_status_check" CHECK ((status = ANY (ARRAY['available'::text, 'coming_soon'::text, 'sold_out'::text, 'waitlist'::text])));

ALTER TABLE public."system_steps" ADD CONSTRAINT "system_steps_fixed_contract_check" CHECK ((((name = 'CLEANSE'::text) AND ("position" = 1) AND (routine_group = 'core'::text)) OR ((name = 'REFINE'::text) AND ("position" = 2) AND (routine_group = 'beyond_core'::text)) OR ((name = 'TREAT'::text) AND ("position" = 3) AND (routine_group = 'core'::text)) OR ((name = 'FRAME'::text) AND ("position" = 4) AND (routine_group = 'beyond_core'::text)) OR ((name = 'SEAL'::text) AND ("position" = 5) AND (routine_group = 'core'::text)) OR ((name = 'PROTECT'::text) AND ("position" = 6) AND (routine_group = 'beyond_core'::text)) OR ((name = 'LIFT'::text) AND ("position" = 7) AND (routine_group = 'beyond_core'::text))));

ALTER TABLE public."system_steps" ADD CONSTRAINT "system_steps_name_check" CHECK ((name = ANY (ARRAY['CLEANSE'::text, 'REFINE'::text, 'TREAT'::text, 'FRAME'::text, 'SEAL'::text, 'PROTECT'::text, 'LIFT'::text])));

ALTER TABLE public."system_steps" ADD CONSTRAINT "system_steps_name_routine_group_key" UNIQUE (name, routine_group);

ALTER TABLE public."system_steps" ADD CONSTRAINT "system_steps_pkey" PRIMARY KEY (name);

ALTER TABLE public."system_steps" ADD CONSTRAINT "system_steps_position_check" CHECK ((("position" >= 1) AND ("position" <= 7)));

ALTER TABLE public."system_steps" ADD CONSTRAINT "system_steps_position_key" UNIQUE ("position");

ALTER TABLE public."system_steps" ADD CONSTRAINT "system_steps_routine_group_check" CHECK ((routine_group = ANY (ARRAY['core'::text, 'beyond_core'::text])));

ALTER TABLE public."cart_items" ADD CONSTRAINT "cart_items_quantity_bounds" CHECK (quantity >= 1 AND quantity <= 99);

ALTER TABLE public."cart_items" ADD CONSTRAINT "cart_items_variant_key_present" CHECK (char_length(variant_key) > 0);

ALTER TABLE public."cart_items" ADD CONSTRAINT "cart_items_pkey" PRIMARY KEY (id);

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

ALTER TABLE public."payment_attempts" ADD CONSTRAINT "payment_attempts_amount_nonnegative" CHECK (amount_cents >= 0);

ALTER TABLE public."payment_attempts" ADD CONSTRAINT "payment_attempts_currency_usd" CHECK (currency = 'USD'::text);

ALTER TABLE public."payment_attempts" ADD CONSTRAINT "payment_attempts_provider_stripe" CHECK (provider = 'stripe'::text);

ALTER TABLE public."payment_attempts" ADD CONSTRAINT "payment_attempts_sandbox_only" CHECK (checkout_environment = 'sandbox'::checkout_environment);

ALTER TABLE public."payment_attempts" ADD CONSTRAINT "payment_attempts_pkey" PRIMARY KEY (id);

ALTER TABLE public."payment_attempts" ADD CONSTRAINT "payment_attempts_idempotency_key_key" UNIQUE (idempotency_key);

ALTER TABLE public."payment_attempts" ADD CONSTRAINT "payment_attempts_stripe_checkout_session_id_key" UNIQUE (stripe_checkout_session_id);

ALTER TABLE public."referral_attributions" ADD CONSTRAINT "referral_attributions_not_self" CHECK (referee_user_id IS NULL OR referee_user_id <> referrer_user_id);

ALTER TABLE public."referral_attributions" ADD CONSTRAINT "referral_attributions_pkey" PRIMARY KEY (id);

ALTER TABLE public."referral_attributions" ADD CONSTRAINT "referral_attributions_source_key_key" UNIQUE (source_key);

ALTER TABLE public."referral_codes" ADD CONSTRAINT "referral_codes_format" CHECK (code ~ '^[A-Z0-9]{6,16}$'::text);

ALTER TABLE public."referral_codes" ADD CONSTRAINT "referral_codes_pkey" PRIMARY KEY (id);

ALTER TABLE public."referral_codes" ADD CONSTRAINT "referral_codes_code_key" UNIQUE (code);

ALTER TABLE public."referral_codes" ADD CONSTRAINT "referral_codes_user_id_key" UNIQUE (user_id);

ALTER TABLE public."rewards_accounts" ADD CONSTRAINT "rewards_accounts_points_nonnegative" CHECK (points_balance >= 0 AND lifetime_points >= 0);

ALTER TABLE public."rewards_accounts" ADD CONSTRAINT "rewards_accounts_pkey" PRIMARY KEY (user_id);

ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE public."products" ADD CONSTRAINT "products_system_step_routine_group_fkey" FOREIGN KEY (system_step_name, routine_group) REFERENCES system_steps(name, routine_group) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE public."cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE;

ALTER TABLE public."cart_items" ADD CONSTRAINT "cart_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE public."carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

ALTER TABLE public."order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

ALTER TABLE public."orders" ADD CONSTRAINT "orders_cart_id_fkey" FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE SET NULL;

ALTER TABLE public."orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public."payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

ALTER TABLE public."referral_attributions" ADD CONSTRAINT "referral_attributions_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

ALTER TABLE public."referral_attributions" ADD CONSTRAINT "referral_attributions_referee_user_id_fkey" FOREIGN KEY (referee_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public."referral_attributions" ADD CONSTRAINT "referral_attributions_referral_code_id_fkey" FOREIGN KEY (referral_code_id) REFERENCES referral_codes(id) ON DELETE RESTRICT;

ALTER TABLE public."referral_attributions" ADD CONSTRAINT "referral_attributions_referrer_user_id_fkey" FOREIGN KEY (referrer_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."referral_codes" ADD CONSTRAINT "referral_codes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."rewards_accounts" ADD CONSTRAINT "rewards_accounts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX product_variants_active_key_idx ON public.product_variants USING btree (product_id, variant_key) WHERE (archived_at IS NULL);

CREATE INDEX product_variants_active_product_idx ON public.product_variants USING btree (product_id, sort_order) WHERE (archived_at IS NULL);

CREATE INDEX product_variants_availability_idx ON public.product_variants USING btree (product_id, available, inventory_status);

CREATE INDEX product_variants_product_id_idx ON public.product_variants USING btree (product_id);

CREATE UNIQUE INDEX product_variants_sku_unique_idx ON public.product_variants USING btree (sku) WHERE (sku IS NOT NULL);

ALTER TABLE public."product_variants" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active product variants" ON public."product_variants" AS PERMISSIVE FOR SELECT TO "authenticated", "anon" USING (((archived_at IS NULL) AND (EXISTS ( SELECT 1
   FROM products
  WHERE ((products.id = product_variants.product_id) AND (products.catalog_status = 'active'::text) AND (products.published_at <= now()))))));

GRANT SELECT ON public."product_variants" TO "anon";

GRANT SELECT ON public."product_variants" TO "authenticated";

GRANT DELETE ON public."product_variants" TO "service_role";

GRANT INSERT ON public."product_variants" TO "service_role";

GRANT SELECT ON public."product_variants" TO "service_role";

GRANT UPDATE ON public."product_variants" TO "service_role";

CREATE INDEX products_catalog_status_sort_idx ON public.products USING btree (catalog_status, sort_order);

CREATE INDEX products_concerns_gin_idx ON public.products USING gin (concerns);

CREATE INDEX products_key_ingredients_gin_idx ON public.products USING gin (key_ingredients);

CREATE INDEX products_routine_sort_idx ON public.products USING btree (routine_sort, sort_order) WHERE (catalog_status = 'active'::text);

CREATE INDEX products_system_step_routine_group_idx ON public.products USING btree (system_step_name, routine_group);

ALTER TABLE public."products" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active published products" ON public."products" AS PERMISSIVE FOR SELECT TO "authenticated", "anon" USING (((catalog_status = 'active'::text) AND (published_at <= now())));

GRANT SELECT ON public."products" TO "anon";

GRANT SELECT ON public."products" TO "authenticated";

GRANT DELETE ON public."products" TO "service_role";

GRANT INSERT ON public."products" TO "service_role";

GRANT SELECT ON public."products" TO "service_role";

GRANT UPDATE ON public."products" TO "service_role";

ALTER TABLE public."system_steps" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read System Steps" ON public."system_steps" AS PERMISSIVE FOR SELECT TO "authenticated", "anon" USING (true);

GRANT SELECT ON public."system_steps" TO "anon";

GRANT SELECT ON public."system_steps" TO "authenticated";

GRANT SELECT ON public."system_steps" TO "service_role";

CREATE UNIQUE INDEX cart_items_cart_product_variant ON public.cart_items USING btree (cart_id, product_id, variant_key);

CREATE INDEX cart_items_cart_id_idx ON public.cart_items USING btree (cart_id);

CREATE INDEX cart_items_product_id_idx ON public.cart_items USING btree (product_id);

ALTER TABLE public."cart_items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cart_items_select_own_user_cart" ON public."cart_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM carts c
  WHERE ((c.id = cart_items.cart_id) AND (c.user_id = ( SELECT auth.uid() AS uid))))));

GRANT SELECT ON public."cart_items" TO "authenticated";

GRANT DELETE ON public."cart_items" TO "service_role";

GRANT INSERT ON public."cart_items" TO "service_role";

GRANT REFERENCES ON public."cart_items" TO "service_role";

GRANT SELECT ON public."cart_items" TO "service_role";

GRANT TRIGGER ON public."cart_items" TO "service_role";

GRANT TRUNCATE ON public."cart_items" TO "service_role";

GRANT UPDATE ON public."cart_items" TO "service_role";

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

CREATE INDEX payment_attempts_order_idx ON public.payment_attempts USING btree (order_id);

CREATE INDEX payment_attempts_status_idx ON public.payment_attempts USING btree (status);

ALTER TABLE public."payment_attempts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_attempts_select_own_order" ON public."payment_attempts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = payment_attempts.order_id) AND (o.user_id = ( SELECT auth.uid() AS uid))))));

GRANT SELECT ON public."payment_attempts" TO "authenticated";

GRANT DELETE ON public."payment_attempts" TO "service_role";

GRANT INSERT ON public."payment_attempts" TO "service_role";

GRANT REFERENCES ON public."payment_attempts" TO "service_role";

GRANT SELECT ON public."payment_attempts" TO "service_role";

GRANT TRIGGER ON public."payment_attempts" TO "service_role";

GRANT TRUNCATE ON public."payment_attempts" TO "service_role";

GRANT UPDATE ON public."payment_attempts" TO "service_role";

CREATE INDEX referral_attributions_referrer_idx ON public.referral_attributions USING btree (referrer_user_id, created_at DESC);

CREATE INDEX referral_attributions_referee_idx ON public.referral_attributions USING btree (referee_user_id);

CREATE UNIQUE INDEX referral_attributions_one_order ON public.referral_attributions USING btree (order_id) WHERE (order_id IS NOT NULL);

CREATE INDEX referral_attributions_referral_code_id_idx ON public.referral_attributions USING btree (referral_code_id);

ALTER TABLE public."referral_attributions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_attributions_select_own" ON public."referral_attributions" AS PERMISSIVE FOR SELECT TO "public" USING (((auth.uid() = referrer_user_id) OR (auth.uid() = referee_user_id)));

GRANT DELETE ON public."referral_attributions" TO "anon";

GRANT INSERT ON public."referral_attributions" TO "anon";

GRANT REFERENCES ON public."referral_attributions" TO "anon";

GRANT SELECT ON public."referral_attributions" TO "anon";

GRANT TRIGGER ON public."referral_attributions" TO "anon";

GRANT TRUNCATE ON public."referral_attributions" TO "anon";

GRANT UPDATE ON public."referral_attributions" TO "anon";

GRANT DELETE ON public."referral_attributions" TO "authenticated";

GRANT INSERT ON public."referral_attributions" TO "authenticated";

GRANT REFERENCES ON public."referral_attributions" TO "authenticated";

GRANT SELECT ON public."referral_attributions" TO "authenticated";

GRANT TRIGGER ON public."referral_attributions" TO "authenticated";

GRANT TRUNCATE ON public."referral_attributions" TO "authenticated";

GRANT UPDATE ON public."referral_attributions" TO "authenticated";

GRANT DELETE ON public."referral_attributions" TO "service_role";

GRANT INSERT ON public."referral_attributions" TO "service_role";

GRANT REFERENCES ON public."referral_attributions" TO "service_role";

GRANT SELECT ON public."referral_attributions" TO "service_role";

GRANT TRIGGER ON public."referral_attributions" TO "service_role";

GRANT TRUNCATE ON public."referral_attributions" TO "service_role";

GRANT UPDATE ON public."referral_attributions" TO "service_role";

ALTER TABLE public."referral_codes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_codes_select_own" ON public."referral_codes" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = user_id));

GRANT DELETE ON public."referral_codes" TO "anon";

GRANT INSERT ON public."referral_codes" TO "anon";

GRANT REFERENCES ON public."referral_codes" TO "anon";

GRANT SELECT ON public."referral_codes" TO "anon";

GRANT TRIGGER ON public."referral_codes" TO "anon";

GRANT TRUNCATE ON public."referral_codes" TO "anon";

GRANT UPDATE ON public."referral_codes" TO "anon";

GRANT DELETE ON public."referral_codes" TO "authenticated";

GRANT INSERT ON public."referral_codes" TO "authenticated";

GRANT REFERENCES ON public."referral_codes" TO "authenticated";

GRANT SELECT ON public."referral_codes" TO "authenticated";

GRANT TRIGGER ON public."referral_codes" TO "authenticated";

GRANT TRUNCATE ON public."referral_codes" TO "authenticated";

GRANT UPDATE ON public."referral_codes" TO "authenticated";

GRANT DELETE ON public."referral_codes" TO "service_role";

GRANT INSERT ON public."referral_codes" TO "service_role";

GRANT REFERENCES ON public."referral_codes" TO "service_role";

GRANT SELECT ON public."referral_codes" TO "service_role";

GRANT TRIGGER ON public."referral_codes" TO "service_role";

GRANT TRUNCATE ON public."referral_codes" TO "service_role";

GRANT UPDATE ON public."referral_codes" TO "service_role";

ALTER TABLE public."rewards_accounts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rewards_accounts_select_own" ON public."rewards_accounts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));

GRANT SELECT ON public."rewards_accounts" TO "authenticated";

GRANT INSERT ON public."rewards_accounts" TO "service_role";

GRANT SELECT ON public."rewards_accounts" TO "service_role";

GRANT UPDATE ON public."rewards_accounts" TO "service_role";

CREATE OR REPLACE FUNCTION public.fail_checkout_order_from_stripe(p_order_id uuid, p_reason text)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select false;
$function$
;

REVOKE ALL ON FUNCTION public.fail_checkout_order_from_stripe(uuid,text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.fail_checkout_order_from_stripe(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_checkout_order_from_stripe(p_order_id uuid, p_session_id text, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_order public.orders%rowtype;
  v_user_id uuid;
  v_reward_points integer;
begin
  if p_order_id is null or p_session_id is null then
    raise exception using errcode = '22023', message = 'order and session are required';
  end if;
  if p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) = 0 then
    raise exception using errcode = '22023', message = 'failure reason is required';
  end if;

  select o.user_id, o.reward_points_redeemed
  into v_user_id, v_reward_points
  from public.orders as o
  where o.id = p_order_id
    and o.stripe_checkout_session_id = p_session_id;

  if v_user_id is not null and coalesce(v_reward_points, 0) > 0 then
    perform public.ensure_rewards_account(v_user_id);
    perform 1
    from public.rewards_accounts as account
    where account.user_id = v_user_id
    for update;
  end if;

  select o.*
  into v_order
  from public.orders as o
  where o.id = p_order_id
    and o.stripe_checkout_session_id = p_session_id
  for update;

  if not found or v_order.status not in ('pending_payment', 'payment_failed', 'cancelled') then
    return false;
  end if;

  update public.orders
  set status = 'payment_failed',
      cancelled_at = pg_catalog.now(),
      checkout_attempt_token = null,
      checkout_attempt_started_at = null
  where id = p_order_id;

  update public.payment_attempts
  set status = 'failed',
      last_error = pg_catalog.btrim(p_reason),
      updated_at = pg_catalog.now()
  where order_id = p_order_id
    and stripe_checkout_session_id = p_session_id
    and status <> 'paid';

  if v_order.user_id is not null and v_order.reward_points_redeemed > 0 then
    perform public.release_rewards_reservations_for_order(
      v_order.user_id,
      v_order.id,
      pg_catalog.btrim(p_reason)
    );
  end if;

  update public.referral_attributions
  set status = 'void', updated_at = pg_catalog.now()
  where order_id = p_order_id
    and status = 'pending';

  return true;
end;
$function$
;

REVOKE ALL ON FUNCTION public.fail_checkout_order_from_stripe(uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.fail_checkout_order_from_stripe(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_checkout_order_snapshot(p_idempotency_key text, p_user_id uuid, p_cart_id uuid, p_customer_email text, p_currency text, p_merchandise_subtotal_cents integer, p_discount_cents integer, p_shipping_cents integer, p_tax_cents integer, p_total_cents integer, p_referral_code text, p_reward_points_redeemed integer, p_reward_discount_cents integer, p_checkout_environment text, p_metadata jsonb, p_items jsonb)
 RETURNS SETOF orders
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_cart public.carts%rowtype;
  v_order public.orders%rowtype;
  v_item_count integer;
  v_item_total bigint;
  v_existing_items jsonb;
  v_incoming_items jsonb;
begin
  if p_idempotency_key is null
    or p_idempotency_key !~ '^checkout:sandbox:[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'invalid checkout idempotency key';
  end if;
  if p_cart_id is null then
    raise exception using errcode = '22023', message = 'cart id is required';
  end if;
  if p_currency <> 'USD' or p_checkout_environment <> 'sandbox' then
    raise exception using errcode = '22023', message = 'checkout must use sandbox USD';
  end if;
  if p_merchandise_subtotal_cents is null
    or p_discount_cents is null
    or p_shipping_cents is null
    or p_tax_cents is null
    or p_total_cents is null
    or p_reward_points_redeemed is null
    or p_reward_discount_cents is null
    or p_merchandise_subtotal_cents < 0
    or p_discount_cents < 0
    or p_shipping_cents < 0
    or p_tax_cents < 0
    or p_total_cents < 0
    or p_reward_points_redeemed < 0
    or p_reward_discount_cents < 0
    or p_reward_discount_cents > p_discount_cents
  then
    raise exception using errcode = '22023', message = 'checkout amounts must be valid nonnegative cents';
  end if;
  if p_total_cents <> greatest(
    0,
    p_merchandise_subtotal_cents - p_discount_cents
  ) + p_shipping_cents + p_tax_cents then
    raise exception using errcode = '22023', message = 'checkout total does not match components';
  end if;
  if p_items is null
    or pg_catalog.jsonb_typeof(p_items) <> 'array'
    or pg_catalog.jsonb_array_length(p_items) < 1
    or pg_catalog.jsonb_array_length(p_items) > 100
  then
    raise exception using errcode = '22023', message = 'checkout items must be a nonempty bounded array';
  end if;

  select c.*
  into v_cart
  from public.carts as c
  where c.id = p_cart_id
    and c.status = 'active'
  for share;
  if not found
    or v_cart.user_id is distinct from p_user_id
    or (v_cart.user_id is null and v_cart.expires_at <= pg_catalog.now())
  then
    raise exception using errcode = 'P0002', message = 'active checkout cart not found';
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(item.line_subtotal_cents), 0),
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'product_id', item.product_id,
        'product_slug', item.product_slug,
        'product_name', item.product_name,
        'variant_key', item.variant_key,
        'variant_label', item.variant_label,
        'unit_price_cents', item.unit_price_cents,
        'quantity', item.quantity,
        'line_subtotal_cents', item.line_subtotal_cents,
        'product_snapshot', item.product_snapshot
      ) order by item.product_id::text, item.variant_key
    )
  into v_item_count, v_item_total, v_incoming_items
  from pg_catalog.jsonb_to_recordset(p_items) as item(
    product_id uuid,
    product_slug text,
    product_name text,
    variant_key text,
    variant_label text,
    unit_price_cents integer,
    quantity integer,
    line_subtotal_cents integer,
    product_snapshot jsonb
  );

  if v_item_count <> pg_catalog.jsonb_array_length(p_items) then
    raise exception using errcode = '22023', message = 'every checkout item must be an object';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_items) as item(
      product_id uuid,
      product_slug text,
      product_name text,
      variant_key text,
      variant_label text,
      unit_price_cents integer,
      quantity integer,
      line_subtotal_cents integer,
      product_snapshot jsonb
    )
    where item.product_id is null
      or item.product_slug is null
      or pg_catalog.char_length(item.product_slug) = 0
      or item.product_name is null
      or pg_catalog.char_length(item.product_name) = 0
      or item.variant_key is null
      or pg_catalog.char_length(item.variant_key) = 0
      or item.variant_label is null
      or pg_catalog.char_length(item.variant_label) = 0
      or item.unit_price_cents is null
      or item.unit_price_cents < 0
      or item.quantity is null
      or item.quantity < 1
      or item.quantity > 99
      or item.line_subtotal_cents is null
      or item.line_subtotal_cents <> item.unit_price_cents * item.quantity
      or item.product_snapshot is null
      or pg_catalog.jsonb_typeof(item.product_snapshot) <> 'object'
  ) then
    raise exception using errcode = '22023', message = 'order item snapshot is invalid';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_items) as item(
      product_id uuid,
      variant_key text
    )
    group by item.product_id, item.variant_key
    having pg_catalog.count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'duplicate order item snapshot';
  end if;
  if v_item_total <> p_merchandise_subtotal_cents then
    raise exception using errcode = '22023', message = 'order item totals do not match merchandise subtotal';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('checkout:' || p_idempotency_key, 0)
  );

  select o.*
  into v_order
  from public.orders as o
  where o.idempotency_key = p_idempotency_key
  for update;

  if found then
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'product_id', oi.product_id,
        'product_slug', oi.product_slug,
        'product_name', oi.product_name,
        'variant_key', oi.variant_key,
        'variant_label', oi.variant_label,
        'unit_price_cents', oi.unit_price_cents,
        'quantity', oi.quantity,
        'line_subtotal_cents', oi.line_subtotal_cents,
        'product_snapshot', oi.product_snapshot
      ) order by oi.product_id::text, oi.variant_key
    )
    into v_existing_items
    from public.order_items as oi
    where oi.order_id = v_order.id;

    if v_order.user_id is distinct from p_user_id
      or v_order.cart_id is distinct from p_cart_id
      or v_order.currency <> p_currency
      or v_order.customer_email is distinct from p_customer_email
      or v_order.merchandise_subtotal_cents <> p_merchandise_subtotal_cents
      or v_order.discount_cents <> p_discount_cents
      or v_order.shipping_cents <> p_shipping_cents
      or v_order.tax_cents <> p_tax_cents
      or v_order.total_cents <> p_total_cents
      or v_order.referral_code is distinct from p_referral_code
      or v_order.reward_points_redeemed <> p_reward_points_redeemed
      or v_order.reward_discount_cents <> p_reward_discount_cents
      or v_order.checkout_environment::text <> p_checkout_environment
      or v_order.metadata is distinct from coalesce(p_metadata, '{}'::jsonb)
      or v_existing_items is distinct from v_incoming_items
    then
      raise exception using errcode = '23505', message = 'checkout idempotency key snapshot mismatch';
    end if;

    if v_order.status in ('cancelled', 'payment_failed') then
      update public.orders
      set status = 'pending_payment', cancelled_at = null, updated_at = pg_catalog.now()
      where id = v_order.id
      returning * into v_order;
    end if;

    return next v_order;
    return;
  end if;

  insert into public.orders (
    order_number,
    user_id,
    cart_id,
    status,
    checkout_environment,
    currency,
    customer_email,
    merchandise_subtotal_cents,
    discount_cents,
    shipping_cents,
    tax_cents,
    total_cents,
    referral_code,
    reward_points_redeemed,
    reward_discount_cents,
    metadata,
    idempotency_key
  )
  values (
    'MP-' || pg_catalog.upper(pg_catalog.substr(p_idempotency_key, 18, 12)),
    p_user_id,
    p_cart_id,
    'pending_payment',
    p_checkout_environment::public.checkout_environment,
    p_currency,
    p_customer_email,
    p_merchandise_subtotal_cents,
    p_discount_cents,
    p_shipping_cents,
    p_tax_cents,
    p_total_cents,
    p_referral_code,
    p_reward_points_redeemed,
    p_reward_discount_cents,
    coalesce(p_metadata, '{}'::jsonb),
    p_idempotency_key
  )
  returning * into v_order;

  insert into public.order_items (
    order_id,
    product_id,
    product_slug,
    product_name,
    variant_key,
    variant_label,
    unit_price_cents,
    quantity,
    line_subtotal_cents,
    product_snapshot
  )
  select
    v_order.id,
    item.product_id,
    item.product_slug,
    item.product_name,
    item.variant_key,
    item.variant_label,
    item.unit_price_cents,
    item.quantity,
    item.line_subtotal_cents,
    item.product_snapshot
  from pg_catalog.jsonb_to_recordset(p_items) as item(
    product_id uuid,
    product_slug text,
    product_name text,
    variant_key text,
    variant_label text,
    unit_price_cents integer,
    quantity integer,
    line_subtotal_cents integer,
    product_snapshot jsonb
  );

  return next v_order;
end;
$function$
;

REVOKE ALL ON FUNCTION public.reserve_checkout_order_snapshot(text,uuid,uuid,text,text,integer,integer,integer,integer,integer,text,integer,integer,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.reserve_checkout_order_snapshot(text,uuid,uuid,text,text,integer,integer,integer,integer,integer,text,integer,integer,text,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_checkout_order_snapshot_v2(p_idempotency_key text, p_user_id uuid, p_cart_id uuid, p_checkout_generation uuid, p_customer_email text, p_currency text, p_merchandise_subtotal_cents integer, p_discount_cents integer, p_shipping_cents integer, p_tax_cents integer, p_total_cents integer, p_referral_code text, p_reward_points_redeemed integer, p_reward_discount_cents integer, p_checkout_environment text, p_metadata jsonb, p_items jsonb)
 RETURNS SETOF orders
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_cart public.carts%rowtype;
  v_order public.orders%rowtype;
begin
  if p_checkout_generation is null then
    raise exception using errcode = '22023', message = 'checkout generation is required';
  end if;
  if p_items is null
    or pg_catalog.jsonb_typeof(p_items) <> 'array'
    or pg_catalog.jsonb_array_length(p_items) = 0
  then
    raise exception using errcode = '22023', message = 'checkout items must be a non-empty array';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'checkout-cart:' || p_cart_id::text || ':' || p_checkout_generation::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('checkout:' || p_idempotency_key, 0)
  );

  select o.*
  into v_order
  from public.orders as o
  where o.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_order.user_id is distinct from p_user_id
      or v_order.cart_id is distinct from p_cart_id
      or v_order.checkout_generation is distinct from p_checkout_generation
      or v_order.currency <> p_currency
      or v_order.customer_email is distinct from p_customer_email
      or v_order.merchandise_subtotal_cents <> p_merchandise_subtotal_cents
      or v_order.discount_cents <> p_discount_cents
      or v_order.shipping_cents <> p_shipping_cents
      or v_order.tax_cents <> p_tax_cents
      or v_order.total_cents <> p_total_cents
      or v_order.referral_code is distinct from p_referral_code
      or v_order.reward_points_redeemed <> p_reward_points_redeemed
      or v_order.reward_discount_cents <> p_reward_discount_cents
      or v_order.checkout_environment::text <> p_checkout_environment
    then
      raise exception using errcode = '23505', message = 'checkout idempotency key snapshot mismatch';
    end if;

    return next v_order;
    return;
  end if;

  select c.*
  into v_cart
  from public.carts as c
  where c.id = p_cart_id
    and c.status = 'active'
  for share;
  if not found
    or v_cart.user_id is distinct from p_user_id
    or v_cart.checkout_generation is distinct from p_checkout_generation
    or (v_cart.user_id is null and v_cart.expires_at <= pg_catalog.now())
  then
    raise exception using errcode = 'P0001', message = 'checkout cart changed';
  end if;

  if exists (
    select 1
    from public.orders as o
    where o.cart_id = p_cart_id
      and o.checkout_generation = p_checkout_generation
  ) then
    raise exception using errcode = 'P0001', message = 'checkout already reserved for cart generation';
  end if;

  if (
    select pg_catalog.count(*)
    from public.cart_items as ci
    where ci.cart_id = p_cart_id
  ) <> pg_catalog.jsonb_array_length(p_items)
  or exists (
    select 1
    from public.cart_items as ci
    left join public.products as p on p.id = ci.product_id
    left join public.product_variants as pv
      on pv.product_id = ci.product_id
     and pv.variant_key = ci.variant_key
    where ci.cart_id = p_cart_id
      and (
        p.id is null
        or pv.product_id is null
        or p.catalog_status is distinct from 'active'
        or p.status is distinct from 'available'
        or pv.available is distinct from true
        or pv.inventory_status in ('out_of_stock', 'unavailable')
        or not exists (
          select 1
          from pg_catalog.jsonb_to_recordset(p_items) as incoming_line(
            product_id uuid,
            variant_key text,
            quantity integer,
            unit_price_cents integer
          )
          where incoming_line.product_id = ci.product_id
            and incoming_line.variant_key = ci.variant_key
            and incoming_line.quantity = ci.quantity
            and incoming_line.unit_price_cents = pv.price_cents
        )
      )
  ) then
    raise exception using errcode = 'P0001', message = 'checkout cart changed';
  end if;

  select *
  into v_order
  from public.reserve_checkout_order_snapshot(
    p_idempotency_key,
    p_user_id,
    p_cart_id,
    p_customer_email,
    p_currency,
    p_merchandise_subtotal_cents,
    p_discount_cents,
    p_shipping_cents,
    p_tax_cents,
    p_total_cents,
    p_referral_code,
    p_reward_points_redeemed,
    p_reward_discount_cents,
    p_checkout_environment,
    p_metadata,
    p_items
  );

  update public.orders
  set checkout_generation = p_checkout_generation
  where id = v_order.id
  returning * into v_order;

  return next v_order;
end;
$function$
;

REVOKE ALL ON FUNCTION public.reserve_checkout_order_snapshot_v2(text,uuid,uuid,uuid,text,text,integer,integer,integer,integer,integer,text,integer,integer,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.reserve_checkout_order_snapshot_v2(text,uuid,uuid,uuid,text,text,integer,integer,integer,integer,integer,text,integer,integer,text,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.rotate_cart_checkout_generation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_cart_id uuid;
begin
  v_cart_id := case when tg_op = 'DELETE' then old.cart_id else new.cart_id end;

  update public.carts
  set checkout_generation = extensions.gen_random_uuid(),
      updated_at = pg_catalog.now()
  where id = v_cart_id;

  if tg_op = 'UPDATE' and old.cart_id is distinct from new.cart_id then
    update public.carts
    set checkout_generation = extensions.gen_random_uuid(),
        updated_at = pg_catalog.now()
    where id = old.cart_id;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$
;

REVOKE ALL ON FUNCTION public.rotate_cart_checkout_generation() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.rotate_cart_checkout_generation() TO service_role;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;

CREATE TRIGGER product_variants_set_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER cart_items_rotate_checkout_generation AFTER INSERT OR DELETE OR UPDATE ON cart_items FOR EACH ROW EXECUTE FUNCTION rotate_cart_checkout_generation();

CREATE TRIGGER cart_items_set_updated_at BEFORE UPDATE ON cart_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER carts_set_updated_at BEFORE UPDATE ON carts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER payment_attempts_set_updated_at BEFORE UPDATE ON payment_attempts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER referral_attributions_set_updated_at BEFORE UPDATE ON referral_attributions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER referral_codes_set_updated_at BEFORE UPDATE ON referral_codes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER rewards_accounts_set_updated_at BEFORE UPDATE ON rewards_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

SET check_function_bodies = true;
GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;
