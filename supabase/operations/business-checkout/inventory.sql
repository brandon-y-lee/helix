CREATE FUNCTION private.install_first_order_inventory() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $phase$
BEGIN
-- No enrollment, stock count, price, or shipping promise is inferred at install time.
CREATE TABLE private.live_checkout_sale_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  project_ref text NOT NULL,
  provider_environment text NOT NULL,
  account_id text NOT NULL CHECK (account_id ~ '^acct_[A-Za-z0-9]{1,120}$' AND account_id <> 'acct_1Tm9WRFEzyaKzdmq'),
  variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  sku text NOT NULL CHECK (length(btrim(sku)) BETWEEN 1 AND 200),
  currency text NOT NULL CHECK (currency='USD'),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents>0),
  approved_units integer NOT NULL CHECK (approved_units>=0),
  allocated_units integer NOT NULL DEFAULT 0 CHECK (allocated_units BETWEEN 0 AND approved_units),
  shipping_cents integer NOT NULL CHECK (shipping_cents>=0),
  free_shipping_threshold_cents integer NOT NULL CHECK (free_shipping_threshold_cents>=0),
  shipping_rate_id text CHECK (shipping_rate_id ~ '^shr_[A-Za-z0-9_]{1,200}$'),
  shipper text NOT NULL CHECK (length(btrim(shipper)) BETWEEN 1 AND 160),
  automatic_tax_enabled boolean NOT NULL,
  tax_behavior text NOT NULL CHECK (tax_behavior='exclusive'),
  tax_code text NOT NULL CHECK (tax_code ~ '^txcd_[0-9]{8}$'),
  dispatch_terms text NOT NULL CHECK (length(btrim(dispatch_terms)) BETWEEN 1 AND 2000),
  return_terms text NOT NULL CHECK (length(btrim(return_terms)) BETWEEN 1 AND 4000),
  enabled boolean NOT NULL DEFAULT false,
  CHECK ((provider_environment,project_ref) IN (
    ('live','erasogmsqpgiirovubjh'),('business_sandbox','zyfkunnpnlmgvrojmrbg'))),
  CHECK (shipping_cents=0 OR shipping_rate_id IS NOT NULL),
  CHECK (NOT enabled OR automatic_tax_enabled)
);
CREATE TABLE private.live_checkout_stock_reservations (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id),
  attempt_id uuid NOT NULL UNIQUE REFERENCES public.payment_attempts(id),
  account_id text NOT NULL,
  provider_environment text NOT NULL CHECK (provider_environment IN ('live','business_sandbox')),
  variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  guest_owner_digest bytea CHECK (octet_length(guest_owner_digest)=32),
  state text NOT NULL CHECK (state IN ('held','consumed','released'))
);
ALTER TABLE private.live_checkout_sale_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.live_checkout_sale_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE private.live_checkout_stock_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.live_checkout_stock_reservations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.live_checkout_sale_policy, private.live_checkout_stock_reservations
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.guard_first_order_policy() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $inventory$
BEGIN
  IF TG_OP IN ('TRUNCATE','DELETE') THEN
    RAISE EXCEPTION 'An enrolled first-order policy is retained';
  END IF;
  IF TG_OP='UPDATE' AND
     (NEW.project_ref,NEW.provider_environment,NEW.account_id,NEW.variant_id,NEW.sku)
     IS DISTINCT FROM (OLD.project_ref,OLD.provider_environment,OLD.account_id,OLD.variant_id,OLD.sku) THEN
    RAISE EXCEPTION 'An enrolled first-order issuer and SKU are immutable';
  END IF;
  IF TG_OP='INSERT' AND (NEW.allocated_units<>0 OR NOT EXISTS (
     SELECT FROM private.helix_environment WHERE singleton AND project_ref=NEW.project_ref
       AND environment=CASE NEW.provider_environment WHEN 'live' THEN 'production' ELSE 'development' END)) THEN
    RAISE EXCEPTION 'First-order enrollment requires its own environment and unallocated stock';
  END IF;
  RETURN NEW;
END;
$inventory$;
CREATE TRIGGER first_order_policy_identity BEFORE INSERT OR UPDATE OR DELETE ON private.live_checkout_sale_policy
  FOR EACH ROW EXECUTE FUNCTION private.guard_first_order_policy();
CREATE TRIGGER retain_first_order_policy BEFORE TRUNCATE ON private.live_checkout_sale_policy
  FOR EACH STATEMENT EXECUTE FUNCTION private.guard_first_order_policy();

