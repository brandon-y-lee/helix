CREATE SCHEMA manual_test;
CREATE FUNCTION manual_test.seed(n integer) RETURNS void LANGUAGE plpgsql AS $$BEGIN
 PERFORM payment_contract_test.seed(n,true);PERFORM payment_contract_test.prepare_and_bind(n);PERFORM payment_contract_test.finalize(n);
END$$;
CREATE FUNCTION manual_test.command(n integer,c integer,s uuid DEFAULT NULL,v integer DEFAULT 0,st text DEFAULT 'preparing',reason text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('commandId',payment_contract_test.id('manual-command',c),'orderId',payment_contract_test.id('order',n),
 'shipmentId',s,'expectedVersion',v,'state',st,'carrier','UPS','trackingReference','TEST-ONLY',
 'lines',CASE WHEN s IS NULL THEN jsonb_build_array(jsonb_build_object('orderItemId',payment_contract_test.id('line',n),'quantity',1)) ELSE '[]'::jsonb END,'correctionReason',reason)
$$;
GRANT USAGE ON SCHEMA manual_test TO service_role;GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA manual_test TO service_role;
INSERT INTO auth.users(id) VALUES(payment_contract_test.id('operator',491)),(payment_contract_test.id('operator',492));
INSERT INTO public.admin_memberships(user_id,role,active) VALUES(payment_contract_test.id('operator',491),'admin',true),(payment_contract_test.id('operator',492),'catalog_editor',true);
SELECT manual_test.seed(5000);SELECT manual_test.seed(5001);
SET ROLE service_role;
SELECT payment_contract_test.assert(public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5000,1))->>'status'='disabled','disabled by default');
RESET ROLE;
UPDATE private.manual_shipment_control SET enabled=true;
SET ROLE service_role;
SELECT payment_contract_test.assert(public.apply_manual_shipment(payment_contract_test.id('operator',492),manual_test.command(5000,1))->>'status'='forbidden','catalog role cannot manage shipments');
SELECT payment_contract_test.assert(public.read_manual_shipment_order('HX-PAYMENT-FIXTURE-5000',payment_contract_test.id('operator',492)) IS NULL,'catalog role cannot read order');
SELECT payment_contract_test.assert(public.apply_manual_shipment(payment_contract_test.id('operator',491),jsonb_set(manual_test.command(5000,1),'{lines,0,orderItemId}',to_jsonb(payment_contract_test.id('line',5001))))->>'status'='invalid','cross-order line rejected');
DO $$DECLARE first jsonb;s uuid;r jsonb;BEGIN
 first:=public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5000,1));s:=(first->>'shipmentId')::uuid;
 PERFORM payment_contract_test.assert(first->>'status'='applied','paid order accepts preparing record');
 PERFORM payment_contract_test.assert(public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5000,1))->>'status'='replayed','retry reuses command');
 PERFORM payment_contract_test.assert(public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5001,1))->>'status'='conflict','same command on other order cannot rebind');
 PERFORM payment_contract_test.assert(public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5000,2))->>'status'='conflict','capacity prevents duplicate allocation');
 PERFORM payment_contract_test.assert(public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5000,3,s,2,'dispatched'))->>'status'='conflict','stale version rejected');
 PERFORM public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5000,4,s,1,'dispatched'));
 PERFORM public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5000,5,s,2,'delivered'));
 PERFORM payment_contract_test.assert(public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5000,6,s,3,'exception'))->>'status'='invalid','delivered correction requires reason');
 PERFORM public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5000,7,s,3,'exception','Corrected by operator'));
 PERFORM public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5000,8,s,4,'cancelled'));
 PERFORM payment_contract_test.assert(public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5000,9))->>'status'='conflict','cancelled dispatched record retains allocation');
 PERFORM payment_contract_test.assert(public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5000,10,s,5,'dispatched'))->>'status'='conflict','cancellation terminal');
 r:=public.read_manual_shipments(payment_contract_test.id('order',5000));
 PERFORM payment_contract_test.assert(r->>'environment'='sandbox' AND NOT (r->'shipments'->0) ?| ARRAY['actorId','reason','payload','orderId'],'customer projection excludes private audit');
 first:=public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5001,11));s:=(first->>'shipmentId')::uuid;
 PERFORM public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5001,12,s,1,'cancelled'));
 PERFORM payment_contract_test.assert(public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5001,13))->>'status'='applied','never-dispatched cancellation releases capacity');
