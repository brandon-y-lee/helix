CREATE SCHEMA lifecycle_test;
CREATE FUNCTION lifecycle_test.assert(c boolean,m text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF c IS DISTINCT FROM true THEN RAISE EXCEPTION '%',m; END IF; END $$;
CREATE FUNCTION lifecycle_test.contract() RETURNS jsonb LANGUAGE sql AS $$ SELECT marketing_contract_test.contract()||'{"version":"lifecycle_v1"}'::jsonb $$;
SELECT lifecycle_test.assert(NOT (public.read_lifecycle_consent_control()->>'enabled')::boolean,'lifecycle default off');
UPDATE private.email_controls SET enabled=true,accepted_after=clock_timestamp()-interval '1 day' WHERE purpose IN ('marketing_confirmation','welcome_initial','welcome_education');
SELECT lifecycle_test.assert(public.request_marketing_subscription('lifecycle@example.invalid','welcome_popup','2026-11-13-lifecycle-v1',repeat('L',43),repeat('b',64),true,lifecycle_test.contract())->>'status'='unavailable','disabled consent cannot create records');
SELECT public.configure_lifecycle_consent(true,(public.read_lifecycle_consent_control()->>'updatedAt')::timestamptz);
-- Legacy consent must remain usable but cannot grant behavior tracking.
SELECT public.request_marketing_subscription('lifecycle@example.invalid','email_preferences','2026-09-29-welcome-v1',repeat('l',43),repeat('b',64),true,marketing_contract_test.contract());
SELECT public.confirm_marketing_subscription(repeat('l',43),repeat('p',43));
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('eeeeeeee-0000-4000-8000-000000000001','lifecycle@example.invalid',clock_timestamp());
SELECT lifecycle_test.assert(NOT public.record_lifecycle_product_visit('eeeeeeee-0000-4000-8000-000000000001','synthetic-already-available'),'legacy welcome cannot enable behavior');
CREATE TABLE lifecycle_test.before_upgrade AS SELECT to_jsonb(s) AS snapshot FROM private.marketing_subscribers s WHERE normalized_email='lifecycle@example.invalid';
SELECT public.request_marketing_subscription('lifecycle@example.invalid','welcome_popup','2026-11-13-lifecycle-v1',repeat('U',43),repeat('b',64),true,lifecycle_test.contract());
SELECT lifecycle_test.assert((SELECT snapshot=(SELECT to_jsonb(s) FROM private.marketing_subscribers s WHERE normalized_email='lifecycle@example.invalid') FROM lifecycle_test.before_upgrade),'pending upgrade preserves current welcome preferences');
SELECT lifecycle_test.assert((SELECT private.marketing_intent_current(e,s) FROM private.email_intents e JOIN private.marketing_subscribers s ON s.id::text=e.receipt->>'subscriberId' WHERE e.receipt->>'confirmationToken'=repeat('U',43)),'pending upgrade confirmation is sendable via shared guard');
-- Exercise the latest dispatcher without losing its existing protections.
UPDATE private.email_intents SET state='leased',lease_token='eeeeeeee-0000-4000-8000-000000000002',lease_expires_at=clock_timestamp()+interval '1 minute' WHERE receipt->>'confirmationToken'=repeat('U',43);
SELECT lifecycle_test.assert(public.prepare_email_attempt(e.id,'eeeeeeee-0000-4000-8000-000000000002',marketing_contract_test.payload(e.id)) IS NOT NULL,'upgrade generation can prepare confirmation without changing original subscriber') FROM private.email_intents e WHERE receipt->>'confirmationToken'=repeat('U',43);
SELECT lifecycle_test.assert(public.confirm_marketing_subscription(repeat('U',43),repeat('q',43))->>'status'='confirmed','explicit upgrade confirms');
SELECT lifecycle_test.assert(public.confirm_marketing_subscription(repeat('U',43),repeat('r',43))->>'status'='confirmed','confirmation is idempotent');
SELECT lifecycle_test.assert((SELECT generation=2 AND status='confirmed' FROM private.marketing_subscribers WHERE normalized_email='lifecycle@example.invalid'),'upgrade produces new generation');
SELECT lifecycle_test.assert(NOT EXISTS(SELECT 1 FROM private.email_intents e JOIN private.marketing_subscribers s ON s.id::text=e.receipt->>'subscriberId' WHERE s.normalized_email='lifecycle@example.invalid' AND e.receipt->>'generation'='2' AND e.purpose IN ('welcome_initial','welcome_education')),'foundation cannot send unconfigured lifecycle offers');
SELECT lifecycle_test.assert(public.record_lifecycle_product_visit('eeeeeeee-0000-4000-8000-000000000001','synthetic-already-available'),'confirmed verified customer can record canonical product');
SELECT lifecycle_test.assert(NOT public.record_lifecycle_product_visit('eeeeeeee-0000-4000-8000-000000000001','synthetic-already-available'),'repeat visits rate bounded');
INSERT INTO public.carts(id,user_id) VALUES('eeeeeeee-0000-4000-8000-000000000003','eeeeeeee-0000-4000-8000-000000000001');
INSERT INTO public.cart_items(id,cart_id,product_id,variant_key,quantity) VALUES('eeeeeeee-0000-4000-8000-000000000004','eeeeeeee-0000-4000-8000-000000000003',notification_contract_test.id('already-available'),'30ml',1);
CREATE TABLE lifecycle_test.first_mutation AS SELECT cart_revision,cart_changed_at FROM private.lifecycle_activity WHERE user_id='eeeeeeee-0000-4000-8000-000000000001';
UPDATE public.cart_items SET quantity=quantity WHERE id='eeeeeeee-0000-4000-8000-000000000004';
SELECT lifecycle_test.assert((SELECT a.cart_revision=f.cart_revision AND a.cart_changed_at=f.cart_changed_at FROM private.lifecycle_activity a CROSS JOIN lifecycle_test.first_mutation f WHERE a.user_id='eeeeeeee-0000-4000-8000-000000000001'),'no-op mutation never rearms cart');
UPDATE public.cart_items SET quantity=2 WHERE id='eeeeeeee-0000-4000-8000-000000000004';
SELECT lifecycle_test.assert((SELECT a.cart_revision>f.cart_revision FROM private.lifecycle_activity a CROSS JOIN lifecycle_test.first_mutation f WHERE a.user_id='eeeeeeee-0000-4000-8000-000000000001'),'meaningful mutation gets new revision');
-- Old preference link still withdraws upgraded current generation.
SELECT public.withdraw_marketing_subscription(repeat('p',43),'global');
SELECT lifecycle_test.assert(public.read_lifecycle_activity('eeeeeeee-0000-4000-8000-000000000001') IS NULL,'withdrawal immediately makes activity ineligible');
SELECT lifecycle_test.assert(public.cleanup_lifecycle_activity()>0,'withdrawn activity cleaned without deleting consent evidence');
-- A withdrawal between request and confirm must invalidate the pending upgrade.
SELECT public.request_marketing_subscription('withdraw-upgrade@example.invalid','email_preferences','2026-09-29-welcome-v1',repeat('w',43),repeat('c',64),true,marketing_contract_test.contract());
SELECT public.confirm_marketing_subscription(repeat('w',43),repeat('s',43));
SELECT public.request_marketing_subscription('withdraw-upgrade@example.invalid','welcome_popup','2026-11-13-lifecycle-v1',repeat('X',43),repeat('c',64),true,lifecycle_test.contract());
SELECT public.withdraw_marketing_subscription(repeat('s',43),'global');
SELECT lifecycle_test.assert(public.confirm_marketing_subscription(repeat('X',43),repeat('z',43))->>'status'='invalid','withdrawal cannot be undone by earlier upgrade token');
SELECT lifecycle_test.assert(NOT has_function_privilege('authenticated','public.record_lifecycle_product_visit(uuid,text)','EXECUTE'),'browser cannot forge activity identity');
SELECT lifecycle_test.assert(NOT has_table_privilege('anon','private.lifecycle_activity','SELECT'),'private activity not exposed');
SELECT lifecycle_test.assert((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='private.lifecycle_activity'::regclass),'activity forced RLS');
-- Fixtures for genuine concurrent confirmation/withdrawal tests in the runner.
SELECT public.request_marketing_subscription('race-lifecycle@example.invalid','welcome_popup','2026-11-13-lifecycle-v1',repeat('R',43),repeat('d',64),true,lifecycle_test.contract());
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('eeeeeeee-0000-4000-8000-000000000005','race-lifecycle@example.invalid',clock_timestamp());
SELECT public.request_marketing_subscription('race-upgrade@example.invalid','email_preferences','2026-09-29-welcome-v1',repeat('T',43),repeat('e',64),true,marketing_contract_test.contract());
SELECT public.confirm_marketing_subscription(repeat('T',43),repeat('V',43));
SELECT public.request_marketing_subscription('race-upgrade@example.invalid','welcome_popup','2026-11-13-lifecycle-v1',repeat('Y',43),repeat('e',64),true,lifecycle_test.contract());

-- Equal generation numbers never make different subscribers interchangeable.
SELECT public.request_marketing_subscription('switch-a@example.invalid','welcome_popup','2026-11-13-lifecycle-v1',repeat('A',43),repeat('1',64),true,lifecycle_test.contract());
SELECT lifecycle_test.assert(public.confirm_marketing_subscription_scoped(repeat('A',43),repeat('B',43),'welcome')->>'status'='invalid','tampered welcome display cannot grant lifecycle');
SELECT lifecycle_test.assert(public.confirm_marketing_subscription_scoped(repeat('A',43),repeat('B',43),null)->>'status'='invalid','missing displayed scope cannot grant lifecycle');
SELECT lifecycle_test.assert(public.confirm_marketing_subscription_scoped(repeat('A',43),repeat('B',43),'lifecycle')->>'status'='confirmed','matching lifecycle display can confirm');
SELECT public.request_marketing_subscription('switch-b@example.invalid','welcome_popup','2026-11-13-lifecycle-v1',repeat('C',43),repeat('2',64),true,lifecycle_test.contract());
SELECT public.confirm_marketing_subscription(repeat('C',43),repeat('D',43));
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('eeeeeeee-0000-4000-8000-000000000011','switch-a@example.invalid',clock_timestamp());
INSERT INTO public.carts(id,user_id) VALUES('eeeeeeee-0000-4000-8000-000000000012','eeeeeeee-0000-4000-8000-000000000011');
INSERT INTO public.cart_items(id,cart_id,product_id,variant_key,quantity) VALUES('eeeeeeee-0000-4000-8000-000000000013','eeeeeeee-0000-4000-8000-000000000012',notification_contract_test.id('already-available'),'30ml',1);
UPDATE auth.users SET email='switch-b@example.invalid' WHERE id='eeeeeeee-0000-4000-8000-000000000011';
SELECT lifecycle_test.assert(public.record_lifecycle_product_visit('eeeeeeee-0000-4000-8000-000000000011','synthetic-already-available'),'new subscriber visit admitted');
SELECT lifecycle_test.assert((SELECT generation=1 AND cart_id IS NULL AND cart_changed_at IS NULL AND cart_revision=0 AND product_id IS NOT NULL FROM private.lifecycle_activity WHERE user_id='eeeeeeee-0000-4000-8000-000000000011'),'new subscriber cannot inherit cart despite equal generation');
UPDATE auth.users SET email='switch-a@example.invalid' WHERE id='eeeeeeee-0000-4000-8000-000000000011';
UPDATE public.cart_items SET quantity=2 WHERE id='eeeeeeee-0000-4000-8000-000000000013';
SELECT lifecycle_test.assert((SELECT generation=1 AND product_id IS NULL AND product_seen_at IS NULL AND cart_id IS NOT NULL FROM private.lifecycle_activity WHERE user_id='eeeeeeee-0000-4000-8000-000000000011'),'new subscriber cannot inherit browse despite equal generation');
-- Retention is per channel, not extended by unrelated fresh activity.
UPDATE private.lifecycle_activity SET product_id=notification_contract_test.id('already-available'),product_seen_at=clock_timestamp()-interval '31 days' WHERE user_id='eeeeeeee-0000-4000-8000-000000000011';
SELECT public.cleanup_lifecycle_activity();
SELECT lifecycle_test.assert((SELECT product_id IS NULL AND product_seen_at IS NULL AND cart_id IS NOT NULL AND cart_changed_at IS NOT NULL FROM private.lifecycle_activity WHERE user_id='eeeeeeee-0000-4000-8000-000000000011'),'fresh cart cannot retain stale browse');
UPDATE private.lifecycle_activity SET product_id=notification_contract_test.id('already-available'),product_seen_at=clock_timestamp(),cart_changed_at=clock_timestamp()-interval '31 days' WHERE user_id='eeeeeeee-0000-4000-8000-000000000011';
CREATE TABLE lifecycle_test.retention_revision AS SELECT cart_revision FROM private.lifecycle_activity WHERE user_id='eeeeeeee-0000-4000-8000-000000000011';
SELECT public.cleanup_lifecycle_activity();
SELECT lifecycle_test.assert((SELECT product_id IS NOT NULL AND product_seen_at IS NOT NULL AND cart_id IS NULL AND cart_changed_at IS NULL AND a.cart_revision=r.cart_revision FROM private.lifecycle_activity a CROSS JOIN lifecycle_test.retention_revision r WHERE a.user_id='eeeeeeee-0000-4000-8000-000000000011'),'fresh browse cannot retain stale cart; revision remains stable');