CREATE FUNCTION private.reserve_live_checkout_stock(p_account_id text,p_order_id uuid,p_attempt_id uuid,p_variant_id uuid,p_quantity integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $inventory$
DECLARE
  b private.live_checkout_bindings%ROWTYPE;
  o public.orders%ROWTYPE;
  p private.live_checkout_sale_policy%ROWTYPE;
  reserved private.live_checkout_stock_reservations%ROWTYPE;
  guest_owner_digest_ bytea;
BEGIN
  IF p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 99 THEN RETURN false; END IF;
  SELECT * INTO b FROM private.live_checkout_bindings
    WHERE (account_id,order_id,attempt_id)=(p_account_id,p_order_id,p_attempt_id) FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id AND status='pending_payment' FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT FROM public.payment_attempts WHERE id=p_attempt_id AND order_id=o.id
    AND checkout_environment=o.checkout_environment AND provider='stripe' AND status IN ('requires_payment','processing'))
    THEN RETURN false; END IF;
  SELECT sha256(convert_to(c.guest_token_hash,'UTF8')) INTO guest_owner_digest_ FROM public.carts c
    WHERE c.id=o.cart_id AND c.checkout_generation=o.checkout_generation AND c.status='active'
      AND c.user_id IS NOT DISTINCT FROM o.user_id FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO p FROM private.live_checkout_sale_policy WHERE singleton AND enabled AND
    (account_id,variant_id,provider_environment)=(p_account_id,p_variant_id,o.checkout_environment::text) FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT FROM private.helix_environment WHERE singleton AND project_ref=p.project_ref
    AND environment=CASE p.provider_environment WHEN 'live' THEN 'production' ELSE 'development' END)
    THEN RETURN false; END IF;
  IF (b.terms->>'environment',o.currency,b.terms->>'taxBehavior',b.terms->'automaticTaxEnabled')
    IS DISTINCT FROM (p.provider_environment,p.currency,p.tax_behavior,to_jsonb(p.automatic_tax_enabled))
    OR o.merchandise_subtotal_cents<>p.unit_price_cents::bigint*p_quantity OR o.discount_cents<>0
    OR o.shipping_cents<>(CASE WHEN o.merchandise_subtotal_cents>=p.free_shipping_threshold_cents THEN 0 ELSE p.shipping_cents END)
    OR (o.shipping_cents>0 AND b.terms->>'shippingRateId' IS DISTINCT FROM p.shipping_rate_id)
    OR (SELECT count(*) FROM public.order_items WHERE order_id=o.id)<>1 THEN RETURN false; END IF;
  PERFORM FROM public.product_variants v JOIN public.products product ON product.id=v.product_id
    JOIN public.order_items i ON (i.product_id,i.variant_key)=(product.id,v.variant_key)
    WHERE v.id=p.variant_id AND v.sku=p.sku AND v.price_cents=p.unit_price_cents AND v.available
      AND v.archived_at IS NULL AND v.inventory_status IN ('in_stock','low_stock')
      AND product.status='available' AND product.catalog_status='active' AND product.currency=p.currency
      AND i.order_id=o.id AND (i.unit_price_cents,i.quantity)=(p.unit_price_cents,p_quantity)
      AND i.line_subtotal_cents=o.merchandise_subtotal_cents
      AND (i.product_snapshot->>'sku',i.product_snapshot->>'variantId',i.product_snapshot->>'taxCode',
           i.product_snapshot->>'shipper',i.product_snapshot->>'dispatchTerms',i.product_snapshot->>'returnTerms')
        IS NOT DISTINCT FROM (p.sku,p.variant_id::text,p.tax_code,p.shipper,p.dispatch_terms,p.return_terms)
    FOR SHARE OF v,product,i;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO reserved FROM private.live_checkout_stock_reservations WHERE order_id=o.id;
  IF FOUND THEN RETURN reserved.state='held' AND
    (reserved.account_id,reserved.attempt_id,reserved.variant_id,reserved.quantity,reserved.provider_environment,reserved.guest_owner_digest)
    IS NOT DISTINCT FROM (p.account_id,p_attempt_id,p.variant_id,p_quantity,p.provider_environment,guest_owner_digest_); END IF;
  IF b.first_send_at IS NOT NULL OR b.session_id IS NOT NULL OR p_quantity>p.approved_units-p.allocated_units THEN
    RETURN false;
  END IF;
  INSERT INTO private.live_checkout_stock_reservations(order_id,attempt_id,account_id,provider_environment,variant_id,quantity,guest_owner_digest,state)
    VALUES(o.id,p_attempt_id,p.account_id,p.provider_environment,p.variant_id,p_quantity,guest_owner_digest_,'held');
  UPDATE private.live_checkout_sale_policy SET allocated_units=allocated_units+p_quantity WHERE singleton;
  RETURN true;
END;
$inventory$;

-- The verified settlement routines write the binding and Attempt before changing
-- the Order. The same transaction consumes or releases its original units.
CREATE FUNCTION private.settle_first_order_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $inventory$
DECLARE
  r private.live_checkout_stock_reservations%ROWTYPE;
  b private.live_checkout_bindings%ROWTYPE;
  a public.payment_attempts%ROWTYPE;
  issuing_cart_id uuid;
