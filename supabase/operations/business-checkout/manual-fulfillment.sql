-- The original sandbox shipment package is optional on the production baseline.
-- Keep the live record attached to its canonical Order and paid stock allocation.
CREATE FUNCTION private.install_first_order_fulfillment() RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,pg_temp AS $phase$
BEGIN
CREATE TABLE private.business_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES private.live_checkout_stock_reservations(order_id),
  state text NOT NULL CHECK(state IN ('preparing','dispatched','delivered','exception','cancelled')),
  version integer NOT NULL CHECK(version BETWEEN 1 AND 100),
  carrier text NOT NULL, tracking_reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  dispatched_at timestamptz, delivered_at timestamptz, released boolean NOT NULL DEFAULT false,
  CHECK(NOT released OR (state='cancelled' AND dispatched_at IS NULL))
);
CREATE INDEX business_shipments_order ON private.business_shipments(order_id);
CREATE TABLE private.business_shipment_items (
  shipment_id uuid NOT NULL REFERENCES private.business_shipments(id),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id),
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 99),
  PRIMARY KEY(shipment_id,order_item_id)
);
CREATE INDEX business_shipment_items_line ON private.business_shipment_items(order_item_id);
CREATE TABLE private.business_shipment_commands (
  command_id uuid PRIMARY KEY, actor_id uuid NOT NULL, order_id uuid NOT NULL REFERENCES public.orders(id),
  shipment_id uuid NOT NULL REFERENCES private.business_shipments(id),
  version integer NOT NULL, previous_state text, payload jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(shipment_id,version)
);
ALTER TABLE private.business_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.business_shipments FORCE ROW LEVEL SECURITY;
ALTER TABLE private.business_shipment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.business_shipment_items FORCE ROW LEVEL SECURITY;
ALTER TABLE private.business_shipment_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.business_shipment_commands FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.business_shipments,private.business_shipment_items,private.business_shipment_commands
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.business_fulfillment_paid(p_environment text,p_account_id text,p_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $paid$
  SELECT EXISTS (
    SELECT FROM private.live_checkout_stock_reservations r
    JOIN private.live_checkout_bindings b ON (b.account_id,b.order_id,b.attempt_id)=(r.account_id,r.order_id,r.attempt_id)
    JOIN public.orders o ON o.id=b.order_id
    JOIN public.payment_attempts a ON a.id=b.attempt_id AND a.order_id=o.id
    JOIN private.live_checkout_sale_policy p ON (p.provider_environment,p.account_id,p.variant_id)=(r.provider_environment,r.account_id,r.variant_id)
    JOIN private.helix_environment e ON e.singleton AND e.project_ref=p.project_ref
    WHERE r.order_id=p_order_id AND r.account_id=p_account_id AND r.provider_environment=p_environment
      AND (p_environment,e.environment,e.project_ref) IN (
        ('live','production','erasogmsqpgiirovubjh'),('business_sandbox','development','zyfkunnpnlmgvrojmrbg'))
      AND r.state='consumed' AND o.checkout_environment::text=p_environment AND a.checkout_environment=o.checkout_environment
      AND o.status IN ('paid','refunded') AND a.status IN ('paid','refunded') AND a.provider='stripe'
      AND o.paid_at IS NOT NULL AND b.verified_facts->>'paymentIntentId'=b.payment_intent_id
      AND b.verified_facts->>'sessionId'=b.session_id AND b.verified_facts->>'orderId'=b.order_id::text
      AND b.verified_facts->>'attemptId'=b.attempt_id::text AND b.verified_facts->>'currency'=o.currency
      AND b.verified_facts->>'totalCents'=o.total_cents::text AND a.amount_cents=o.total_cents
      AND b.terms->'lines'=private.checkout_order_lines(o.id)
      AND r.quantity=(SELECT sum(i.quantity) FROM public.order_items i WHERE i.order_id=o.id)
  );
$paid$;

CREATE FUNCTION private.business_shipment_projection(p_environment text,p_order_id uuid,p_operator boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $projection$
  SELECT jsonb_build_object('environment',p_environment,'shipments',coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'state',s.state,'version',s.version,'carrier',s.carrier,'trackingReference',s.tracking_reference,
    'dispatchedAt',s.dispatched_at,'deliveredAt',s.delivered_at,'items',(SELECT jsonb_agg(
      jsonb_build_object('name',i.product_name,'quantity',si.quantity) ORDER BY i.id)
      FROM private.business_shipment_items si JOIN public.order_items i ON i.id=si.order_item_id
      WHERE si.shipment_id=s.id AND i.order_id=s.order_id)) ORDER BY s.created_at,s.id),'[]'::jsonb))
  FROM private.business_shipments s WHERE s.order_id=p_order_id AND (p_operator OR s.dispatched_at IS NOT NULL);
