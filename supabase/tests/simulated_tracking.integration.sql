-- Disposable synthetic database only. Real production RPCs are exercised below.
CREATE SCHEMA tracking_test;
GRANT USAGE ON SCHEMA tracking_test TO service_role,anon,authenticated;
-- APPLY SIMULATED TRACKING MIGRATION
SELECT payment_contract_test.assert(
  to_regprocedure('public.apply_simulated_shipment_event(uuid,uuid,uuid,uuid,integer,text,jsonb,text)') IS NOT NULL,
  'simulated shipment mutation boundary exists');
CREATE FUNCTION tracking_test.activate() RETURNS boolean LANGUAGE sql AS $$
  SELECT public.configure_simulated_tracking(true,(public.read_simulated_tracking_control()->>'updatedAt')::timestamptz)
$$;
CREATE FUNCTION tracking_test.seed(n integer,email_override text DEFAULT 'synthetic@example.invalid') RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  PERFORM payment_contract_test.seed(n);
  -- Model an Order accepted after the separate activation transaction, even though
  -- each isolated test deliberately wraps its fixture in one rollback transaction.
  UPDATE public.orders SET created_at=clock_timestamp() WHERE id=payment_contract_test.id('order',n);
  PERFORM payment_contract_test.prepare_and_bind(n);
  PERFORM payment_contract_test.finalize(n,jsonb_build_object('customerEmail',email_override));
