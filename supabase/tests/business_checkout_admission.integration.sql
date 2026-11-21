-- The runner encloses this file in a rolled-back transaction after setup.
DO $admission$
DECLARE
  cart jsonb := pg_temp.make_test_first_cart('admission-guest',1);
  second_cart jsonb := pg_temp.make_test_first_cart('admission-other',1);
  member_cart jsonb := pg_temp.make_test_first_cart('admission-member',2);
  member_id constant uuid := '59200000-0000-4000-8000-000000000101';
  wrong_id constant uuid := '59200000-0000-4000-8000-000000000102';
  issuer text := cart->>'accountId';
  mode_ text := cart->>'environment';
  other_mode text := CASE mode_ WHEN 'live' THEN 'business_sandbox' ELSE 'live' END;
  session_ text := CASE mode_ WHEN 'live' THEN 'cs_live_592Guest' ELSE 'cs_test_592Guest' END;
  session_member text := CASE mode_ WHEN 'live' THEN 'cs_live_592Member' ELSE 'cs_test_592Member' END;
  admitted jsonb;
  accepted_terms jsonb;
  result jsonb;
  order_id_ uuid;
  attempt_id_ uuid;
  nonce_ uuid;
  prior_allocations integer;
  context_row record;
BEGIN
  SELECT allocated_units INTO STRICT prior_allocations FROM private.live_checkout_sale_policy WHERE singleton;
  IF NOT EXISTS (SELECT FROM private.helix_environment WHERE singleton AND
       ((environment='development' AND mode_='business_sandbox') OR (environment='production' AND mode_='live'))) THEN
    RAISE EXCEPTION 'The fixture must exercise the actual database marker';
  END IF;
  INSERT INTO auth.users(id) VALUES(member_id);
  UPDATE public.carts SET user_id=member_id,guest_token_hash=NULL,expires_at=NULL
    WHERE id=(member_cart->>'cartId')::uuid;
  member_cart := member_cart||jsonb_build_object('userId',member_id,'guestHash',NULL,'receiptHash',NULL,
    'generation',(SELECT checkout_generation FROM public.carts WHERE id=(member_cart->>'cartId')::uuid));

  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.reserve_business_checkout(mode_,issuer,(cart->>'cartId')::uuid,
      (cart->>'generation')::uuid,NULL,cart->>'guestHash',cart->>'receiptHash',true);
    RAISE EXCEPTION 'Anonymous login invoked the checkout admission RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.reserve_business_checkout(mode_,issuer,(cart->>'cartId')::uuid,
      (cart->>'generation')::uuid,NULL,cart->>'guestHash',cart->>'receiptHash',true);
    RAISE EXCEPTION 'Authenticated browser login invoked the checkout admission RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SET LOCAL ROLE service_role;
  IF public.read_business_checkout_offer(mode_,issuer)->>'sku' IS DISTINCT FROM 'FIXTURE-592'
    OR public.read_business_checkout_offer(other_mode,issuer) IS NOT NULL THEN
    RAISE EXCEPTION 'Only the marker-selected issuer can offer the fixture SKU';
  END IF;
  IF NOT (public.read_business_checkout_offer(mode_,issuer) @> jsonb_build_object('shippingCents',500,
    'freeShippingThresholdCents',5000,'dispatchTerms','Synthetic dispatch terms','returnTerms','Synthetic return terms')) THEN
    RAISE EXCEPTION 'Offer must disclose the approved shipping price, threshold, dispatch and returns';
  END IF;
  FOR context_row IN SELECT * FROM (VALUES
      (cart||jsonb_build_object('environment',other_mode),'closed'),
      (cart||'{"accountId":"acct_WrongIssuer"}','closed'),
      (cart||jsonb_build_object('guestHash',second_cart->>'guestHash'),'unauthorized'),
      (cart||jsonb_build_object('receiptHash',cart->>'guestHash'),'unauthorized'),
      (cart||jsonb_build_object('receiptHash',NULL),'unauthorized'),
      (cart||jsonb_build_object('userId',member_id),'unauthorized'),
      (cart||jsonb_build_object('generation',gen_random_uuid()),'stale'),
      (member_cart||jsonb_build_object('userId',wrong_id),'unauthorized'),
      (member_cart||jsonb_build_object('receiptHash',cart->>'receiptHash'),'unauthorized')
    ) cases(input,expected_state) LOOP
    IF pg_temp.prepare_test_first_cart(context_row.input) IS DISTINCT FROM
       jsonb_build_object('state',context_row.expected_state) THEN
      RAISE EXCEPTION 'Cart admission should refuse invalid identity or stale generation with %',context_row.expected_state;
    END IF;
  END LOOP;
  SET LOCAL ROLE postgres;
  UPDATE public.carts SET expires_at=now()-interval '1 minute' WHERE id=(second_cart->>'cartId')::uuid;
  SET LOCAL ROLE service_role;
  IF pg_temp.prepare_test_first_cart(second_cart) IS DISTINCT FROM '{"state":"unauthorized"}'::jsonb THEN
    RAISE EXCEPTION 'Expired guest cart can reserve';
  END IF;
  SET LOCAL ROLE postgres;
  UPDATE public.carts SET expires_at=NULL WHERE id=(second_cart->>'cartId')::uuid;
  SET LOCAL ROLE service_role;
  IF pg_temp.prepare_test_first_cart(second_cart) IS DISTINCT FROM '{"state":"unauthorized"}'::jsonb THEN
    RAISE EXCEPTION 'Guest cart without expiration can reserve';
  END IF;
  SET LOCAL ROLE postgres;
  UPDATE public.product_variants SET price_cents=2501 WHERE sku='FIXTURE-592';
  SET LOCAL ROLE service_role;
  IF pg_temp.prepare_test_first_cart(cart) IS DISTINCT FROM '{"state":"unavailable"}'::jsonb
     OR public.read_business_checkout_offer(mode_,issuer) IS NOT NULL THEN
    RAISE EXCEPTION 'Catalog price drift must close the offer';
  END IF;
  SET LOCAL ROLE postgres;
  UPDATE public.product_variants SET price_cents=2500,archived_at=now() WHERE sku='FIXTURE-592';
  SET LOCAL ROLE service_role;
  IF pg_temp.prepare_test_first_cart(cart) IS DISTINCT FROM '{"state":"unavailable"}'::jsonb
     OR public.read_business_checkout_offer(mode_,issuer) IS NOT NULL THEN
    RAISE EXCEPTION 'An archived variant can be offered or reserved';
  END IF;
  SET LOCAL ROLE postgres;
  UPDATE public.product_variants SET archived_at=NULL WHERE sku='FIXTURE-592';
  UPDATE public.carts SET expires_at=now()+interval '1 day' WHERE id=(second_cart->>'cartId')::uuid;
  UPDATE public.cart_items SET variant_key='other' WHERE cart_id=(second_cart->>'cartId')::uuid;
  second_cart := second_cart||jsonb_build_object('generation',(SELECT checkout_generation FROM public.carts
    WHERE id=(second_cart->>'cartId')::uuid));
  SET LOCAL ROLE service_role;
  IF pg_temp.prepare_test_first_cart(second_cart) IS DISTINCT FROM '{"state":"unavailable"}'::jsonb THEN
    RAISE EXCEPTION 'A different same-price variant passed admission';
  END IF;
  SET LOCAL ROLE postgres;
  IF (SELECT allocated_units FROM private.live_checkout_sale_policy)<>prior_allocations OR EXISTS
    (SELECT FROM public.orders WHERE cart_id IN ((cart->>'cartId')::uuid,(second_cart->>'cartId')::uuid,(member_cart->>'cartId')::uuid)) THEN
    RAISE EXCEPTION 'A rejected request reserved stock or created an Order';
  END IF;
  SET LOCAL ROLE service_role;
  admitted := pg_temp.prepare_test_first_cart(cart);
  order_id_ := (admitted->>'orderId')::uuid;
  attempt_id_ := (admitted->>'attemptId')::uuid;
  nonce_ := (admitted->>'bindingNonce')::uuid;
  accepted_terms := admitted->'terms';
  IF admitted->>'state' IS DISTINCT FROM 'reserved' OR order_id_ IS NULL OR attempt_id_ IS NULL OR nonce_ IS NULL
    OR admitted->>'sku' IS DISTINCT FROM 'FIXTURE-592' OR accepted_terms->>'environment' IS DISTINCT FROM mode_
    OR accepted_terms->>'accountId' IS DISTINCT FROM issuer OR accepted_terms->>'merchandiseSubtotalCents' IS DISTINCT FROM '2500'
    OR accepted_terms->>'shippingCents' IS DISTINCT FROM '500' OR accepted_terms->>'preTaxTotalCents' IS DISTINCT FROM '3000'
    OR accepted_terms->'lines'->0->>'quantity' IS DISTINCT FROM '1' OR accepted_terms->'legacyEligible' IS DISTINCT FROM 'false'::jsonb
    OR pg_temp.prepare_test_first_cart(cart) IS DISTINCT FROM admitted
    OR pg_temp.prepare_test_first_cart(cart||jsonb_build_object('receiptHash',second_cart->>'receiptHash'))
       IS DISTINCT FROM '{"state":"unauthorized"}'::jsonb THEN
    RAISE EXCEPTION 'Admission must snapshot canonical terms and replay only for the original receipt';
  END IF;
  IF public.start_business_checkout_send(mode_,issuer,order_id_,attempt_id_,gen_random_uuid(),repeat('a',64))
     IS DISTINCT FROM '{"state":"unauthorized"}'::jsonb THEN RAISE EXCEPTION 'Incorrect nonce accepted'; END IF;
  SET LOCAL ROLE postgres;
  UPDATE private.live_checkout_sale_policy SET dispatch_terms='Revised dispatch terms' WHERE singleton;
  SET LOCAL ROLE service_role;
  IF public.start_business_checkout_send(mode_,issuer,order_id_,attempt_id_,nonce_,repeat('a',64))
      IS DISTINCT FROM '{"state":"stale"}'::jsonb OR pg_temp.prepare_test_first_cart(cart) IS DISTINCT FROM admitted THEN
    RAISE EXCEPTION 'Changed policy must preserve existing terms and stop an unsent attempt';
  END IF;
  SET LOCAL ROLE postgres;
  UPDATE private.live_checkout_sale_policy SET dispatch_terms='Synthetic dispatch terms' WHERE singleton;
  SET LOCAL ROLE service_role;
  IF public.start_business_checkout_send(mode_,issuer,order_id_,attempt_id_,nonce_,repeat('a',64))->>'state' IS DISTINCT FROM 'send'
     OR public.start_business_checkout_send(mode_,issuer,order_id_,attempt_id_,nonce_,repeat('a',64))->>'state' IS DISTINCT FROM 'send_started' THEN
    RAISE EXCEPTION 'Only one request may win first send';
  END IF;
  IF NOT public.bind_recovered_business_checkout_session(mode_,issuer,order_id_,attempt_id_,session_,nonce_) THEN
    RAISE EXCEPTION 'Could not bind first synthetic guest Session';
  END IF;
  IF NOT public.authorize_business_checkout_receipt(mode_,issuer,order_id_,session_,NULL,cart->>'receiptHash')
    OR public.authorize_business_checkout_receipt(mode_,issuer,order_id_,session_,NULL,cart->>'guestHash')
    OR public.authorize_business_checkout_receipt(mode_,issuer,order_id_,session_,NULL,second_cart->>'receiptHash')
    OR public.authorize_business_checkout_receipt(other_mode,issuer,order_id_,session_,NULL,cart->>'receiptHash')
    OR public.authorize_business_checkout_receipt(mode_,'acct_WrongIssuer',order_id_,session_,NULL,cart->>'receiptHash')
    OR public.read_archived_live_checkout_receipt(issuer,session_,cart->>'receiptHash') IS NOT NULL
    OR public.authorize_checkout_receipt(issuer,order_id_,session_,NULL,cart->>'receiptHash',cart->>'guestHash') THEN
    RAISE EXCEPTION 'Guest receipt must require its issuer, mode and own distinct capability';
  END IF;
  result := pg_temp.prepare_test_first_cart(member_cart);
  IF result->>'state' IS DISTINCT FROM 'reserved' OR result->'terms'->>'shippingCents' IS DISTINCT FROM '0'
     OR result->'terms'->>'preTaxTotalCents' IS DISTINCT FROM '5000' THEN
    RAISE EXCEPTION 'Canonical authenticated cart or free shipping threshold failed';
  END IF;
  IF pg_temp.test_first_resume(member_cart) IS DISTINCT FROM true OR
    pg_temp.test_first_resume(member_cart||jsonb_build_object('userId',wrong_id)) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Only the original authenticated cart owner can resume the existing Order';
  END IF;
  IF public.start_business_checkout_send(mode_,issuer,(result->>'orderId')::uuid,
    (result->>'attemptId')::uuid,(result->>'bindingNonce')::uuid,repeat('a',64))->>'state' IS DISTINCT FROM 'send'
    OR NOT public.bind_recovered_business_checkout_session(mode_,issuer,(result->>'orderId')::uuid,
        (result->>'attemptId')::uuid,session_member,(result->>'bindingNonce')::uuid) THEN
    RAISE EXCEPTION 'Could not bind authenticated synthetic Session';
  END IF;
  IF NOT public.authorize_business_checkout_receipt(mode_,issuer,(result->>'orderId')::uuid,session_member,member_id,NULL)
    OR public.authorize_business_checkout_receipt(mode_,issuer,(result->>'orderId')::uuid,session_member,wrong_id,NULL)
    OR public.authorize_business_checkout_receipt(mode_,issuer,(result->>'orderId')::uuid,session_member,NULL,cart->>'receiptHash') THEN
    RAISE EXCEPTION 'Account receipts must require the original account owner';
  END IF;
  SET LOCAL ROLE postgres;
  IF (SELECT allocated_units FROM private.live_checkout_sale_policy)<>prior_allocations+3 OR
     (SELECT count(*) FROM public.payment_attempts WHERE order_id=order_id_)<>1 OR
     (SELECT count(*) FROM private.live_checkout_stock_reservations WHERE order_id=order_id_ AND state='held' AND quantity=1)<>1 THEN
    RAISE EXCEPTION 'Duplicate admission or sending changed stock or payment attempts';
  END IF;
  UPDATE private.live_checkout_bindings SET receipt_expires_at=statement_timestamp()-interval '1 second'
    WHERE order_id=order_id_;
  SET LOCAL ROLE service_role;
  IF public.authorize_business_checkout_receipt(mode_,issuer,order_id_,session_,NULL,cart->>'receiptHash') THEN
    RAISE EXCEPTION 'Expired guest capability disclosed a receipt';
  END IF;
  SET LOCAL ROLE postgres;
