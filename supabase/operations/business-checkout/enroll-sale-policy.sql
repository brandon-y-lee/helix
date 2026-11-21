-- Manual operator entrypoint. Provide psql variables operation and sale_policy
-- (a JSON object). No invocation from migration, deployment, or application code.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path=pg_catalog,pg_temp;
CREATE TEMP TABLE first_order_operator_input ON COMMIT DROP AS
  SELECT :'operation'::text AS action, :'sale_policy'::jsonb AS plan;

DO $operator$
DECLARE
  action_ text;
  input_ jsonb;
  full_plan jsonb;
  identity_keys constant text[] := ARRAY['project_ref','provider_environment','account_id','variant_id','sku'];
  configuration_keys constant text[] := ARRAY['currency','unit_price_cents','approved_units','shipping_cents',
    'free_shipping_threshold_cents','shipping_rate_id','shipper','automatic_tax_enabled','tax_behavior',
    'tax_code','dispatch_terms','return_terms'];
  expected_keys text[];
  key_ text;
  desired private.live_checkout_sale_policy;
  existing private.live_checkout_sale_policy;
  row_version text;
  policy_snapshot record;
BEGIN
  IF current_user<>'postgres' OR session_user<>current_user THEN
    RAISE EXCEPTION 'Sale policy requires the directly authenticated database owner';
  END IF;
  SELECT action,plan INTO STRICT action_,input_ FROM pg_temp.first_order_operator_input;
  IF action_ IS NULL OR action_ NOT IN ('enroll','inspect','open','pause')
    OR jsonb_typeof(input_) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Expected an explicit operation and JSON policy object';
  END IF;
  expected_keys:=identity_keys;
  IF action_ IN ('enroll','open') THEN expected_keys:=expected_keys||configuration_keys; END IF;
  IF action_='open' THEN expected_keys:=array_append(expected_keys,'expected_policy_version'); END IF;
  IF NOT input_ ?& expected_keys OR input_-expected_keys<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Missing or unexpected sale-policy fields for this operation';
  END IF;
  FOREACH key_ IN ARRAY expected_keys LOOP
    IF key_ IN ('unit_price_cents','approved_units','shipping_cents','free_shipping_threshold_cents') THEN
      IF jsonb_typeof(input_->key_) IS DISTINCT FROM 'number' OR input_->>key_ !~ '^[0-9]{1,10}$' THEN
        RAISE EXCEPTION 'An explicit nonnegative whole number is required for %',key_;
      END IF;
    ELSIF key_='expected_policy_version' THEN
      IF jsonb_typeof(input_->key_) IS DISTINCT FROM 'string' OR input_->>key_ !~ '^[0-9]{1,10}$' THEN
        RAISE EXCEPTION 'Supply the policy version from a fresh readback';
      END IF;
    ELSIF key_='automatic_tax_enabled' THEN
      IF jsonb_typeof(input_->key_) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Supply a boolean tax decision'; END IF;
    ELSIF key_='shipping_rate_id' AND input_->key_='null'::jsonb THEN
      IF input_->>'shipping_cents' <> '0' THEN RAISE EXCEPTION 'A charged shipment requires a rate'; END IF;
    ELSIF jsonb_typeof(input_->key_) IS DISTINCT FROM 'string' OR length(btrim(input_->>key_))=0 THEN
      RAISE EXCEPTION 'An explicit nonempty value is required for %',key_;
    END IF;
  END LOOP;
  full_plan:=input_-'expected_policy_version';
  desired:=jsonb_populate_record(NULL::private.live_checkout_sale_policy,full_plan);
  IF desired.account_id !~ '^acct_[A-Za-z0-9]{1,120}$' OR desired.account_id='acct_1Tm9WRFEzyaKzdmq'
    OR NOT EXISTS (SELECT FROM private.helix_environment WHERE singleton AND project_ref=desired.project_ref AND
      ((environment,project_ref,desired.provider_environment)=('production','erasogmsqpgiirovubjh','live') OR
       (environment,project_ref,desired.provider_environment)=('development','zyfkunnpnlmgvrojmrbg','business_sandbox')) FOR SHARE)
    THEN RAISE EXCEPTION 'The requested business issuer does not match this database'; END IF;

  -- Serialize initial enrollment and concurrent owners. Admission also locks the
  -- one policy row, so an accepted send has a clear order relative to a pause.
  IF action_<>'inspect' THEN LOCK TABLE private.live_checkout_sale_policy IN EXCLUSIVE MODE; END IF;
  SELECT p AS configuration,p.xmin::text AS version INTO policy_snapshot
    FROM private.live_checkout_sale_policy p WHERE p.singleton;
  IF FOUND THEN existing:=policy_snapshot.configuration; row_version:=policy_snapshot.version; END IF;
  IF existing.singleton THEN
    IF (existing.project_ref,existing.provider_environment,existing.account_id,existing.variant_id,existing.sku)
      IS DISTINCT FROM (desired.project_ref,desired.provider_environment,desired.account_id,desired.variant_id,desired.sku)
      THEN RAISE EXCEPTION 'The enrolled issuer or SKU differs'; END IF;
    IF action_ IN ('enroll','open') AND
      to_jsonb(existing)-ARRAY['singleton','enabled','allocated_units'] IS DISTINCT FROM full_plan THEN
      RAISE EXCEPTION 'The requested plan differs from the enrolled plan';
    END IF;
  ELSIF action_<>'enroll' THEN RAISE EXCEPTION 'No sale policy is enrolled'; END IF;

  IF action_='open' OR (action_='enroll' AND existing.singleton IS NULL) THEN
    PERFORM FROM public.product_variants v JOIN public.products product ON product.id=v.product_id
      WHERE v.id=desired.variant_id AND v.sku=desired.sku AND v.price_cents=desired.unit_price_cents
        AND v.available AND v.archived_at IS NULL AND v.inventory_status IN ('in_stock','low_stock')
        AND product.catalog_status='active' AND product.status='available' AND product.currency=desired.currency
      FOR SHARE OF v,product;
    IF NOT FOUND THEN RAISE EXCEPTION 'The canonical Catalog cannot sell this variant at this price'; END IF;
  END IF;
  IF action_='enroll' AND existing.singleton IS NULL THEN
    INSERT INTO private.live_checkout_sale_policy(project_ref,provider_environment,account_id,variant_id,sku,
      currency,unit_price_cents,approved_units,shipping_cents,free_shipping_threshold_cents,shipping_rate_id,
      shipper,automatic_tax_enabled,tax_behavior,tax_code,dispatch_terms,return_terms)
    VALUES(desired.project_ref,desired.provider_environment,desired.account_id,desired.variant_id,desired.sku,
      desired.currency,desired.unit_price_cents,desired.approved_units,desired.shipping_cents,
      desired.free_shipping_threshold_cents,desired.shipping_rate_id,desired.shipper,desired.automatic_tax_enabled,
      desired.tax_behavior,desired.tax_code,desired.dispatch_terms,desired.return_terms);
  ELSIF action_='open' THEN
    IF (NOT existing.enabled AND row_version IS DISTINCT FROM input_->>'expected_policy_version')
      OR NOT existing.automatic_tax_enabled OR existing.approved_units<=existing.allocated_units THEN
      RAISE EXCEPTION 'Opening requires a fresh policy readback, qualified tax and available stock';
    END IF;
    IF NOT existing.enabled THEN UPDATE private.live_checkout_sale_policy SET enabled=true WHERE singleton; END IF;
  ELSIF action_='pause' AND existing.enabled THEN
    UPDATE private.live_checkout_sale_policy SET enabled=false WHERE singleton;
  END IF;
END;
$operator$;
-- Readback excludes customer, payment and provider credentials. The version
-- changes after every real stock or policy change and is required to reopen.
SELECT jsonb_build_object('approved_plan',to_jsonb(p)-ARRAY['singleton','enabled','allocated_units'],
  'enabled',p.enabled,'allocated_units',p.allocated_units,'available_units',p.approved_units-p.allocated_units,
  'policy_version',p.xmin::text) AS sale_policy_state
FROM private.live_checkout_sale_policy p WHERE singleton;
COMMIT;