END $$;
CREATE FUNCTION tracking_test.apply(n integer,command_n integer,shipment uuid DEFAULT NULL,
  version integer DEFAULT 0,state text DEFAULT 'dispatched',lines jsonb DEFAULT NULL,reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.apply_simulated_shipment_event(payment_contract_test.id('operator',1),
    payment_contract_test.id('order',n),payment_contract_test.id('command',command_n),shipment,version,state,
    coalesce(lines,CASE WHEN shipment IS NULL THEN jsonb_build_array(jsonb_build_object(
      'orderItemId',payment_contract_test.id('line',n),'quantity',1)) ELSE '[]'::jsonb END),reason)
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tracking_test TO service_role;
INSERT INTO auth.users(id) VALUES(payment_contract_test.id('operator',1)),
  (payment_contract_test.id('operator',2)),(payment_contract_test.id('operator',3));
INSERT INTO public.admin_memberships(user_id,role,active) VALUES
  (payment_contract_test.id('operator',1),'admin',true),
  (payment_contract_test.id('operator',2),'catalog_publisher',true),
  (payment_contract_test.id('operator',3),'admin',false);

BEGIN;
SELECT tracking_test.seed(2000);
SET LOCAL ROLE service_role;
SELECT payment_contract_test.assert(tracking_test.apply(2000,2000)->>'status'='ineligible',
  'installed simulator is disabled even for a paid eligible Order');
DO $$ DECLARE control jsonb; BEGIN
  control:=public.read_simulated_tracking_control();
  PERFORM payment_contract_test.assert(NOT (control->>'enabled')::boolean,'tracking control starts disabled');
  PERFORM payment_contract_test.assert(public.configure_simulated_tracking(true,(control->>'updatedAt')::timestamptz),
    'current control version activates simulation');
  PERFORM payment_contract_test.assert(NOT public.configure_simulated_tracking(false,(control->>'updatedAt')::timestamptz),
    'stale control update cannot overwrite active version');
END $$;
SELECT payment_contract_test.assert(tracking_test.apply(2000,2000)->>'status'='ineligible',
  'first activation does not admit an Order created before its permanent boundary');
RESET ROLE;
SELECT tracking_test.seed(2019);
SET LOCAL ROLE service_role;
DO $$ DECLARE result jsonb; message private.email_intents%rowtype; BEGIN
  result:=tracking_test.apply(2019,2019);
  PERFORM payment_contract_test.assert(result->>'status'='applied' AND result->>'version'='1'
    AND result#>>'{order,lines,0,allocatedQuantity}'='1','dispatch allocates the existing Order line');
  SELECT * INTO message FROM private.email_intents WHERE order_id=payment_contract_test.id('order',2019)
    AND purpose='order_tracking';
  PERFORM payment_contract_test.assert(message.recipient='synthetic@example.invalid' AND message.state='queued'
    AND message.receipt->>'orderNumber'='HX-PAYMENT-FIXTURE-2019'
    AND message.receipt->>'shipmentNumber'='1' AND message.receipt->>'status'='dispatched'
    AND message.receipt->'items'='[{"name":"Synthetic serum","variantLabel":"30 mL","quantity":1}]'::jsonb
    AND NOT message.receipt ?| ARRAY['shippingAddress','actorId','resolutionReason'],
    'dispatch commits one minimal notice using the original recipient and immutable line facts');
  PERFORM payment_contract_test.assert(tracking_test.apply(2019,2019)->>'status'='replayed',
    'identical command replay returns the original committed transition');
  PERFORM payment_contract_test.assert(tracking_test.apply(2019,2019,NULL,0,'dispatched',
    jsonb_build_array(jsonb_build_object('orderItemId',payment_contract_test.id('line',2019),'quantity',2)))->>'status'='conflict',
    'changed command content cannot reuse committed identity');
  PERFORM payment_contract_test.assert(tracking_test.apply(2019,2001)->>'status'='conflict',
    'a second command cannot allocate a quantity that is already consumed');
  PERFORM payment_contract_test.assert((SELECT count(*)=1 FROM private.simulated_shipment_events
    WHERE shipment_id=(result->>'shipmentId')::uuid),'duplicate and conflicting commands add no events');
END $$;
ROLLBACK;

BEGIN;
SELECT tracking_test.activate();
SELECT tracking_test.seed(2001);
SELECT tracking_test.seed(2002);
SELECT tracking_test.seed(2003,NULL);
UPDATE private.email_controls SET enabled=true WHERE purpose='order_tracking';
SET LOCAL ROLE service_role;
DO $$ DECLARE result jsonb; shipment uuid; invalid jsonb; BEGIN
  FOREACH invalid IN ARRAY ARRAY[
    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('orderItemId',payment_contract_test.id('line',2002),'quantity',1)),
    jsonb_build_array(jsonb_build_object('orderItemId',payment_contract_test.id('line',2001),'quantity',0)),
    jsonb_build_array(jsonb_build_object('orderItemId',payment_contract_test.id('line',2001),'quantity',1.5)),
    jsonb_build_array(jsonb_build_object('orderItemId',payment_contract_test.id('line',2001),'quantity',100)),
    jsonb_build_array(jsonb_build_object('orderItemId',payment_contract_test.id('line',2001),'quantity',1),
      jsonb_build_object('orderItemId',payment_contract_test.id('line',2001),'quantity',1))
  ] LOOP
    PERFORM payment_contract_test.assert(tracking_test.apply(2001,2001,NULL,0,'dispatched',invalid)->>'status'='conflict',
      'invalid, foreign, duplicate and over-bounded allocations leave no committed command');
  END LOOP;
  result:=tracking_test.apply(2001,2001); shipment:=(result->>'shipmentId')::uuid;
  PERFORM payment_contract_test.assert(tracking_test.apply(2002,2001)->>'status'='conflict',
    'a command is bound to its original Order');
  PERFORM payment_contract_test.assert(tracking_test.apply(2001,2002,shipment,0,'delivered')->>'status'='conflict',
    'stale revisions do not skip intervening history');
  PERFORM payment_contract_test.assert(tracking_test.apply(2001,2002,shipment,1,'dispatched')->>'status'='conflict',
    'same-state events do not create notification spam');
  PERFORM payment_contract_test.assert(tracking_test.apply(2001,2002,shipment,1,'in_transit')->>'status'='applied',
    'dispatch advances to in-transit');
  PERFORM payment_contract_test.assert((SELECT count(*)=1 FROM private.email_intents
    WHERE order_id=payment_contract_test.id('order',2001) AND purpose='order_tracking'),
    'intermediate movement records history without another email');
  PERFORM payment_contract_test.assert(tracking_test.apply(2001,2003,shipment,2,'exception')->>'status'='applied',
    'in-transit can enter an exception');
  PERFORM payment_contract_test.assert(tracking_test.apply(2001,2004,shipment,3,'in_transit')->>'status'='conflict',
    'exception cannot resolve without explicit operator reasoning');
  PERFORM payment_contract_test.assert(tracking_test.apply(2001,2004,shipment,3,'in_transit','[]','Resolved synthetic delay')->>'status'='applied',
    'explicit operator resolution permits resumed transit');
  PERFORM payment_contract_test.assert(tracking_test.apply(2001,2005,shipment,4,'exception')->>'status'='applied',
    'a later committed exception is distinct from the earlier one');
  PERFORM payment_contract_test.assert(tracking_test.apply(2001,2006,shipment,5,'delivered','[]','Resolved and delivered')->>'status'='applied',
    'explicit exception resolution can establish simulated delivery');
  PERFORM payment_contract_test.assert(tracking_test.apply(2001,2007,shipment,6,'exception')->>'status'='conflict',
    'delivered is terminal');
  PERFORM payment_contract_test.assert(tracking_test.apply(2001,2006,shipment,5,'delivered','[]','Resolved and delivered')->>'status'='replayed',
    'delivered replay preserves its original committed revision');
  PERFORM payment_contract_test.assert((SELECT count(*)=4 AND count(DISTINCT tracking_event_id)=4
    FROM private.email_intents WHERE order_id=payment_contract_test.id('order',2001) AND purpose='order_tracking'),
    'only dispatch, both committed exceptions, and delivery have notices');
  PERFORM payment_contract_test.assert(NOT public.read_simulated_tracking(payment_contract_test.id('order',2001))::text
    LIKE '%Resolved synthetic delay%','private resolution reason is absent from customer tracking');
  PERFORM tracking_test.apply(2003,2008);
  PERFORM payment_contract_test.assert((SELECT state='unsendable' AND recipient IS NULL
    FROM private.email_intents WHERE order_id=payment_contract_test.id('order',2003) AND purpose='order_tracking'),
    'missing original recipient is preserved as unsendable');
END $$;
ROLLBACK;

BEGIN;
SELECT tracking_test.activate();
SELECT tracking_test.seed(2004);
SELECT payment_contract_test.seed(2005);
UPDATE private.email_controls SET enabled=true WHERE purpose='order_tracking';
SET LOCAL ROLE service_role;
DO $$ DECLARE actor uuid; result jsonb; BEGIN
  FOREACH actor IN ARRAY ARRAY[payment_contract_test.id('operator',2),payment_contract_test.id('operator',3),
    payment_contract_test.id('nonoperator',1)] LOOP
    result:=public.apply_simulated_shipment_event(actor,payment_contract_test.id('order',2004),
      payment_contract_test.id('command',2004),NULL,0,'dispatched',
      jsonb_build_array(jsonb_build_object('orderItemId',payment_contract_test.id('line',2004),'quantity',1)),NULL);
    PERFORM payment_contract_test.assert(result->>'status'='forbidden' AND result->'order'='null'::jsonb,
      'catalog-only, inactive and unknown actors cannot mutate or discover a private Order');
    PERFORM payment_contract_test.assert(public.read_simulated_order('HX-PAYMENT-FIXTURE-2004',actor) IS NULL,
      'catalog-only, inactive and unknown actors cannot read the operator projection');
  END LOOP;
  PERFORM payment_contract_test.assert(tracking_test.apply(2005,2005)->>'status'='ineligible','unverified payment cannot create simulation');
  UPDATE private.email_intents SET state='blocked',recipient=NULL,receipt=NULL,request_payload=NULL,content_deleted_at=now()
    WHERE order_id=payment_contract_test.id('order',2004) AND purpose='order_confirmation';
  PERFORM payment_contract_test.assert(tracking_test.apply(2004,2004)->>'status'='ineligible',
    'purged original confirmation cannot be reconstructed from the mutable Order or Account');
END $$;
ROLLBACK;

-- Isolated synthetic security/retention proofs. Every case rolls back its fixtures.
BEGIN;
SELECT tracking_test.activate();
SELECT tracking_test.seed(2100);
SET LOCAL ROLE service_role;
SELECT email_contract_test.assert(public.configure_simulated_tracking(true,
  (public.read_simulated_tracking_control()->>'updatedAt')::timestamptz),'enable the isolated tracking fixture');
SELECT email_contract_test.assert(tracking_test.apply(2100,2100)->>'status'='applied','security fixture dispatch exists');
RESET ROLE;
DO $$
DECLARE role_name text; table_name text; statement text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['simulated_shipments','simulated_shipment_allocations',
    'simulated_shipment_events','simulated_shipment_commands','simulation_refund_freezes'] LOOP
    PERFORM email_contract_test.assert((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
      WHERE oid=('private.'||table_name)::regclass),'private tracking tables force row security');
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      PERFORM email_contract_test.assert(NOT has_table_privilege(role_name,'private.'||table_name,
        'SELECT,INSERT,UPDATE,DELETE'),'customer roles hold no tracking table privileges');
      PERFORM set_config('role',role_name,true);
      FOREACH statement IN ARRAY ARRAY[
        format('SELECT * FROM private.%I',table_name),
        format('INSERT INTO private.%I DEFAULT VALUES',table_name),
        format('UPDATE private.%I SET %s',table_name,CASE table_name
          WHEN 'simulated_shipments' THEN 'state=state'
          WHEN 'simulated_shipment_allocations' THEN 'quantity=quantity'
          WHEN 'simulated_shipment_events' THEN 'state=state'
          WHEN 'simulated_shipment_commands' THEN 'payload_hash=payload_hash'
          ELSE 'frozen_at=frozen_at' END),
        format('DELETE FROM private.%I',table_name)] LOOP
        BEGIN
          EXECUTE statement;
          RAISE EXCEPTION 'Customer table operation unexpectedly succeeded';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      END LOOP;
      PERFORM set_config('role','postgres',true);
    END LOOP;
  END LOOP;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    PERFORM set_config('role',role_name,true);
    FOREACH statement IN ARRAY ARRAY[
      'SELECT public.read_simulated_tracking_control()',
      'SELECT public.configure_simulated_tracking(true,NULL::timestamptz)',
      'SELECT public.record_verified_refund_simulation_freeze(NULL::uuid,NULL::text,NULL::text,NULL::integer)',
      'SELECT public.read_simulated_tracking(NULL::uuid)',
      'SELECT public.read_simulated_order(NULL::text,NULL::uuid)',
      'SELECT public.apply_simulated_shipment_event(NULL::uuid,NULL::uuid,NULL::uuid,NULL::uuid,NULL::integer,NULL::text,NULL::jsonb,NULL::text)',
      'SELECT private.simulation_is_frozen(NULL::uuid)',
      'SELECT private.simulation_order_eligible(NULL::uuid)',
      'SELECT private.simulation_lines_displayable(NULL::uuid)'] LOOP
      BEGIN
        EXECUTE statement;
        RAISE EXCEPTION 'Customer tracking RPC unexpectedly succeeded';
      EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    END LOOP;
    PERFORM set_config('role','postgres',true);
  END LOOP;
END $$;
-- Demonstrate the independent RLS layer, rather than inferring it from denied grants.
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT SELECT ON private.simulated_shipments,private.simulated_shipment_allocations,
  private.simulated_shipment_events,private.simulated_shipment_commands TO authenticated;
SET LOCAL ROLE authenticated;
SELECT email_contract_test.assert((SELECT count(*)=0 FROM private.simulated_shipments),'RLS hides shipment rows even after accidental SELECT grant');
SELECT email_contract_test.assert((SELECT count(*)=0 FROM private.simulated_shipment_allocations),'RLS hides allocations even after accidental SELECT grant');
SELECT email_contract_test.assert((SELECT count(*)=0 FROM private.simulated_shipment_events),'RLS hides events even after accidental SELECT grant');
SELECT email_contract_test.assert((SELECT count(*)=0 FROM private.simulated_shipment_commands),'RLS hides commands even after accidental SELECT grant');
ROLLBACK;

BEGIN;
SELECT tracking_test.activate();
SELECT tracking_test.seed(2101);
SET LOCAL ROLE service_role;
SELECT public.configure_simulated_tracking(true,(public.read_simulated_tracking_control()->>'updatedAt')::timestamptz);
SELECT tracking_test.apply(2101,2101);
SELECT public.record_verified_refund_simulation_freeze(payment_contract_test.id('order',2101),
  'cs_test_contract2101','pi_contract2101',3240);
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['simulated_shipments','simulated_shipment_allocations',
    'simulated_shipment_events','simulated_shipment_commands','simulation_refund_freezes','email_intents'] LOOP
    BEGIN
      EXECUTE format('DELETE FROM private.%I',table_name);
      RAISE EXCEPTION 'Service deletion of durable identity unexpectedly succeeded';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
END $$;
RESET ROLE;
DO $$
DECLARE statement text; v_shipment_id uuid; event_id uuid; intent_id uuid;
BEGIN
  SELECT id INTO STRICT v_shipment_id FROM private.simulated_shipments WHERE order_id=payment_contract_test.id('order',2101);
  SELECT id INTO STRICT event_id FROM private.simulated_shipment_events e WHERE e.shipment_id=v_shipment_id;
  SELECT id INTO STRICT intent_id FROM private.email_intents WHERE order_id=payment_contract_test.id('order',2101) AND purpose='order_tracking';
  FOREACH statement IN ARRAY ARRAY[
    format('UPDATE private.simulated_shipments SET number=number+1 WHERE id=%L',v_shipment_id),
    format('DELETE FROM private.simulated_shipments WHERE id=%L',v_shipment_id),
    format('UPDATE private.simulated_shipment_allocations SET quantity=quantity+1 WHERE shipment_id=%L',v_shipment_id),
    format('DELETE FROM private.simulated_shipment_allocations WHERE shipment_id=%L',v_shipment_id),
    format('UPDATE private.simulated_shipment_events SET state=''exception'' WHERE id=%L',event_id),
    format('DELETE FROM private.simulated_shipment_events WHERE id=%L',event_id),
    format('UPDATE private.simulated_shipment_commands SET payload_hash=repeat(''0'',64) WHERE event_id=%L',event_id),
    format('DELETE FROM private.simulated_shipment_commands WHERE event_id=%L',event_id),
    format('UPDATE private.simulation_refund_freezes SET frozen_at=frozen_at+interval ''1 second'' WHERE order_id=%L',payment_contract_test.id('order',2101)),
    format('DELETE FROM private.simulation_refund_freezes WHERE order_id=%L',payment_contract_test.id('order',2101)),
    format('UPDATE private.email_intents SET tracking_event_id=%L WHERE id=%L',payment_contract_test.id('event',2199),intent_id),
    format('UPDATE private.email_intents SET idempotency_key=''replacement-key'' WHERE id=%L',intent_id),
    format('DELETE FROM private.email_intents WHERE id=%L',intent_id)] LOOP
    BEGIN
      EXECUTE statement;
      RAISE EXCEPTION 'History mutation unexpectedly succeeded';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  END LOOP;
END $$;
ROLLBACK;

-- A verified refund may freeze simulation while commerce reconciliation is still paid.
BEGIN;
SELECT tracking_test.activate();
SELECT tracking_test.seed(2102);
SET LOCAL ROLE service_role;
SELECT public.configure_simulated_tracking(true,(public.read_simulated_tracking_control()->>'updatedAt')::timestamptz);
SELECT tracking_test.apply(2102,2102);
DO $$
DECLARE message_id uuid; v_shipment_id uuid; worker_id uuid:=payment_contract_test.id('worker',2102);
BEGIN
  SELECT id INTO STRICT message_id FROM private.email_intents WHERE order_id=payment_contract_test.id('order',2102) AND purpose='order_tracking';
  SELECT id INTO STRICT v_shipment_id FROM private.simulated_shipments WHERE order_id=payment_contract_test.id('order',2102);
  PERFORM public.claim_email_intents('sandbox',worker_id,5);
  PERFORM email_contract_test.assert(NOT public.record_verified_refund_simulation_freeze(payment_contract_test.id('order',2102),
    'cs_test_wrong','pi_contract2102',3240),'refund freeze rejects a different checkout Session');
  PERFORM email_contract_test.assert(NOT public.record_verified_refund_simulation_freeze(payment_contract_test.id('order',2102),
    'cs_test_contract2102','pi_wrong',3240),'refund freeze rejects a different payment');
  PERFORM email_contract_test.assert(NOT public.record_verified_refund_simulation_freeze(payment_contract_test.id('order',2102),
    'cs_test_contract2102','pi_contract2102',1),'refund freeze rejects a partial amount');
  PERFORM email_contract_test.assert(NOT (public.read_simulated_tracking(payment_contract_test.id('order',2102))->>'frozen')::boolean,
    'rejected refund facts leave simulation unfrozen');
  PERFORM email_contract_test.assert(public.record_verified_refund_simulation_freeze(payment_contract_test.id('order',2102),
    'cs_test_contract2102','pi_contract2102',3240),'verified refund creates a monotonic freeze');
  PERFORM email_contract_test.assert((SELECT status='paid' FROM public.orders WHERE id=payment_contract_test.id('order',2102)),
    'simulation freeze does not mutate payment settlement');
  PERFORM email_contract_test.assert(public.prepare_email_attempt(message_id,worker_id,
    email_contract_test.payload('synthetic@example.invalid',message_id)) IS NULL,'refund blocks first tracking handoff');
  PERFORM email_contract_test.assert((SELECT state='blocked' AND error_code='order_refunded'
    AND first_attempt_at IS NULL AND attempt_count=0 AND lease_token IS NULL FROM private.email_intents WHERE id=message_id),
    'unattempted frozen notice retains identity without consuming an attempt');
  PERFORM email_contract_test.assert(tracking_test.apply(2102,2103,v_shipment_id,1,'delivered','[]'::jsonb)->>'status'='ineligible',
    'refund prevents any new shipment transition');
  PERFORM email_contract_test.assert(tracking_test.apply(2102,2102)->>'status'='replayed',
    'refund preserves replay of committed history');
  PERFORM email_contract_test.assert((SELECT count(*)=1 FROM private.email_intents WHERE order_id=payment_contract_test.id('order',2102) AND purpose='order_tracking'),
    'refund and replay cannot add a second notice');
END $$;
ROLLBACK;

-- An uncertain pre-freeze send retains its original envelope and can reconcile later.
BEGIN;
SELECT tracking_test.activate();
SELECT tracking_test.seed(2103);
SET LOCAL ROLE service_role;
SELECT public.configure_simulated_tracking(true,(public.read_simulated_tracking_control()->>'updatedAt')::timestamptz);
SELECT tracking_test.apply(2103,2104);
DO $$
DECLARE message_id uuid; worker_id uuid:=payment_contract_test.id('worker',2103); prepared jsonb; original_first timestamptz;
BEGIN
  SELECT id INTO STRICT message_id FROM private.email_intents WHERE order_id=payment_contract_test.id('order',2103) AND purpose='order_tracking';
  PERFORM public.claim_email_intents('sandbox',worker_id,5);
  prepared:=public.prepare_email_attempt(message_id,worker_id,email_contract_test.payload('synthetic@example.invalid',message_id));
  PERFORM email_contract_test.assert(prepared IS NOT NULL,'tracking handoff can begin before refund');
  original_first:=(prepared->>'firstAttemptAt')::timestamptz;
  PERFORM email_contract_test.assert(public.finish_email_attempt(message_id,worker_id,'uncertain',NULL,'provider_connection_uncertain'),
    'lost provider response remains uncertain');
  PERFORM public.record_verified_refund_simulation_freeze(payment_contract_test.id('order',2103),'cs_test_contract2103','pi_contract2103',3240);
  PERFORM email_contract_test.assert(public.retry_email_delivery(message_id,
    (SELECT updated_at FROM private.email_intents WHERE id=message_id)),'operator may request a fenced retry');
  PERFORM public.claim_email_intents('sandbox',worker_id,5);
  PERFORM email_contract_test.assert(public.prepare_email_attempt(message_id,worker_id,prepared->'requestPayload') IS NULL,
    'a retry request cannot bypass the refund guard');
  PERFORM email_contract_test.assert((SELECT first_attempt_at=original_first AND attempt_count=1
    AND request_payload=prepared->'requestPayload' AND state='blocked' FROM private.email_intents WHERE id=message_id),
    'blocked retry preserves uncertainty timing and exact pre-freeze request');
  PERFORM email_contract_test.assert(public.record_email_delivery_event('evt_tracking_late_2103','sandbox',message_id,
    'email_tracking_2103','email.delivered',clock_timestamp(),'Helix Demo <onboarding@resend.dev>','synthetic@example.invalid')='matched',
    'late signed callback reconciles the possible pre-freeze handoff');
  PERFORM email_contract_test.assert((SELECT state='accepted' AND delivery_status='delivered' AND attempt_count=1
    AND first_attempt_at=original_first FROM private.email_intents WHERE id=message_id),'freeze never discards accepted delivery facts');
END $$;
ROLLBACK;

BEGIN;
SELECT tracking_test.activate();
SELECT tracking_test.seed(2104);
SET LOCAL ROLE service_role;
SELECT public.configure_simulated_tracking(true,(public.read_simulated_tracking_control()->>'updatedAt')::timestamptz);
SELECT tracking_test.apply(2104,2105);
DO $$
DECLARE message_id uuid; source_id uuid; worker_id uuid:=payment_contract_test.id('worker',2104); prepared jsonb; original_key text;
BEGIN
  SELECT id,tracking_event_id,idempotency_key INTO STRICT message_id,source_id,original_key FROM private.email_intents
    WHERE order_id=payment_contract_test.id('order',2104) AND purpose='order_tracking';
  PERFORM public.claim_email_intents('sandbox',worker_id,5);
  prepared:=public.prepare_email_attempt(message_id,worker_id,email_contract_test.payload('synthetic@example.invalid',message_id));
  PERFORM email_contract_test.assert(prepared IS NOT NULL,'retention fixture has a prepared request');
  PERFORM email_contract_test.assert(public.finish_email_attempt(message_id,worker_id,'accepted','email_tracking_2104',NULL),
    'retention fixture records accepted delivery');
  UPDATE private.email_intents SET content_deleted_at=clock_timestamp(),recipient=NULL,receipt=NULL,request_payload=NULL
    WHERE id=message_id;
  PERFORM email_contract_test.assert(tracking_test.apply(2104,2105)->>'status'='replayed',
    'content deletion does not forget committed transition replay');
  PERFORM email_contract_test.assert((SELECT count(*)=1 FROM private.email_intents WHERE tracking_event_id=source_id),
    'content deletion preserves one logical notice per event');
  BEGIN
    INSERT INTO private.email_intents(environment,purpose,order_id,tracking_event_id,recipient,receipt,state,idempotency_key)
      VALUES('sandbox','order_tracking',payment_contract_test.id('order',2104),source_id,NULL,NULL,'unsendable','synthetic-recreated-tracking-2104');
    RAISE EXCEPTION 'Erased transition identity could be recreated';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  PERFORM email_contract_test.assert(public.record_email_delivery_event('evt_tracking_purged_2104','sandbox',message_id,
    'email_tracking_2104','email.complained',clock_timestamp(),NULL,NULL)='matched','known provider identity still reconciles after content deletion');
  PERFORM email_contract_test.assert((SELECT tracking_event_id=source_id AND idempotency_key=original_key
    AND first_attempt_at=(prepared->>'firstAttemptAt')::timestamptz AND provider_email_id='email_tracking_2104'
    AND delivery_status='complained' AND recipient IS NULL AND receipt IS NULL AND request_payload IS NULL
    FROM private.email_intents WHERE id=message_id),'minimal deduplication identity survives without restoring erased content');
  PERFORM email_contract_test.assert(jsonb_array_length(public.read_simulated_tracking(payment_contract_test.id('order',2104))->'shipments')=1,
    'email content cleanup preserves private shipment history');
  PERFORM email_contract_test.assert(NOT public.retry_email_delivery(message_id,(SELECT updated_at FROM private.email_intents WHERE id=message_id)),
    'erased delivery content cannot be queued again');
END $$;
ROLLBACK;

-- Fault injection is confined to this rolled-back synthetic transaction.
BEGIN;
SELECT tracking_test.activate();
SELECT tracking_test.seed(2105);
CREATE FUNCTION tracking_test.reject_tracking_notice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.purpose='order_tracking' THEN RAISE EXCEPTION USING ERRCODE='P0004',MESSAGE='synthetic notice storage failure'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER synthetic_reject_tracking_notice BEFORE INSERT ON private.email_intents
  FOR EACH ROW EXECUTE FUNCTION tracking_test.reject_tracking_notice();
SET LOCAL ROLE service_role;
SELECT public.configure_simulated_tracking(true,(public.read_simulated_tracking_control()->>'updatedAt')::timestamptz);
DO $$
BEGIN
  BEGIN
    PERFORM tracking_test.apply(2105,2106);
    RAISE EXCEPTION 'Dispatch unexpectedly survived notice storage failure';
  EXCEPTION WHEN SQLSTATE 'P0004' THEN NULL; END;
  PERFORM email_contract_test.assert(jsonb_array_length(public.read_simulated_tracking(payment_contract_test.id('order',2105))->'shipments')=0,
    'notice storage failure rolls back new shipment and tracking view');
  PERFORM email_contract_test.assert(NOT EXISTS(SELECT 1 FROM private.simulated_shipment_commands WHERE order_id=payment_contract_test.id('order',2105)),
    'notice storage failure rolls back command replay identity');
  PERFORM email_contract_test.assert(NOT EXISTS(SELECT 1 FROM private.simulated_shipment_allocations WHERE order_item_id=payment_contract_test.id('line',2105)),
    'notice storage failure rolls back quantity allocation');
  PERFORM email_contract_test.assert((SELECT count(*)=0 FROM private.email_intents WHERE order_id=payment_contract_test.id('order',2105) AND purpose='order_tracking'),
    'notice storage failure leaves no partial notice');
  PERFORM email_contract_test.assert((SELECT status='paid' FROM public.orders WHERE id=payment_contract_test.id('order',2105)),
    'tracking storage failure does not undo a previously verified payment');
END $$;
RESET ROLE;
DROP TRIGGER synthetic_reject_tracking_notice ON private.email_intents;
SET LOCAL ROLE service_role;
SELECT email_contract_test.assert(tracking_test.apply(2105,2106)->>'status'='applied','retry after storage recovery commits the original command');
ROLLBACK;

BEGIN;
SELECT tracking_test.activate();
SELECT tracking_test.seed(2106);
SET LOCAL ROLE service_role;
SELECT public.configure_simulated_tracking(true,(public.read_simulated_tracking_control()->>'updatedAt')::timestamptz);
SELECT tracking_test.apply(2106,2107);
RESET ROLE;
CREATE FUNCTION tracking_test.reject_tracking_notice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.purpose='order_tracking' THEN RAISE EXCEPTION USING ERRCODE='P0004',MESSAGE='synthetic notice storage failure'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER synthetic_reject_tracking_notice BEFORE INSERT ON private.email_intents
  FOR EACH ROW EXECUTE FUNCTION tracking_test.reject_tracking_notice();
SET LOCAL ROLE service_role;
DO $$
DECLARE v_shipment_id uuid;
BEGIN
  SELECT id INTO STRICT v_shipment_id FROM private.simulated_shipments WHERE order_id=payment_contract_test.id('order',2106);
  BEGIN
    PERFORM tracking_test.apply(2106,2108,v_shipment_id,1,'delivered','[]'::jsonb);
    RAISE EXCEPTION 'Delivery unexpectedly survived notice storage failure';
  EXCEPTION WHEN SQLSTATE 'P0004' THEN NULL; END;
  PERFORM email_contract_test.assert((SELECT state='dispatched' AND version=1 FROM private.simulated_shipments WHERE id=v_shipment_id),
    'notice storage failure restores previous shipment state and revision');
  PERFORM email_contract_test.assert((SELECT count(*)=1 FROM private.simulated_shipment_events e WHERE e.shipment_id=v_shipment_id),
    'notice storage failure leaves no partial transition event');
  PERFORM email_contract_test.assert((SELECT count(*)=1 FROM private.email_intents WHERE order_id=payment_contract_test.id('order',2106) AND purpose='order_tracking'),
    'failed delivery transition retains only its previous dispatch notice');
END $$;
ROLLBACK;

BEGIN;
SELECT tracking_test.activate();
SELECT tracking_test.seed(2010);
SELECT tracking_test.seed(2011);
SELECT tracking_test.seed(2012);
SELECT tracking_test.seed(2013);
UPDATE private.email_controls SET enabled=true WHERE purpose='order_tracking';
-- Moving a later confirmation admission cutoff cannot invalidate an existing source identity.
UPDATE private.email_controls SET accepted_after=clock_timestamp()+interval '1 day' WHERE purpose='order_confirmation';
UPDATE public.orders SET customer_email='changed-account@example.invalid' WHERE id=payment_contract_test.id('order',2010);
UPDATE public.products SET display_name='Changed catalog name' WHERE id=payment_contract_test.id('product',1);
UPDATE public.orders SET status='refunded' WHERE id=payment_contract_test.id('order',2011);
UPDATE public.payment_attempts SET status='refunded' WHERE order_id=payment_contract_test.id('order',2012);
INSERT INTO private.checkout_payment_exceptions(order_id,session_id,payment_intent_id,code,payment_status,amount_cents,resolved_at)
VALUES(payment_contract_test.id('order',2013),'cs_test_contract2013','pi_contract2013',
  'full_refund_reconciliation_failed','refunded',3240,now());
SET LOCAL ROLE service_role;
SELECT payment_contract_test.assert(tracking_test.apply(2010,2010)->>'status'='applied',
  'original confirmation identity survives a later activation cutoff');
SELECT payment_contract_test.assert((SELECT recipient='synthetic@example.invalid'
  AND receipt#>>'{items,0,name}'='Synthetic serum' FROM private.email_intents
  WHERE order_id=payment_contract_test.id('order',2010) AND purpose='order_tracking'),
  'Account and current catalog changes cannot alter original tracking recipient or accepted item name');
SELECT payment_contract_test.assert(tracking_test.apply(2011,2011)->>'status'='ineligible',
  'existing refunded Order status freezes simulation');
SELECT payment_contract_test.assert(tracking_test.apply(2012,2012)->>'status'='ineligible',
  'matching refunded payment attempt freezes simulation while Order status is still paid');
SELECT payment_contract_test.assert(tracking_test.apply(2013,2013)->>'status'='ineligible',
  'resolved historical exception does not erase its trusted full-refund fact');
DO $$ DECLARE control jsonb; BEGIN
  control:=public.read_simulated_tracking_control();
  PERFORM public.configure_simulated_tracking(false,(control->>'updatedAt')::timestamptz);
  PERFORM payment_contract_test.assert(jsonb_array_length(public.read_simulated_tracking(payment_contract_test.id('order',2010))->'shipments')=1,
    'disabling new simulation keeps historical tracking readable');
  PERFORM payment_contract_test.assert(NOT (public.read_simulated_order('HX-PAYMENT-FIXTURE-2010',payment_contract_test.id('operator',1))->>'eligible')::boolean,
    'operator projection honestly reports disabled admission');
END $$;
ROLLBACK;

BEGIN;
SELECT tracking_test.activate();
SELECT tracking_test.seed(2014);
UPDATE private.email_controls SET enabled=true WHERE purpose='order_tracking';
SET LOCAL ROLE service_role;
DO $$ DECLARE shipment uuid; result jsonb; n integer; target_state text; reason text; BEGIN
  result:=tracking_test.apply(2014,2400); shipment:=(result->>'shipmentId')::uuid;
  FOR n IN 2..100 LOOP
    target_state:=CASE WHEN n%2=0 THEN 'exception' ELSE 'in_transit' END;
    reason:=CASE WHEN n%2=1 THEN 'Resolved synthetic interruption' END;
    result:=tracking_test.apply(2014,2400+n,shipment,n-1,target_state,'[]',reason);
    PERFORM payment_contract_test.assert(result->>'status'='applied','bounded synthetic transitions remain available within the limit');
  END LOOP;
  PERFORM payment_contract_test.assert(tracking_test.apply(2014,2600,shipment,100,'delivered','[]','Resolved')->>'status'<>'applied',
    'simulation cannot append unbounded history beyond 100 events');
  PERFORM payment_contract_test.assert((SELECT count(*)=100 FROM private.simulated_shipment_events WHERE shipment_id=shipment),
    'history remains complete and bounded at the documented limit');
  PERFORM payment_contract_test.assert(NOT (public.read_simulated_order('HX-PAYMENT-FIXTURE-2014',payment_contract_test.id('operator',1))->>'eligible')::boolean,
    'operator projection reports exhausted simulation capacity');
END $$;
ROLLBACK;

-- A later unverifiable retry must not erase previously verified full-refund evidence.
BEGIN;
SELECT tracking_test.activate();
SELECT tracking_test.seed(2015);
UPDATE private.email_controls SET enabled=true WHERE purpose='order_tracking';
SET LOCAL ROLE service_role;
SELECT public.record_checkout_payment_exception(payment_contract_test.id('order',2015),NULL,
  'cs_test_contract2015','full_refund_reconciliation_failed','pi_contract2015','refunded',3240);
SELECT payment_contract_test.assert((public.read_simulated_tracking(payment_contract_test.id('order',2015))->>'frozen')::boolean,
  'verified refund fallback freezes simulation when earlier freeze response was lost');
SELECT public.record_checkout_payment_exception(payment_contract_test.id('order',2015),NULL,
  'cs_test_contract2015','full_refund_reconciliation_failed','pi_contract2015','unknown',NULL);
SELECT payment_contract_test.assert((public.read_simulated_tracking(payment_contract_test.id('order',2015))->>'frozen')::boolean,
  'later provider verification failure cannot erase the prior trusted full-refund fact');
SELECT payment_contract_test.assert(tracking_test.apply(2015,2015)->>'status'='ineligible',
  'unknown retry cannot reopen simulation admission after verified refund');
ROLLBACK;

BEGIN;
SELECT tracking_test.activate();
SELECT tracking_test.seed(2016);
UPDATE private.email_controls SET enabled=true WHERE purpose='order_tracking';
SET LOCAL ROLE service_role;
SELECT tracking_test.apply(2016,2016);
RESET ROLE;
-- Model a legacy snapshot outside the bounded simulator display contract.
UPDATE public.order_items SET product_name=repeat('x',201) WHERE id=payment_contract_test.id('line',2016);
SET LOCAL ROLE service_role;
DO $$ DECLARE view jsonb; BEGIN
  view:=public.read_simulated_order('HX-PAYMENT-FIXTURE-2016',payment_contract_test.id('operator',1));
  PERFORM payment_contract_test.assert(view->'eligible'='false'::jsonb AND view->'lines'='[]'::jsonb,
    'unsupported source snapshots return a sparse ineligible Order instead of an invalid display payload');
  PERFORM payment_contract_test.assert(jsonb_array_length(view->'shipments')=1
    AND view#>>'{shipments,0,items,0,name}'='Synthetic serum','sparse source projection preserves previously frozen shipment history');
END $$;
ROLLBACK;

BEGIN;
SELECT tracking_test.activate();
SELECT tracking_test.seed(2017);
SELECT tracking_test.seed(2018);
INSERT INTO private.checkout_payment_exceptions(order_id,session_id,payment_intent_id,code,payment_status,amount_cents,resolved_at)
VALUES(payment_contract_test.id('order',2017),'cs_test_contract2017','pi_contract2017',
  'full_refund_reconciliation_failed','refunded',3240,now());
SET LOCAL ROLE service_role;
SELECT public.record_checkout_payment_exception(payment_contract_test.id('order',2017),NULL,
  'cs_test_contract2017','full_refund_reconciliation_failed','pi_contract2017','unknown',NULL);
SELECT payment_contract_test.assert((public.read_simulated_tracking(payment_contract_test.id('order',2017))->>'frozen')::boolean,
  'pre-migration verified exception is preserved into monotonic freeze before unknown overwrite');
SELECT public.record_checkout_payment_exception(payment_contract_test.id('order',2018),NULL,
  'cs_test_contract2018','full_refund_reconciliation_failed','pi_contract2018','unknown',NULL);
SELECT payment_contract_test.assert(NOT (public.read_simulated_tracking(payment_contract_test.id('order',2018))->>'frozen')::boolean,
  'unknown refund facts alone cannot invent a verified full refund');
ROLLBACK;

BEGIN;
SELECT tracking_test.activate();
SELECT tracking_test.seed(2020);
SET LOCAL ROLE service_role;
DO $$ DECLARE first_control jsonb; current_control jsonb; contract jsonb; denied boolean:=false; BEGIN
  first_control:=public.read_simulated_tracking_control();
  contract:=public.read_checkout_payment_contract(payment_contract_test.id('order',2020),'cs_test_contract2020');
  PERFORM payment_contract_test.assert(contract->'trackingSchemaVersion'='1'::jsonb,
    'existing contract projection proves installed tracking guards without changing its signature');
  PERFORM payment_contract_test.assert(NOT EXISTS(SELECT 1 FROM private.checkout_payment_contracts
    WHERE order_id=payment_contract_test.id('order',2020) AND terms ? 'trackingSchemaVersion'),
    'schema capability metadata never enters immutable accepted terms');
  PERFORM payment_contract_test.assert(public.read_checkout_payment_contract(payment_contract_test.id('order',18),
    'cs_test_contract18')->'trackingSchemaVersion'='1'::jsonb,
    'legacy contract projection also reports installed tracking guards');
  PERFORM public.configure_simulated_tracking(false,(first_control->>'updatedAt')::timestamptz);
  current_control:=public.read_simulated_tracking_control();
  PERFORM public.configure_simulated_tracking(true,(current_control->>'updatedAt')::timestamptz);
  current_control:=public.read_simulated_tracking_control();
  PERFORM payment_contract_test.assert(current_control->'acceptedAfter'=first_control->'acceptedAfter'
    AND current_control->'activatedAt'=first_control->'activatedAt',
    'disabling and re-enabling never moves the permanent first-activation cutoff');
  PERFORM payment_contract_test.assert(tracking_test.apply(2020,2020)->>'status'='applied',
    'an already eligible demo Order remains available after reactivation');
  BEGIN
    UPDATE private.email_controls SET accepted_after=accepted_after-interval '1 day'
      WHERE purpose='order_tracking';
  EXCEPTION WHEN SQLSTATE '55000' THEN denied:=true; END;
  PERFORM payment_contract_test.assert(denied,'the persisted activation boundary cannot be moved backwards');
  PERFORM payment_contract_test.assert((SELECT payload_hash ~ '^[0-9a-f]{64}$'
    FROM private.simulated_shipment_commands WHERE id=payment_contract_test.id('command',2020)),
    'command replay retains a canonical digest without duplicating private resolution text');
END $$;
ROLLBACK;

BEGIN;
SELECT tracking_test.activate();
SELECT tracking_test.seed(2021);
UPDATE public.orders SET metadata=metadata-'stripe_idempotency_key' WHERE id=payment_contract_test.id('order',2021);
SET LOCAL ROLE service_role;
SELECT payment_contract_test.assert(public.read_checkout_payment_contract(payment_contract_test.id('order',2021),
  'cs_test_contract2021') IS NULL,'missing current binding makes the existing contract read null');
SELECT payment_contract_test.assert(tracking_test.apply(2021,2021)->>'status'='ineligible',
  'a null-contract refund cannot coexist with simulation admission');
ROLLBACK;