$projection$;

CREATE FUNCTION private.read_business_shipment_order(p_environment text,p_account_id text,p_order_number text,p_actor_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $lookup$
  SELECT private.business_shipment_projection(p_environment,o.id,true) || jsonb_build_object(
    'orderId',o.id,'orderNumber',o.order_number,'eligible',o.status='paid' AND b.refunded_cents=0,
    'delivery',jsonb_build_object('name',b.verified_facts->>'shippingName','address',
      (SELECT jsonb_object_agg(k,b.verified_facts->'shippingAddress'->k)
       FROM unnest(ARRAY['line1','line2','city','state','postal_code','country']) k)),
    'lines',(SELECT jsonb_agg(jsonb_build_object('id',i.id,'name',i.product_name,'quantity',i.quantity,
      'allocatedQuantity',(SELECT coalesce(sum(si.quantity),0) FROM private.business_shipment_items si
        JOIN private.business_shipments s ON s.id=si.shipment_id WHERE si.order_item_id=i.id AND NOT s.released))
      ORDER BY i.id) FROM public.order_items i WHERE i.order_id=o.id))
  FROM public.orders o JOIN private.live_checkout_bindings b ON b.order_id=o.id
  WHERE o.order_number=p_order_number AND b.account_id=p_account_id
    AND EXISTS (SELECT FROM public.admin_memberships WHERE user_id=p_actor_id AND active AND role='admin')
    AND private.business_fulfillment_paid(p_environment,p_account_id,o.id);
$lookup$;

CREATE FUNCTION private.read_business_order_shipments(p_environment text,p_account_id text,p_order_id uuid,p_session_id text,
  p_user_id uuid,p_receipt_token_hash text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $customer$
  SELECT private.business_shipment_projection(p_environment,b.order_id,false)
  FROM private.live_checkout_bindings b WHERE b.account_id=p_account_id
    AND (p_order_id IS NOT NULL OR p_session_id IS NOT NULL) AND (p_order_id IS NULL OR b.order_id=p_order_id)
    AND (p_session_id IS NULL OR b.session_id=p_session_id)
    AND private.authorize_business_checkout_receipt(p_environment,p_account_id,b.order_id,b.session_id,p_user_id,p_receipt_token_hash)
    AND private.business_fulfillment_paid(p_environment,p_account_id,b.order_id);
$customer$;

CREATE FUNCTION private.apply_business_shipment(p_environment text,p_account_id text,p_actor_id uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $apply$
DECLARE
  order_id_ uuid; command_id_ uuid; shipment_id_ uuid; expected_ integer; state_ text; reason_ text;
  s private.business_shipments%ROWTYPE; prior private.business_shipment_commands%ROWTYPE;
  paid_without_refund boolean; previous_ text; line_ jsonb; line_id_ uuid; quantity_ integer; remaining_ integer;
BEGIN
  PERFORM FROM public.admin_memberships WHERE user_id=p_actor_id AND active AND role='admin' FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','forbidden'); END IF;
  IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR pg_column_size(p_command)>65536 THEN
    RETURN jsonb_build_object('status','invalid'); END IF;
  IF NOT (p_command ?& ARRAY['carrier','commandId','correctionReason','expectedVersion','lines','orderId','shipmentId','state','trackingReference'])
    OR p_command-ARRAY['carrier','commandId','correctionReason','expectedVersion','lines','orderId','shipmentId','state','trackingReference']<>'{}'::jsonb
    OR jsonb_typeof(p_command->'lines')<>'array' OR jsonb_typeof(p_command->'carrier')<>'string'
    OR jsonb_typeof(p_command->'trackingReference')<>'string' OR jsonb_typeof(p_command->'correctionReason') NOT IN ('string','null')
    OR jsonb_typeof(p_command->'expectedVersion')<>'number' THEN RETURN jsonb_build_object('status','invalid'); END IF;
  order_id_:=(p_command->>'orderId')::uuid; command_id_:=(p_command->>'commandId')::uuid;
  shipment_id_:=(p_command->>'shipmentId')::uuid; expected_:=(p_command->>'expectedVersion')::integer;
  state_:=p_command->>'state'; reason_:=p_command->>'correctionReason';
  IF order_id_ IS NULL OR command_id_ IS NULL OR state_ IS NULL OR state_ NOT IN ('preparing','dispatched','delivered','exception','cancelled')
    OR expected_ NOT BETWEEN 0 AND 100 OR (p_command->>'expectedVersion') !~ '^[0-9]+$'
    OR jsonb_array_length(p_command->'lines')>100 OR length(p_command->>'carrier')>100
    OR length(p_command->>'trackingReference')>200 OR concat(p_command->>'carrier',p_command->>'trackingReference',reason_) ~ '[[:cntrl:]]'
    OR (reason_ IS NOT NULL AND (btrim(reason_)='' OR length(reason_)>500)) THEN RETURN jsonb_build_object('status','invalid'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(command_id_::text,592));
  -- Refund locks this binding before the Order. Use the same order for dispatch.
  PERFORM FROM private.live_checkout_bindings WHERE account_id=p_account_id AND order_id=order_id_ FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','ineligible'); END IF;
  PERFORM FROM public.orders WHERE id=order_id_ AND checkout_environment::text=p_environment FOR UPDATE;
  IF NOT FOUND OR NOT private.business_fulfillment_paid(p_environment,p_account_id,order_id_) THEN
    RETURN jsonb_build_object('status','ineligible'); END IF;
  SELECT * INTO prior FROM private.business_shipment_commands WHERE command_id=command_id_;
  IF FOUND THEN
    IF prior.actor_id=p_actor_id AND prior.order_id=order_id_ AND prior.payload=p_command THEN
      RETURN jsonb_build_object('status','replayed','shipmentId',prior.shipment_id,'version',prior.version);
    END IF;
    RETURN jsonb_build_object('status','conflict');
  END IF;
  SELECT o.status='paid' AND b.refunded_cents=0 INTO STRICT paid_without_refund FROM public.orders o
    JOIN private.live_checkout_bindings b ON b.order_id=o.id WHERE o.id=order_id_;
  IF shipment_id_ IS NULL THEN
    IF state_<>'preparing' OR expected_<>0 OR reason_ IS NOT NULL OR NOT paid_without_refund
      OR jsonb_array_length(p_command->'lines')<1 OR (SELECT count(*) FROM private.business_shipments WHERE order_id=order_id_)>=100
      THEN RETURN jsonb_build_object('status','ineligible'); END IF;
    IF (SELECT count(DISTINCT x->>'orderItemId') FROM jsonb_array_elements(p_command->'lines') x)<>jsonb_array_length(p_command->'lines') THEN
      RETURN jsonb_build_object('status','invalid'); END IF;
    FOR line_ IN SELECT value FROM jsonb_array_elements(p_command->'lines') LOOP
      IF jsonb_typeof(line_)<>'object' OR NOT(line_ ?& ARRAY['orderItemId','quantity']) OR line_-ARRAY['orderItemId','quantity']<>'{}'::jsonb
        OR jsonb_typeof(line_->'quantity')<>'number' OR (line_->>'quantity') !~ '^[1-9][0-9]?$'
        THEN RETURN jsonb_build_object('status','invalid'); END IF;
      line_id_:=(line_->>'orderItemId')::uuid; quantity_:=(line_->>'quantity')::integer;
      SELECT i.quantity-(SELECT coalesce(sum(si.quantity),0) FROM private.business_shipment_items si
        JOIN private.business_shipments ms ON ms.id=si.shipment_id WHERE si.order_item_id=i.id AND NOT ms.released)
        INTO remaining_ FROM public.order_items i WHERE i.order_id=order_id_ AND i.id=line_id_;
      IF NOT FOUND OR quantity_>remaining_ THEN RETURN jsonb_build_object('status','conflict'); END IF;
    END LOOP;
    INSERT INTO private.business_shipments(order_id,state,version,carrier,tracking_reference)
      VALUES(order_id_,'preparing',1,p_command->>'carrier',p_command->>'trackingReference') RETURNING * INTO s;
    INSERT INTO private.business_shipment_items(shipment_id,order_item_id,quantity)
      SELECT s.id,(x->>'orderItemId')::uuid,(x->>'quantity')::integer FROM jsonb_array_elements(p_command->'lines') x;
  ELSE
    SELECT * INTO s FROM private.business_shipments WHERE id=shipment_id_ AND order_id=order_id_ FOR UPDATE;
    IF NOT FOUND OR s.version<>expected_ OR s.version>=100 OR s.state='cancelled' OR jsonb_array_length(p_command->'lines')<>0 THEN
      RETURN jsonb_build_object('status','conflict'); END IF;
    previous_:=s.state;
    IF state_=s.state THEN
      IF (s.carrier,s.tracking_reference)=(p_command->>'carrier',p_command->>'trackingReference')
        THEN RETURN jsonb_build_object('status','conflict'); END IF;
    ELSIF NOT ((s.state='preparing' AND state_ IN ('dispatched','exception','cancelled'))
        OR (s.state='dispatched' AND state_ IN ('delivered','exception','cancelled'))
        OR (s.state='exception' AND state_ IN ('dispatched','delivered','cancelled'))
        OR (s.state='delivered' AND state_ IN ('exception','cancelled'))) THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF (s.state='delivered' AND reason_ IS NULL) OR (state_='delivered' AND s.dispatched_at IS NULL)
      THEN RETURN jsonb_build_object('status','invalid'); END IF;
    IF s.state<>state_ AND state_='dispatched' AND NOT paid_without_refund THEN RETURN jsonb_build_object('status','ineligible'); END IF;
    UPDATE private.business_shipments SET version=version+1,state=state_,carrier=p_command->>'carrier',
      tracking_reference=p_command->>'trackingReference',
      dispatched_at=CASE WHEN state_='dispatched' THEN coalesce(dispatched_at,clock_timestamp()) ELSE dispatched_at END,
      delivered_at=CASE WHEN state_='delivered' THEN coalesce(delivered_at,clock_timestamp()) END,
      released=(state_='cancelled' AND s.state='preparing' AND dispatched_at IS NULL)
      WHERE id=shipment_id_ RETURNING * INTO s;
  END IF;
  INSERT INTO private.business_shipment_commands(command_id,actor_id,order_id,shipment_id,version,previous_state,payload)
    VALUES(command_id_,p_actor_id,order_id_,s.id,s.version,previous_,p_command);
  RETURN jsonb_build_object('status','applied','shipmentId',s.id,'version',s.version);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('status','invalid');
END;
$apply$;

CREATE FUNCTION public.read_business_shipment_order(p_environment text,p_account_id text,p_order_number text,p_actor_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp
AS $api$ SELECT private.read_business_shipment_order(p_environment,p_account_id,p_order_number,p_actor_id) $api$;
CREATE FUNCTION public.apply_business_shipment(p_environment text,p_account_id text,p_actor_id uuid,p_command jsonb)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp
AS $api$ SELECT private.apply_business_shipment(p_environment,p_account_id,p_actor_id,p_command) $api$;
CREATE FUNCTION public.read_business_order_shipments(p_environment text,p_account_id text,p_order_id uuid,p_session_id text,p_user_id uuid,p_receipt_token_hash text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp
AS $api$ SELECT private.read_business_order_shipments(p_environment,p_account_id,p_order_id,p_session_id,p_user_id,p_receipt_token_hash) $api$;
REVOKE ALL ON FUNCTION private.business_fulfillment_paid(text,text,uuid),private.business_shipment_projection(text,uuid,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.read_business_shipment_order(text,text,text,uuid),public.read_business_shipment_order(text,text,text,uuid),
  private.apply_business_shipment(text,text,uuid,jsonb),public.apply_business_shipment(text,text,uuid,jsonb),
  private.read_business_order_shipments(text,text,uuid,text,uuid,text),public.read_business_order_shipments(text,text,uuid,text,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.read_business_shipment_order(text,text,text,uuid),public.read_business_shipment_order(text,text,text,uuid),
  private.apply_business_shipment(text,text,uuid,jsonb),public.apply_business_shipment(text,text,uuid,jsonb),
  private.read_business_order_shipments(text,text,uuid,text,uuid,text),public.read_business_order_shipments(text,text,uuid,text,uuid,text)
  TO service_role;
END;
$phase$;
