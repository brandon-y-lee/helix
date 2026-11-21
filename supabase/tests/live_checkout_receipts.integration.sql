-- Executed only against the disposable checkout fixture with pg_temp.seed_live_checkout.
BEGIN;
CREATE FUNCTION pg_temp.receipt_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('59100000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.assert_receipt(value boolean, assertion text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Live receipt: %',assertion; END IF;
END $$;
SELECT pg_temp.seed_live_checkout('acct_591ReceiptA',pg_temp.receipt_id(1),pg_temp.receipt_id(101));
SELECT pg_temp.seed_live_checkout('acct_591ReceiptA',pg_temp.receipt_id(2),NULL,repeat('a',64));
SELECT pg_temp.seed_live_checkout('acct_591ReceiptB',pg_temp.receipt_id(3),pg_temp.receipt_id(101));
SELECT pg_temp.seed_live_checkout('acct_591ReceiptA',pg_temp.receipt_id(4),pg_temp.receipt_id(102));
SELECT pg_temp.seed_live_checkout('acct_591ReceiptA',pg_temp.receipt_id(5),pg_temp.receipt_id(101));

INSERT INTO public.orders(id,order_number,user_id,merchandise_subtotal_cents,total_cents,idempotency_key)
VALUES (pg_temp.receipt_id(6),'HX-591-SANDBOX',pg_temp.receipt_id(101),1200,1200,'591-receipt-sandbox');
INSERT INTO public.order_items(order_id,product_slug,product_name,variant_key,variant_label,unit_price_cents,quantity,line_subtotal_cents)
VALUES (pg_temp.receipt_id(6),'synthetic-receipt','Fixture','base','Fixture size',1200,1,1200);
INSERT INTO public.payment_attempts(order_id,amount_cents,idempotency_key)
VALUES (pg_temp.receipt_id(6),1200,'591-receipt-sandbox-attempt');

DO $receipt_tests$
DECLARE
  merchant CONSTANT text := 'acct_591ReceiptA';
  owner_id CONSTANT uuid := pg_temp.receipt_id(101);
  other_id CONSTANT uuid := pg_temp.receipt_id(102);
  owned CONSTANT uuid := pg_temp.receipt_id(1);
  guest CONSTANT uuid := pg_temp.receipt_id(2);
  owned_session CONSTANT text := 'cs_live_' || replace(owned::text,'-','');
  guest_session CONSTANT text := 'cs_live_' || replace(guest::text,'-','');
  receipt_hash CONSTANT text := repeat('a',64);
  receipt jsonb;
  history jsonb;
  second_page jsonb;
  first_row jsonb;
  fields CONSTANT text[] := ARRAY['orderId','orderNumber','status','createdAt','currency','merchandiseSubtotalCents',
    'discountCents','shippingCents','taxCents','totalCents','refundedCents','items'];
  item_fields CONSTANT text[] := ARRAY['productName','variantLabel','quantity','unitPriceCents','lineSubtotalCents'];
  summary_fields CONSTANT text[] := ARRAY['orderId','orderNumber','status','createdAt','currency','totalCents','refundedCents'];
BEGIN
  receipt := public.read_live_checkout_receipt(merchant,NULL,owned_session,owner_id,NULL);
  PERFORM pg_temp.assert_receipt(receipt ?& fields AND receipt-fields='{}'::jsonb
    AND receipt->>'orderId'=owned::text AND receipt->>'currency'='USD'
    AND (receipt->>'totalCents')::integer=(SELECT total_cents FROM public.orders WHERE id=owned),
    'the verified owner receives only receipt fields for the exact Session');
  PERFORM pg_temp.assert_receipt(jsonb_array_length(receipt->'items')>0
    AND NOT EXISTS (SELECT FROM jsonb_array_elements(receipt->'items') i WHERE NOT(i ?& item_fields) OR i-item_fields<>'{}'::jsonb),
    'line items expose only receipt snapshots');
  PERFORM pg_temp.assert_receipt(public.read_live_checkout_receipt(merchant,owned,NULL,owner_id,NULL)=receipt,
    'selecting the same bound Order by ID returns the same owner projection');
  PERFORM pg_temp.assert_receipt(
    public.read_live_checkout_receipt(merchant,owned,owned_session,other_id,receipt_hash) IS NULL
    AND public.read_live_checkout_receipt(merchant,NULL,owned_session,NULL,NULL) IS NULL
    AND public.read_live_checkout_receipt(merchant,NULL,NULL,owner_id,NULL) IS NULL
    AND public.read_live_checkout_receipt(merchant,owned,guest_session,owner_id,NULL) IS NULL
    AND public.read_live_checkout_receipt('acct_591ReceiptB',owned,owned_session,owner_id,NULL) IS NULL
    AND public.read_live_checkout_receipt(merchant,pg_temp.receipt_id(6),NULL,owner_id,NULL) IS NULL,
    'a Session alone, another owner, mismatched selectors, merchant or sandbox Order reveals nothing');
  PERFORM pg_temp.assert_receipt(
    public.authorize_live_checkout_receipt(merchant,guest,guest_session,NULL,receipt_hash)
    AND public.read_live_checkout_receipt(merchant,NULL,guest_session,NULL,receipt_hash)->>'orderId'=guest::text
    AND NOT public.authorize_live_checkout_receipt(merchant,guest,guest_session,NULL,NULL)
    AND NOT public.authorize_live_checkout_receipt(merchant,guest,guest_session,owner_id,NULL)
    AND NOT public.authorize_live_checkout_receipt(merchant,owned,owned_session,NULL,receipt_hash)
    AND NOT public.authorize_live_checkout_receipt('acct_591ReceiptB',guest,guest_session,NULL,receipt_hash),
    'a current guest grant is confined to the bound guest Order and merchant');

  history := public.read_live_checkout_order_history(merchant,owner_id,10,NULL,NULL);
  first_row := history->0;
  PERFORM pg_temp.assert_receipt(jsonb_array_length(history)=2
    AND (SELECT array_agg((e->>'orderId')::uuid ORDER BY ordinal)
      FROM jsonb_array_elements(history) WITH ORDINALITY h(e,ordinal))
      =(SELECT array_agg(id ORDER BY created_at DESC,id DESC) FROM public.orders WHERE id IN (owned,pg_temp.receipt_id(5)))
    AND NOT EXISTS (SELECT FROM jsonb_array_elements(history) e WHERE NOT(e ?& summary_fields) OR e-summary_fields<>'{}'::jsonb),
    'history permits only this verified owner, merchant and live dataset in canonical order');
  second_page := public.read_live_checkout_order_history(merchant,owner_id,1,(first_row->>'createdAt')::timestamptz,
    (first_row->>'orderId')::uuid);
  PERFORM pg_temp.assert_receipt(public.read_live_checkout_order_history(merchant,owner_id,1,NULL,NULL)=jsonb_build_array(first_row)
    AND second_page=jsonb_build_array(history->1) AND public.read_live_checkout_order_history(merchant,NULL,10,NULL,NULL)='[]'
    AND public.read_live_checkout_order_history(merchant,owner_id,10,NULL,owned)='[]'
    AND public.read_live_checkout_order_history(merchant,owner_id,51,NULL,NULL)='[]',
    'bounded pages never repeat the cursor or accept unauthenticated/incomplete inputs');
  PERFORM pg_temp.assert_receipt(NOT EXISTS (
    SELECT FROM (VALUES ('public.authorize_live_checkout_receipt(text,uuid,text,uuid,text)'::regprocedure),
      ('public.read_live_checkout_receipt(text,uuid,text,uuid,text)'::regprocedure),
      ('public.read_live_checkout_order_history(text,uuid,integer,timestamptz,uuid)'::regprocedure)) f(fn)
    WHERE has_function_privilege('anon',fn,'EXECUTE') OR has_function_privilege('authenticated',fn,'EXECUTE')
      OR NOT has_function_privilege('service_role',fn,'EXECUTE')), 'the public RPCs are service-only');
END;
$receipt_tests$;

SET LOCAL ROLE service_role;
DO $service$
DECLARE owner_id CONSTANT uuid := '59100000-0000-4000-8000-000000000101';
  owned CONSTANT uuid := '59100000-0000-4000-8000-000000000001';
BEGIN
  IF public.read_live_checkout_receipt('acct_591ReceiptA',owned,NULL,owner_id,NULL)->>'orderId'
      IS DISTINCT FROM owned::text
    OR NOT public.authorize_live_checkout_receipt('acct_591ReceiptA',owned,NULL,owner_id,NULL)
    OR jsonb_array_length(public.read_live_checkout_order_history('acct_591ReceiptA',owner_id,10,NULL,NULL))<>2 THEN
    RAISE EXCEPTION 'The application service role must be able to use the exact public RPC entry points';
  END IF;
END;
$service$;
RESET ROLE;

-- Exercise the real authenticated RLS, including dependent Order items and payment attempts.
SELECT set_config('request.jwt.claim.sub',pg_temp.receipt_id(101)::text,true);
SET LOCAL ROLE authenticated;
DO $rls$
DECLARE sandbox_order CONSTANT uuid := '59100000-0000-4000-8000-000000000006';
  live_order CONSTANT uuid := '59100000-0000-4000-8000-000000000001';
BEGIN
  IF EXISTS (SELECT FROM public.orders WHERE id=live_order)
    OR EXISTS (SELECT FROM public.order_items WHERE order_id=live_order)
    OR EXISTS (SELECT FROM public.payment_attempts WHERE order_id=live_order)
    OR NOT EXISTS (SELECT FROM public.orders WHERE id=sandbox_order)
    OR NOT EXISTS (SELECT FROM public.order_items WHERE order_id=sandbox_order)
    OR NOT EXISTS (SELECT FROM public.payment_attempts WHERE order_id=sandbox_order) THEN
    RAISE EXCEPTION 'Authenticated sandbox projections must preserve owned sandbox rows and hide live rows';
  END IF;
END;
$rls$;
RESET ROLE;

-- The capability expires independently of ownership. An earlier owner or guest
-- grant cannot regain access by moving the Order through another account.
DO $immutable$
DECLARE accepted boolean;
BEGIN
  FOR iteration IN 1..3 LOOP
    accepted := false;
    BEGIN
      UPDATE private.live_checkout_bindings SET
        receipt_hash=CASE WHEN iteration=1 THEN repeat('c',64) ELSE receipt_hash END,
        receipt_ownership_version=receipt_ownership_version + CASE WHEN iteration=2 THEN 1 ELSE 0 END,
        receipt_expires_at=receipt_expires_at + CASE WHEN iteration=3 THEN interval '1 second' ELSE interval '0' END
        WHERE order_id=pg_temp.receipt_id(2);
      accepted := found;
    EXCEPTION WHEN raise_exception OR check_violation THEN NULL;
    END;
    IF accepted THEN RAISE EXCEPTION 'A fixed guest receipt allowed substitution or deadline extension'; END IF;
  END LOOP;
END;
$immutable$;
SAVEPOINT before_expiry;
UPDATE private.live_checkout_bindings SET receipt_expires_at=statement_timestamp() WHERE order_id=pg_temp.receipt_id(2);
SELECT pg_temp.assert_receipt(public.read_live_checkout_receipt('acct_591ReceiptA',pg_temp.receipt_id(2),NULL,NULL,repeat('a',64)) IS NULL,
  'an expired grant cannot disclose the receipt');
ROLLBACK TO before_expiry;
UPDATE public.orders SET user_id=pg_temp.receipt_id(102) WHERE id=pg_temp.receipt_id(2);
SELECT pg_temp.assert_receipt(NOT public.authorize_live_checkout_receipt('acct_591ReceiptA',pg_temp.receipt_id(2),NULL,NULL,repeat('a',64)),
  'guest access is revoked immediately when the Order acquires an authenticated owner');
UPDATE public.orders SET user_id=NULL WHERE id=pg_temp.receipt_id(2);
SELECT pg_temp.assert_receipt(NOT public.authorize_live_checkout_receipt('acct_591ReceiptA',pg_temp.receipt_id(2),NULL,NULL,repeat('a',64)),
  'a rebuilt guest ownership generation cannot use the original receipt');
INSERT INTO public.carts(id,guest_token_hash,expires_at) VALUES (pg_temp.receipt_id(201),repeat('b',64),now()+interval '1 day');
UPDATE public.orders SET cart_id=pg_temp.receipt_id(201) WHERE id=pg_temp.receipt_id(2);
SELECT pg_temp.assert_receipt(NOT public.authorize_live_checkout_receipt('acct_591ReceiptA',pg_temp.receipt_id(2),NULL,NULL,repeat('b',64)),
  'the actual historical guest-cart hash cannot authorize a live receipt');
ROLLBACK;
