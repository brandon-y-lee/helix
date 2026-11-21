CREATE FUNCTION private.install_first_order_admission() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $phase$
BEGIN
CREATE FUNCTION private.read_business_checkout_offer(p_environment text,p_account_id text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT jsonb_build_object('admissionOpen',true,'sku',v.sku,'productSlug',p.slug,'variantKey',v.variant_key,
    'unitPriceCents',v.price_cents,'currency',sp.currency,'shippingCents',sp.shipping_cents,
    'freeShippingThresholdCents',sp.free_shipping_threshold_cents,'dispatchTerms',sp.dispatch_terms,'returnTerms',sp.return_terms)
  FROM private.live_checkout_sale_policy sp JOIN public.product_variants v ON v.id=sp.variant_id
  JOIN public.products p ON p.id=v.product_id
  WHERE sp.singleton AND sp.enabled AND sp.account_id=p_account_id AND sp.provider_environment=p_environment
    AND private.business_checkout_target(p_environment,p_account_id) AND sp.approved_units>sp.allocated_units
    AND sp.sku=v.sku AND sp.unit_price_cents=v.price_cents AND v.available AND v.archived_at IS NULL AND p.currency=sp.currency
    AND v.inventory_status IN ('in_stock','low_stock') AND p.catalog_status='active' AND p.status='available'
$fn$;

CREATE FUNCTION private.business_checkout_result(p_order_id uuid,p_state text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT jsonb_build_object('state',p_state,'orderId',o.id,'orderNumber',o.order_number,
    'attemptId',b.attempt_id,'bindingNonce',b.binding_nonce,'sessionId',b.session_id,'firstSendAt',b.first_send_at,
    'idempotencyKey',b.idempotency_key,'productName',i.product_name,'productSlug',i.product_slug,
    'variantKey',i.variant_key,'sku',i.product_snapshot->'sku','taxCode',i.product_snapshot->'taxCode',
    'shipper',i.product_snapshot->'shipper','dispatchTerms',i.product_snapshot->'dispatchTerms',
    'returnTerms',i.product_snapshot->'returnTerms','terms',b.terms||jsonb_build_object(
      'orderId',o.id,'attemptId',b.attempt_id,'bindingNonce',b.binding_nonce,'sessionId',b.session_id))
  FROM private.live_checkout_bindings b JOIN public.orders o ON o.id=b.order_id
  JOIN public.order_items i ON i.order_id=o.id WHERE b.order_id=p_order_id
$fn$;
CREATE FUNCTION private.reserve_business_checkout(
  p_environment text,p_account_id text,p_cart_id uuid,p_checkout_generation uuid,p_user_id uuid,
  p_guest_cart_hash text,p_receipt_hash text,p_allow_new boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE
  c public.carts; o public.orders; b private.live_checkout_bindings; sp private.live_checkout_sale_policy;
  line public.cart_items; variant public.product_variants; product public.products;
  new_order uuid:=gen_random_uuid(); new_attempt uuid:=gen_random_uuid(); nonce uuid:=gen_random_uuid();
  key_ text; subtotal integer; shipping integer; terms_ jsonb; generation_receipt bigint;
BEGIN
  IF p_cart_id IS NULL OR p_checkout_generation IS NULL OR NOT private.business_checkout_target(p_environment,p_account_id)
    THEN RETURN '{"state":"closed"}'; END IF;
  IF (p_user_id IS NULL AND (p_guest_cart_hash IS NULL OR p_guest_cart_hash !~ '^[a-f0-9]{64}$'
      OR p_receipt_hash IS NULL OR p_receipt_hash !~ '^[a-f0-9]{64}$' OR p_receipt_hash=p_guest_cart_hash))
    OR (p_user_id IS NOT NULL AND (p_guest_cart_hash IS NOT NULL OR p_receipt_hash IS NOT NULL))
    THEN RETURN '{"state":"unauthorized"}'; END IF;
  SELECT * INTO c FROM public.carts WHERE id=p_cart_id FOR UPDATE;
  IF NOT FOUND OR (c.user_id,c.guest_token_hash) IS DISTINCT FROM (p_user_id,p_guest_cart_hash)
    OR c.status<>'active' OR (p_user_id IS NULL AND c.expires_at IS NULL) OR c.expires_at<=statement_timestamp() THEN RETURN '{"state":"unauthorized"}'; END IF;
  IF c.checkout_generation IS DISTINCT FROM p_checkout_generation THEN RETURN '{"state":"stale"}'; END IF;
  SELECT * INTO o FROM public.orders WHERE cart_id=c.id AND checkout_generation=p_checkout_generation;
  IF FOUND THEN
    IF o.user_id IS DISTINCT FROM p_user_id OR o.checkout_environment::text<>p_environment
      THEN RETURN '{"state":"unavailable"}'; END IF;
    SELECT * INTO b FROM private.live_checkout_bindings WHERE order_id=o.id AND account_id=p_account_id;
    IF NOT FOUND OR (p_user_id IS NULL AND (b.receipt_hash IS DISTINCT FROM p_receipt_hash
      OR b.receipt_expires_at<=clock_timestamp() OR b.receipt_ownership_version<>o.receipt_ownership_version
      OR NOT EXISTS (SELECT FROM private.live_checkout_stock_reservations r
        WHERE r.order_id=o.id AND r.attempt_id=b.attempt_id AND r.account_id=b.account_id
          AND r.guest_owner_digest=sha256(convert_to(p_guest_cart_hash,'UTF8')))))
      THEN RETURN '{"state":"unauthorized"}'; END IF;
    IF p_allow_new IS NOT TRUE AND o.status<>'pending_payment'
      THEN RETURN '{"state":"closed"}'; END IF;
    RETURN private.business_checkout_result(o.id,CASE WHEN o.status<>'pending_payment' THEN 'terminal'
      WHEN b.session_id IS NOT NULL THEN 'bound' WHEN b.first_send_at IS NOT NULL THEN 'send_started' ELSE 'reserved' END);
  END IF;
  IF p_allow_new IS NOT TRUE THEN RETURN '{"state":"closed"}'; END IF;
  -- Never replace an unresolved earlier cart generation or its first provider send.
  IF EXISTS (SELECT FROM public.orders old WHERE old.cart_id=c.id AND old.status='pending_payment')
    THEN RETURN '{"state":"unavailable"}'; END IF;
  SELECT * INTO sp FROM private.live_checkout_sale_policy WHERE singleton AND provider_environment=p_environment AND account_id=p_account_id FOR UPDATE;
  IF NOT FOUND OR NOT sp.enabled THEN RETURN '{"state":"closed"}'; END IF;
  IF (SELECT count(*) FROM public.cart_items WHERE cart_id=c.id)<>1 THEN RETURN '{"state":"unavailable"}'; END IF;
  SELECT * INTO STRICT line FROM public.cart_items WHERE cart_id=c.id;
  SELECT * INTO variant FROM public.product_variants WHERE id=sp.variant_id AND
    (product_id,variant_key)=(line.product_id,line.variant_key) AND sku=sp.sku AND price_cents=sp.unit_price_cents
    AND available AND archived_at IS NULL AND inventory_status IN ('in_stock','low_stock') FOR SHARE;
  IF NOT FOUND OR line.quantity>sp.approved_units-sp.allocated_units THEN RETURN '{"state":"unavailable"}'; END IF;
  SELECT * INTO product FROM public.products WHERE id=variant.product_id AND currency=sp.currency AND catalog_status='active' AND status='available' FOR SHARE;
  IF NOT FOUND THEN RETURN '{"state":"unavailable"}'; END IF;
  subtotal:=line.quantity*variant.price_cents;
  shipping:=CASE WHEN sp.free_shipping_threshold_cents IS NOT NULL AND subtotal>=sp.free_shipping_threshold_cents
    THEN 0 ELSE sp.shipping_cents END;
  key_:=p_environment||':attempt:'||new_attempt::text;
  INSERT INTO public.orders(id,order_number,user_id,cart_id,checkout_generation,checkout_environment,currency,
      merchandise_subtotal_cents,shipping_cents,total_cents,idempotency_key)
    VALUES(new_order,'HX-'||upper(substr(replace(new_order::text,'-',''),1,12)),p_user_id,c.id,p_checkout_generation,
      p_environment::public.checkout_environment,'USD',subtotal,shipping,subtotal+shipping,p_environment||':order:'||new_order)
    RETURNING receipt_ownership_version INTO generation_receipt;
  INSERT INTO public.order_items(order_id,product_id,product_slug,product_name,variant_key,variant_label,
    unit_price_cents,quantity,line_subtotal_cents,product_snapshot)
    VALUES(new_order,product.id,product.slug,product.display_name,variant.variant_key,variant.label,variant.price_cents,
      line.quantity,subtotal,jsonb_build_object('sku',sp.sku,'taxCode',sp.tax_code,'shipper',sp.shipper,
      'dispatchTerms',sp.dispatch_terms,'returnTerms',sp.return_terms,'variantId',variant.id));
  INSERT INTO public.payment_attempts(id,order_id,checkout_environment,amount_cents,idempotency_key)
    VALUES(new_attempt,new_order,p_environment::public.checkout_environment,subtotal+shipping,key_);
  terms_:=jsonb_build_object('version','checkout_v2','legacyEligible',false,'accountId',p_account_id,
    'environment',p_environment,'apiVersion','2026-06-24.dahlia','orderId',new_order,'attemptId',new_attempt,
    'bindingNonce',nonce,'sessionId',NULL,'customerId',NULL,'currency','USD','lines',private.checkout_order_lines(new_order),
    'merchandiseSubtotalCents',subtotal,'discountCents',0,'shippingCents',shipping,'preTaxTotalCents',subtotal+shipping,
    'couponId',NULL,'offerId',NULL,'freeShipping',shipping=0,'shippingRateId',CASE WHEN shipping>0 THEN sp.shipping_rate_id END,
    'automaticTaxEnabled',sp.automatic_tax_enabled,'taxBehavior',sp.tax_behavior);
  INSERT INTO private.live_checkout_bindings(account_id,order_id,attempt_id,idempotency_key,terms,binding_nonce,
    receipt_hash,receipt_expires_at,receipt_ownership_version)
    VALUES(p_account_id,new_order,new_attempt,key_,terms_,nonce,p_receipt_hash,
      CASE WHEN p_receipt_hash IS NOT NULL THEN clock_timestamp()+interval '24 hours' END,
      CASE WHEN p_receipt_hash IS NOT NULL THEN generation_receipt END);
  IF NOT private.reserve_live_checkout_stock(p_account_id,new_order,new_attempt,variant.id,line.quantity)
    THEN RAISE EXCEPTION 'Inventory reservation failed'; END IF;
  RETURN private.business_checkout_result(new_order,'reserved');
END;
$fn$;

-- This ownership check lets a customer return to the original reservation when
-- its allocation exhausted saleable stock. It never creates or changes a hold.
CREATE FUNCTION private.read_business_checkout_resume(
  p_environment text,p_account_id text,p_cart_id uuid,p_checkout_generation uuid,p_user_id uuid,
  p_guest_cart_hash text,p_receipt_hash text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT EXISTS (
    SELECT FROM public.carts c JOIN public.orders o ON o.cart_id=c.id AND o.checkout_generation=c.checkout_generation
    JOIN private.live_checkout_bindings b ON b.order_id=o.id AND b.account_id=p_account_id
    JOIN private.live_checkout_stock_reservations r ON r.order_id=o.id AND r.attempt_id=b.attempt_id
    JOIN private.live_checkout_sale_policy sp ON sp.singleton AND sp.provider_environment=p_environment AND sp.account_id=b.account_id
    WHERE (c.id,c.checkout_generation)=(p_cart_id,p_checkout_generation) AND c.status='active' AND c.currency='USD'
      AND (c.expires_at IS NULL OR c.expires_at>statement_timestamp())
      AND o.status='pending_payment' AND r.state='held' AND o.checkout_environment::text=p_environment
      AND private.valid_business_checkout_binding(p_environment,p_account_id,o.id,b.attempt_id)
      AND ((p_user_id IS NOT NULL AND c.user_id=p_user_id AND o.user_id=p_user_id
        AND p_guest_cart_hash IS NULL AND p_receipt_hash IS NULL)
      OR (p_user_id IS NULL AND c.user_id IS NULL AND o.user_id IS NULL AND c.expires_at IS NOT NULL
        AND c.guest_token_hash=p_guest_cart_hash AND r.guest_owner_digest=sha256(convert_to(p_guest_cart_hash,'UTF8'))
        AND b.receipt_hash=p_receipt_hash AND b.receipt_expires_at>statement_timestamp()
        AND b.receipt_ownership_version=o.receipt_ownership_version))
      AND (b.session_id IS NOT NULL OR (sp.enabled AND
        (b.first_send_at IS NULL OR b.first_send_at>statement_timestamp()-interval '12 hours'))))
$fn$;

CREATE FUNCTION private.start_business_checkout_send(
  p_environment text,p_account_id text,p_order_id uuid,p_attempt_id uuid,p_binding_nonce uuid,p_request_sha256 text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE
  c public.carts; o public.orders; b private.live_checkout_bindings; sp private.live_checkout_sale_policy;
  item public.order_items; v public.product_variants; stock private.live_checkout_stock_reservations; shipping integer;
  observed timestamptz;
BEGIN
  IF NOT private.valid_business_checkout_binding(p_environment,p_account_id,p_order_id,p_attempt_id)
    THEN RETURN '{"state":"unauthorized"}'; END IF;
  SELECT * INTO STRICT b FROM private.live_checkout_bindings WHERE (account_id,order_id,attempt_id)=(p_account_id,p_order_id,p_attempt_id) FOR UPDATE;
  IF b.binding_nonce IS DISTINCT FROM p_binding_nonce THEN RETURN '{"state":"unauthorized"}'; END IF;
  SELECT * INTO STRICT o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF o.status<>'pending_payment' THEN RETURN private.business_checkout_result(o.id,'terminal'); END IF;
  IF b.session_id IS NOT NULL THEN RETURN private.business_checkout_result(o.id,'bound'); END IF;
  IF p_request_sha256 IS NULL OR p_request_sha256 !~ '^[a-f0-9]{64}$' THEN RETURN '{"state":"unavailable"}'; END IF;
  IF b.first_send_at IS NOT NULL AND b.send_request_sha256 IS DISTINCT FROM p_request_sha256 THEN
    RETURN private.business_checkout_result(o.id,'send_started'); END IF;
  observed:=clock_timestamp();
  IF b.first_send_at IS NOT NULL AND (observed>=b.first_send_at+interval '12 hours' OR
    observed<coalesce(b.last_send_attempt_at,b.first_send_at)+interval '10 seconds') THEN
    RETURN private.business_checkout_result(o.id,'send_started');
  END IF;
  -- Settlement and unsent release take these locks in the same order.
  SELECT * INTO c FROM public.carts WHERE id=o.cart_id FOR UPDATE;
  IF c.id IS NULL OR c.status<>'active' OR c.checkout_generation IS DISTINCT FROM o.checkout_generation
    OR c.user_id IS DISTINCT FROM o.user_id OR (o.user_id IS NULL AND c.expires_at IS NULL) OR c.expires_at<=statement_timestamp()
    OR (o.user_id IS NULL AND (b.receipt_expires_at<=clock_timestamp() OR b.receipt_ownership_version<>o.receipt_ownership_version))
    THEN RETURN '{"state":"stale"}'; END IF;
  SELECT * INTO stock FROM private.live_checkout_stock_reservations WHERE order_id=o.id AND attempt_id=b.attempt_id
    AND account_id=b.account_id AND provider_environment=p_environment;
  IF NOT FOUND OR stock.state<>'held' OR stock.guest_owner_digest IS DISTINCT FROM sha256(convert_to(c.guest_token_hash,'UTF8')) THEN RETURN '{"state":"unavailable"}'; END IF;
  SELECT * INTO sp FROM private.live_checkout_sale_policy WHERE singleton AND
    (provider_environment,account_id)=(p_environment,p_account_id) FOR UPDATE;
  IF NOT FOUND OR NOT sp.enabled THEN RETURN '{"state":"closed"}'; END IF;
  SELECT * INTO STRICT item FROM public.order_items WHERE order_id=o.id;
  SELECT * INTO v FROM public.product_variants WHERE id=sp.variant_id AND id=stock.variant_id
    AND product_id=item.product_id AND variant_key=item.variant_key AND sku=sp.sku AND price_cents=sp.unit_price_cents
    AND available AND archived_at IS NULL AND inventory_status IN ('in_stock','low_stock') FOR SHARE;
  IF NOT FOUND OR stock.quantity<>item.quantity OR v.price_cents<>item.unit_price_cents
    OR NOT EXISTS (SELECT FROM public.products WHERE id=item.product_id AND currency=sp.currency AND catalog_status='active' AND status='available' FOR SHARE)
    OR NOT EXISTS (SELECT FROM public.cart_items WHERE cart_id=c.id AND (product_id,variant_key,quantity)=(item.product_id,item.variant_key,item.quantity))
    OR (SELECT count(*) FROM public.cart_items WHERE cart_id=c.id)<>1
    THEN RETURN '{"state":"unavailable"}'; END IF;
  shipping:=CASE WHEN sp.free_shipping_threshold_cents IS NOT NULL AND o.merchandise_subtotal_cents>=sp.free_shipping_threshold_cents
    THEN 0 ELSE sp.shipping_cents END;
  IF shipping<>o.shipping_cents OR (CASE WHEN shipping>0 THEN sp.shipping_rate_id END) IS DISTINCT FROM b.terms->>'shippingRateId'
    OR (sp.shipper,sp.dispatch_terms,sp.return_terms,sp.tax_code,sp.tax_behavior,sp.automatic_tax_enabled)
      IS DISTINCT FROM (item.product_snapshot->>'shipper',item.product_snapshot->>'dispatchTerms',
        item.product_snapshot->>'returnTerms',item.product_snapshot->>'taxCode',b.terms->>'taxBehavior',
        (b.terms->>'automaticTaxEnabled')::boolean) THEN RETURN '{"state":"stale"}'; END IF;
  -- Recheck after waiting on approval or cart locks. The original Stripe key
  -- and accepted terms are reused strictly inside its conservative retry window.
  observed:=clock_timestamp();
  IF b.first_send_at IS NOT NULL AND observed>=b.first_send_at+interval '12 hours' THEN
    RETURN private.business_checkout_result(o.id,'send_started'); END IF;
  UPDATE private.live_checkout_bindings SET first_send_at=coalesce(first_send_at,observed),last_send_attempt_at=observed,send_request_sha256=p_request_sha256
    WHERE attempt_id=p_attempt_id;
  RETURN private.business_checkout_result(o.id,CASE WHEN b.first_send_at IS NULL THEN 'send' ELSE 'recover' END);
END;
$fn$;

CREATE FUNCTION private.release_unsent_business_checkout(
  p_environment text,p_account_id text,p_order_id uuid,p_attempt_id uuid,p_binding_nonce uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
  IF NOT private.valid_business_checkout_binding(p_environment,p_account_id,p_order_id,p_attempt_id)
    OR NOT EXISTS (SELECT FROM private.live_checkout_bindings WHERE account_id=p_account_id AND order_id=p_order_id
      AND attempt_id=p_attempt_id AND binding_nonce=p_binding_nonce AND first_send_at IS NULL AND session_id IS NULL)
    THEN RETURN false; END IF;
  RETURN private.release_unsent_live_checkout_stock(p_account_id,p_order_id,p_attempt_id);
END;
$fn$;

CREATE FUNCTION private.read_archived_live_checkout_receipt(p_account_id text,p_session_id text,p_receipt_token_hash text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT private.read_live_checkout_receipt(b.account_id,b.order_id,b.session_id,NULL,p_receipt_token_hash)
  FROM private.live_checkout_bindings b
  WHERE b.account_id=p_account_id AND b.session_id=p_session_id
    AND private.valid_live_checkout_binding(p_account_id,b.order_id,b.attempt_id)
    AND NOT EXISTS (SELECT FROM private.live_checkout_stock_reservations r WHERE r.order_id=b.order_id)
$fn$;
REVOKE ALL ON FUNCTION private.read_business_checkout_offer(text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.read_business_checkout_offer(p_environment text,p_account_id text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $api$
 SELECT private.read_business_checkout_offer(p_environment,p_account_id)
$api$;
REVOKE ALL ON FUNCTION public.read_business_checkout_offer(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_business_checkout_offer(text,text),public.read_business_checkout_offer(text,text) TO service_role;
REVOKE ALL ON FUNCTION private.business_checkout_result(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.reserve_business_checkout(text,text,uuid,uuid,uuid,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.reserve_business_checkout(p_environment text,p_account_id text,p_cart_id uuid,p_checkout_generation uuid,p_user_id uuid, p_guest_cart_hash text,p_receipt_hash text,p_allow_new boolean DEFAULT true) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $api$
 SELECT private.reserve_business_checkout(p_environment,p_account_id,p_cart_id,p_checkout_generation,p_user_id,p_guest_cart_hash,p_receipt_hash,p_allow_new)
$api$;
REVOKE ALL ON FUNCTION public.reserve_business_checkout(text,text,uuid,uuid,uuid,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.reserve_business_checkout(text,text,uuid,uuid,uuid,text,text,boolean),public.reserve_business_checkout(text,text,uuid,uuid,uuid,text,text,boolean) TO service_role;
REVOKE ALL ON FUNCTION private.read_business_checkout_resume(text,text,uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.read_business_checkout_resume(p_environment text,p_account_id text,p_cart_id uuid,p_checkout_generation uuid,p_user_id uuid, p_guest_cart_hash text,p_receipt_hash text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $api$
 SELECT private.read_business_checkout_resume(p_environment,p_account_id,p_cart_id,p_checkout_generation,p_user_id,p_guest_cart_hash,p_receipt_hash)
$api$;
REVOKE ALL ON FUNCTION public.read_business_checkout_resume(text,text,uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_business_checkout_resume(text,text,uuid,uuid,uuid,text,text),public.read_business_checkout_resume(text,text,uuid,uuid,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION private.start_business_checkout_send(text,text,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.start_business_checkout_send(p_environment text,p_account_id text,p_order_id uuid,p_attempt_id uuid,p_binding_nonce uuid,p_request_sha256 text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $api$
 SELECT private.start_business_checkout_send(p_environment,p_account_id,p_order_id,p_attempt_id,p_binding_nonce,p_request_sha256)
$api$;
REVOKE ALL ON FUNCTION public.start_business_checkout_send(text,text,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.start_business_checkout_send(text,text,uuid,uuid,uuid,text),public.start_business_checkout_send(text,text,uuid,uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION private.release_unsent_business_checkout(text,text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.release_unsent_business_checkout(p_environment text,p_account_id text,p_order_id uuid,p_attempt_id uuid,p_binding_nonce uuid) RETURNS boolean
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $api$
 SELECT private.release_unsent_business_checkout(p_environment,p_account_id,p_order_id,p_attempt_id,p_binding_nonce)
$api$;
REVOKE ALL ON FUNCTION public.release_unsent_business_checkout(text,text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.release_unsent_business_checkout(text,text,uuid,uuid,uuid),public.release_unsent_business_checkout(text,text,uuid,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION private.read_archived_live_checkout_receipt(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.read_archived_live_checkout_receipt(p_account_id text,p_session_id text,p_receipt_token_hash text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $api$
 SELECT private.read_archived_live_checkout_receipt(p_account_id,p_session_id,p_receipt_token_hash)
$api$;
REVOKE ALL ON FUNCTION public.read_archived_live_checkout_receipt(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_archived_live_checkout_receipt(text,text,text),public.read_archived_live_checkout_receipt(text,text,text) TO service_role;
END;
$phase$;