END$$;
RESET ROLE;
SELECT payment_contract_test.assert((SELECT count(*)=5 FROM private.manual_shipment_audit WHERE order_id=payment_contract_test.id('order',5000)),'audit records applied revisions only');
SELECT payment_contract_test.assert(NOT has_table_privilege('authenticated','private.manual_shipments','SELECT'),'authenticated has no direct private read');
SELECT payment_contract_test.assert(NOT has_table_privilege('service_role','private.manual_shipments','UPDATE'),'service role cannot bypass mutation protocol');
SELECT payment_contract_test.assert(NOT has_function_privilege('authenticated','public.read_manual_shipments(uuid)','EXECUTE'),'read RPC service-only');
SELECT manual_test.seed(5002);SELECT payment_contract_test.seed(5003,true);
UPDATE public.orders SET status='refunded' WHERE id=payment_contract_test.id('order',5002);
SET ROLE service_role;
SELECT payment_contract_test.assert(public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5002,20))->>'status'='ineligible','refunded order blocked');
SELECT payment_contract_test.assert(public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5003,21))->>'status'='ineligible','unverified unpaid order blocked');
RESET ROLE;

SELECT manual_test.seed(5004);
DO $$DECLARE s uuid; before_row private.manual_shipments; after_row private.manual_shipments; cmd jsonb; BEGIN
 s:=(public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5004,30))->>'shipmentId')::uuid;
 PERFORM public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5004,31,s,1,'dispatched'));
 PERFORM public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5004,32,s,2,'delivered'));
 SELECT * INTO before_row FROM private.manual_shipments WHERE id=s;
 cmd:=manual_test.command(5004,33,s,3,'delivered','Tracking typo') || jsonb_build_object('trackingReference','CORRECTED');
 PERFORM payment_contract_test.assert(public.apply_manual_shipment(payment_contract_test.id('operator',491),cmd || jsonb_build_object('correctionReason',null))->>'status'='invalid','same-status delivered correction requires reason');
 PERFORM payment_contract_test.assert(public.apply_manual_shipment(payment_contract_test.id('operator',491),cmd)->>'status'='applied','same-status reference correction accepted');
 PERFORM payment_contract_test.assert(public.apply_manual_shipment(payment_contract_test.id('operator',491),cmd)->>'status'='replayed','correction retries idempotently');
 SELECT * INTO after_row FROM private.manual_shipments WHERE id=s;
 PERFORM payment_contract_test.assert(after_row.version=4 AND after_row.state='delivered' AND after_row.tracking_reference='CORRECTED' AND after_row.delivered_at=before_row.delivered_at AND after_row.dispatched_at=before_row.dispatched_at AND after_row.ever_dispatched AND NOT after_row.released,'correction retains state timestamps and allocation');
 PERFORM payment_contract_test.assert(public.apply_manual_shipment(payment_contract_test.id('operator',491),cmd || jsonb_build_object('commandId',payment_contract_test.id('manual-command',34)))->>'status'='conflict','correction stale revision rejected');
 cmd:=cmd || jsonb_build_object('commandId',payment_contract_test.id('manual-command',35),'expectedVersion',4);
 PERFORM payment_contract_test.assert(public.apply_manual_shipment(payment_contract_test.id('operator',491),cmd)->>'status'='conflict','true no-op rejected');
 cmd:=cmd || jsonb_build_object('carrier','USPS');
 PERFORM payment_contract_test.assert(public.apply_manual_shipment(payment_contract_test.id('operator',491),cmd)->>'status'='applied','carrier-only correction accepted');
 PERFORM payment_contract_test.assert((SELECT count(*)=2 FROM private.manual_shipment_audit WHERE shipment_id=s AND prior_state='delivered' AND state='delivered' AND reason='Tracking typo'),'corrections audited without false status transitions');
 PERFORM payment_contract_test.assert(public.apply_manual_shipment(payment_contract_test.id('operator',491),manual_test.command(5004,36))->>'status'='conflict','corrected delivered allocation retained');
END$$;
