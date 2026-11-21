-- Per-session helpers for an already enrolled synthetic target. A race can
-- commit both carts first, then contend solely on the real reservation RPC.
CREATE FUNCTION pg_temp.test_business_issuer() RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'acct_592NativeMerchant'::text;
$$;

CREATE FUNCTION pg_temp.make_test_first_cart(purpose text,quantity integer) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  cart_id_ uuid;
  generation_ uuid;
  mode_ text;
  guest_hash text := encode(sha256(convert_to('guest:'||purpose,'UTF8')),'hex');
  receipt_hash text := encode(sha256(convert_to('receipt:'||purpose,'UTF8')),'hex');
BEGIN
  SELECT provider_environment INTO STRICT mode_ FROM private.live_checkout_sale_policy
    WHERE singleton AND account_id=pg_temp.test_business_issuer();
  INSERT INTO public.carts(guest_token_hash,expires_at) VALUES(guest_hash,now()+interval '1 day')
    RETURNING id INTO cart_id_;
  INSERT INTO public.cart_items(cart_id,product_id,variant_key,quantity)
    VALUES(cart_id_,'59200000-0000-4000-8000-000000000001','eligible',quantity);
  -- The actual cart trigger rotates checkout_generation after inserting a line.
  SELECT checkout_generation INTO STRICT generation_ FROM public.carts WHERE id=cart_id_;
  RETURN jsonb_build_object('environment',mode_,'accountId',pg_temp.test_business_issuer(),
    'cartId',cart_id_,'generation',generation_,'userId',NULL,'guestHash',guest_hash,'receiptHash',receipt_hash);
END;
$$;

CREATE FUNCTION pg_temp.prepare_test_first_cart(context jsonb) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT public.reserve_business_checkout(context->>'environment',context->>'accountId',
    (context->>'cartId')::uuid,(context->>'generation')::uuid,(context->>'userId')::uuid,
    context->>'guestHash',context->>'receiptHash');
$$;

CREATE FUNCTION pg_temp.reserve_test_first_cart(context jsonb) RETURNS uuid
LANGUAGE sql AS $$
  SELECT (pg_temp.prepare_test_first_cart(context)->>'orderId')::uuid;
$$;

CREATE FUNCTION pg_temp.open_test_first_order(purpose text,quantity integer) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  original_role text := current_user;
  cart jsonb;
  result jsonb;
BEGIN
  cart := pg_temp.make_test_first_cart(purpose,quantity);
  SET LOCAL ROLE service_role;
  result := pg_temp.prepare_test_first_cart(cart);
  EXECUTE format('SET LOCAL ROLE %I',original_role);
  IF result->>'state' IS DISTINCT FROM 'reserved' OR result->>'orderId' IS NULL THEN
    RAISE EXCEPTION 'Expected an unsent first Order for %, got %',purpose,result->>'state';
  END IF;
  RETURN (result->>'orderId')::uuid;
END;
$$;