END;
$admission$;

CREATE FUNCTION pg_temp.retry_test_send(context jsonb,request_digest text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.start_business_checkout_send(context->>'environment',context->>'accountId',
    (context->>'orderId')::uuid,(context->>'attemptId')::uuid,(context->>'bindingNonce')::uuid,request_digest);
$$;

DO $recovery$
DECLARE
  recent jsonb := pg_temp.make_retry_test_order('recover-at-backoff',interval '10 seconds');
  limit_order jsonb := pg_temp.make_retry_test_order('recover-at-expiry',interval '12 hours');
  paused_retry jsonb := pg_temp.make_retry_test_order('recover-while-paused',interval '1 minute');
  fresh jsonb := pg_temp.make_test_first_cart('resume-without-order',1);
  unsent jsonb := pg_temp.make_test_first_cart('reserve-no-new-unsent',1);
  mode_ text := recent->>'environment';
  other_mode text := CASE mode_ WHEN 'live' THEN 'business_sandbox' ELSE 'live' END;
  digest_ text := recent->>'requestSha256';
  bound_session text := CASE mode_ WHEN 'live' THEN 'cs_live_592Resume' ELSE 'cs_test_592Resume' END;
  result jsonb;
  attempted_at timestamptz;
  prior_units integer;
  prior_orders bigint;
  prior_attempts bigint;
BEGIN
  SET LOCAL ROLE service_role;
  IF pg_temp.prepare_test_first_cart(unsent)->>'state' IS DISTINCT FROM 'reserved' THEN
    RAISE EXCEPTION 'Expected an actual reservation with an unstarted provider send';
  END IF;
  SET LOCAL ROLE postgres;
  SELECT allocated_units INTO STRICT prior_units FROM private.live_checkout_sale_policy;
  SELECT count(*) INTO prior_orders FROM public.orders;
  SELECT count(*) INTO prior_attempts FROM public.payment_attempts;
  IF has_function_privilege('anon','public.read_business_checkout_resume(text,text,uuid,uuid,uuid,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.read_business_checkout_resume(text,text,uuid,uuid,uuid,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.read_business_checkout_resume(text,text,uuid,uuid,uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'The scoped resume read must remain service-only';
  END IF;
  UPDATE public.carts SET guest_token_hash=repeat('c',64) WHERE id=(recent->>'cartId')::uuid;
  SET LOCAL ROLE service_role;
  IF pg_temp.test_first_resume(recent||jsonb_build_object('guestHash',repeat('c',64))) IS DISTINCT FROM false
    OR pg_temp.prepare_test_first_cart(recent||jsonb_build_object('guestHash',repeat('c',64)),false)
       IS DISTINCT FROM '{"state":"unauthorized"}'::jsonb
    OR pg_temp.prepare_test_first_cart(recent||jsonb_build_object('guestHash',repeat('c',64)),true)
       IS DISTINCT FROM '{"state":"unauthorized"}'::jsonb THEN
    RAISE EXCEPTION 'Reassigned guest cart matched the original reservation owner';
  END IF;
  SET LOCAL ROLE postgres;
  UPDATE public.carts SET guest_token_hash=recent->>'guestHash' WHERE id=(recent->>'cartId')::uuid;
  -- A returning buyer can own the last unit. Availability alone cannot decide resume.
  UPDATE private.live_checkout_sale_policy SET approved_units=allocated_units WHERE singleton;
  SET LOCAL ROLE service_role;
  IF public.read_business_checkout_offer(mode_,recent->>'accountId') IS NOT NULL
    OR pg_temp.test_first_resume(recent) IS DISTINCT FROM true
    OR pg_temp.test_first_resume(fresh) IS DISTINCT FROM false
    OR pg_temp.test_first_resume(recent||jsonb_build_object('environment',other_mode))
    OR pg_temp.test_first_resume(recent||jsonb_build_object('accountId','acct_OtherIssuer'))
    OR pg_temp.test_first_resume(recent||jsonb_build_object('generation',gen_random_uuid()))
    OR pg_temp.test_first_resume(recent||jsonb_build_object('guestHash',fresh->>'guestHash'))
    OR pg_temp.test_first_resume(recent||jsonb_build_object('receiptHash',fresh->>'receiptHash')) THEN
    RAISE EXCEPTION 'Sold-out resume must identify only the original issuer, cart generation, owner and receipt';
  END IF;
  IF pg_temp.prepare_test_first_cart(fresh,false) IS DISTINCT FROM '{"state":"closed"}'::jsonb
    OR pg_temp.prepare_test_first_cart(unsent,false)->>'state' IS DISTINCT FROM 'reserved'
    OR pg_temp.prepare_test_first_cart(recent,false)->>'state' IS DISTINCT FROM 'send_started' THEN
    RAISE EXCEPTION 'Recovery-only admission must exclude new Orders and preserve existing reserved or uncertain attempts';
  END IF;
  IF pg_temp.retry_test_send(recent,repeat('b',64))->>'state' IS DISTINCT FROM 'send_started' THEN
    RAISE EXCEPTION 'A changed Stripe request body acquired the recovery send';
  END IF;
  result := pg_temp.retry_test_send(recent,digest_);
  IF result->>'state' IS DISTINCT FROM 'recover'
    OR result->'terms' IS DISTINCT FROM recent->'terms'
    OR (result->>'orderId',result->>'attemptId',result->>'bindingNonce',result->>'idempotencyKey',result->>'firstSendAt')
       IS DISTINCT FROM (recent->>'orderId',recent->>'attemptId',recent->>'bindingNonce',recent->>'idempotencyKey',recent->>'firstSendAt')
    OR pg_temp.test_first_resume(recent) IS DISTINCT FROM true
    OR pg_temp.retry_test_send(recent,digest_)->>'state' IS DISTINCT FROM 'send_started' THEN
    RAISE EXCEPTION 'Lost response must recover the identical accepted request only once per backoff';
  END IF;
  IF pg_temp.test_first_resume(limit_order) IS DISTINCT FROM false
    OR pg_temp.retry_test_send(limit_order,digest_)->>'state' IS DISTINCT FROM 'send_started' THEN
    RAISE EXCEPTION 'The original 12-hour window ended; retain the uncertain reservation';
  END IF;
  SET LOCAL ROLE postgres;
  SELECT last_send_attempt_at INTO STRICT attempted_at FROM private.live_checkout_bindings
    WHERE order_id=(recent->>'orderId')::uuid AND send_request_sha256=digest_
      AND first_send_at=(recent->>'firstSendAt')::timestamptz;
  IF attempted_at <= (recent->>'firstSendAt')::timestamptz OR NOT EXISTS (
    SELECT FROM private.live_checkout_bindings WHERE order_id=(limit_order->>'orderId')::uuid
      AND first_send_at=(limit_order->>'firstSendAt')::timestamptz AND last_send_attempt_at=first_send_at) THEN
    RAISE EXCEPTION 'Only a successful recovery may advance its retry timestamp';
  END IF;
  UPDATE private.live_checkout_sale_policy SET enabled=false WHERE singleton;
  SET LOCAL ROLE service_role;
  IF pg_temp.test_first_resume(recent) IS DISTINCT FROM false
    OR pg_temp.retry_test_send(paused_retry,digest_)->>'state' IS DISTINCT FROM 'closed' THEN
    RAISE EXCEPTION 'Paused issuer allowed an unbound retry';
  END IF;
  IF NOT public.bind_recovered_business_checkout_session(mode_,recent->>'accountId',(recent->>'orderId')::uuid,
    (recent->>'attemptId')::uuid,bound_session,(recent->>'bindingNonce')::uuid) THEN
    RAISE EXCEPTION 'Could not attach the authenticated original Session after admission closed';
  END IF;
  result := pg_temp.prepare_test_first_cart(recent,false);
  IF pg_temp.test_first_resume(recent) IS DISTINCT FROM true OR result->>'state' IS DISTINCT FROM 'bound'
    OR result->>'sessionId' IS DISTINCT FROM bound_session OR result->>'orderId' IS DISTINCT FROM recent->>'orderId'
    OR pg_temp.retry_test_send(recent,digest_)->>'state' IS DISTINCT FROM 'bound'
    OR pg_temp.prepare_test_first_cart(recent||jsonb_build_object('receiptHash',fresh->>'receiptHash'),false) ? 'sessionId' THEN
    RAISE EXCEPTION 'Paused issuer must expose the bound Session only to its proven owner';
  END IF;
  SET LOCAL ROLE postgres;
  IF (SELECT allocated_units FROM private.live_checkout_sale_policy)<>prior_units
    OR (SELECT count(*) FROM public.orders)<>prior_orders OR (SELECT count(*) FROM public.payment_attempts)<>prior_attempts
    OR (SELECT count(*) FROM private.live_checkout_stock_reservations WHERE
       order_id IN ((recent->>'orderId')::uuid,(limit_order->>'orderId')::uuid) AND state='held' AND quantity=1)<>2 THEN
    RAISE EXCEPTION 'Retries must retain exactly the original Orders, Attempts and units';
  END IF;
END;
$recovery$;
