-- Run in the disposable first-order transaction after actual admission fixtures.
CREATE TEMP TABLE first_order_test_ids(purpose text PRIMARY KEY,order_id uuid NOT NULL UNIQUE);
DO $access$
DECLARE
  app_role text;
  tab text;
  routine regprocedure;
BEGIN
  FOREACH app_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    FOREACH tab IN ARRAY ARRAY['private.live_checkout_stock_reservations','private.live_checkout_sale_policy'] LOOP
      IF has_table_privilege(app_role,tab,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege(app_role,tab,'SELECT,INSERT,UPDATE,REFERENCES')
        THEN RAISE EXCEPTION 'Unexpected stock table access for %',app_role; END IF;
    END LOOP;
    FOREACH routine IN ARRAY ARRAY['private.reserve_live_checkout_stock(text,uuid,uuid,uuid,integer)'::regprocedure,
      'private.release_unsent_live_checkout_stock(text,uuid,uuid)'::regprocedure,
      'private.settle_first_order_stock()'::regprocedure,'private.guard_first_order_policy()'::regprocedure] LOOP
      IF has_function_privilege(app_role,routine,'EXECUTE') THEN RAISE EXCEPTION 'Unexpected stock function access for %',app_role; END IF;
    END LOOP;
  END LOOP;
  BEGIN
    UPDATE private.live_checkout_sale_policy SET account_id='acct_OtherIssuer';
    RAISE EXCEPTION 'Changed enrolled issuer';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'An enrolled first-order issuer and SKU are immutable' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM private.live_checkout_sale_policy;
    RAISE EXCEPTION 'Removed enrolled issuer with active sale policy';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'An enrolled first-order policy is retained' THEN RAISE; END IF;
  END;
END;
$access$;
CREATE FUNCTION pg_temp.prove_first_order_stock(purpose text, qty integer) RETURNS void LANGUAGE plpgsql AS $proof$
DECLARE
  baseline integer;
  r private.live_checkout_stock_reservations;
  b private.live_checkout_bindings;
  o public.orders;
  expected_state text;
  expected_units integer;
  session_id_ text;
  intent_id text;
  facts jsonb;
  outcome text;
  replay text;
  current_generation uuid;
  retry_order uuid;
  retry_binding private.live_checkout_bindings;
  paused_cart jsonb;
BEGIN
  SELECT allocated_units INTO STRICT baseline FROM private.live_checkout_sale_policy WHERE singleton;
  INSERT INTO pg_temp.first_order_test_ids VALUES (purpose,pg_temp.open_test_first_order(purpose,qty))
    RETURNING order_id INTO o.id;
  SELECT * INTO STRICT o FROM public.orders WHERE id=o.id;
  SELECT * INTO STRICT r FROM private.live_checkout_stock_reservations WHERE order_id=o.id;
  SELECT * INTO STRICT b FROM private.live_checkout_bindings WHERE order_id=o.id;
  IF (r.state,r.quantity,r.attempt_id,r.account_id,r.provider_environment) IS DISTINCT FROM
    ('held',qty,b.attempt_id,b.account_id,o.checkout_environment::text)
    OR b.first_send_at IS NOT NULL OR b.session_id IS NOT NULL
    OR (SELECT allocated_units FROM private.live_checkout_sale_policy)<>baseline+qty THEN
    RAISE EXCEPTION 'The issued Order did not hold its exact units and issuer';
  END IF;
  IF NOT private.reserve_live_checkout_stock(b.account_id,o.id,b.attempt_id,r.variant_id,qty)
     OR private.reserve_live_checkout_stock(b.account_id,o.id,b.attempt_id,r.variant_id,qty+1)
     OR private.reserve_live_checkout_stock('acct_Unrelated',o.id,b.attempt_id,r.variant_id,qty)
     OR (SELECT allocated_units FROM private.live_checkout_sale_policy)<>baseline+qty THEN
    RAISE EXCEPTION 'Stock replay changed its immutable allocation';
  END IF;
  IF purpose='pending' THEN RETURN; END IF;
  BEGIN
    UPDATE public.orders SET status='cancelled' WHERE id=o.id;
    RAISE EXCEPTION 'Unverified cancellation released held stock';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'First-order terminal status requires matching payment evidence' THEN RAISE; END IF;
  END;
  session_id_:=CASE WHEN r.provider_environment='live' THEN 'cs_live_' ELSE 'cs_test_' END||replace(o.id::text,'-','');
  intent_id:='pi_'||replace(o.id::text,'-','');
  SET LOCAL ROLE service_role;
  IF purpose='unsent' THEN
    IF NOT public.release_unsent_business_checkout(r.provider_environment,b.account_id,o.id,b.attempt_id,b.binding_nonce)
      OR public.release_unsent_business_checkout(r.provider_environment,b.account_id,o.id,b.attempt_id,b.binding_nonce)
      THEN RAISE EXCEPTION 'A definitely unsent Order must release stock exactly once'; END IF;
    expected_state:='released';
    expected_units:=baseline;
  ELSE
    IF public.start_business_checkout_send(r.provider_environment,b.account_id,o.id,b.attempt_id,b.binding_nonce)->>'state'
       IS DISTINCT FROM 'send' THEN RAISE EXCEPTION 'Could not start a synthetic provider send'; END IF;
    IF public.release_unsent_business_checkout(r.provider_environment,b.account_id,o.id,b.attempt_id,b.binding_nonce)
      OR public.record_business_checkout_unpaid(r.provider_environment,b.account_id,o.id,b.attempt_id,session_id_,'expired') IS DISTINCT FROM 'unmatched'
      THEN RAISE EXCEPTION 'An ambiguous provider send released stock'; END IF;
    IF purpose='uncertain' THEN
      RESET ROLE;
      UPDATE public.carts SET expires_at=clock_timestamp()-interval '1 minute' WHERE id=o.cart_id;
      UPDATE private.live_checkout_bindings SET receipt_expires_at=clock_timestamp()-interval '1 minute'
        WHERE attempt_id=b.attempt_id;
      SET LOCAL ROLE service_role;
      IF public.release_unsent_business_checkout(r.provider_environment,b.account_id,o.id,b.attempt_id,b.binding_nonce)
        THEN RAISE EXCEPTION 'An elapsed receipt or cart lifetime authorized inventory release'; END IF;
      RESET ROLE;
      IF (SELECT state FROM private.live_checkout_stock_reservations WHERE order_id=o.id) IS DISTINCT FROM 'held'
        OR (SELECT allocated_units FROM private.live_checkout_sale_policy) IS DISTINCT FROM baseline+qty
        OR (SELECT checkout_generation FROM public.carts WHERE id=o.cart_id) IS DISTINCT FROM o.checkout_generation
        THEN RAISE EXCEPTION 'A send with an unknown provider outcome lost stock or its cart generation'; END IF;
      RETURN;
    END IF;
    IF NOT public.bind_recovered_business_checkout_session(r.provider_environment,b.account_id,o.id,b.attempt_id,session_id_,b.binding_nonce)
      THEN RAISE EXCEPTION 'Could not bind the synthetic provider Session'; END IF;
    IF purpose='paid_paused' THEN
      RESET ROLE;
      paused_cart:=pg_temp.make_test_first_cart('pause_new_cart',1);
      UPDATE private.live_checkout_sale_policy SET enabled=false WHERE singleton;
      SET LOCAL ROLE service_role;
      IF pg_temp.prepare_test_first_cart(paused_cart)->>'state' IS DISTINCT FROM 'closed'
        THEN RAISE EXCEPTION 'A closed policy admitted a new cart'; END IF;
    END IF;
    IF purpose IN ('paid_edited','paid_new_owner') THEN
      RESET ROLE;
      IF purpose='paid_edited' THEN
        UPDATE public.cart_items SET quantity=qty+1 WHERE cart_id=o.cart_id;
      ELSE
        UPDATE public.carts SET guest_token_hash=encode(sha256(convert_to('replacement owner','UTF8')),'hex') WHERE id=o.cart_id;
      END IF;
      SELECT checkout_generation INTO STRICT current_generation FROM public.carts WHERE id=o.cart_id;
      SET LOCAL ROLE service_role;
    END IF;
    IF purpose IN ('failed','expired') THEN
      outcome:=public.record_business_checkout_unpaid(r.provider_environment,b.account_id,o.id,b.attempt_id,session_id_,purpose);
      replay:=public.record_business_checkout_unpaid(r.provider_environment,b.account_id,o.id,b.attempt_id,session_id_,purpose);
      IF (outcome,replay) IS DISTINCT FROM ('recorded','already_recorded') THEN
        RAISE EXCEPTION 'Verified unpaid outcome or its replay failed: %, %',outcome,replay;
      END IF;
      expected_state:='released';
      expected_units:=baseline;
    ELSE
      facts:=jsonb_build_object('orderId',o.id,'attemptId',b.attempt_id,'sessionId',session_id_,'contractVersion','checkout_v2',
        'paymentIntentId',intent_id,'paymentMethodType','card','customerId',b.terms->'customerId','customerEmail',NULL,
        'currency','USD','merchandiseSubtotalCents',o.merchandise_subtotal_cents,'discountCents',0,'shippingCents',o.shipping_cents,
        'taxCents',0,'totalCents',o.total_cents,'shippingName','Synthetic recipient',
        'shippingAddress',jsonb_build_object('line1','Fixture 1','line2',NULL,'city','Fixture','state','CA',
          'postal_code','90000','country','US'),'billingAddress',NULL,'taxBreakdown','[]'::jsonb);
      outcome:=public.finalize_business_checkout_payment(r.provider_environment,b.account_id,o.id,b.attempt_id,session_id_,facts);
      replay:=public.finalize_business_checkout_payment(r.provider_environment,b.account_id,o.id,b.attempt_id,session_id_,facts);
      IF (outcome,replay) IS DISTINCT FROM ('paid','already_paid') OR
        public.record_business_checkout_unpaid(r.provider_environment,b.account_id,o.id,b.attempt_id,session_id_,'expired') IS DISTINCT FROM 'already_paid'
        THEN RAISE EXCEPTION 'Paid settlement or its replay failed: %, %',outcome,replay; END IF;
      expected_state:='consumed';
      expected_units:=baseline+qty;
      IF purpose='refunded' THEN
        outcome:=public.record_business_checkout_refund(r.provider_environment,b.account_id,intent_id,'ch_inventory',1,'USD');
        replay:=public.record_business_checkout_refund(r.provider_environment,b.account_id,intent_id,'ch_inventory',o.total_cents,'USD');
        IF (outcome,replay) IS DISTINCT FROM ('partial','refunded') OR
          public.record_business_checkout_refund(r.provider_environment,b.account_id,intent_id,'ch_inventory',o.total_cents,'USD')
          IS DISTINCT FROM 'already_recorded' THEN RAISE EXCEPTION 'Refund lifecycle proof failed'; END IF;
      END IF;
    END IF;
  END IF;
  RESET ROLE;
  IF (SELECT state FROM private.live_checkout_stock_reservations WHERE order_id=o.id) IS DISTINCT FROM expected_state OR
     (SELECT allocated_units FROM private.live_checkout_sale_policy) IS DISTINCT FROM expected_units THEN
    RAISE EXCEPTION 'Stock after % disagreed with verified outcome',purpose;
  END IF;
  IF purpose='paid_paused' THEN
    IF (SELECT enabled FROM private.live_checkout_sale_policy) IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'Finalizing a sent order reopened a paused store';
    END IF;
    UPDATE private.live_checkout_sale_policy SET enabled=true WHERE singleton;
  END IF;
  IF purpose IN ('paid','paid_paused','refunded') THEN
    IF EXISTS (SELECT FROM public.cart_items WHERE cart_id=o.cart_id)
      OR (SELECT checkout_generation FROM public.carts WHERE id=o.cart_id)=o.checkout_generation
      THEN RAISE EXCEPTION 'The paid original cart kept its purchased line or generation'; END IF;
  ELSIF purpose IN ('paid_edited','paid_new_owner') THEN
    IF (SELECT checkout_generation FROM public.carts WHERE id=o.cart_id) IS DISTINCT FROM current_generation OR
       (SELECT quantity FROM public.cart_items WHERE cart_id=o.cart_id) IS DISTINCT FROM
         (CASE WHEN purpose='paid_edited' THEN qty+1 ELSE qty END)
      THEN RAISE EXCEPTION 'Financial settlement changed a newer cart or guest owner'; END IF;
  ELSE
    SELECT checkout_generation INTO STRICT current_generation FROM public.carts WHERE id=o.cart_id;
    IF current_generation=o.checkout_generation OR (SELECT quantity FROM public.cart_items WHERE cart_id=o.cart_id) IS DISTINCT FROM qty
      THEN RAISE EXCEPTION 'A definitive unpaid outcome must preserve the cart line in a fresh generation'; END IF;
    SET LOCAL ROLE service_role;
    retry_order:=(public.reserve_business_checkout(r.provider_environment,b.account_id,o.cart_id,current_generation,NULL,
      encode(sha256(convert_to('guest:'||purpose,'UTF8')),'hex'),
      encode(sha256(convert_to('retry receipt:'||current_generation::text,'UTF8')),'hex'))->>'orderId')::uuid;
    RESET ROLE;
    SELECT * INTO STRICT retry_binding FROM private.live_checkout_bindings WHERE order_id=retry_order;
    IF retry_order=o.id THEN RAISE EXCEPTION 'A new cart generation reused a terminal Order'; END IF;
    SET LOCAL ROLE service_role;
    IF NOT public.release_unsent_business_checkout(r.provider_environment,b.account_id,retry_order,
      retry_binding.attempt_id,retry_binding.binding_nonce) THEN RAISE EXCEPTION 'The retry did not have its own stock hold'; END IF;
    RESET ROLE;
    IF (SELECT allocated_units FROM private.live_checkout_sale_policy) IS DISTINCT FROM baseline THEN
      RAISE EXCEPTION 'Releasing an unsent retry did not restore exactly its own units'; END IF;
  END IF;
END;
$proof$;

SELECT pg_temp.prove_first_order_stock('unsent',2);
SELECT pg_temp.prove_first_order_stock('failed',3);
SELECT pg_temp.prove_first_order_stock('expired',2);
SELECT pg_temp.prove_first_order_stock('refunded',2);
SELECT pg_temp.prove_first_order_stock('uncertain',1);
SELECT pg_temp.prove_first_order_stock('paid_paused',1);
SELECT pg_temp.prove_first_order_stock('paid_edited',2);
SELECT pg_temp.prove_first_order_stock('paid_new_owner',1);
SELECT pg_temp.prove_first_order_stock('paid',1);
SELECT pg_temp.prove_first_order_stock('pending',1);