BEGIN
  IF OLD.status<>'pending_payment' OR NEW.status NOT IN ('paid','payment_failed','cancelled')
     OR NEW.checkout_environment::text NOT IN ('live','business_sandbox') THEN RETURN NEW; END IF;
  SELECT * INTO r FROM private.live_checkout_stock_reservations WHERE order_id=NEW.id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT * INTO STRICT b FROM private.live_checkout_bindings WHERE (account_id,order_id,attempt_id)=(r.account_id,r.order_id,r.attempt_id);
  SELECT * INTO STRICT a FROM public.payment_attempts WHERE id=r.attempt_id AND order_id=r.order_id;
  IF r.state<>'held' OR r.provider_environment<>NEW.checkout_environment::text OR a.checkout_environment<>NEW.checkout_environment THEN
    RAISE EXCEPTION 'First-order stock state does not match this settlement';
  END IF;
  -- Keep financial settlement independent of subsequent cart edits or transfers.
  SELECT c.id INTO issuing_cart_id FROM public.carts c WHERE c.id=NEW.cart_id AND c.status='active'
    AND c.checkout_generation=NEW.checkout_generation AND c.user_id IS NOT DISTINCT FROM NEW.user_id
    AND sha256(convert_to(c.guest_token_hash,'UTF8')) IS NOT DISTINCT FROM r.guest_owner_digest FOR UPDATE;
  IF NEW.status='paid' AND a.status='paid' AND a.raw_status='paid' AND b.payment_intent_id IS NOT NULL
    AND b.verified_facts IS NOT NULL AND b.session_id IS NOT NULL AND b.first_send_at IS NOT NULL THEN
    UPDATE private.live_checkout_stock_reservations SET state='consumed' WHERE order_id=NEW.id;
    DELETE FROM public.cart_items ci USING public.order_items oi
      WHERE ci.cart_id=issuing_cart_id AND oi.order_id=NEW.id
        AND (ci.product_id,ci.variant_key,ci.quantity)=(oi.product_id,oi.variant_key,oi.quantity)
        AND ci.quantity=r.quantity;
  ELSIF b.verified_facts IS NULL AND b.payment_intent_id IS NULL AND
    ((b.first_send_at IS NOT NULL AND b.session_id IS NOT NULL AND (
       (NEW.status='payment_failed' AND a.status='failed' AND a.raw_status='failed') OR
       (NEW.status='cancelled' AND a.status='cancelled' AND a.raw_status='expired'))) OR
     (b.first_send_at IS NULL AND b.session_id IS NULL AND NEW.status='cancelled'
       AND a.status='cancelled' AND a.raw_status='never_submitted')) THEN
    UPDATE private.live_checkout_sale_policy SET allocated_units=allocated_units-r.quantity WHERE singleton
      AND (provider_environment,account_id,variant_id)=(r.provider_environment,r.account_id,r.variant_id)
      AND allocated_units>=r.quantity;
    IF NOT FOUND THEN RAISE EXCEPTION 'First-order stock allocation is inconsistent'; END IF;
    UPDATE private.live_checkout_stock_reservations SET state='released' WHERE order_id=NEW.id;
    UPDATE public.carts SET checkout_generation=gen_random_uuid() WHERE id=issuing_cart_id;
  ELSE
    RAISE EXCEPTION 'First-order terminal status requires matching payment evidence';
  END IF;
  RETURN NEW;
END;
$inventory$;
CREATE TRIGGER settle_first_order_stock AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.settle_first_order_stock();

CREATE FUNCTION private.release_unsent_live_checkout_stock(p_account_id text,p_order_id uuid,p_attempt_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $inventory$
DECLARE
  b private.live_checkout_bindings%ROWTYPE;
  o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO b FROM private.live_checkout_bindings WHERE
    (account_id,order_id,attempt_id)=(p_account_id,p_order_id,p_attempt_id) FOR UPDATE;
  IF NOT FOUND OR b.first_send_at IS NOT NULL OR b.session_id IS NOT NULL
    OR b.payment_intent_id IS NOT NULL OR b.verified_facts IS NOT NULL THEN RETURN false; END IF;
  SELECT * INTO o FROM public.orders WHERE id=b.order_id AND status='pending_payment' FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT FROM private.live_checkout_stock_reservations WHERE order_id=o.id
    AND (attempt_id,account_id,provider_environment,state)=(b.attempt_id,b.account_id,o.checkout_environment::text,'held')) THEN
    RETURN false;
  END IF;
  UPDATE public.payment_attempts SET status='cancelled',raw_status='never_submitted' WHERE id=b.attempt_id
    AND order_id=o.id AND checkout_environment=o.checkout_environment AND status IN ('requires_payment','processing');
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.orders SET status='cancelled',cancelled_at=clock_timestamp() WHERE id=o.id;
  RETURN true;
END;
$inventory$;
REVOKE ALL ON FUNCTION private.guard_first_order_policy(),private.settle_first_order_stock(),
  private.reserve_live_checkout_stock(text,uuid,uuid,uuid,integer),private.release_unsent_live_checkout_stock(text,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
END;
$phase$;
