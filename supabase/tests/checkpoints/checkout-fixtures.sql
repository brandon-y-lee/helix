-- Synthetic inputs only; none of these identities belong to the approved project.
CREATE SCHEMA checkout_test;
CREATE FUNCTION checkout_test.assert(ok boolean, description text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', description; END IF;
END $$;

INSERT INTO public.system_steps VALUES ('CLEANSE', 1, 'core');
INSERT INTO public.products (
  id, slug, display_name, product_type, swatch_from, swatch_to, sort_order,
  editorial_description, editorial_how_to_use, routine_group, routine_sort, system_step_name
) VALUES (
  'a6000000-0000-4000-8000-000000000001', 'checkout-fixture', 'Checkout fixture',
  'Cleanser', '#ffffff', '#ffffff', 1, 'Synthetic description', 'Synthetic guidance',
  'core', 1, 'CLEANSE'
);
INSERT INTO public.product_variants (product_id, variant_key, label, price_cents, sort_order)
VALUES ('a6000000-0000-4000-8000-000000000001', 'standard', 'Standard', 1000, 1);
INSERT INTO public.carts (id, guest_token_hash, expires_at)
SELECT ('a6000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  repeat(n::text,64), now() + interval '1 day'
FROM generate_series(11,14) n;
INSERT INTO public.cart_items (cart_id, product_id, variant_key, quantity)
SELECT id, 'a6000000-0000-4000-8000-000000000001', 'standard', 1 FROM public.carts;

CREATE FUNCTION checkout_test.reserve(key_letter text, cart_suffix integer)
RETURNS SETOF public.orders LANGUAGE sql AS $$
  SELECT * FROM public.reserve_checkout_order_snapshot_v2(
    'checkout:sandbox:' || repeat(key_letter,64), null,
    ('a6000000-0000-4000-8000-' || lpad(cart_suffix::text,12,'0'))::uuid,
    (SELECT checkout_generation FROM public.carts WHERE id =
      ('a6000000-0000-4000-8000-' || lpad(cart_suffix::text,12,'0'))::uuid),
    null, 'USD', 1000, 0, 0, 0, 1000, null, 0, 0, 'sandbox',
    '{"fixture":"checkout-contract"}'::jsonb,
    '[{"product_id":"a6000000-0000-4000-8000-000000000001","product_slug":"checkout-fixture","product_name":"Checkout fixture","variant_key":"standard","variant_label":"Standard","quantity":1,"unit_price_cents":1000,"line_subtotal_cents":1000,"product_snapshot":{"fixture":true}}]'::jsonb
  );
$$;
GRANT USAGE ON SCHEMA checkout_test TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA checkout_test TO service_role;

SET ROLE service_role;
SELECT checkout_test.assert((SELECT order_number = 'MP-AAAAAAAAAAAA' FROM checkout_test.reserve('a',11)),
  'the captured predecessor actually generates the historical number');
RESET ROLE;
CREATE TABLE checkout_test.historical_order AS
  SELECT to_jsonb(o) AS snapshot FROM public.orders o;
CREATE TABLE checkout_test.historical_items AS
  SELECT to_jsonb(i) AS snapshot FROM public.order_items i;
CREATE TABLE checkout_test.unchanged_functions AS
  SELECT oid::regprocedure::text AS signature, prosrc, proacl, proconfig, prosecdef
  FROM pg_proc WHERE oid IN (
    'public.reserve_checkout_order_snapshot_v2(text,uuid,uuid,uuid,text,text,integer,integer,integer,integer,integer,text,integer,integer,text,jsonb,jsonb)'::regprocedure,
    'public.fail_checkout_order_from_stripe(uuid,text,text)'::regprocedure
  );
