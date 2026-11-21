-- Runs inside the native first-Order test transaction after a real reservation,
-- verified settlement and stock consumption on the disposable target.
DO $fulfillment_test$
DECLARE
  operator_id CONSTANT uuid:='592a0000-0000-4000-8000-000000000001';
  editor_id CONSTANT uuid:='592a0000-0000-4000-8000-000000000002';
  inactive_id CONSTANT uuid:='592a0000-0000-4000-8000-000000000003';
  order_id_ uuid; number_ text; account_ text; environment_ text; session_ text; customer_ uuid; receipt_ text;
  verified jsonb; other_number text; line_id uuid; pending_line uuid; units integer; shipments jsonb; lookup_ jsonb;
  command_ jsonb; next_ jsonb; result_ jsonb; parcel_id uuid; prior_email_count bigint; refund_value integer;
  refunded_id uuid; refunded_number text; alternate_environment text;
  status_after public.order_status; reward_after integer;
BEGIN
  SELECT o.id,o.order_number,r.account_id,r.provider_environment,b.session_id,o.user_id,b.receipt_hash,b.verified_facts,b.refunded_cents
    INTO STRICT order_id_,number_,account_,environment_,session_,customer_,receipt_,verified,refund_value
    FROM pg_temp.first_order_test_ids x JOIN public.orders o ON o.id=x.order_id
    JOIN private.live_checkout_stock_reservations r ON r.order_id=o.id AND r.state='consumed'
    JOIN private.live_checkout_bindings b ON b.order_id=o.id WHERE x.purpose='paid';
  SELECT o.order_number,i.id INTO STRICT other_number,pending_line FROM pg_temp.first_order_test_ids x
    JOIN public.orders o ON o.id=x.order_id JOIN public.order_items i ON i.order_id=o.id WHERE x.purpose='pending';
  SELECT id,quantity INTO STRICT line_id,units FROM public.order_items WHERE order_id=order_id_;
  SELECT o.id,o.order_number INTO STRICT refunded_id,refunded_number FROM pg_temp.first_order_test_ids x
    JOIN public.orders o ON o.id=x.order_id WHERE x.purpose='refunded' AND o.status='refunded';
  alternate_environment:=CASE WHEN environment_='live' THEN 'business_sandbox' ELSE 'live' END;
  -- Closing new sales must leave the verified prior Order fulfillable.
  UPDATE private.live_checkout_sale_policy SET enabled=false WHERE singleton;
  SELECT count(*) INTO prior_email_count FROM private.email_intents;
  INSERT INTO auth.users(id) VALUES(operator_id),(editor_id),(inactive_id);
  INSERT INTO public.admin_memberships(user_id,role,active) VALUES(operator_id,'admin',true),
    (editor_id,'catalog_editor',true),(inactive_id,'admin',false);

  SET LOCAL ROLE service_role;
  lookup_:=public.read_business_shipment_order(environment_,account_,number_,operator_id);
  IF lookup_->>'environment' IS DISTINCT FROM environment_ OR lookup_->>'orderId' IS DISTINCT FROM order_id_::text
    OR lookup_->'eligible' IS DISTINCT FROM 'true'::jsonb
    OR lookup_->'delivery'->>'name' IS DISTINCT FROM verified->>'shippingName'
    OR lookup_->'delivery'->'address'->>'line1' IS DISTINCT FROM verified->'shippingAddress'->>'line1'
    OR lookup_->'delivery'->'address'->>'country' IS DISTINCT FROM 'US'
    OR (lookup_->'delivery'->'address')-ARRAY['line1','line2','city','state','postal_code','country']<>'{}'::jsonb
    OR (lookup_->'delivery')-ARRAY['name','address']<>'{}'::jsonb
    OR lookup_-ARRAY['orderId','orderNumber','environment','shipments','eligible','delivery','lines']<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Operator shipping projection differs from the authorized physical delivery snapshot';
  END IF;
  IF public.read_business_shipment_order(environment_,account_,number_,editor_id) IS NOT NULL
    OR public.read_business_shipment_order(environment_,account_,number_,inactive_id) IS NOT NULL
    OR public.read_business_shipment_order(environment_,'acct_wrong',number_,operator_id) IS NOT NULL
    OR public.read_business_shipment_order(alternate_environment,account_,number_,operator_id) IS NOT NULL
    OR public.read_business_shipment_order(environment_,account_,other_number,operator_id) IS NOT NULL THEN
    RAISE EXCEPTION 'A nonoperator, other environment/merchant or unpaid Order acquired shipping details';
  END IF;
  command_:=jsonb_build_object('commandId',gen_random_uuid(),'orderId',order_id_,'shipmentId',NULL,'expectedVersion',0,
    'state','preparing','carrier','Fixture carrier','trackingReference','FIXTURE-592','correctionReason',NULL,
    'lines',jsonb_build_array(jsonb_build_object('orderItemId',line_id,'quantity',units)));
  IF public.apply_business_shipment(environment_,account_,editor_id,command_)->>'status' IS DISTINCT FROM 'forbidden'
    OR public.apply_business_shipment(environment_,'acct_wrong',operator_id,command_)->>'status' IS DISTINCT FROM 'ineligible'
    OR public.read_business_shipment_order(environment_,account_,refunded_number,operator_id)->'eligible' IS DISTINCT FROM 'false'::jsonb
    OR public.apply_business_shipment(environment_,account_,operator_id,command_||jsonb_build_object('orderId',refunded_id))->>'status'
      IS DISTINCT FROM 'ineligible'
    OR public.apply_business_shipment(environment_,account_,operator_id,jsonb_set(command_,'{lines,0,orderItemId}',to_jsonb(pending_line)))->>'status'
      IS DISTINCT FROM 'conflict' THEN RAISE EXCEPTION 'Shipment permissions or line ownership failed'; END IF;
  result_:=public.apply_business_shipment(environment_,account_,operator_id,command_);
  parcel_id:=(result_->>'shipmentId')::uuid;
  IF result_->>'status' IS DISTINCT FROM 'applied' OR parcel_id IS NULL
    OR public.apply_business_shipment(environment_,account_,operator_id,command_)->>'status' IS DISTINCT FROM 'replayed'
    OR public.apply_business_shipment(environment_,account_,operator_id,command_||'{"trackingReference":"DIFFERENT"}')->>'status' IS DISTINCT FROM 'conflict'
    OR public.apply_business_shipment(environment_,account_,operator_id,command_||jsonb_build_object('commandId',gen_random_uuid()))->>'status'
      IS DISTINCT FROM 'conflict' THEN RAISE EXCEPTION 'A duplicate or overlapping allocation changed an owned shipment'; END IF;
  shipments:=public.read_business_order_shipments(environment_,account_,NULL,session_,customer_,receipt_);
  IF shipments IS DISTINCT FROM jsonb_build_object('environment',environment_,'shipments','[]'::jsonb)
    OR public.read_business_order_shipments(environment_,account_,order_id_,session_,editor_id,NULL) IS NOT NULL
    OR public.read_business_order_shipments(environment_,'acct_wrong',order_id_,session_,customer_,receipt_) IS NOT NULL THEN
    RAISE EXCEPTION 'Preparing shipment, address, or customer view escaped its owner and recorded-dispatch boundary';
  END IF;
  next_:=command_||jsonb_build_object('commandId',gen_random_uuid(),'shipmentId',parcel_id,'expectedVersion',1,
    'state','dispatched','lines','[]'::jsonb);
  IF public.apply_business_shipment(environment_,account_,operator_id,next_)->>'status' IS DISTINCT FROM 'applied' THEN
    RAISE EXCEPTION 'An authorized recorded dispatch failed'; END IF;
  shipments:=public.read_business_order_shipments(environment_,account_,order_id_,session_,customer_,receipt_);
  IF jsonb_array_length(shipments->'shipments') IS DISTINCT FROM 1
    OR shipments-ARRAY['environment','shipments']<>'{}'::jsonb
    OR shipments->'shipments'->0->>'state' IS DISTINCT FROM 'dispatched'
    OR shipments->'shipments'->0->>'trackingReference' IS DISTINCT FROM 'FIXTURE-592'
    OR shipments->'shipments'->0->>'dispatchedAt' IS NULL
    OR (shipments->'shipments'->0)-ARRAY['id','state','version','carrier','trackingReference','dispatchedAt','deliveredAt','items']<>'{}'::jsonb
    OR (shipments->'shipments'->0->'items'->0)-ARRAY['name','quantity']<>'{}'::jsonb THEN
    RAISE EXCEPTION 'The private buyer projection must show recorded tracking alone'; END IF;
  IF public.apply_business_shipment(environment_,account_,operator_id,next_||jsonb_build_object('commandId',gen_random_uuid(),
      'expectedVersion',2,'state','cancelled'))->>'status' IS DISTINCT FROM 'applied'
    OR public.apply_business_shipment(environment_,account_,operator_id,command_||jsonb_build_object('commandId',gen_random_uuid()))->>'status'
      IS DISTINCT FROM 'conflict' THEN RAISE EXCEPTION 'Ever-dispatched allocation was improperly reused'; END IF;
  RESET ROLE;
  SELECT status,reward_points_earned INTO STRICT status_after,reward_after FROM public.orders WHERE id=order_id_;
  IF (SELECT count(*) FROM private.business_shipment_commands WHERE order_id=order_id_)<>3 OR status_after<>'paid'
    OR reward_after<>0 OR refund_value<>0 OR (SELECT count(*) FROM private.email_intents)<>prior_email_count
    OR (SELECT state FROM private.live_checkout_stock_reservations WHERE order_id=order_id_) IS DISTINCT FROM 'consumed'
    OR EXISTS (SELECT FROM (VALUES ('anon'),('authenticated')) a(role_name)
      WHERE has_function_privilege(a.role_name,'public.read_business_shipment_order(text,text,text,uuid)','EXECUTE')
        OR has_function_privilege(a.role_name,'public.read_business_order_shipments(text,text,uuid,text,uuid,text)','EXECUTE')
        OR has_function_privilege(a.role_name,'public.apply_business_shipment(text,text,uuid,jsonb)','EXECUTE'))
    OR EXISTS (SELECT FROM (VALUES ('service_role'),('anon'),('authenticated')) a(role_name)
      CROSS JOIN (VALUES ('private.business_shipments'),('private.business_shipment_items'),('private.business_shipment_commands')) t(name)
      WHERE has_table_privilege(a.role_name,t.name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'))
    THEN RAISE EXCEPTION 'Manual fulfillment changed financial state, generated mail, exposed tables or lost its audit'; END IF;
END;
$fulfillment_test$;
